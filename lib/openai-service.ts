import crypto from "node:crypto";
import OpenAI from "openai";
import {
  ApiError,
  getErrorMessage,
  normalizeText,
  safeJsonParse,
} from "@/lib/api-utils";
import { chooseLocalizedText } from "@/lib/localization";
import {
  buildGroundedReportChatReply,
  buildHistoricalContext,
} from "@/lib/report-analytics";
import { generateFallbackMedicalAnalysis } from "@/lib/fallback-analysis";
import type {
  AiComparisonConfidence,
  AiComparisonDifference,
  AiComparisonDirection,
  AiComparisonValue,
  AiReportComparisonResult,
  ConditionInsight,
  HealthInsights,
  MedicalAnalysis,
  MedicineEntry,
  OutputLanguage,
  OcrStructuredData,
  OcrResult,
  ReportComparisonSummary,
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

const reportComparisonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "healthImpact", "keyDifferences", "notes", "followUpQuestions"],
  properties: {
    summary: { type: "string" },
    healthImpact: { type: "string" },
    keyDifferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "direction",
          "summary",
          "healthImpact",
          "confidence",
          "values",
        ],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          direction: {
            type: "string",
            enum: ["improved", "worsened", "changed", "stable", "mixed", "uncertain"],
          },
          summary: { type: "string" },
          healthImpact: { type: "string" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          values: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["reportId", "reportTitle", "reportDate", "value", "note"],
              properties: {
                reportId: { type: "string" },
                reportTitle: { type: "string" },
                reportDate: { type: "string" },
                value: { type: "string" },
                note: { type: "string" },
              },
            },
          },
        },
      },
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const symptomSupportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "possibleConditions",
    "suggestedMedicines",
    "precautions",
    "disclaimer",
  ],
  properties: {
    summary: { type: "string" },
    possibleConditions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "rationale"],
        properties: {
          name: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    suggestedMedicines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "purpose", "safetyNote"],
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
          safetyNote: { type: "string" },
        },
      },
    },
    precautions: {
      type: "array",
      items: { type: "string" },
    },
    disclaimer: { type: "string" },
  },
} as const;

type ComparisonSourceReport = {
  id: string;
  title?: string | null;
  createdAt: string;
  content?: string; 
  reportStatus?: string | null;
  ocrText?: string | null;
  analysis?: MedicalAnalysis | null;
  insights?: HealthInsights | null;
};

type GeneratedComparisonPayload = Omit<AiReportComparisonResult, "reports" | "generatedBy">;

type SymptomSupportCondition = {
  name: string;
  rationale: string;
};

type SymptomSupportMedicine = {
  name: string;
  purpose: string;
  safetyNote: string;
};

type SymptomSupportPayload = {
  summary: string;
  possibleConditions: SymptomSupportCondition[];
  suggestedMedicines: SymptomSupportMedicine[];
  precautions: string[];
  disclaimer: string;
};

type ChatReportContext = {
  title?: string | null;
  createdAt?: string;
  ocrText?: string | null;
  analysis?: MedicalAnalysis | null;
  insights?: HealthInsights | null;
  chatHistory?: string;
};

type ChatHistoryReport = {
  title?: string | null;
  createdAt?: string;
  analysis?: MedicalAnalysis | null;
  insights?: HealthInsights | null;
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

const SYMPTOM_KEYWORDS = [
  "fever",
  "headache",
  "weakness",
  "fatigue",
  "tired",
  "tiredness",
  "cough",
  "cold",
  "sore throat",
  "body ache",
  "body pain",
  "chills",
  "dizziness",
  "lightheaded",
  "nausea",
  "vomiting",
  "vomit",
  "diarrhea",
  "loose motion",
  "constipation",
  "stomach pain",
  "abdominal pain",
  "chest pain",
  "breathlessness",
  "shortness of breath",
  "runny nose",
  "blocked nose",
  "congestion",
  "rash",
  "itching",
  "burning urination",
  "pain while urinating",
  "frequent urination",
  "dehydration",
  "migraine",
  "back pain",
  "joint pain",
  "ear pain",
  "tooth pain",
  "gas",
  "acidity",
  "indigestion",
  "bukhar",
  "sar dard",
  "kamzori",
  "khansi",
  "jukam",
  "gale me dard",
  "ulti",
  "pet dard",
  "saans",
  "thakan",
];

const REPORT_CONTEXT_KEYWORDS = [
  "report",
  "reports",
  "lab",
  "labs",
  "test",
  "tests",
  "result",
  "results",
  "value",
  "values",
  "level",
  "levels",
  "range",
  "abnormal",
  "trend",
  "trends",
  "compare",
  "comparison",
  "history",
  "current report",
  "previous report",
  "uploaded report",
  "scan",
  "ocr",
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

const ADMINISTRATIVE_NOISE_PATTERNS = [
  /\b(?:address|road|street|near|phone|mobile|whatsapp|email|website|timing|hours|available|branch)\b/i,
  /\b(?:hospital|clinic|diagnostic|centre|center|laboratory|lab)\b/i,
];

const MEDICAL_OCR_NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/\bmgi?d[li]\b/gi, "mg/dL"],
  [/\bg[li]\/d[li]\b/gi, "g/dL"],
  [/\bmiu\s*\/?\s*l\b/gi, "mIU/L"],
  [/\bng\s*\/?\s*ml\b/gi, "ng/mL"],
  [/\bmmh[gq]\b/gi, "mmHg"],
  [/\bmcg\b/gi, "mcg"],
  [/\bhba[il1]c\b/gi, "HbA1c"],
  [/\bt\s*3\b/gi, "T3"],
  [/\bt\s*4\b/gi, "T4"],
  [/\bt\s*s\s*h\b/gi, "TSH"],
  [/\bw\s*b\s*c\b/gi, "WBC"],
  [/\br\s*b\s*c\b/gi, "RBC"],
];

