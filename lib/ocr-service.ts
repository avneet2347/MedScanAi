import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import tesseract from "node-tesseract-ocr";
import { getErrorMessage, normalizeText } from "@/lib/api-utils";
import { generateFallbackMedicalAnalysis } from "@/lib/fallback-analysis";
import { renderPdfPagesToPngBuffers } from "@/lib/pdf-rasterizer";
import type { OcrResult, OcrStructuredData } from "@/lib/report-types";

const OCR_FALLBACK_MESSAGE =
  "OCR could not confidently extract readable medical text from this file. Please upload a clearer JPG, PNG, or PDF scan, then try again.";

const MEDICAL_READABILITY_PATTERNS = [
  /\b(?:patient|name|age|sex|date|doctor|department|investigation|report|lab|laboratory|specimen)\b/i,
  /\b(?:hemoglobin|hba1c|glucose|sugar|creatinine|urea|bilirubin|platelet|wbc|rbc|cholesterol|triglyceride|hdl|ldl|tsh|t3|t4|vitamin|sodium|potassium|calcium|bp|pulse)\b/i,
  /\b(?:tablet|tab|capsule|cap|syrup|injection|inj|drop|cream|ointment|solution|rx|prescription)\b/i,
  /\b(?:mg|mcg|g|ml|iu|units?|meq|mmhg|bpm|g\/dl|mg\/dl|mmol\/l|ng\/ml|miu\/l|u\/l|cells\/cumm|x10\^3)\b/i,
  /\b(?:reference|range|result|findings|impression|advice|diagnosis|remarks)\b/i,
];

const ADMINISTRATIVE_NOISE_PATTERNS = [
  /\b(?:address|road|street|near|phone|mobile|whatsapp|email|website|timing|hours|available|branch)\b/i,
  /\b(?:hospital|clinic|diagnostic|centre|center|laboratory|lab)\b/i,
];

const MEDICAL_OCR_NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/\bmgi?d[li]\b/gi, "mg/dL"],
  [/\bg[li]\/d[li]\b/gi, "g/dL"],
  [/\bmiu\s*\/?\s*l\b/gi, "mIU/L"],
  [/\buiu\s*\/?\s*ml\b/gi, "uIU/mL"],
  [/\bng\s*\/?\s*ml\b/gi, "ng/mL"],
  [/\bmmh[gq]\b/gi, "mmHg"],
  [/\bmmol\s*\/?\s*l\b/gi, "mmol/L"],
  [/\bmeq\s*\/?\s*l\b/gi, "mEq/L"],
  [/\bhba[il1]c\b/gi, "HbA1c"],
  [/\bt\s*3\b/gi, "T3"],
  [/\bt\s*4\b/gi, "T4"],
  [/\bt\s*s\s*h\b/gi, "TSH"],
  [/\bw\s*b\s*c\b/gi, "WBC"],
  [/\br\s*b\s*c\b/gi, "RBC"],
];

type OcrTextAssessment = {
  score: number;
  readable: boolean;
  normalized: string;
};

type PreparedOcrImageVariant = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  preprocessingApplied: boolean;
  label: string;
};

function isUsableOcrAssessment(assessment: OcrTextAssessment) {
  return (
    Boolean(assessment.normalized) &&
    (assessment.readable || assessment.score >= 18 || assessment.normalized.length >= 60)
  );
}

function scoreMedicalLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return 0;
  }

  let score = 0;

  if (/\d/.test(trimmed)) {
    score += 2;
  }

  if (/[A-Za-z]{3,}/.test(trimmed)) {
    score += 2;
  }

  if (looksLikeStructuredMedicalLine(trimmed)) {
    score += 4;
  }

  for (const pattern of MEDICAL_READABILITY_PATTERNS) {
    if (pattern.test(trimmed)) {
      score += 3;
    }
  }

  if (/^[A-Z0-9\s\-/:().,%]+$/.test(trimmed)) {
    score += 1;
  }

  if (trimmed.length > 180) {
    score -= 1;
  }

  if ((trimmed.match(/[^A-Za-z0-9\s.,:;/%()+\-]/g) || []).length > 3) {
    score -= 2;
  }

  return score;
}

