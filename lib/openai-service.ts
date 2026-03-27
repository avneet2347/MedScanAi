import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import { ApiError, getErrorMessage, normalizeText, safeJsonParse } from "@/lib/api-utils";
import { chooseLocalizedText } from "@/lib/localization";
import {
  buildGroundedReportChatReply,
  buildHistoricalContext,
} from "@/lib/report-analytics";
import { generateFallbackMedicalAnalysis } from "@/lib/fallback-analysis";
import type {
  ConditionInsight,
  HealthInsights,
  MedicalAnalysis,
  MedicineEntry,
  OutputLanguage,
  OcrResult,
  TestStatus,
  TestValueEntry,
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

const medicalOcrCleanupSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "cleanedText",
    "medicines",
    "dosage",
    "instructions",
    "possible_conditions",
  ],
  properties: {
    cleanedText: { type: "string" },
    medicines: {
      type: "array",
      items: { type: "string" },
    },
    dosage: {
      type: "array",
      items: { type: "string" },
    },
    instructions: {
      type: "array",
      items: { type: "string" },
    },
    possible_conditions: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

type MedicalOcrCleanupPayload = {
  cleanedText: string;
  medicines: string[];
  dosage: string[];
  instructions: string[];
  possible_conditions: string[];
};

type AnalysisEvidenceBundle = {
  importantLines: string[];
  candidateMedicines: Array<Pick<MedicineEntry, "name" | "dosage" | "frequency">>;
  candidateTestValues: Array<
    Pick<TestValueEntry, "name" | "value" | "unit" | "referenceRange" | "status">
  >;
  candidatePossibleConditions: string[];
  candidatePrecautions: string[];
};

const VALID_TEST_STATUSES = new Set<TestStatus>([
  "normal",
  "high",
  "low",
  "borderline",
  "abnormal",
  "unknown",
]);

const MEDICAL_LINE_PATTERNS = [
  /\b(?:mg|mcg|g|ml|iu|units?|meq|mmhg|bpm|g\/dl|mg\/dl|mmol\/l|ng\/ml|miu\/l|u\/l|cells\/cumm)\b/i,
  /\b(?:tablet|tab|capsule|cap|syrup|injection|inj|drop|cream|ointment|solution)\b/i,
  /\b(?:once|twice|thrice|daily|weekly|morning|evening|night|before food|after food|od|bd|tds|hs|stat|sos)\b/i,
  /\b(?:hemoglobin|hba1c|glucose|sugar|creatinine|urea|bilirubin|platelet|wbc|rbc|cholesterol|triglyceride|hdl|ldl|tsh|t3|t4|vitamin|sodium|potassium|calcium|bp|blood pressure|pulse)\b/i,
  /\b(?:reference|range|normal|result|findings|impression|diagnosis|advice|prescription|rx|laboratory|investigation)\b/i,
];

function safetyIdentifier(userId?: string) {
  if (!userId) {
    return undefined;
  }

  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

function normalizeLookupKey(value: string) {
  return normalizeText(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeByKey<T>(items: T[], buildKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = buildKey(item);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function scoreMedicalLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return 0;
  }

  let score = 0;

  if (/\d/.test(trimmed)) {
    score += 1;
  }

  for (const pattern of MEDICAL_LINE_PATTERNS) {
    if (pattern.test(trimmed)) {
      score += 2;
    }
  }

  if (trimmed.length > 160) {
    score -= 1;
  }

  if (/^[A-Z0-9\s\-/:().,%]+$/.test(trimmed)) {
    score += 1;
  }

  return score;
}

function selectImportantMedicalLines(text: string, maxLines = 18) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => ({
      line,
      index,
      score: scoreMedicalLine(line),
    }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxLines)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.line);
}

function uniqueNormalizedStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value || ""))
        .filter((value) => value.length > 0)
      )
  );
}

function normalizeConditionInsights(items: ConditionInsight[]) {
  return dedupeByKey(
    (items || [])
      .map((item) => ({
        name: normalizeText(item?.name || ""),
        confidence:
          item?.confidence === "high" || item?.confidence === "medium" || item?.confidence === "low"
            ? item.confidence
            : "low",
        evidence: normalizeText(item?.evidence || ""),
        explanation: normalizeText(item?.explanation || ""),
      }))
      .filter((item) => item.name.length > 0),
    (item) => normalizeLookupKey(item.name)
  );
}

