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

function hasReadableText(text: string) {
  return /[A-Za-z0-9]/.test(text) && text.trim().length >= 8;
}

async function preprocessImageBufferForOcr(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  if (!payload.mimeType.startsWith("image/")) {
    return {
      buffer: payload.buffer,
      filename: payload.filename,
      mimeType: payload.mimeType,
      preprocessingApplied: false,
    };
  }

  try {
    const metadata = await sharp(payload.buffer, { failOn: "none" }).metadata();
    const baseName = path.basename(payload.filename, path.extname(payload.filename) || undefined) || "scan";
    let pipeline = sharp(payload.buffer, { failOn: "none" }).rotate();

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

    const buffer = await pipeline
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.2, m1: 0.5, m2: 2 })
      .linear(1.12, -10)
      .png({ compressionLevel: 9 })
      .toBuffer();

    return {
      buffer,
      filename: `${baseName}-ocr.png`,
      mimeType: "image/png",
      preprocessingApplied: true,
    };
  } catch {
    return {
      buffer: payload.buffer,
      filename: payload.filename,
      mimeType: payload.mimeType,
      preprocessingApplied: false,
    };
  }
}

async function runTesseractOnImage(buffer: Buffer, filename: string) {
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
      psm: 3,
      preserve_interword_spaces: 1,
    });

    return normalizeText(text);
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

async function runTesseractOnPdf(buffer: Buffer) {
  const convert = fromBuffer(buffer, {
    density: 170,
    format: "png",
    width: 1800,
    preserveAspectRatio: true,
  });

  const pages = await convert.bulk(-1, { responseType: "buffer" });
  const pageBuffers = pages.slice(0, 3);
  const extractedPages: string[] = [];

  for (const page of pageBuffers) {
    if (!page.buffer) {
      continue;
    }

    const preprocessedPage = await preprocessImageBufferForOcr({
      buffer: page.buffer,
      filename: `pdf-page-${page.page}.png`,
      mimeType: "image/png",
    });
    const text = await runTesseractOnImage(preprocessedPage.buffer, preprocessedPage.filename);

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

    if (hasReadableText(aiAttempt.text)) {
      return finalizeOcrResult({
        rawText: aiAttempt.text,
        engine: aiAttempt.engine,
        confidence: "high",
        warnings: aiAttempt.warnings,
      });
    }

    try {
      const localPdfText = await runTesseractOnPdf(payload.buffer);

      if (hasReadableText(localPdfText)) {
        return finalizeOcrResult({
          rawText: localPdfText,
          engine: "tesseract-pdf",
          confidence: "medium",
          warnings: aiAttempt.warnings,
        });
      }
    } catch (error) {
      aiAttempt.warnings.push(
        `tesseract-pdf failed: ${getErrorMessage(error, "Local PDF OCR unavailable.")}`
      );
    }

    return buildFallbackOcrResult(aiAttempt.warnings);
  }

  const preprocessed = await preprocessImageBufferForOcr(payload);
  const preprocessingWarnings = preprocessed.preprocessingApplied
    ? ["Applied grayscale, sharpening, and contrast normalization before OCR."]
    : [];
  const aiAttempt = await extractTextWithPreferredAiVision(preprocessed);

  if (hasReadableText(aiAttempt.text)) {
    return finalizeOcrResult({
      rawText: aiAttempt.text,
      engine: aiAttempt.engine,
      confidence: "high",
      warnings: [...preprocessingWarnings, ...aiAttempt.warnings],
    });
  }

  try {
    const text = await runTesseractOnImage(preprocessed.buffer, preprocessed.filename);

    if (hasReadableText(text)) {
      return finalizeOcrResult({
        rawText: text,
        engine: "tesseract",
        confidence: "medium",
        warnings: [...preprocessingWarnings, ...aiAttempt.warnings],
      });
    }
  } catch (error) {
    aiAttempt.warnings.push(`tesseract failed: ${getErrorMessage(error, "Local OCR unavailable.")}`);
  }

  return buildFallbackOcrResult([...preprocessingWarnings, ...aiAttempt.warnings]);
}
