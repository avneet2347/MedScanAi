import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fromBuffer } from "pdf2pic";
import tesseract from "node-tesseract-ocr";
import { ApiError, normalizeText } from "@/lib/api-utils";
import { extractTextWithOpenAI } from "@/lib/openai-service";
import type { OcrResult } from "@/lib/report-types";

function hasReadableText(text: string) {
  return /[A-Za-z0-9]/.test(text) && text.trim().length >= 8;
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
    density: 150,
    format: "png",
    width: 1600,
    preserveAspectRatio: true,
  });

  const pages = await convert.bulk(-1, { responseType: "buffer" });
  const pageBuffers = pages.slice(0, 3);
  const extractedPages: string[] = [];

  for (const page of pageBuffers) {
    if (!page.buffer) {
      continue;
    }

    const text = await runTesseractOnImage(page.buffer, `pdf-page-${page.page}.png`);

    if (hasReadableText(text)) {
      extractedPages.push(text);
    }
  }

  return normalizeText(extractedPages.join("\n\n"));
}

export async function extractTextFromDocument(payload: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<OcrResult> {
  if (payload.mimeType === "application/pdf") {
    try {
      const localPdfText = await runTesseractOnPdf(payload.buffer);

      if (hasReadableText(localPdfText)) {
        return {
          text: localPdfText,
          engine: "tesseract-pdf",
          confidence: "medium",
        };
      }
    } catch {
      // Fall back to hosted OCR when local PDF conversion is unavailable.
    }

    const pdfText = await extractTextWithOpenAI(payload);

    if (!hasReadableText(pdfText)) {
      throw new ApiError("No readable text could be extracted from the PDF.", 422);
    }

    return {
      text: pdfText,
      engine: "openai-document-ocr",
      confidence: "high",
    };
  }

  try {
    const text = await runTesseractOnImage(payload.buffer, payload.filename);

    if (hasReadableText(text) && text.length >= 40) {
      return {
        text,
        engine: "tesseract",
        confidence: "medium",
      };
    }
  } catch {
    // Fall through to OpenAI OCR for a second attempt.
  }

  const fallbackText = await extractTextWithOpenAI(payload);

  if (!hasReadableText(fallbackText)) {
    throw new ApiError("No readable text could be extracted from the uploaded image.", 422);
  }

  return {
    text: fallbackText,
    engine: "openai-vision-ocr",
    confidence: "high",
  };
}