function normalizeMedicineEntries(items: MedicineEntry[]) {
  return dedupeByKey(
    (items || [])
      .map((item) => ({
        name: normalizeText(item?.name || ""),
        dosage: normalizeText(item?.dosage || ""),
        frequency: normalizeText(item?.frequency || ""),
        purpose: normalizeText(item?.purpose || ""),
        notes: normalizeText(item?.notes || ""),
      }))
      .filter((item) => item.name.length > 0),
    (item) =>
      [
        normalizeLookupKey(item.name),
        normalizeLookupKey(item.dosage),
        normalizeLookupKey(item.frequency),
      ].join("|")
  );
}

function normalizeTestValueEntries(items: TestValueEntry[]) {
  return dedupeByKey(
    (items || [])
      .map((item) => ({
        name: normalizeText(item?.name || ""),
        value: normalizeText(item?.value || ""),
        unit: normalizeText(item?.unit || ""),
        referenceRange: normalizeText(item?.referenceRange || ""),
        status: VALID_TEST_STATUSES.has(item?.status as TestStatus)
          ? (item.status as TestStatus)
          : "unknown",
        explanation: normalizeText(item?.explanation || ""),
      }))
      .filter((item) => item.name.length > 0 && (item.value.length > 0 || item.referenceRange.length > 0)),
    (item) =>
      [
        normalizeLookupKey(item.name),
        normalizeLookupKey(item.value),
        normalizeLookupKey(item.unit),
      ].join("|")
  );
}

function enrichMedicinesWithFallback(
  medicines: MedicineEntry[],
  fallbackMedicines: MedicineEntry[]
) {
  if (medicines.length === 0) {
    return fallbackMedicines;
  }

  const fallbackByName = new Map(
    fallbackMedicines.map((item) => [normalizeLookupKey(item.name), item] as const)
  );

  return medicines.map((item) => {
    const fallback = fallbackByName.get(normalizeLookupKey(item.name));

    if (!fallback) {
      return item;
    }

    return {
      ...item,
      dosage: item.dosage || fallback.dosage,
      frequency: item.frequency || fallback.frequency,
      purpose: item.purpose || fallback.purpose,
      notes: item.notes || fallback.notes,
    };
  });
}

function enrichTestsWithFallback(testValues: TestValueEntry[], fallbackTests: TestValueEntry[]) {
  if (testValues.length === 0) {
    return fallbackTests;
  }

  const fallbackByName = new Map(
    fallbackTests.map((item) => [normalizeLookupKey(item.name), item] as const)
  );

  return testValues.map((item) => {
    const fallback = fallbackByName.get(normalizeLookupKey(item.name));

    if (!fallback) {
      return item;
    }

    return {
      ...item,
      unit: item.unit || fallback.unit,
      referenceRange: item.referenceRange || fallback.referenceRange,
      status: item.status !== "unknown" ? item.status : fallback.status,
      explanation: item.explanation || fallback.explanation,
    };
  });
}

function buildAnalysisEvidenceBundle(
  extractedText: string,
  fallbackAnalysis: MedicalAnalysis
): AnalysisEvidenceBundle {
  return {
    importantLines: selectImportantMedicalLines(extractedText),
    candidateMedicines: fallbackAnalysis.medicines.slice(0, 8).map((item) => ({
      name: item.name,
      dosage: item.dosage,
      frequency: item.frequency,
    })),
    candidateTestValues: fallbackAnalysis.testValues.slice(0, 10).map((item) => ({
      name: item.name,
      value: item.value,
      unit: item.unit,
      referenceRange: item.referenceRange,
      status: item.status,
    })),
    candidatePossibleConditions: fallbackAnalysis.possibleConditions
      .slice(0, 5)
      .map((item) => item.name),
    candidatePrecautions: fallbackAnalysis.precautions.slice(0, 4),
  };
}

