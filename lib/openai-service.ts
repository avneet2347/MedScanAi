import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import { ApiError, normalizeText, safeJsonParse } from "@/lib/api-utils";
import { chooseLocalizedText } from "@/lib/localization";
import { buildFallbackChatReply, buildHistoricalContext } from "@/lib/report-analytics";
import { generateFallbackMedicalAnalysis } from "@/lib/fallback-analysis";
import type {
  HealthInsights,
  MedicalAnalysis,
  OutputLanguage,
} from "@/lib/report-types";
import { serverConfig } from "@/lib/server-config";

const openai = new OpenAI({
  apiKey: serverConfig.openAiApiKey,
});

const medicalAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentType",
    "overview",
    "plainLanguageSummary",
    "possibleConditions",
    "medicines",
    "testValues",
    "precautions",
    "followUpQuestions",
    "safetyFlags",
  ],
  properties: {
    documentType: { type: "string" },
    overview: { type: "string" },
    plainLanguageSummary: { type: "string" },
    possibleConditions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "confidence", "evidence", "explanation"],
        properties: {
          name: { type: "string" },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          evidence: { type: "string" },
          explanation: { type: "string" },
        },
      },
    },
    medicines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "dosage", "frequency", "purpose", "notes"],
        properties: {
          name: { type: "string" },
          dosage: { type: "string" },
          frequency: { type: "string" },
          purpose: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    testValues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value", "unit", "referenceRange", "status", "explanation"],
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          unit: { type: "string" },
          referenceRange: { type: "string" },
          status: {
            type: "string",
            enum: ["normal", "high", "low", "borderline", "abnormal", "unknown"],
          },
          explanation: { type: "string" },
        },
      },
    },
    precautions: {
      type: "array",
      items: { type: "string" },
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" },
    },
    safetyFlags: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

function safetyIdentifier(userId?: string) {
  if (!userId) {
    return undefined;
  }

  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

function normalizeAnalysis(analysis: MedicalAnalysis): MedicalAnalysis {
  return {
    documentType: analysis.documentType || "medical-report",
    overview: normalizeText(analysis.overview || "No summary available."),
    plainLanguageSummary: normalizeText(
      analysis.plainLanguageSummary || "No plain-language explanation available."
    ),
    possibleConditions: analysis.possibleConditions || [],
    medicines: analysis.medicines || [],
    testValues: analysis.testValues || [],
    precautions: analysis.precautions || [],
    followUpQuestions: analysis.followUpQuestions || [],
    safetyFlags: analysis.safetyFlags || [],
  };
}

function languageInstruction(language: OutputLanguage) {
  if (language === "hi") {
    return "Write every human-readable value in Hindi. Keep JSON keys, medicine names, and test status enums in English.";
  }

  if (language === "hinglish") {
    return "Write every human-readable value in natural Hinglish using Roman script. Keep JSON keys, medicine names, and test status enums in English.";
  }

  return "Write every human-readable value in English.";
}

function isOpenAiQuotaError(error: unknown) {
  if (
    typeof error === "object" &&
    error &&
    "status" in error &&
    (error as { status?: unknown }).status === 429
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error || "");
  return /quota|rate limit|429/i.test(message);
}

async function generateMedicalAnalysisWithGemini(
  extractedText: string,
  language: OutputLanguage
) {
  if (!serverConfig.geminiApiKey) {
    throw new ApiError("Gemini API key is not configured.", 500);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${serverConfig.geminiAnalysisModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": serverConfig.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Analyze this OCR text from a medical report. Use only information present in the text. Do not invent diagnoses. Return strict JSON matching the provided schema. ${languageInstruction(language)}`,
              },
              {
                text: extractedText,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: medicalAnalysisSchema,
        },
      }),
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
            }>;
          };
        }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini analysis request failed.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = safeJsonParse<MedicalAnalysis>(text);

  if (!parsed) {
    throw new Error("Gemini returned an invalid analysis payload.");
  }

  return normalizeAnalysis(parsed);
}

async function extractTextWithGemini(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  if (!serverConfig.geminiApiKey) {
    throw new ApiError("Gemini API key is not configured.", 500);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${serverConfig.geminiAnalysisModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": serverConfig.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Extract all readable text from this medical document. Preserve headings, table labels, values, units, dates, and medicine names. Do not summarize.",
              },
              {
                inlineData: {
                  mimeType: payload.mimeType,
                  data: payload.buffer.toString("base64"),
                },
              },
            ],
          },
        ],
      }),
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
            }>;
          };
        }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini OCR request failed.");
  }

  return normalizeText(
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || ""
  );
}

function trimForModel(text: string, maxChars: number) {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const head = normalized.slice(0, Math.floor(maxChars * 0.7)).trimEnd();
  const tail = normalized.slice(normalized.length - Math.floor(maxChars * 0.25)).trimStart();

  return `${head}\n\n[truncated]\n\n${tail}`;
}