function repairSegmentedMedicalTokens(line: string) {
  return line
    .replace(/\bH\s*b\s*A\s*1\s*c\b/gi, "HbA1c")
    .replace(/\bT\s*S\s*H\b/gi, "TSH")
    .replace(/\bT\s*3\b/gi, "T3")
    .replace(/\bT\s*4\b/gi, "T4")
    .replace(/\bW\s*B\s*C\b/gi, "WBC")
    .replace(/\bR\s*B\s*C\b/gi, "RBC")
    .replace(/\bm\s*g\s*\/\s*d\s*l\b/gi, "mg/dL")
    .replace(/\bg\s*\/\s*d\s*l\b/gi, "g/dL")
    .replace(/\bm\s*I\s*U\s*\/\s*L\b/gi, "mIU/L")
    .replace(/\bu\s*I\s*U\s*\/\s*m\s*L\b/gi, "uIU/mL")
    .replace(/\bn\s*g\s*\/\s*m\s*l\b/gi, "ng/mL")
    .replace(/\bm\s*m\s*H\s*g\b/gi, "mmHg");
}

function looksLikeStructuredMedicalLine(line: string) {
  const normalized = normalizeText(line);

  if (!normalized) {
    return false;
  }

  const hasValue = /\b-?\d+(?:\.\d+)?(?:\/\d{2,3})?\b/.test(normalized);
  const hasUnitOrRange =
    /\b(?:mg\/dL|g\/dL|mIU\/L|uIU\/mL|ng\/mL|mmHg|mmol\/L|mEq\/L|IU\/L|U\/L|bpm|cells\/cumm)\b/i.test(
      normalized
    ) ||
    /\b(?:ref(?:erence)?(?: range)?|normal(?: range)?|bio\.?\s*ref\.?\s*interval|range)\b/i.test(
      normalized
    ) ||
    /(?:<|>)\s*-?\d+(?:\.\d+)?/.test(normalized) ||
    /-?\d+(?:\.\d+)?\s*(?:to|-)\s*-?\d+(?:\.\d+)?/.test(normalized);

  return hasValue && hasUnitOrRange;
}

function countStructuredMedicalLines(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => looksLikeStructuredMedicalLine(line)).length;
}

function assessOcrTextQuality(text: string): OcrTextAssessment {
  const normalized = normalizeText(text);

  // ✅ Early rejection (very important)
  if (!normalized || normalized.length < 20) {
    return {
      score: 0,
      readable: false,
      normalized,
    };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const tokens = normalized.split(/\s+/).filter(Boolean);

  const wordLikeTokens = tokens.filter((token) => /[A-Za-z]{2,}/.test(token));
  const digitTokens = tokens.filter((token) => /\d/.test(token));

  // ❌ Garbage detection
  const suspiciousTokens = tokens.filter(
    (token) =>
      token.length >= 5 &&
      /[A-Za-z]{5,}/.test(token) &&
      !/[aeiou]/i.test(token) &&
      !/\d/.test(token)
  );

  // ✅ Strong medical lines
  const strongLines = lines.filter((line) => scoreMedicalLine(line) >= 4).length;

  // ✅ Medical keyword detection
  const medicalHits = MEDICAL_READABILITY_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(normalized) ? 1 : 0),
    0
  );

  // ✅ NEW: Structured pattern detection (VERY IMPORTANT)
  const structuredLines = lines.filter((line) =>
    /\b[A-Za-z]+\b\s*[:\-]\s*\d+/.test(line)
  ).length;

  // ✅ NEW: Unit detection (VERY IMPORTANT)
  const unitHits =
    (normalized.match(
      /\b(mg\/dl|g\/dl|mmhg|bpm|mmol\/l|ng\/ml|iu\/l|cells\/cumm)\b/gi
    ) || []).length;

  // ❌ Noise detection
  const weirdChars = (normalized.match(/[^\p{L}\p{N}\s.,:;/%()+\-]/gu) || []).length;
  const weirdRatio = weirdChars / Math.max(normalized.length, 1);

  let score = 0;

  // ✅ Length & structure
  if (normalized.length >= 40) score += 10;
  if (normalized.length >= 120) score += 10;
  if (lines.length >= 3) score += 8;
  if (lines.length >= 8) score += 6;

  // ✅ Words & numbers
  if (wordLikeTokens.length >= 5) score += 10;
  if (wordLikeTokens.length >= 12) score += 8;
  if (digitTokens.length >= 2) score += 8;
  if (digitTokens.length >= 6) score += 6;

  // ✅ Medical relevance
  score += Math.min(medicalHits * 8, 24);
  score += Math.min(strongLines * 4, 16);

  // ✅ NEW: Structure + Units (CORE IMPROVEMENT)
  score += Math.min(structuredLines * 6, 24);
  score += Math.min(unitHits * 5, 20);

  // ❌ Penalties
  if (tokens.length > 0 && wordLikeTokens.length / tokens.length < 0.35) {
    score -= 10;
  }

  if (tokens.length > 0 && suspiciousTokens.length / tokens.length > 0.22) {
    score -= 12;
  }

  if (weirdRatio > 0.05) score -= 8;
  if (weirdRatio > 0.1) score -= 12;

  // ✅ FINAL DECISION (STRONGER LOGIC)
  const readable =
    score >= 25 &&
    wordLikeTokens.length >= 5 &&
    (
      medicalHits >= 2 ||
      structuredLines >= 2 ||
      unitHits >= 1 ||
      strongLines >= 2
    );

  return {
    score,
    readable,
    normalized,
  };
}