function buildMedicalAnalysisPrompt(language: OutputLanguage) {
  return [
    "You structure OCR'd medical documents into strict JSON for patients.",
    "Use only facts present in the OCR text or clearly repeated in the evidence brief.",
    "Never invent diagnoses, medicines, doses, values, units, dates, or instructions.",
    "If a condition is not explicitly diagnosed, label it only as a possibility and ground it in evidence.",
    "Prefer exact medicine names, numeric values, units, and reference ranges as written in the report.",
    "Ignore non-clinical noise such as addresses, billing text, repeated headers, and branding unless clinically relevant.",
    "overview must briefly describe what this document appears to contain and the most important clinical findings.",
    "plainLanguageSummary must explain the report in simple, user-friendly language and mention the most important medicine or abnormal result if available.",
    "possibleConditions should be conservative and evidence-based. Do not infer a disease from a medicine name alone.",
    "medicines should contain exact extracted medicines with dosage and frequency when available. Leave fields blank instead of guessing.",
    "testValues should include only values actually present in the report. Use status='unknown' when the direction is unclear.",
    "precautions, followUpQuestions, and safetyFlags should be short, practical, and grounded in the report.",
    "Deduplicate repeated items and prefer the clearest version.",
    languageInstruction(language),
  ].join(" ");
}

function buildMedicalAnalysisUserMessage(payload: {
  extractedText: string;
  evidenceBundle: AnalysisEvidenceBundle;
}) {
  return [
    "Analyze this medical document and return JSON only.",
    "The evidence brief is a helper summary extracted from the same OCR text. If there is any conflict, trust the OCR text over the brief.",
    "",
    "OCR TEXT:",
    payload.extractedText,
    "",
    "EVIDENCE BRIEF:",
    JSON.stringify(payload.evidenceBundle, null, 2),
  ].join("\n");
}

function buildChatSnapshot(payload: {
  currentReport: {
    title?: string | null;
    analysis?: MedicalAnalysis | null;
    insights?: HealthInsights | null;
  };
}) {
  const analysis = payload.currentReport.analysis;
  const insights = payload.currentReport.insights;
  const abnormalLines =
    insights?.abnormalFindings?.slice(0, 6).map((item) => {
      const range = item.referenceRange ? ` | range ${item.referenceRange}` : "";
      return `- ${item.name}: ${item.value} | status ${item.status}${range}`;
    }) || [];
  const medicineLines =
    analysis?.medicines?.slice(0, 6).map((item) => {
      const schedule = [item.dosage, item.frequency].filter(Boolean).join(", ");
      const purpose = item.purpose ? ` | purpose ${item.purpose}` : "";
      return `- ${item.name}${schedule ? ` | ${schedule}` : ""}${purpose}`;
    }) || [];
  const testLines =
    analysis?.testValues?.slice(0, 8).map((item) => {
      const unit = item.unit ? ` ${item.unit}` : "";
      const range = item.referenceRange ? ` | range ${item.referenceRange}` : "";
      return `- ${item.name}: ${item.value}${unit} | status ${item.status}${range}`;
    }) || [];
  const conditionLines =
    analysis?.possibleConditions?.slice(0, 5).map((item) => {
      return `- ${item.name} | confidence ${item.confidence} | evidence ${item.evidence}`;
    }) || [];
  const safetyLines =
    (analysis?.safetyFlags?.slice(0, 4) || []).concat(
      insights?.alerts?.slice(0, 3).map((item) => item.title) || []
    );

  return [
    `REPORT SNAPSHOT (${payload.currentReport.title || "Current report"}):`,
    `- Plain summary: ${analysis?.plainLanguageSummary || insights?.summary || "Not available."}`,
    `- Overview: ${analysis?.overview || "Not available."}`,
    "- Abnormal findings:",
    ...(abnormalLines.length ? abnormalLines : ["- None clearly identified."]),
    "- Medicines:",
    ...(medicineLines.length ? medicineLines : ["- None clearly extracted."]),
    "- Key test values:",
    ...(testLines.length ? testLines : ["- None clearly extracted."]),
    "- Possible conditions:",
    ...(conditionLines.length ? conditionLines : ["- None listed."]),
    "- Safety flags:",
    ...(safetyLines.length ? safetyLines.map((item) => `- ${item}`) : ["- None listed."]),
  ].join("\n");
}