export async function extractTextWithOpenAI(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const file = await openai.files.create({
    file: await toFile(payload.buffer, payload.filename, { type: payload.mimeType }),
    purpose: payload.mimeType === "application/pdf" ? "user_data" : "vision",
  });

  try {
    try {
      const response = await openai.responses.create({
        model: serverConfig.openAiOcrModel,
        store: false,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Extract all readable text from this medical document. Preserve headings, table labels, values, units, dates, and medicine names. Do not summarize.",
              },
              payload.mimeType === "application/pdf"
                ? {
                    type: "input_file",
                    file_id: file.id,
                  }
                : {
                    type: "input_image",
                    file_id: file.id,
                    detail: "high",
                  },
            ],
          },
        ],
      });

      return normalizeText(response.output_text || "");
    } catch (error) {
      if (!isOpenAiQuotaError(error)) {
        throw error;
      }

      return await extractTextWithGemini(payload);
    }
  } finally {
    await openai.files.delete(file.id).catch(() => undefined);
  }
}

export async function generateMedicalAnalysis(payload: {
  extractedText: string;
  userId?: string;
  language?: OutputLanguage;
}) {
  const extractedText = trimForModel(payload.extractedText, 30000);
  const language = payload.language || "en";

  if (!extractedText) {
    throw new ApiError("No readable OCR text is available for analysis.", 422);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiAnalysisModel,
      temperature: 0.2,
      store: false,
      safety_identifier: safetyIdentifier(payload.userId),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "medical_report_analysis",
          strict: true,
          schema: medicalAnalysisSchema,
        },
      },
      messages: [
        {
          role: "developer",
          content:
            `You structure OCR'd medical reports. Use only information present in the text. Do not invent diagnoses. Possible conditions must be labeled as possibilities, not confirmed disease. Keep wording safe and non-alarmist. ${languageInstruction(language)}`,
        },
        {
          role: "user",
          content: `Analyze this OCR text from a medical report and return JSON only.\n\nOCR TEXT:\n${extractedText}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = safeJsonParse<MedicalAnalysis>(content);

    if (!parsed) {
      throw new Error("OpenAI returned an invalid analysis payload.");
    }

    return normalizeAnalysis(parsed);
  } catch (error) {
    if (!isOpenAiQuotaError(error)) {
      throw error;
    }

    try {
      return await generateMedicalAnalysisWithGemini(extractedText, language);
    } catch {
      return generateFallbackMedicalAnalysis(extractedText, language);
    }
  }
}

export async function generateChatReply(payload: {
  question: string;
  userId?: string;
  language?: OutputLanguage;
  currentReport: {
    title?: string | null;
    createdAt?: string;
    ocrText?: string | null;
    analysis?: MedicalAnalysis | null;
    insights?: HealthInsights | null;
    chatHistory?: string;
  };
  history?: Array<{
    title?: string | null;
    createdAt?: string;
    analysis?: MedicalAnalysis | null;
    insights?: HealthInsights | null;
  }>;
}) {
  const language = payload.language || payload.currentReport.insights?.preferredLanguage || "en";
  const history = payload.history || [];
  const historyContext = buildHistoricalContext(history, language);

  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiChatModel,
      temperature: 0.3,
      store: false,
      safety_identifier: safetyIdentifier(payload.userId),
      messages: [
        {
          role: "developer",
          content:
            "You answer questions about uploaded medical reports. Stay grounded in the provided OCR text, structured analysis, health insights, and historical report context. Give safe educational explanations only. Do not diagnose, prescribe, or advise medication changes. If the report does not contain enough information, say that clearly.",
        },
        {
          role: "user",
          content: `Preferred output language: ${language}\n\nCurrent report title: ${
            payload.currentReport.title || "Current report"
          }\n\nCurrent report OCR text:\n${trimForModel(
            payload.currentReport.ocrText || "No OCR text available.",
            18000
          )}\n\nStructured analysis JSON:\n${trimForModel(
            JSON.stringify(payload.currentReport.analysis || {}, null, 2),
            9000
          )}\n\nHealth insights JSON:\n${trimForModel(
            JSON.stringify(payload.currentReport.insights || {}, null, 2),
            7000
          )}\n\nPrevious report history:\n${trimForModel(
            historyContext,
            5000
          )}\n\nRecent chat history:\n${trimForModel(
            payload.currentReport.chatHistory || "No previous chat history.",
            4000
          )}\n\nQuestion:\n${payload.question}`,
        },
      ],
    });

    return normalizeText(
      completion.choices[0]?.message?.content ||
        chooseLocalizedText(language, {
          en: "I could not generate an answer for that report.",
          hi: "मैं इस रिपोर्ट के लिए उत्तर उत्पन्न नहीं कर सका।",
          hinglish: "Main is report ke liye answer generate nahi kar saka.",
        })
    );
  } catch (error) {
    if (!isOpenAiQuotaError(error)) {
      throw error;
    }

    return buildFallbackChatReply({
      question: payload.question,
      currentAnalysis: payload.currentReport.analysis,
      currentInsights: payload.currentReport.insights,
      history,
      language,
    });
  }
}