function normalizeMedicalOcrLine(line: string) {
  let next = repairSegmentedMedicalTokens(normalizeText(line));

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

function selectImportantMedicalLines(text: string, maxLines = 32) {
  return normalizeText(text)
    .split("\n")
    .map((line, index) => {
      const normalizedLine = normalizeMedicalOcrLine(line);

      return {
        index,
        line: normalizedLine,
        score: scoreMedicalLine(normalizedLine),
      };
    })
    .filter((item) => item.line && item.score >= 2)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxLines)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.line);
}

function isLikelyAdministrativeNoise(line: string) {
  return (
    ADMINISTRATIVE_NOISE_PATTERNS.some((pattern) => pattern.test(line)) &&
    scoreMedicalLine(line) < 3 &&
    !/\b(?:bp|pulse|glucose|sugar|tablet|capsule|mg|ml|result|test|value)\b/i.test(line)
  );
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

function normalizeStructuredOcrData(structured?: Partial<OcrStructuredData> | null): OcrStructuredData {
  return {
    medicines: uniqueNormalizedStrings(structured?.medicines || []),
    dosage: uniqueNormalizedStrings(structured?.dosage || []),
    instructions: uniqueNormalizedStrings(structured?.instructions || []),
    possible_conditions: uniqueNormalizedStrings(structured?.possible_conditions || []),
  };
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
  const seenLines = new Map<string, number>();

  for (const line of rawLines) {
    if (line.length < 2) {
      continue;
    }

    if (isLikelyAdministrativeNoise(line)) {
      continue;
    }

    const normalizedKey = line.toLowerCase();
    const repeatCount = seenLines.get(normalizedKey) || 0;
    const lineScore = scoreMedicalLine(line);
    const lineLooksStructured = looksLikeStructuredMedicalLine(line);

    if (repeatCount > 0 && lineScore <= 4) {
      continue;
    }

    seenLines.set(normalizedKey, repeatCount + 1);

    const previousLine = cleanedLines[cleanedLines.length - 1] || "";
    const previousLooksStructured = looksLikeStructuredMedicalLine(previousLine);
    const shouldMergeWithPrevious =
      previousLine.length > 0 &&
      !previousLooksStructured &&
      !lineLooksStructured &&
      previousLine.length < 72 &&
      line.length < 110 &&
      !/\b-?\d+(?:\.\d+)?(?:\/\d{2,3})?\b/.test(previousLine) &&
      scoreMedicalLine(`${previousLine} ${line}`) >= scoreMedicalLine(previousLine) + 2;

    if (shouldMergeWithPrevious) {
      cleanedLines[cleanedLines.length - 1] = `${previousLine} ${line}`
        .replace(/\s{2,}/g, " ")
        .trim();
      continue;
    }

    if (
      lineScore >= 2 ||
      lineLooksStructured ||
      /\b(?:patient|date|age|sex|doctor|diagnosis|medicine|advice|remarks|impression)\b/i.test(
        line
      )
    ) {
      cleanedLines.push(line);
    }
  }

  const prioritizedLines =
    cleanedLines.length > 0
      ? cleanedLines
      : selectImportantMedicalLines(normalized, 24).map((line) => normalizeMedicalOcrLine(line));

  return normalizeText(prioritizedLines.join("\n")) || normalized;
}

function normalizeCleanedOcrText(cleanedText: string, fallbackText: string) {
  const normalizedCleanedText = normalizeText(cleanedText);
  const heuristicText = buildHeuristicMedicalOcrText(fallbackText);
  const normalizedFallbackText = normalizeText(fallbackText);
  const cleanedImportantLines = selectImportantMedicalLines(normalizedCleanedText, 24).length;
  const fallbackImportantLines = selectImportantMedicalLines(normalizedFallbackText, 24).length;
  const cleanedStructuredLines = countStructuredMedicalLines(normalizedCleanedText);
  const fallbackStructuredLines = countStructuredMedicalLines(normalizedFallbackText);
  const cleanedLooksOverCompressed =
    Boolean(normalizedCleanedText) &&
    Boolean(normalizedFallbackText) &&
    (normalizedCleanedText.length < normalizedFallbackText.length * 0.45 ||
      cleanedStructuredLines + 1 < fallbackStructuredLines) &&
    cleanedImportantLines + 2 < fallbackImportantLines;

  return (
    (cleanedLooksOverCompressed ? "" : normalizedCleanedText) ||
    heuristicText ||
    normalizedFallbackText
  );
}

function buildHeuristicStructuredOcrData(text: string) {
  const fallbackAnalysis = generateFallbackMedicalAnalysis(text, "en");

  return normalizeStructuredOcrData({
    medicines: fallbackAnalysis.medicines.map((item) => item.name),
    dosage: fallbackAnalysis.medicines.map((item) => item.dosage),
    instructions: [
      ...fallbackAnalysis.medicines.map((item) =>
        [item.frequency, item.notes].filter(Boolean).join(" - ")
      ),
      ...fallbackAnalysis.precautions,
    ],
    possible_conditions: fallbackAnalysis.possibleConditions.map((item) => item.name),
  });
}

function cleanAndStructureMedicalOcrText(payload: { extractedText: string }) {
  const extractedText = normalizeText(payload.extractedText);

  if (!extractedText) {
    return {
      text: "",
      rawText: "",
      structured: normalizeStructuredOcrData(),
      warnings: ["OCR cleanup received empty text and returned an empty local heuristic result."],
      engine: "heuristic-medical-cleanup",
    };
  }

  const cleanedText = normalizeCleanedOcrText(
    buildHeuristicMedicalOcrText(extractedText),
    extractedText
  );
  const structured = buildHeuristicStructuredOcrData(cleanedText || extractedText);
  const warnings =
    cleanedText && cleanedText !== extractedText
      ? [
          "OCR text was cleaned locally with line-preserving heuristics to improve readability before analysis.",
        ]
      : undefined;

  return {
    text: cleanedText || extractedText,
    rawText: extractedText,
    structured,
    warnings,
    engine: "heuristic-medical-cleanup",
  };
}

async function buildImageVariantsForOcr(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<PreparedOcrImageVariant[]> {
  const originalVariant: PreparedOcrImageVariant = {
    buffer: payload.buffer,
    filename: payload.filename,
    mimeType: payload.mimeType,
    preprocessingApplied: false,
    label: "original",
  };

  if (!payload.mimeType.startsWith("image/")) {
    return [originalVariant];
  }

  try {
    const metadata = await sharp(payload.buffer, { failOn: "none" }).metadata();
    const baseName = path.basename(payload.filename, path.extname(payload.filename) || undefined) || "scan";
    let pipeline = sharp(payload.buffer, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" });
    const variants = [originalVariant];

    if (metadata.width && metadata.width < 1600) {
      pipeline = pipeline.resize({
        width: 1800,
        fit: "inside",
        withoutEnlargement: false,
      });
    } else if (metadata.width && metadata.width > 2400) {
      pipeline = pipeline.resize({
        width: 2400,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const normalizedBuffer = await pipeline
      .clone()
      .grayscale()
      .normalize()
      .gamma(1.1)
      .sharpen({ sigma: 1.2, m1: 0.5, m2: 2 })
      .linear(1.12, -10)
      .png({ compressionLevel: 9 })
      .toBuffer();

    variants.push({
      buffer: normalizedBuffer,
      filename: `${baseName}-ocr.png`,
      mimeType: "image/png",
      preprocessingApplied: true,
      label: "normalized",
    });

    const highContrastBuffer = await pipeline
      .clone()
      .grayscale()
      .normalize()
      .median(1)
      .gamma(1.18)
      .linear(1.24, -18)
      .sharpen({ sigma: 1.35, m1: 0.45, m2: 2.4 })
      .png({ compressionLevel: 9 })
      .toBuffer();

    variants.push({
      buffer: highContrastBuffer,
      filename: `${baseName}-ocr-contrast.png`,
      mimeType: "image/png",
      preprocessingApplied: true,
      label: "high-contrast",
    });

    const thresholdedBuffer = await pipeline
      .clone()
      .grayscale()
      .normalize()
      .median(1)
      .gamma(1.12)
      .linear(1.28, -20)
      .threshold(172, { grayscale: true })
      .sharpen({ sigma: 0.9, m1: 0.4, m2: 1.8 })
      .png({ compressionLevel: 9 })
      .toBuffer();

    variants.push({
      buffer: thresholdedBuffer,
      filename: `${baseName}-ocr-threshold.png`,
      mimeType: "image/png",
      preprocessingApplied: true,
      label: "thresholded",
    });

    const denoisedBuffer = await pipeline
      .clone()
      .grayscale()
      .normalize()
      .median(2)
      .gamma(1.16)
      .linear(1.2, -14)
      .sharpen({ sigma: 1.1, m1: 0.45, m2: 2.1 })
      .png({ compressionLevel: 9 })
      .toBuffer();

    variants.push({
      buffer: denoisedBuffer,
      filename: `${baseName}-ocr-denoised.png`,
      mimeType: "image/png",
      preprocessingApplied: true,
      label: "denoised",
    });

    return variants;
  } catch {
    return [originalVariant];
  }
}

async function runTesseractOnImage(
  buffer: Buffer,
  filename: string,
  config?: {
    psm?: number;
  }
) {
  const extension = path.extname(filename).replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
  const tempPath = path.join(
    os.tmpdir(),
    `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`
  );

  await fs.writeFile(tempPath, buffer);

  try {
    const text = await tesseract.recognize(tempPath, {
      lang: "eng",
      oem: 1,
      psm: config?.psm ?? 6,
      preserve_interword_spaces: 1,
    });

    return normalizeText(text);
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

async function runBestTesseractOnImageVariants(variants: PreparedOcrImageVariant[]) {
  const configs = [{ psm: 6 }, { psm: 4 }, { psm: 11 }, { psm: 3 }];
  const warnings: string[] = [];
  let best:
    | {
        text: string;
        score: number;
        engine: string;
      }
    | null = null;

  for (const variant of variants) {
    for (const config of configs) {
      try {
        const text = await runTesseractOnImage(variant.buffer, variant.filename, config);
        const assessment = assessOcrTextQuality(text);

        if (!text.trim()) {
          continue;
        }

        if (!best || assessment.score > best.score) {
          best = {
            text: assessment.normalized,
            score: assessment.score,
            engine: `tesseract-${variant.label}-psm${config.psm}`,
          };
        }
      } catch (error) {
        warnings.push(
          `${variant.label} tesseract psm ${config.psm} failed: ${getErrorMessage(
            error,
            "Local OCR unavailable."
          )}`
        );
      }
    }
  }

  return {
    text: best?.text || "",
    engine: best?.engine || "tesseract-unavailable",
    confidence: best
      ? best.score >= 68
        ? ("high" as const)
        : best.score >= 42
          ? ("medium" as const)
          : ("low" as const)
      : ("low" as const),
    warnings,
  };
}

async function runTesseractOnPdf(buffer: Buffer) {
  const pageImages = await renderPdfPagesToPngBuffers(buffer, {
    maxPages: 5,
    targetWidth: 2200,
  });
  const warnings: string[] = [];
  const strongPages: Array<{ pageNumber: number; text: string; score: number }> = [];
  const fallbackPages: Array<{ pageNumber: number; text: string; score: number }> = [];

  for (const pageImage of pageImages) {
    const pageVariants = await buildImageVariantsForOcr({
      buffer: pageImage.buffer,
      filename: `pdf-page-${pageImage.pageNumber}.png`,
      mimeType: "image/png",
    });
    const bestAttempt = await runBestTesseractOnImageVariants(pageVariants);
    warnings.push(...bestAttempt.warnings.map((warning) => `Page ${pageImage.pageNumber}: ${warning}`));

    const assessment = assessOcrTextQuality(bestAttempt.text);

    if (isUsableOcrAssessment(assessment)) {
      strongPages.push({
        pageNumber: pageImage.pageNumber,
        text: assessment.normalized,
        score: assessment.score,
      });
      continue;
    }

    if (assessment.normalized) {
      fallbackPages.push({
        pageNumber: pageImage.pageNumber,
        text: assessment.normalized,
        score: assessment.score,
      });
      warnings.push(
        `Page ${pageImage.pageNumber} OCR was low confidence and will only be used if no stronger page text is available.`
      );
    }
  }

  const selectedPages =
    strongPages.length > 0
      ? strongPages
      : (
          fallbackPages
            .filter((page) => page.score >= 10)
            .sort((left, right) => left.pageNumber - right.pageNumber)
        ).length > 0
        ? fallbackPages
            .filter((page) => page.score >= 10)
            .sort((left, right) => left.pageNumber - right.pageNumber)
        : fallbackPages
            .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
            .slice(0, Math.min(3, fallbackPages.length));

  return {
    text: normalizeText(selectedPages.map((page) => page.text).join("\n\n")),
    warnings,
  };
}

async function finalizeOcrResult(payload: {
  rawText: string;
  engine: string;
  confidence: OcrResult["confidence"];
  warnings?: string[];
}) {
  const cleaned = await cleanAndStructureMedicalOcrText({
    extractedText: payload.rawText,
  });
  const warnings = [...(payload.warnings || []), ...(cleaned.warnings || [])].filter(Boolean);

  return {
    text: cleaned.text || payload.rawText,
    rawText: cleaned.rawText || payload.rawText,
    structured: cleaned.structured,
    warnings: warnings.length > 0 ? warnings : undefined,
    engine: `${payload.engine}+${cleaned.engine}`,
    confidence:
      cleaned.engine === "heuristic-medical-cleanup" && payload.confidence === "high"
        ? "medium"
        : payload.confidence,
  } satisfies OcrResult;
}

function buildFallbackOcrResult(warnings?: string[]) {
  return {
    text: OCR_FALLBACK_MESSAGE,
    rawText: "",
    engine: "fallback-message",
    confidence: "low",
    structured: {
      medicines: [],
      dosage: [],
      instructions: [
        "Upload a clearer scan with high contrast, readable medicine names, and visible dosage details.",
      ],
      possible_conditions: [],
    },
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
  } satisfies OcrResult;
}

export async function extractTextFromDocument(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<OcrResult> {
  if (payload.mimeType === "application/pdf") {
    const preprocessingWarnings = [
      "Rendered the PDF locally and prepared OCR-safe page images with grayscale, sharpening, contrast normalization, and thresholding.",
    ];

    try {
      const localPdfAttempt = await runTesseractOnPdf(payload.buffer);
      const localAssessment = assessOcrTextQuality(localPdfAttempt.text);

      if (isUsableOcrAssessment(localAssessment)) {
        return finalizeOcrResult({
          rawText: localAssessment.normalized,
          engine: "tesseract-pdf",
          confidence:
            localAssessment.score >= 68
              ? "high"
              : localAssessment.score >= 42
                ? "medium"
                : "low",
          warnings: [...preprocessingWarnings, ...localPdfAttempt.warnings],
        });
      }

      return buildFallbackOcrResult([
        ...preprocessingWarnings,
        ...localPdfAttempt.warnings,
        "Tesseract could not extract enough readable PDF text to trust the result.",
      ]);
    } catch (error) {
      return buildFallbackOcrResult([
        ...preprocessingWarnings,
        `tesseract-pdf failed: ${getErrorMessage(error, "Local PDF OCR unavailable.")}`,
      ]);
    }
  }

  const imageVariants = await buildImageVariantsForOcr(payload);
  const preprocessingWarnings =
    imageVariants.filter((variant) => variant.preprocessingApplied).length > 0
      ? [
          "Prepared multiple OCR-safe image variants with grayscale, sharpening, contrast boosting, and thresholding.",
        ]
      : [];

  try {
    const localAttempt = await runBestTesseractOnImageVariants(imageVariants);
    const localAssessment = assessOcrTextQuality(localAttempt.text);

    if (isUsableOcrAssessment(localAssessment)) {
      return finalizeOcrResult({
        rawText: localAssessment.normalized,
        engine: localAttempt.engine,
        confidence: localAttempt.confidence,
        warnings: [...preprocessingWarnings, ...localAttempt.warnings],
      });
    }

    return buildFallbackOcrResult([
      ...preprocessingWarnings,
      ...localAttempt.warnings,
      "Tesseract could not extract enough readable image text to trust the result.",
    ]);
  } catch (error) {
    return buildFallbackOcrResult([
      ...preprocessingWarnings,
      `tesseract failed: ${getErrorMessage(error, "Local OCR unavailable.")}`,
    ]);
  }
}