function normalizeAnalysis(
  analysis: MedicalAnalysis,
  fallbackAnalysis?: MedicalAnalysis
): MedicalAnalysis {
  const normalizedPrimary = {
    documentType: normalizeText(analysis.documentType || "medical-report") || "medical-report",
    overview: normalizeText(analysis.overview || ""),
    plainLanguageSummary: normalizeText(analysis.plainLanguageSummary || ""),
    possibleConditions: normalizeConditionInsights(analysis.possibleConditions || []),
    medicines: normalizeMedicineEntries(analysis.medicines || []),
    testValues: normalizeTestValueEntries(analysis.testValues || []),
    precautions: uniqueNormalizedStrings(analysis.precautions || []),
    followUpQuestions: uniqueNormalizedStrings(analysis.followUpQuestions || []),
    safetyFlags: uniqueNormalizedStrings(analysis.safetyFlags || []),
  };

  if (!fallbackAnalysis) {
    return {
      documentType: normalizedPrimary.documentType,
      overview: normalizedPrimary.overview || "No summary available.",
      plainLanguageSummary:
        normalizedPrimary.plainLanguageSummary || "No plain-language explanation available.",
      possibleConditions: normalizedPrimary.possibleConditions,
      medicines: normalizedPrimary.medicines,
      testValues: normalizedPrimary.testValues,
      precautions: normalizedPrimary.precautions,
      followUpQuestions: normalizedPrimary.followUpQuestions,
      safetyFlags: normalizedPrimary.safetyFlags,
    };
  }

  const normalizedFallback = normalizeAnalysis(fallbackAnalysis);

  return {
    documentType: normalizedPrimary.documentType || normalizedFallback.documentType,
    overview: normalizedPrimary.overview || normalizedFallback.overview,
    plainLanguageSummary:
      normalizedPrimary.plainLanguageSummary || normalizedFallback.plainLanguageSummary,
    possibleConditions:
      normalizedPrimary.possibleConditions.length > 0
        ? normalizedPrimary.possibleConditions
        : normalizedFallback.possibleConditions,
    medicines: enrichMedicinesWithFallback(
      normalizedPrimary.medicines,
      normalizedFallback.medicines
    ),
    testValues: enrichTestsWithFallback(
      normalizedPrimary.testValues,
      normalizedFallback.testValues
    ),
    precautions:
      normalizedPrimary.precautions.length > 0
        ? normalizedPrimary.precautions
        : normalizedFallback.precautions,
    followUpQuestions:
      normalizedPrimary.followUpQuestions.length > 0
        ? normalizedPrimary.followUpQuestions
        : normalizedFallback.followUpQuestions,
    safetyFlags:
      normalizedPrimary.safetyFlags.length > 0
        ? normalizedPrimary.safetyFlags
        : normalizedFallback.safetyFlags,
  };
}

function normalizeMedicalOcrCleanup(
  payload: MedicalOcrCleanupPayload,
  fallbackText: string
): MedicalOcrCleanupPayload {
  return {
    cleanedText: normalizeText(payload.cleanedText || fallbackText),
    medicines: uniqueNormalizedStrings(payload.medicines || []),
    dosage: uniqueNormalizedStrings(payload.dosage || []),
    instructions: uniqueNormalizedStrings(payload.instructions || []),
    possible_conditions: uniqueNormalizedStrings(payload.possible_conditions || []),
  };
}

function buildFallbackMedicalOcrCleanup(text: string): MedicalOcrCleanupPayload {
  const fallbackAnalysis = generateFallbackMedicalAnalysis(text, "en");

  return normalizeMedicalOcrCleanup(
    {
      cleanedText: text,
      medicines: fallbackAnalysis.medicines.map((item) => item.name),
      dosage: fallbackAnalysis.medicines.map((item) => item.dosage),
      instructions: [
        ...fallbackAnalysis.medicines.map((item) =>
          [item.frequency, item.notes].filter(Boolean).join(" - ")
        ),
        ...fallbackAnalysis.precautions,
      ],
      possible_conditions: fallbackAnalysis.possibleConditions.map((item) => item.name),
    },
    text
  );
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

  const fallbackAnalysis = generateFallbackMedicalAnalysis(extractedText, language);
  const evidenceBundle = buildAnalysisEvidenceBundle(extractedText, fallbackAnalysis);

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
                text: `${buildMedicalAnalysisPrompt(language)} Return strict JSON matching the provided schema.`,
              },
              {
                text: buildMedicalAnalysisUserMessage({
                  extractedText,
                  evidenceBundle,
                }),
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

  return normalizeAnalysis(parsed, fallbackAnalysis);
}