function normalizeMedicalOcrLine(line: string) {
  let next = normalizeText(line);

  for (const [pattern, replacement] of MEDICAL_OCR_NORMALIZATION_RULES) {
    next = next.replace(pattern, replacement);
  }

  return next
    .replace(/[|]{2,}/g, " | ")
    .replace(/[_=]{2,}/g, " ")
    .replace(/\s*[:|-]\s*/g, (match) => (match.includes(":") ? ": " : " - "))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyAdministrativeNoise(line: string) {
  return (
    ADMINISTRATIVE_NOISE_PATTERNS.some((pattern) => pattern.test(line)) &&
    scoreMedicalLine(line) < 3 &&
    !/\b(?:bp|pulse|glucose|sugar|tablet|capsule|mg|ml|result|test|value)\b/i.test(line)
  );
}

function buildHeuristicMedicalOcrText(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return "";
  }

  const rawLines = normalized
    .split("\n")
    .map((line) => normalizeMedicalOcrLine(line))
    .filter(Boolean);
  const cleanedLines: string[] = [];

  for (const line of rawLines) {
    if (line.length < 2) {
      continue;
    }

    if (isLikelyAdministrativeNoise(line)) {
      continue;
    }

    const previousLine = cleanedLines[cleanedLines.length - 1] || "";
    const shouldMergeWithPrevious =
      previousLine.length > 0 &&
      previousLine.length < 45 &&
      line.length < 80 &&
      scoreMedicalLine(`${previousLine} ${line}`) >= scoreMedicalLine(previousLine) + 2;

    if (shouldMergeWithPrevious) {
      cleanedLines[cleanedLines.length - 1] = `${previousLine} ${line}`.replace(/\s{2,}/g, " ").trim();
      continue;
    }

    if (scoreMedicalLine(line) >= 2 || /\b(?:patient|date|age|sex|doctor|diagnosis|medicine|advice|remarks)\b/i.test(line)) {
      cleanedLines.push(line);
    }
  }

  const prioritizedLines =
    cleanedLines.length > 0
      ? cleanedLines
      : selectImportantMedicalLines(normalized, 24).map((line) => normalizeMedicalOcrLine(line));

  return normalizeText(prioritizedLines.join("\n")) || normalized;
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

function normalizeStructuredOcrData(structured?: OcrStructuredData | null): OcrStructuredData {
  return {
    medicines: uniqueNormalizedStrings(structured?.medicines || []),
    dosage: uniqueNormalizedStrings(structured?.dosage || []),
    instructions: uniqueNormalizedStrings(structured?.instructions || []),
    possible_conditions: uniqueNormalizedStrings(structured?.possible_conditions || []),
  };
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
  fallbackAnalysis: MedicalAnalysis,
  structuredOcr?: OcrStructuredData | null
): AnalysisEvidenceBundle {
  const normalizedStructuredOcr = normalizeStructuredOcrData(structuredOcr);

  return {
    importantLines: selectImportantMedicalLines(extractedText),
    candidateMedicines: dedupeByKey(
      [
        ...fallbackAnalysis.medicines.slice(0, 8).map((item) => ({
          name: item.name,
          dosage: item.dosage,
          frequency: item.frequency,
        })),
        ...normalizedStructuredOcr.medicines.slice(0, 8).map((name, index) => ({
          name,
          dosage: normalizedStructuredOcr.dosage[index] || "",
          frequency: "",
        })),
      ],
      (item) => normalizeLookupKey(item.name)
    ),
    candidateTestValues: fallbackAnalysis.testValues.slice(0, 10).map((item) => ({
      name: item.name,
      value: item.value,
      unit: item.unit,
      referenceRange: item.referenceRange,
      status: item.status,
    })),
    candidatePossibleConditions: uniqueNormalizedStrings([
      ...fallbackAnalysis.possibleConditions.slice(0, 5).map((item) => item.name),
      ...normalizedStructuredOcr.possible_conditions.slice(0, 5),
    ]),
    candidatePrecautions: uniqueNormalizedStrings([
      ...fallbackAnalysis.precautions.slice(0, 4),
      ...normalizedStructuredOcr.instructions.slice(0, 4),
    ]),
  };
}

function buildMedicalAnalysisPrompt(language: OutputLanguage) {
  return [
    "You structure OCR'd medical documents into strict JSON for patients.",
    "Treat the PRIMARY SOURCE OCR TEXT as the source of truth for all facts.",
    "Use the SECONDARY CLEANED OCR TEXT and OCR STRUCTURE HINTS only to recover formatting or clarify labels from the same document.",
    "If the primary OCR text conflicts with helper text, trust the primary OCR text.",
    "Use only facts present in the OCR text or clearly repeated in the evidence brief.",
    "Never invent diagnoses, medicines, doses, values, units, dates, or instructions.",
    "If the OCR text is noisy, incomplete, or ambiguous, prefer empty arrays and explicit uncertainty over guessing.",
    "If a condition is not explicitly diagnosed, label it only as a possibility and ground it in evidence.",
    "Prefer exact medicine names, numeric values, units, and reference ranges as written in the report.",
    "Ignore non-clinical noise such as addresses, billing text, repeated headers, and branding unless clinically relevant.",
    "Ignore hospital names, addresses, phone numbers, availability text, and promotional text unless they directly describe a finding or instruction.",
    "overview must briefly describe what this document appears to contain and summarize the most important clinical findings only.",
    "plainLanguageSummary must clearly cover: report summary, key findings, abnormal values if any, and a simple patient-friendly explanation.",
    "possibleConditions should be conservative and evidence-based. Do not infer a disease from a medicine name alone. Leave this empty when the report does not support a condition hypothesis.",
    "medicines should contain exact extracted medicines with dosage and frequency when available. Leave fields blank instead of guessing.",
    "testValues should include only values actually present in the report. Use status='unknown' when the direction is unclear.",
    "For each test value, prefer exact rows from the report and keep the value, unit, and reference range tightly grounded to the OCR text.",
    "precautions, followUpQuestions, and safetyFlags should be short, practical, and grounded in the report.",
    "Deduplicate repeated items and prefer the clearest version.",
    languageInstruction(language),
  ].join(" ");
}

function buildMedicalAnalysisUserMessage(payload: {
  primaryOcrText: string;
  cleanedOcrText?: string;
  evidenceBundle: AnalysisEvidenceBundle;
  structuredOcr?: OcrStructuredData | null;
  ocrEngine?: string;
}) {
  const structuredOcr = normalizeStructuredOcrData(payload.structuredOcr);
  const hasDistinctCleanedText =
    normalizeText(payload.cleanedOcrText || "") &&
    normalizeText(payload.cleanedOcrText || "") !== normalizeText(payload.primaryOcrText);

  return [
    "Analyze this medical document and return JSON only.",
    "The evidence brief and OCR structure hints are helper summaries extracted from the same document.",
    "If there is any conflict, trust the PRIMARY SOURCE OCR TEXT over everything else.",
    payload.ocrEngine ? `OCR engine: ${payload.ocrEngine}` : "",
    "",
    "IMPORTANT CLINICAL LINES:",
    payload.evidenceBundle.importantLines.length > 0
      ? payload.evidenceBundle.importantLines.map((line) => `- ${line}`).join("\n")
      : "- None confidently isolated.",
    "",
    "PRIMARY SOURCE OCR TEXT:",
    payload.primaryOcrText,
    "",
    hasDistinctCleanedText ? "SECONDARY CLEANED OCR TEXT:" : "",
    hasDistinctCleanedText ? payload.cleanedOcrText || "" : "",
    "",
    "OCR STRUCTURE HINTS:",
    JSON.stringify(structuredOcr, null, 2),
    "",
    "EVIDENCE BRIEF:",
    JSON.stringify(payload.evidenceBundle, null, 2),
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function buildAnalysisEvidenceSearchText(values: Array<string | null | undefined>) {
  const rawText = normalizeText(values.filter(Boolean).join("\n")).toLowerCase();
  const normalizedText = normalizeLookupKey(values.filter(Boolean).join("\n"));

  return {
    rawText,
    normalizedText,
  };
}

function hasGroundedEvidence(
  candidate: string,
  evidenceText: ReturnType<typeof buildAnalysisEvidenceSearchText>
) {
  const normalizedCandidate = normalizeLookupKey(candidate);
  const rawCandidate = normalizeText(candidate).toLowerCase();

  if (!normalizedCandidate) {
    return false;
  }

  if (rawCandidate.length >= 3 && evidenceText.rawText.includes(rawCandidate)) {
    return true;
  }

  if (normalizedCandidate.length >= 3 && evidenceText.normalizedText.includes(normalizedCandidate)) {
    return true;
  }

  const tokens = normalizedCandidate
    .split(" ")
    .filter((token) => token.length >= 4 || /\d/.test(token));

  return tokens.length > 0 && tokens.every((token) => evidenceText.normalizedText.includes(token));
}

function formatAnalysisValue(entry: Pick<TestValueEntry, "name" | "value" | "unit">) {
  const unit = entry.unit ? ` ${entry.unit}` : "";
  return `${entry.name} ${entry.value}${unit}`.trim();
}

function isAbnormalTestStatus(status: TestStatus) {
  return status === "high" || status === "low" || status === "borderline" || status === "abnormal";
}

function buildGroundedOverview(analysis: MedicalAnalysis, language: OutputLanguage) {
  const documentType = normalizeText(analysis.documentType || "") || "medical report";
  const abnormalValues = analysis.testValues.filter((item) => isAbnormalTestStatus(item.status)).slice(0, 3);

  if (abnormalValues.length > 0) {
    return chooseLocalizedText(language, {
      en: `This appears to be a ${documentType} with key findings including ${abnormalValues
        .map((item) => formatAnalysisValue(item))
        .join(", ")}.`,
      hi: `Yeh ${documentType} lagta hai jismein key findings mein ${abnormalValues
        .map((item) => formatAnalysisValue(item))
        .join(", ")} shamil hain.`,
      hinglish: `Yeh ${documentType} lagta hai jismein key findings mein ${abnormalValues
        .map((item) => formatAnalysisValue(item))
        .join(", ")} shamil hain.`,
    });
  }

  if (analysis.testValues.length > 0) {
    return chooseLocalizedText(language, {
      en: `This appears to be a ${documentType} with ${analysis.testValues.length} extracted test value(s).`,
      hi: `Yeh ${documentType} lagta hai jismein ${analysis.testValues.length} extracted test value(s) mile hain.`,
      hinglish: `Yeh ${documentType} lagta hai jismein ${analysis.testValues.length} extracted test value(s) mile hain.`,
    });
  }

  if (analysis.medicines.length > 0) {
    return chooseLocalizedText(language, {
      en: `This appears to be a ${documentType} with ${analysis.medicines.length} medicine entry(ies) mentioned.`,
      hi: `Yeh ${documentType} lagta hai jismein ${analysis.medicines.length} medicine entry(ies) mention hui hain.`,
      hinglish: `Yeh ${documentType} lagta hai jismein ${analysis.medicines.length} medicine entry(ies) mention hui hain.`,
    });
  }

  return chooseLocalizedText(language, {
    en: `This appears to be a ${documentType} based on the uploaded scan.`,
    hi: `Uploaded scan ke basis par yeh ${documentType} lagta hai.`,
    hinglish: `Uploaded scan ke basis par yeh ${documentType} lagta hai.`,
  });
}

function buildGroundedPlainLanguageSummary(analysis: MedicalAnalysis, language: OutputLanguage) {
  const abnormalValues = analysis.testValues.filter((item) => isAbnormalTestStatus(item.status)).slice(0, 3);
  const medicineNames = analysis.medicines.slice(0, 3).map((item) => item.name);

  return normalizeText(
    [
      chooseLocalizedText(language, {
        en: "Summary:",
        hi: "Summary:",
        hinglish: "Summary:",
      }),
      buildGroundedOverview(analysis, language),
      "",
      chooseLocalizedText(language, {
        en: "Key findings:",
        hi: "Key findings:",
        hinglish: "Key findings:",
      }),
      abnormalValues.length > 0
        ? abnormalValues.map((item) => `- ${formatAnalysisValue(item)} (${item.status})`).join("\n")
        : analysis.testValues.length > 0
          ? analysis.testValues.slice(0, 4).map((item) => `- ${formatAnalysisValue(item)} (${item.status})`).join("\n")
          : chooseLocalizedText(language, {
              en: "- No specific test value could be confidently extracted.",
              hi: "- Koi specific test value confidently extract nahi ho saki.",
              hinglish: "- Koi specific test value confidently extract nahi ho saki.",
            }),
      "",
      chooseLocalizedText(language, {
        en: "Abnormal values:",
        hi: "Abnormal values:",
        hinglish: "Abnormal values:",
      }),
      abnormalValues.length > 0
        ? abnormalValues.map((item) => `- ${formatAnalysisValue(item)} (${item.status})`).join("\n")
        : chooseLocalizedText(language, {
            en: "- No clearly abnormal value was confidently identified from the OCR text.",
            hi: "- OCR text se koi clearly abnormal value confidently identify nahi hui.",
            hinglish: "- OCR text se koi clearly abnormal value confidently identify nahi hui.",
          }),
      "",
      chooseLocalizedText(language, {
        en: "Simple explanation:",
        hi: "Simple explanation:",
        hinglish: "Simple explanation:",
      }),
      chooseLocalizedText(language, {
        en:
          medicineNames.length > 0
            ? `The scan shows report details along with medicines such as ${medicineNames.join(
                ", "
              )}. Please match these extracted details with the original report before taking action.`
            : "This is a simple explanation of what was visible in the uploaded report scan. Please match the extracted details with the original report before taking action.",
        hi:
          medicineNames.length > 0
            ? `Scan me report details ke saath ${medicineNames.join(
                ", "
              )} jaise medicines bhi dikh rahi hain. Koi action lene se pehle extracted details ko original report se match karein.`
            : "Yeh uploaded report scan me jo clearly visible tha uski simple explanation hai. Koi action lene se pehle extracted details ko original report se match karein.",
        hinglish:
          medicineNames.length > 0
            ? `Scan me report details ke saath ${medicineNames.join(
                ", "
              )} jaise medicines bhi dikh rahi hain. Koi action lene se pehle extracted details ko original report se match karein.`
            : "Yeh uploaded report scan me jo clearly visible tha uski simple explanation hai. Koi action lene se pehle extracted details ko original report se match karein.",
      }),
    ].join("\n")
  );
}

function applyMedicalAnalysisGuardrails(payload: {
  analysis: MedicalAnalysis;
  fallbackAnalysis: MedicalAnalysis;
  primaryOcrText: string;
  cleanedOcrText?: string;
  structuredOcr?: OcrStructuredData | null;
  evidenceBundle: AnalysisEvidenceBundle;
  language: OutputLanguage;
}) {
  const structuredOcr = normalizeStructuredOcrData(payload.structuredOcr);
  const evidenceText = buildAnalysisEvidenceSearchText([
    payload.primaryOcrText,
    payload.cleanedOcrText,
    ...payload.evidenceBundle.importantLines,
    JSON.stringify(structuredOcr),
    JSON.stringify(payload.evidenceBundle.candidateMedicines),
    JSON.stringify(payload.evidenceBundle.candidateTestValues),
  ]);
  const fallbackTestsByName = new Map(
    payload.fallbackAnalysis.testValues.map((item) => [normalizeLookupKey(item.name), item] as const)
  );
  const fallbackMedicineNames = new Set(
    payload.fallbackAnalysis.medicines.map((item) => normalizeLookupKey(item.name))
  );
  const fallbackConditionNames = new Set(
    [
      ...payload.fallbackAnalysis.possibleConditions.map((item) => item.name),
      ...structuredOcr.possible_conditions,
    ].map((item) => normalizeLookupKey(item))
  );

  const medicines = payload.analysis.medicines.filter((item) => {
    const medicineKey = normalizeLookupKey(item.name);
    return fallbackMedicineNames.has(medicineKey) || hasGroundedEvidence(item.name, evidenceText);
  });

  const testValues = payload.analysis.testValues.filter((item) => {
    const fallback = fallbackTestsByName.get(normalizeLookupKey(item.name));
    const nameGrounded = hasGroundedEvidence(item.name, evidenceText);
    const valueGrounded =
      hasGroundedEvidence(item.value, evidenceText) ||
      hasGroundedEvidence(formatAnalysisValue(item), evidenceText);
    const rangeGrounded = item.referenceRange
      ? hasGroundedEvidence(item.referenceRange, evidenceText)
      : false;
    const fallbackAligned =
      Boolean(fallback) &&
      normalizeLookupKey(fallback?.value || "") === normalizeLookupKey(item.value || "");

    return nameGrounded && (valueGrounded || rangeGrounded || fallbackAligned);
  });

  const possibleConditions = payload.analysis.possibleConditions.filter((item) => {
    const conditionKey = normalizeLookupKey(item.name);
    const evidenceGrounded = hasGroundedEvidence(item.evidence, evidenceText);
    const testMentioned = testValues.some((test) =>
      normalizeLookupKey(item.evidence).includes(normalizeLookupKey(test.name))
    );

    return (
      fallbackConditionNames.has(conditionKey) ||
      hasGroundedEvidence(item.name, evidenceText) ||
      evidenceGrounded ||
      testMentioned
    );
  });

  const nextAnalysis: MedicalAnalysis = {
    ...payload.analysis,
    medicines,
    testValues,
    possibleConditions,
  };
  const shouldSynthesizeOverview =
    !nextAnalysis.overview ||
    nextAnalysis.overview.length < 24 ||
    isLikelyAdministrativeNoise(nextAnalysis.overview);
  const shouldSynthesizePlainLanguageSummary =
    !nextAnalysis.plainLanguageSummary ||
    nextAnalysis.plainLanguageSummary.length < 80 ||
    /fallback parser|no plain-language explanation available/i.test(nextAnalysis.plainLanguageSummary);

  return {
    ...nextAnalysis,
    overview: shouldSynthesizeOverview
      ? buildGroundedOverview(nextAnalysis, payload.language)
      : nextAnalysis.overview,
    plainLanguageSummary: shouldSynthesizePlainLanguageSummary
      ? buildGroundedPlainLanguageSummary(nextAnalysis, payload.language)
      : nextAnalysis.plainLanguageSummary,
  } satisfies MedicalAnalysis;
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

function sortComparisonReports(reports: ComparisonSourceReport[]) {
  return [...reports].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function buildComparisonReportSummaries(
  reports: ComparisonSourceReport[]
): ReportComparisonSummary[] {
  return sortComparisonReports(reports).map((report) => ({
    id: report.id,
    title: normalizeText(report.title || "") || "Report",
    createdAt: report.createdAt,
    reportStatus: normalizeText(report.reportStatus || "") || "unknown",
    overallRisk: report.insights?.overallRisk || "unknown",
  }));
}

function hasComparableReportContent(report: ComparisonSourceReport) {
  return Boolean(
    normalizeText(report.ocrText || "") ||
      report.analysis ||
      report.insights
  );
}

function normalizeAiComparisonDirection(value: string): AiComparisonDirection {
  switch (value) {
    case "improved":
    case "worsened":
    case "changed":
    case "stable":
    case "mixed":
      return value;
    default:
      return "uncertain";
  }
}

function normalizeAiComparisonConfidence(value: string): AiComparisonConfidence {
  switch (value) {
    case "high":
    case "medium":
      return value;
    default:
      return "low";
  }
}

function fallbackComparisonValue(report: ReportComparisonSummary): AiComparisonValue {
  return {
    reportId: report.id,
    reportTitle: report.title,
    reportDate: report.createdAt,
    value: "Not clearly stated",
    note: "",
  };
}

function normalizeComparisonValue(
  value: AiComparisonValue,
  reports: ReportComparisonSummary[]
) {
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const reportsByTitle = new Map(
    reports.map((report) => [normalizeLookupKey(report.title), report] as const)
  );
  const match =
    reportsById.get(normalizeText(value.reportId || "")) ||
    reportsByTitle.get(normalizeLookupKey(value.reportTitle || ""));

  if (!match) {
    return null;
  }

  return {
    reportId: match.id,
    reportTitle: match.title,
    reportDate: match.createdAt,
    value: normalizeText(value.value || "") || "Not clearly stated",
    note: normalizeText(value.note || ""),
  } satisfies AiComparisonValue;
}

function normalizeComparisonDifference(
  difference: AiComparisonDifference,
  index: number,
  reports: ReportComparisonSummary[]
) {
  const valuesByReportId = new Map<string, AiComparisonValue>();

  for (const value of difference.values || []) {
    const normalizedValue = normalizeComparisonValue(value, reports);

    if (!normalizedValue || valuesByReportId.has(normalizedValue.reportId)) {
      continue;
    }

    valuesByReportId.set(normalizedValue.reportId, normalizedValue);
  }

  return {
    id:
      normalizeLookupKey(difference.id || difference.label || `difference-${index + 1}`).replace(
        /\s+/g,
        "-"
      ) || `difference-${index + 1}`,
    label: normalizeText(difference.label || "") || `Key difference ${index + 1}`,
    direction: normalizeAiComparisonDirection(difference.direction || ""),
    summary: normalizeText(difference.summary || "") || "No detailed comparison summary was available.",
    healthImpact:
      normalizeText(difference.healthImpact || "") ||
      "The health impact is uncertain from the available report data.",
    confidence: normalizeAiComparisonConfidence(difference.confidence || ""),
    values: reports.map((report) => valuesByReportId.get(report.id) || fallbackComparisonValue(report)),
  } satisfies AiComparisonDifference;
}

function normalizeGeneratedComparisonPayload(
  payload: GeneratedComparisonPayload,
  reports: ComparisonSourceReport[],
  generatedBy: AiReportComparisonResult["generatedBy"]
): AiReportComparisonResult {
  const reportSummaries = buildComparisonReportSummaries(reports);

  return {
    reports: reportSummaries,
    summary:
      normalizeText(payload.summary || "") ||
      "No overall AI comparison summary was generated for the selected reports.",
    healthImpact:
      normalizeText(payload.healthImpact || "") ||
      "No clear health impact could be determined from the available report data.",
    keyDifferences: dedupeByKey(
      (payload.keyDifferences || [])
        .slice(0, 8)
        .map((difference, index) =>
          normalizeComparisonDifference(difference, index, reportSummaries)
        ),
      (difference) => difference.id
    ),
    notes: uniqueNormalizedStrings(payload.notes || []),
    followUpQuestions: uniqueNormalizedStrings(payload.followUpQuestions || []),
    generatedBy,
  };
}

function buildComparisonStructuredSnapshot(report: ComparisonSourceReport) {
  return {
    documentType: report.analysis?.documentType || "",
    overview: report.analysis?.overview || "",
    plainLanguageSummary: report.analysis?.plainLanguageSummary || "",
    possibleConditions: (report.analysis?.possibleConditions || []).slice(0, 6).map((item) => ({
      name: item.name,
      confidence: item.confidence,
      evidence: item.evidence,
    })),
    medicines: (report.analysis?.medicines || []).slice(0, 10).map((item) => ({
      name: item.name,
      dosage: item.dosage,
      frequency: item.frequency,
    })),
    testValues: (report.analysis?.testValues || []).slice(0, 16).map((item) => ({
      name: item.name,
      value: item.value,
      unit: item.unit,
      referenceRange: item.referenceRange,
      status: item.status,
    })),
    insightsSummary: report.insights?.summary || "",
    overallRisk: report.insights?.overallRisk || "unknown",
    abnormalFindings: (report.insights?.abnormalFindings || []).slice(0, 8).map((item) => ({
      name: item.name,
      value: item.value,
      referenceRange: item.referenceRange,
      status: item.status,
    })),
    alerts: (report.insights?.alerts || []).slice(0, 5).map((item) => ({
      title: item.title,
      severity: item.severity,
      reason: item.reason,
    })),
    precautions: (report.analysis?.precautions || []).slice(0, 6),
    safetyFlags: (report.analysis?.safetyFlags || []).slice(0, 6),
  };
}

function buildComparisonReportSnapshot(
  report: ComparisonSourceReport,
  ocrCharBudget: number
) {
  const ocrText = normalizeText(report.ocrText || "");

  return [
    `Report ID: ${report.id}`,
    `Title: ${normalizeText(report.title || "") || "Report"}`,
    `Date: ${report.createdAt}`,
    `Status: ${normalizeText(report.reportStatus || "") || "unknown"}`,
    "OCR text excerpt:",
    ocrText ? trimForModel(ocrText, ocrCharBudget) : "Not available.",
    "Structured report data:",
    JSON.stringify(buildComparisonStructuredSnapshot(report), null, 2),
  ].join("\n");
}

function buildReportComparisonPrompt(language: OutputLanguage) {
  return [
    "You compare multiple medical reports that belong to the same person.",
    "Use only the provided OCR text and structured report data.",
    "Never invent values, units, diagnoses, dates, medicines, or clinical improvements.",
    "Compare the reports in chronological order from oldest to newest.",
    "Focus on concrete changes in key values, findings, medicines, impressions, and safety-relevant details.",
    "If a value is missing, unclear, or not directly comparable, say so plainly.",
    "Use 'uncertain' or 'mixed' when a change cannot be judged confidently.",
    "summary must be a concise overall comparison across the selected reports.",
    "healthImpact must explain the likely significance in plain language without diagnosing or prescribing.",
    "keyDifferences must contain up to 8 important changes.",
    "Each keyDifference must include values for every selected report in the order provided.",
    "followUpQuestions should be short clinician follow-up questions, not treatment instructions.",
    "Keep the wording clear, accurate, and conservative.",
    languageInstruction(language),
  ].join(" ");
}

function buildReportComparisonUserMessage(payload: {
  reports: ComparisonSourceReport[];
}) {
  const orderedReports = sortComparisonReports(payload.reports);
  const ocrCharBudget =
    orderedReports.length <= 2 ? 3200 : orderedReports.length <= 4 ? 2200 : 1500;

  return [
    "Compare these reports and return JSON only.",
    "The reports are listed from oldest to newest.",
    "",
    ...orderedReports.map((report, index) => `REPORT ${index + 1}\n${buildComparisonReportSnapshot(report, ocrCharBudget)}`),
  ].join("\n\n");
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

function languageInstruction(language: OutputLanguage) {
  if (language === "hi") {
    return "Write every human-readable value in Hindi. Keep JSON keys, medicine names, and test status enums in English.";
  }

  if (language === "hinglish") {
    return "Write every human-readable value in natural Hinglish using Roman script. Keep JSON keys, medicine names, and test status enums in English.";
  }

  return "Write every human-readable value in English.";
}

async function generateMedicalAnalysisWithGemini(payload: {
  extractedText: string;
  rawText?: string;
  structuredOcr?: OcrStructuredData | null;
  ocrEngine?: string;
  language: OutputLanguage;
}) {
  if (!serverConfig.geminiApiKey) {
    throw new ApiError("Gemini API key is not configured.", 500);
  }

  const primaryOcrText = trimForModel(normalizeText(payload.rawText || payload.extractedText), 30000);
  const cleanedOcrText = trimForModel(normalizeText(payload.extractedText), 30000);
  const sourceText = normalizeText([primaryOcrText, cleanedOcrText].filter(Boolean).join("\n\n"));
  const fallbackAnalysis = generateFallbackMedicalAnalysis(primaryOcrText || cleanedOcrText, payload.language);
  const evidenceBundle = buildAnalysisEvidenceBundle(
    sourceText || primaryOcrText || cleanedOcrText,
    fallbackAnalysis,
    payload.structuredOcr
  );

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
                text: `${buildMedicalAnalysisPrompt(payload.language)} Return strict JSON matching the provided schema.`,
              },
              {
                text: buildMedicalAnalysisUserMessage({
                  primaryOcrText,
                  cleanedOcrText,
                  evidenceBundle,
                  structuredOcr: payload.structuredOcr,
                  ocrEngine: payload.ocrEngine,
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

  return applyMedicalAnalysisGuardrails({
    analysis: normalizeAnalysis(parsed, fallbackAnalysis),
    fallbackAnalysis,
    primaryOcrText,
    cleanedOcrText,
    structuredOcr: payload.structuredOcr,
    evidenceBundle,
    language: payload.language,
  });
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



export async function generateMedicalAnalysis(payload: {
  extractedText: string;
  rawText?: string;
  structuredOcr?: OcrStructuredData | null;
  ocrEngine?: string;
  userId?: string;
  language?: OutputLanguage;
}) {
  const extractedText = trimForModel(normalizeText(payload.extractedText), 30000);
  const primaryOcrText = trimForModel(normalizeText(payload.rawText || payload.extractedText), 30000);
  const language = payload.language || "en";

  if (!extractedText && !primaryOcrText) {
    throw new ApiError("No readable OCR text is available for analysis.", 422);
  }

  const sourceText = normalizeText([primaryOcrText, extractedText].filter(Boolean).join("\n\n"));
  const fallbackAnalysis = generateFallbackMedicalAnalysis(primaryOcrText || extractedText, language);
  const evidenceBundle = buildAnalysisEvidenceBundle(
    sourceText || primaryOcrText || extractedText,
    fallbackAnalysis,
    payload.structuredOcr
  );

  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiAnalysisModel,
      temperature: 0.1,
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
            primaryOcrText,
            cleanedOcrText: extractedText,
            evidenceBundle,
            structuredOcr: payload.structuredOcr,
            ocrEngine: payload.ocrEngine,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = safeJsonParse<MedicalAnalysis>(content);

    if (!parsed) {
      throw new Error("OpenAI returned an invalid analysis payload.");
    }

    return applyMedicalAnalysisGuardrails({
      analysis: normalizeAnalysis(parsed, fallbackAnalysis),
      fallbackAnalysis,
      primaryOcrText,
      cleanedOcrText: extractedText,
      structuredOcr: payload.structuredOcr,
      evidenceBundle,
      language,
    });
  } catch {
    try {
      return await generateMedicalAnalysisWithGemini({
        extractedText,
        rawText: primaryOcrText,
        structuredOcr: payload.structuredOcr,
        ocrEngine: payload.ocrEngine,
        language,
      });
    } catch {
      return applyMedicalAnalysisGuardrails({
        analysis: generateFallbackMedicalAnalysis(primaryOcrText || extractedText, language),
        fallbackAnalysis,
        primaryOcrText,
        cleanedOcrText: extractedText,
        structuredOcr: payload.structuredOcr,
        evidenceBundle,
        language,
      });
    }
  }
}

async function generateAiReportComparisonWithGemini(payload: {
  reports: ComparisonSourceReport[];
  language: OutputLanguage;
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
                text: `${buildReportComparisonPrompt(payload.language)} Return strict JSON matching the provided schema.`,
              },
              {
                text: buildReportComparisonUserMessage({
                  reports: payload.reports,
                }),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: reportComparisonSchema,
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
    throw new Error(data?.error?.message || "Gemini comparison request failed.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = safeJsonParse<GeneratedComparisonPayload>(text);

  if (!parsed) {
    throw new Error("Gemini returned an invalid comparison payload.");
  }

  return normalizeGeneratedComparisonPayload(parsed, payload.reports, "gemini");
}

export async function generateAiReportComparison(payload: {
  reports: ComparisonSourceReport[];
  userId?: string;
  language?: OutputLanguage;
}) {
  const language = payload.language || "en";
  const reports = sortComparisonReports(payload.reports);

  if (reports.length < 2) {
    throw new ApiError("Select at least two reports to compare.", 422);
  }

  if (reports.filter(hasComparableReportContent).length < 2) {
    throw new ApiError(
      "At least two selected reports need OCR text or extracted analysis before AI comparison can run.",
      422
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiAnalysisModel,
      temperature: 0.1,
      store: false,
      safety_identifier: safetyIdentifier(payload.userId),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "medical_report_comparison",
          strict: true,
          schema: reportComparisonSchema,
        },
      },
      messages: [
        {
          role: "developer",
          content: buildReportComparisonPrompt(language),
        },
        {
          role: "user",
          content: buildReportComparisonUserMessage({
            reports,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = safeJsonParse<GeneratedComparisonPayload>(content);

    if (!parsed) {
      throw new Error("OpenAI returned an invalid comparison payload.");
    }

    return normalizeGeneratedComparisonPayload(parsed, reports, "openai");
  } catch (error) {
    if (!serverConfig.geminiApiKey) {
      throw error;
    }

    try {
      return await generateAiReportComparisonWithGemini({
        reports,
        language,
      });
    } catch {
      throw error;
    }
  }
}

async function generateReportOnlyChatReply(payload: {
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

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesIntentTerm(question: string, term: string) {
  const normalizedQuestion = normalizeIntentText(question);
  const normalizedTerm = normalizeIntentText(term);
  return Boolean(
    normalizedQuestion &&
      normalizedTerm &&
      ` ${normalizedQuestion} `.includes(` ${normalizedTerm} `)
  );
}

function questionMentionsKnownReportEntity(
  question: string,
  currentReport: Pick<ChatReportContext, "analysis" | "insights">
) {
  const normalizedQuestion = normalizeIntentText(question);

  if (!normalizedQuestion) {
    return false;
  }

  const candidateNames = [
    ...(currentReport.analysis?.testValues || []).map((item) => item.name),
    ...(currentReport.analysis?.medicines || []).map((item) => item.name),
    ...(currentReport.analysis?.possibleConditions || []).map((item) => item.name),
    ...(currentReport.insights?.testEvaluations || []).map((item) => item.name),
    ...(currentReport.insights?.abnormalFindings || []).map((item) => item.name),
  ]
    .map((item) => normalizeIntentText(item || ""))
    .filter((item) => item.length >= 3);

  return candidateNames.some(
    (candidate) => normalizedQuestion.includes(candidate) || candidate.includes(normalizedQuestion)
  );
}

function detectSymptomQuery(question: string) {
  const normalizedQuestion = normalizeIntentText(question);

  if (!normalizedQuestion) {
    return false;
  }

  const symptomMatches = SYMPTOM_KEYWORDS.filter((keyword) => includesIntentTerm(normalizedQuestion, keyword));
  const firstPersonContext =
    /\b(i have|i am|im|having|suffering|feel|feeling|my|from yesterday|since yesterday|since morning|since today)\b/.test(
      normalizedQuestion
    );
  const conciseSymptomNote = normalizedQuestion.split(" ").length <= 12;

  return symptomMatches.length >= 2 || (symptomMatches.length >= 1 && (firstPersonContext || conciseSymptomNote));
}

function detectReportQuestion(question: string, currentReport: ChatReportContext) {
  const normalizedQuestion = normalizeIntentText(question);

  if (!normalizedQuestion) {
    return false;
  }

  if (REPORT_CONTEXT_KEYWORDS.some((keyword) => includesIntentTerm(normalizedQuestion, keyword))) {
    return true;
  }

  return questionMentionsKnownReportEntity(normalizedQuestion, currentReport);
}

function buildSymptomSupportPrompt(language: OutputLanguage) {
  return [
    "You provide conservative symptom-based health education.",
    "Use the user's symptom description first, and use the report snapshot only as supporting context when it clearly matters.",
    "Do not claim to diagnose, confirm, or rule out a disease.",
    "possibleConditions should contain only plausible condition categories with short reasoning grounded in the symptoms.",
    "suggestedMedicines must include only common over-the-counter or supportive options when appropriate.",
    "Never suggest antibiotics, steroids, sedatives, injections, prescription-only medicines, or unsafe treatments.",
    "Do not include medicine dosages. Tell the user to follow the product label and speak with a clinician or pharmacist if they are pregnant, elderly, immunocompromised, have chronic disease, or already take medicines.",
    "precautions should include hydration, rest, monitoring, and urgent warning signs when relevant.",
    'disclaimer must be exactly: "This is not a medical diagnosis."',
    "Keep the wording clear, calm, and practical.",
    languageInstruction(language),
  ].join(" ");
}

function buildSymptomSupportUserMessage(payload: {
  question: string;
  currentReport: ChatReportContext;
  historyContext: string;
  reportSnapshot: string;
}) {
  return [
    "Analyze the user's described symptoms and return JSON only.",
    "If the uploaded report does not materially change the advice, focus on the symptoms and keep the report context minimal.",
    "",
    "User question:",
    payload.question,
    "",
    "Current report snapshot:",
    trimForModel(payload.reportSnapshot, 4500),
    "",
    "Current report OCR excerpt:",
    trimForModel(payload.currentReport.ocrText || "Not available.", 2500),
    "",
    "Previous report history:",
    trimForModel(payload.historyContext, 2500),
    "",
    "Recent chat history:",
    trimForModel(payload.currentReport.chatHistory || "No previous chat history.", 1200),
  ].join("\n");
}

function normalizeSymptomSupportPayload(
  payload: SymptomSupportPayload,
  language: OutputLanguage
): SymptomSupportPayload {
  const fallbackSummary = chooseLocalizedText(language, {
    en: "Based on the symptoms you shared, only general symptom relief advice is appropriate without an in-person medical evaluation.",
    hi: "Aapke bataye gaye symptoms ke basis par bina in-person medical evaluation ke sirf general symptom relief guidance dena theek hai.",
    hinglish:
      "Aapke bataye gaye symptoms ke basis par bina in-person medical evaluation ke sirf general symptom relief guidance dena theek hai.",
  });

  return {
    summary: normalizeText(payload.summary || "") || fallbackSummary,
    possibleConditions: (payload.possibleConditions || [])
      .map((item) => ({
        name: normalizeText(item?.name || ""),
        rationale: normalizeText(item?.rationale || ""),
      }))
      .filter((item) => item.name && item.rationale)
      .slice(0, 4),
    suggestedMedicines: (payload.suggestedMedicines || [])
      .map((item) => ({
        name: normalizeText(item?.name || ""),
        purpose: normalizeText(item?.purpose || ""),
        safetyNote: normalizeText(item?.safetyNote || ""),
      }))
      .filter((item) => item.name && item.purpose)
      .slice(0, 4),
    precautions: (payload.precautions || [])
      .map((item) => normalizeText(item || ""))
      .filter(Boolean)
      .slice(0, 6),
    disclaimer: "This is not a medical diagnosis.",
  };
}

function formatSymptomSupportReply(payload: SymptomSupportPayload, language: OutputLanguage) {
  const sectionTitle = (label: { en: string; hi: string; hinglish: string }) =>
    chooseLocalizedText(language, label);
  const noConditionText = chooseLocalizedText(language, {
    en: "No clear condition category could be narrowed down from the symptom text alone.",
    hi: "Sirf symptom text se koi clear condition category narrow down nahi hui.",
    hinglish: "Sirf symptom text se koi clear condition category narrow down nahi hui.",
  });
  const noMedicineText = chooseLocalizedText(language, {
    en: "No general medicine suggestion is appropriate from symptoms alone. Supportive care and clinician guidance are safer.",
    hi: "Sirf symptoms ke basis par koi general medicine suggestion theek nahi hai. Supportive care aur clinician guidance zyada safe hai.",
    hinglish:
      "Sirf symptoms ke basis par koi general medicine suggestion theek nahi hai. Supportive care aur clinician guidance zyada safe hai.",
  });
  const noPrecautionText = chooseLocalizedText(language, {
    en: "Rest, drink fluids, and seek urgent care if symptoms become severe or rapidly worsen.",
    hi: "Rest karein, fluids lein, aur symptoms severe ya rapidly worse hon to urgent care lein.",
    hinglish: "Rest karein, fluids lein, aur symptoms severe ya rapidly worse hon to urgent care lein.",
  });

  return normalizeText(
    [
      `${sectionTitle({
        en: "Summary",
        hi: "Summary",
        hinglish: "Summary",
      })}:`,
      payload.summary,
      "",
      `${sectionTitle({
        en: "Possible condition(s)",
        hi: "Possible condition(s)",
        hinglish: "Possible condition(s)",
      })}:`,
      payload.possibleConditions.length
        ? payload.possibleConditions.map((item) => `- ${item.name}: ${item.rationale}`).join("\n")
        : `- ${noConditionText}`,
      "",
      `${sectionTitle({
        en: "Suggested medicines",
        hi: "Suggested medicines",
        hinglish: "Suggested medicines",
      })}:`,
      payload.suggestedMedicines.length
        ? payload.suggestedMedicines
            .map((item) => `- ${item.name}: ${item.purpose}. ${item.safetyNote}`)
            .join("\n")
        : `- ${noMedicineText}`,
      "",
      `${sectionTitle({
        en: "Precautions",
        hi: "Precautions",
        hinglish: "Precautions",
      })}:`,
      payload.precautions.length
        ? payload.precautions.map((item) => `- ${item}`).join("\n")
        : `- ${noPrecautionText}`,
      "",
      `${sectionTitle({
        en: "Disclaimer",
        hi: "Disclaimer",
        hinglish: "Disclaimer",
      })}:`,
      payload.disclaimer,
    ].join("\n")
  );
}

function buildSymptomSupportUnavailableReply(language: OutputLanguage) {
  return normalizeText(
    [
      chooseLocalizedText(language, {
        en: "I could not generate symptom-based guidance right now.",
        hi: "Main abhi symptom-based guidance generate nahi kar saka.",
        hinglish: "Main abhi symptom-based guidance generate nahi kar saka.",
      }),
      chooseLocalizedText(language, {
        en: "If symptoms are severe, worsening, or include chest pain, trouble breathing, confusion, dehydration, or persistent high fever, seek urgent medical care.",
        hi: "Agar symptoms severe hon, worse ho rahe hon, ya chest pain, trouble breathing, confusion, dehydration, ya persistent high fever ho to urgent medical care lein.",
        hinglish:
          "Agar symptoms severe hon, worse ho rahe hon, ya chest pain, trouble breathing, confusion, dehydration, ya persistent high fever ho to urgent medical care lein.",
      }),
      "This is not a medical diagnosis.",
    ].join("\n\n")
  );
}

function buildCombinedChatReply(reportReply: string, symptomReply: string, language: OutputLanguage) {
  if (!reportReply) {
    return symptomReply;
  }

  return normalizeText(
    [
      `${chooseLocalizedText(language, {
        en: "Report context",
        hi: "Report context",
        hinglish: "Report context",
      })}:`,
      reportReply,
      "",
      symptomReply,
    ].join("\n")
  );
}

async function generateSymptomSupportWithGemini(payload: {
  question: string;
  language: OutputLanguage;
  currentReport: ChatReportContext;
  historyContext: string;
  reportSnapshot: string;
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
                text: `${buildSymptomSupportPrompt(payload.language)} Return strict JSON matching the provided schema.`,
              },
              {
                text: buildSymptomSupportUserMessage({
                  question: payload.question,
                  currentReport: payload.currentReport,
                  historyContext: payload.historyContext,
                  reportSnapshot: payload.reportSnapshot,
                }),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: symptomSupportSchema,
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
    throw new Error(data?.error?.message || "Gemini symptom support request failed.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = safeJsonParse<SymptomSupportPayload>(text);

  if (!parsed) {
    throw new Error("Gemini returned an invalid symptom support payload.");
  }

  return normalizeSymptomSupportPayload(parsed, payload.language);
}

async function generateSymptomSupport(payload: {
  question: string;
  userId?: string;
  language: OutputLanguage;
  currentReport: ChatReportContext;
  historyContext: string;
  reportSnapshot: string;
}) {
  try {
    const completion = await openai.chat.completions.create({
      model: serverConfig.openAiAnalysisModel,
      temperature: 0.1,
      store: false,
      safety_identifier: safetyIdentifier(payload.userId),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "medical_symptom_support",
          strict: true,
          schema: symptomSupportSchema,
        },
      },
      messages: [
        {
          role: "developer",
          content: buildSymptomSupportPrompt(payload.language),
        },
        {
          role: "user",
          content: buildSymptomSupportUserMessage({
            question: payload.question,
            currentReport: payload.currentReport,
            historyContext: payload.historyContext,
            reportSnapshot: payload.reportSnapshot,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = safeJsonParse<SymptomSupportPayload>(content);

    if (!parsed) {
      throw new Error("OpenAI returned an invalid symptom support payload.");
    }

    return normalizeSymptomSupportPayload(parsed, payload.language);
  } catch (error) {
    if (!serverConfig.geminiApiKey) {
      throw error;
    }

    try {
      return await generateSymptomSupportWithGemini(payload);
    } catch {
      throw error;
    }
  }
}

export async function generateChatReply(payload: {
  question: string;
  userId?: string;
  language?: OutputLanguage;
  currentReport: ChatReportContext;
  history?: ChatHistoryReport[];
}) {
  const language = payload.language || payload.currentReport.insights?.preferredLanguage || "en";
  const symptomQueryDetected = detectSymptomQuery(payload.question);
  const reportQueryDetected = detectReportQuestion(payload.question, payload.currentReport);
  const shouldAnswerFromReport = reportQueryDetected || !symptomQueryDetected;
  const reportReply = shouldAnswerFromReport
    ? await generateReportOnlyChatReply({
        question: payload.question,
        userId: payload.userId,
        language,
        currentReport: payload.currentReport,
        history: payload.history,
      })
    : "";

  if (!symptomQueryDetected) {
    return reportReply;
  }

  const history = payload.history || [];
  const historyContext = buildHistoricalContext(history, language);
  const reportSnapshot = buildChatSnapshot({
    currentReport: {
      title: payload.currentReport.title,
      analysis: payload.currentReport.analysis,
      insights: payload.currentReport.insights,
    },
  });

  try {
    const symptomSupport = await generateSymptomSupport({
      question: payload.question,
      userId: payload.userId,
      language,
      currentReport: payload.currentReport,
      historyContext,
      reportSnapshot,
    });
    const symptomReply = formatSymptomSupportReply(symptomSupport, language);

    return buildCombinedChatReply(reportReply, symptomReply, language);
  } catch {
    if (reportReply) {
      return buildCombinedChatReply(reportReply, buildSymptomSupportUnavailableReply(language), language);
    }

    return buildSymptomSupportUnavailableReply(language);
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
