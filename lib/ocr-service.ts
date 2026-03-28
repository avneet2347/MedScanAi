import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fromBuffer } from "pdf2pic";
import sharp from "sharp";
import tesseract from "node-tesseract-ocr";
import { getErrorMessage, normalizeText } from "@/lib/api-utils";
import {
  cleanAndStructureMedicalOcrText,
  extractTextWithGemini,
  extractTextWithOpenAI,
} from "@/lib/openai-service";
import type { OcrResult } from "@/lib/report-types";
import { serverConfig } from "@/lib/server-config";

const OCR_FALLBACK_MESSAGE =
  "OCR could not confidently extract readable medical text from this file. Please upload a clearer JPG, PNG, or PDF scan, then try again.";

const MEDICAL_READABILITY_PATTERNS = [
  /\b(?:patient|name|age|sex|date|doctor|department|investigation|report|lab|laboratory|specimen)\b/i,
  /\b(?:hemoglobin|hba1c|glucose|sugar|creatinine|urea|bilirubin|platelet|wbc|rbc|cholesterol|triglyceride|hdl|ldl|tsh|t3|t4|vitamin|sodium|potassium|calcium|bp|pulse)\b/i,
  /\b(?:tablet|tab|capsule|cap|syrup|injection|inj|drop|cream|ointment|solution|rx|prescription)\b/i,
  /\b(?:mg|mcg|g|ml|iu|units?|meq|mmhg|bpm|g\/dl|mg\/dl|mmol\/l|ng\/ml|miu\/l|u\/l|cells\/cumm|x10\^3)\b/i,
  /\b(?:reference|range|result|findings|impression|advice|diagnosis|remarks)\b/i,
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

function hasReadableText(text: string) {
  return assessOcrTextQuality(text).readable;
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

function assessOcrTextQuality(text: string): OcrTextAssessment {
  const normalized = normalizeText(text);

  if (!normalized) {
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
  const suspiciousTokens = tokens.filter(
    (token) =>
      token.length >= 5 &&
      /[A-Za-z]{5,}/.test(token) &&
      !/[aeiou]/i.test(token) &&
      !/\d/.test(token)
  );
  const strongLines = lines.filter((line) => scoreMedicalLine(line) >= 4).length;
  const medicalHits = MEDICAL_READABILITY_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(normalized) ? 1 : 0),
    0
  );
  const weirdChars = (normalized.match(/[^\p{L}\p{N}\s.,:;/%()+\-]/gu) || []).length;
  const weirdRatio = weirdChars / Math.max(normalized.length, 1);
  let score = 0;

  if (normalized.length >= 40) score += 12;
  if (normalized.length >= 120) score += 8;
  if (lines.length >= 3) score += 8;
  if (lines.length >= 8) score += 6;
  if (wordLikeTokens.length >= 5) score += 12;
  if (wordLikeTokens.length >= 12) score += 8;
  if (digitTokens.length >= 2) score += 8;
  if (digitTokens.length >= 6) score += 6;
  score += Math.min(medicalHits * 8, 24);
  score += Math.min(strongLines * 4, 16);

  if (tokens.length > 0 && wordLikeTokens.length / tokens.length < 0.35) {
    score -= 10;
  }

  if (tokens.length > 0 && suspiciousTokens.length / tokens.length > 0.22) {
    score -= 12;
  }

  if (weirdRatio > 0.05) {
    score -= 8;
  }

  if (weirdRatio > 0.1) {
    score -= 10;
  }

  return {
    score,
    readable:
      score >= 34 &&
      wordLikeTokens.length >= 3 &&
      (medicalHits >= 1 || strongLines >= 2 || digitTokens.length >= 3),
    normalized,
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
    let pipeline = sharp(payload.buffer, { failOn: "none" }).rotate();
    const variants = [originalVariant];

    if (metadata.width && metadata.width < 1600) {
      pipeline = pipeline.resize({
        width: 1600,
        fit: "inside",
        withoutEnlargement: false,
      });
    } else if (metadata.width && metadata.width > 2200) {
      pipeline = pipeline.resize({
        width: 2200,
        fit: "inside",
        withoutEnlargement: true,
        });
      }

    const normalizedBuffer = await pipeline
      .clone()
      .grayscale()
      .normalize()
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

    const thresholdedBuffer = await pipeline
      .clone()
      .grayscale()
      .normalize()
      .median(1)
      .linear(1.2, -14)
      .threshold(178, { grayscale: true })
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
  const configs = [{ psm: 6 }, { psm: 11 }, { psm: 4 }];
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
  const convert = fromBuffer(buffer, {
    density: 200,
    format: "png",
    width: 2000,
    preserveAspectRatio: true,
  });

  const pages = await convert.bulk(-1, { responseType: "buffer" });
  const pageBuffers = pages.slice(0, 4);
  const extractedPages: string[] = [];

  for (const page of pageBuffers) {
    if (!page.buffer) {
      continue;
    }

    const pageVariants = await buildImageVariantsForOcr({
      buffer: page.buffer,
      filename: `pdf-page-${page.page}.png`,
      mimeType: "image/png",
    });
    const bestAttempt = await runBestTesseractOnImageVariants(pageVariants);
    const text = bestAttempt.text;

    if (hasReadableText(text)) {
      extractedPages.push(text);
    }
  }

  return normalizeText(extractedPages.join("\n\n"));
}

async function extractTextWithPreferredAiVision(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const attempts: Array<{
    engine: string;
    run: () => Promise<string>;
  }> = [];

  if (serverConfig.geminiApiKey) {
    attempts.push({
      engine: payload.mimeType === "application/pdf" ? "gemini-document-ocr" : "gemini-vision-ocr",
      run: () => extractTextWithGemini(payload),
    });
  }

  attempts.push({
    engine: payload.mimeType === "application/pdf" ? "openai-document-ocr" : "openai-vision-ocr",
    run: () => extractTextWithOpenAI(payload),
  });

  const warnings: string[] = [];

  for (const attempt of attempts) {
    try {
      const text = normalizeText(await attempt.run());

      if (hasReadableText(text)) {
        return {
          text,
          engine: attempt.engine,
          warnings,
        };
      }

      warnings.push(`${attempt.engine} returned text, but it was not readable enough to trust.`);
    } catch (error) {
      warnings.push(`${attempt.engine} failed: ${getErrorMessage(error, "OCR unavailable.")}`);
    }
  }

  return {
    text: "",
    engine: "ai-vision-unavailable",
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
    const aiAttempt = await extractTextWithPreferredAiVision(payload);
    const aiAssessment = assessOcrTextQuality(aiAttempt.text);
    let bestCandidate: {
      text: string;
      engine: string;
      confidence: OcrResult["confidence"];
    } | null = aiAssessment.readable
      ? {
          text: aiAssessment.normalized,
          engine: aiAttempt.engine,
          confidence: aiAssessment.score >= 68 ? "high" : "medium",
        }
      : null;

    try {
      const localPdfText = await runTesseractOnPdf(payload.buffer);
      const localAssessment = assessOcrTextQuality(localPdfText);

      if (
        localAssessment.readable &&
        (!bestCandidate || localAssessment.score > aiAssessment.score)
      ) {
        bestCandidate = {
          text: localAssessment.normalized,
          engine: "tesseract-pdf",
          confidence: localAssessment.score >= 68 ? "high" : "medium",
        };
      }
    } catch (error) {
      aiAttempt.warnings.push(
        `tesseract-pdf failed: ${getErrorMessage(error, "Local PDF OCR unavailable.")}`
      );
    }

    if (bestCandidate) {
      return finalizeOcrResult({
        rawText: bestCandidate.text,
        engine: bestCandidate.engine,
        confidence: bestCandidate.confidence,
        warnings: aiAttempt.warnings,
      });
    }

    return buildFallbackOcrResult(aiAttempt.warnings);
  }

  const imageVariants = await buildImageVariantsForOcr(payload);
  const preprocessingWarnings =
    imageVariants.filter((variant) => variant.preprocessingApplied).length > 0
      ? [
          "Prepared multiple OCR-safe image variants with grayscale, sharpening, contrast normalization, and thresholding.",
        ]
      : [];
  const aiAttemptOriginal = await extractTextWithPreferredAiVision(payload);
  let bestAiAttempt = aiAttemptOriginal;
  let bestAiAssessment = assessOcrTextQuality(aiAttemptOriginal.text);

  const normalizedVariant = imageVariants.find((variant) => variant.label === "normalized");

  if (!bestAiAssessment.readable && normalizedVariant) {
    const aiAttemptNormalized = await extractTextWithPreferredAiVision(normalizedVariant);
    const normalizedAssessment = assessOcrTextQuality(aiAttemptNormalized.text);

    if (normalizedAssessment.score > bestAiAssessment.score) {
      bestAiAttempt = {
        text: aiAttemptNormalized.text,
        engine: aiAttemptNormalized.engine,
        warnings: [...bestAiAttempt.warnings, ...aiAttemptNormalized.warnings],
      };
      bestAiAssessment = normalizedAssessment;
    } else {
      bestAiAttempt.warnings.push(...aiAttemptNormalized.warnings);
    }
  }

  let bestCandidate: {
    text: string;
    engine: string;
    confidence: OcrResult["confidence"];
  } | null = bestAiAssessment.readable
    ? {
        text: bestAiAssessment.normalized,
        engine: bestAiAttempt.engine,
        confidence: bestAiAssessment.score >= 68 ? "high" : "medium",
      }
    : null;

  try {
    const localAttempt = await runBestTesseractOnImageVariants(imageVariants);
    bestAiAttempt.warnings.push(...localAttempt.warnings);
    const localAssessment = assessOcrTextQuality(localAttempt.text);

    if (
      localAssessment.readable &&
      (!bestCandidate || localAssessment.score > bestAiAssessment.score)
    ) {
      bestCandidate = {
        text: localAssessment.normalized,
        engine: localAttempt.engine,
        confidence: localAttempt.confidence,
      };
    }
  } catch (error) {
    bestAiAttempt.warnings.push(`tesseract failed: ${getErrorMessage(error, "Local OCR unavailable.")}`);
  }

  if (bestCandidate) {
    return finalizeOcrResult({
      rawText: bestCandidate.text,
      engine: bestCandidate.engine,
      confidence: bestCandidate.confidence,
      warnings: [...preprocessingWarnings, ...bestAiAttempt.warnings],
    });
  }

  return buildFallbackOcrResult([...preprocessingWarnings, ...bestAiAttempt.warnings]);
}