export async function extractTextWithGemini(payload: {
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

async function cleanMedicalOcrTextWithGemini(payload: {
  extractedText: string;
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
                  "Clean this OCR text from a medical document. Correct only high-confidence OCR mistakes in medicine names, units, dates, and common medical terms. Do not invent missing facts. Return strict JSON with cleanedText, medicines, dosage, instructions, and possible_conditions.",
              },
              {
                text: payload.extractedText,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: medicalOcrCleanupSchema,
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
    throw new Error(data?.error?.message || "Gemini OCR cleanup request failed.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = safeJsonParse<MedicalOcrCleanupPayload>(text);

  if (!parsed) {
    throw new Error("Gemini returned an invalid OCR cleanup payload.");
  }

  return normalizeMedicalOcrCleanup(parsed, payload.extractedText);
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
  } finally {
    await openai.files.delete(file.id).catch(() => undefined);
  }
}

async function cleanMedicalOcrTextWithOpenAI(payload: {
  extractedText: string;
  userId?: string;
}) {
  const completion = await openai.chat.completions.create({
    model: serverConfig.openAiAnalysisModel,
    temperature: 0.1,
    store: false,
    safety_identifier: safetyIdentifier(payload.userId),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "medical_ocr_cleanup",
        strict: true,
        schema: medicalOcrCleanupSchema,
      },
    },
    messages: [
      {
        role: "developer",
        content:
          "You clean OCR text from medical documents. Correct only high-confidence OCR mistakes in medicine names, units, dates, and common medical terms. Keep clinically relevant wording. Do not invent missing facts. Return JSON only.",
      },
      {
        role: "user",
        content: `Clean and structure this OCR text.\n\nOCR TEXT:\n${payload.extractedText}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  const parsed = safeJsonParse<MedicalOcrCleanupPayload>(content);

  if (!parsed) {
    throw new Error("OpenAI returned an invalid OCR cleanup payload.");
  }

  return normalizeMedicalOcrCleanup(parsed, payload.extractedText);
}

export async function cleanAndStructureMedicalOcrText(payload: {
  extractedText: string;
  userId?: string;
}): Promise<Pick<OcrResult, "text" | "rawText" | "structured" | "warnings"> & { engine: string }> {
  const extractedText = trimForModel(normalizeText(payload.extractedText), 25000);

  if (!extractedText) {
    const fallback = buildFallbackMedicalOcrCleanup("");
    return {
      text: "",
      rawText: "",
      structured: fallback,
      warnings: ["OCR cleanup received empty text and returned a heuristic fallback."],
      engine: "heuristic-medical-cleanup",
    };
  }

  try {
    const cleaned = await cleanMedicalOcrTextWithOpenAI({
      extractedText,
      userId: payload.userId,
    });

    return {
      text: cleaned.cleanedText,
      rawText: extractedText,
      structured: {
        medicines: cleaned.medicines,
        dosage: cleaned.dosage,
        instructions: cleaned.instructions,
        possible_conditions: cleaned.possible_conditions,
      },
      engine: "openai-medical-cleanup",
    };
  } catch (error) {
    try {
      const cleaned = await cleanMedicalOcrTextWithGemini({
        extractedText,
      });

      return {
        text: cleaned.cleanedText,
        rawText: extractedText,
        structured: {
          medicines: cleaned.medicines,
          dosage: cleaned.dosage,
          instructions: cleaned.instructions,
          possible_conditions: cleaned.possible_conditions,
        },
        warnings: [
          `OpenAI OCR cleanup failed: ${getErrorMessage(error, "OpenAI OCR cleanup unavailable.")}`,
        ],
        engine: "gemini-medical-cleanup",
      };
    } catch {
      const fallback = buildFallbackMedicalOcrCleanup(extractedText);

      return {
        text: fallback.cleanedText,
        rawText: extractedText,
        structured: {
          medicines: fallback.medicines,
          dosage: fallback.dosage,
          instructions: fallback.instructions,
          possible_conditions: fallback.possible_conditions,
        },
        warnings: [
          getErrorMessage(
            error,
            "AI OCR cleanup was unavailable, so a heuristic cleanup fallback was used."
          ),
        ],
        engine: "heuristic-medical-cleanup",
      };
    }
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

  const fallbackAnalysis = generateFallbackMedicalAnalysis(extractedText, language);
  const evidenceBundle = buildAnalysisEvidenceBundle(extractedText, fallbackAnalysis);

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
          content: buildMedicalAnalysisPrompt(language),
        },
        {
          role: "user",
          content: buildMedicalAnalysisUserMessage({
            extractedText,
            evidenceBundle,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = safeJsonParse<MedicalAnalysis>(content);

    if (!parsed) {
      throw new Error("OpenAI returned an invalid analysis payload.");
    }

    return normalizeAnalysis(parsed, fallbackAnalysis);
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
  const reportSnapshot = buildChatSnapshot({
    currentReport: {
      title: payload.currentReport.title,
      analysis: payload.currentReport.analysis,
      insights: payload.currentReport.insights,
    },
  });
  const groundedReply = buildGroundedReportChatReply({
    question: payload.question,
    currentAnalysis: payload.currentReport.analysis,
    currentInsights: payload.currentReport.insights,
    currentReportTitle: payload.currentReport.title,
    currentReportCreatedAt: payload.currentReport.createdAt,
    history,
    language,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiChatModel,
      temperature: 0.1,
      store: false,
      safety_identifier: safetyIdentifier(payload.userId),
      messages: [
        {
          role: "developer",
          content: [
            "You rewrite grounded answers about uploaded medical reports for non-expert users.",
            "Stay strictly within the facts already present in the grounded answer and supporting report data.",
            "Do not add any new diagnoses, medicines, values, trends, dates, timelines, or recommendations.",
            "Use recent chat history only to resolve references in the user's phrasing.",
            "If the grounded answer says the data is incomplete or unclear, preserve that.",
            "Keep the answer direct, calm, and easy to understand.",
            languageInstruction(language),
          ].join(" "),
        },
        {
          role: "user",
          content: `Preferred output language: ${language}\n\nCurrent report title: ${
            payload.currentReport.title || "Current report"
          }\n\nGrounded answer from structured report data:\n${trimForModel(
            groundedReply,
            4000
          )}\n\nSupporting report snapshot:\n${trimForModel(
            reportSnapshot,
            5000
          )}\n\nPrevious report history:\n${trimForModel(
            historyContext,
            3000
          )}\n\nRecent chat history:\n${trimForModel(
            payload.currentReport.chatHistory || "No previous chat history.",
            1500
          )}\n\nQuestion:\n${payload.question}\n\nRewrite the grounded answer so it is clearer for the user without adding any new facts.`,
        },
      ],
    });

    return normalizeText(
      completion.choices[0]?.message?.content || groundedReply ||
        chooseLocalizedText(language, {
          en: "I could not generate an answer for that report.",
          hi: "मैं इस रिपोर्ट के लिए उत्तर उत्पन्न नहीं कर सका।",
          hinglish: "Main is report ke liye answer generate nahi kar saka.",
        })
    );
  } catch {
    return groundedReply;
  }
}

export async function humanizeChatReply(payload: {
  message: string;
  userId?: string;
  language?: OutputLanguage;
  currentReport: {
    title?: string | null;
    analysis?: MedicalAnalysis | null;
    insights?: HealthInsights | null;
  };
}) {
  const language = payload.language || payload.currentReport.insights?.preferredLanguage || "en";
  const reportSnapshot = buildChatSnapshot({
    currentReport: {
      title: payload.currentReport.title,
      analysis: payload.currentReport.analysis,
      insights: payload.currentReport.insights,
    },
  });
  const fallbackReply = normalizeText(payload.message);

  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiChatModel,
      temperature: 0.1,
      store: false,
      safety_identifier: safetyIdentifier(payload.userId),
      messages: [
        {
          role: "developer",
          content: [
            "You rewrite existing assistant replies about uploaded medical reports into plain, easy-to-follow language.",
            "Stay strictly within the facts already present in the original reply and supporting report data.",
            "Do not add new diagnoses, numbers, recommendations, timelines, or warnings.",
            "Use short sentences and everyday words.",
            "Preserve uncertainty when the original reply says the data is incomplete or unclear.",
            languageInstruction(language),
          ].join(" "),
        },
        {
          role: "user",
          content: `Preferred output language: ${language}\n\nCurrent report title: ${
            payload.currentReport.title || "Current report"
          }\n\nOriginal assistant reply:\n${trimForModel(
            fallbackReply,
            3000
          )}\n\nSupporting report snapshot:\n${trimForModel(
            reportSnapshot,
            4000
          )}\n\nRewrite the assistant reply in simpler human language without adding any new facts.`,
        },
      ],
    });

    return normalizeText(completion.choices[0]?.message?.content || fallbackReply);
  } catch {
    return fallbackReply;
  }
}
