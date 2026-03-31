import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getErrorStatus,
  isAllowedUploadMimeType,
  jsonError,
} from "@/lib/api-utils";
import {
  GUEST_PREVIEW_LIMIT_COOKIE,
  GUEST_PREVIEW_LIMIT_MAX_AGE,
} from "@/lib/guest-preview";
import { generateFallbackMedicalAnalysis } from "@/lib/fallback-analysis";
import { generateHealthInsights } from "@/lib/insights";
import { normalizeOutputLanguage } from "@/lib/localization";
import { extractTextFromDocument } from "@/lib/ocr-service";
import { generateMedicalAnalysis } from "@/lib/openai-service";
import { createAuthenticityProof } from "@/lib/report-authenticity";
import { serverConfig } from "@/lib/server-config";

export const runtime = "nodejs";

function hasGuestPreviewCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return false;
  }

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie === `${GUEST_PREVIEW_LIMIT_COOKIE}=1`);
}

function shouldUseSecureCookies() {
  const configuredAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    process.env.NODE_ENV === "production" ||
    configuredAppUrl.toLowerCase().startsWith("https://")
  );
}

export async function POST(request: Request) {
  try {
    if (hasGuestPreviewCookie(request)) {
      return jsonError(
        "Your free report preview is already used. Create an account or sign in to analyze more reports.",
        403,
        {
          limitReached: true,
          requiresAuth: true,
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const language = normalizeOutputLanguage(formData.get("language"));

    if (!file || typeof file === "string") {
      return jsonError("A file is required.");
    }

    if (!isAllowedUploadMimeType(file.type)) {
      return jsonError("Only JPG, PNG, and PDF files are supported.");
    }

    if (file.size > serverConfig.maxUploadBytes) {
      return jsonError(
        `File size must be ${Math.round(serverConfig.maxUploadBytes / (1024 * 1024))}MB or less.`
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ocr = await extractTextFromDocument({
      buffer,
      filename: file.name,
      mimeType: file.type,
    });

    if (!ocr.text.trim()) {
      return jsonError(
        "No readable report text was detected. Please upload a clearer JPG, PNG, or PDF file.",
        422
      );
    }

    const analysis = ocr.engine.startsWith("fallback-message")
      ? generateFallbackMedicalAnalysis(ocr.text, language)
      : await generateMedicalAnalysis({
          extractedText: ocr.text,
          rawText: ocr.rawText,
          structuredOcr: ocr.structured,
          ocrEngine: ocr.engine,
          language,
        });

    const authenticity = createAuthenticityProof({
      fileBuffer: buffer,
      ocrText: ocr.text,
      analysis,
    });
    const insights = generateHealthInsights(analysis, {
      language,
      authenticity,
    });

    const response = NextResponse.json({
      success: true,
      language,
      preview: {
        id: crypto.randomUUID(),
        filename: file.name,
        createdAt: new Date().toISOString(),
        extractedText: ocr.text,
        analysis,
        insights,
      },
    });

    response.cookies.set({
      name: GUEST_PREVIEW_LIMIT_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(),
      path: "/",
      maxAge: GUEST_PREVIEW_LIMIT_MAX_AGE,
    });

    return response;
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Processing failed."),
      getErrorStatus(error, 500)
    );
  }
}
