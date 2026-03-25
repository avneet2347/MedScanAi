import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getErrorStatus,
  isAllowedUploadMimeType,
  jsonError,
} from "@/lib/api-utils";
import { generateHealthInsights } from "@/lib/insights";
import { normalizeOutputLanguage } from "@/lib/localization";
import { generateMedicalAnalysis } from "@/lib/openai-service";
import { extractTextFromDocument } from "@/lib/ocr-service";
import { createAuthenticityProof } from "@/lib/report-authenticity";
import { uploadReportForUser } from "@/lib/report-upload";
import { ensureReportInsights } from "@/lib/report-pipeline";
import { ensureUserProfile } from "@/lib/reports";
import { serverConfig } from "@/lib/server-config";
import { getOptionalAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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

    const authState = await getOptionalAuthenticatedUser(request);

    if (authState) {
      const { user, dataClient } = authState;
      await ensureUserProfile(dataClient, user);

      const { report } = await uploadReportForUser(dataClient, user, file);

      const { report: processedReport, insights } = await ensureReportInsights(
        dataClient,
        report.id,
        user.id,
        true
      );

      return NextResponse.json({
        success: true,
        language,
        report: processedReport,
        extractedText: processedReport.ocr_text,
        analysis: processedReport.analysis_json,
        insights,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ocr = await extractTextFromDocument({
      buffer,
      filename: file.name || "report",
      mimeType: file.type,
    });
    const analysis = await generateMedicalAnalysis({
      extractedText: ocr.text,
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

    return NextResponse.json({
      success: true,
      language,
      reportId: `local-${Date.now()}`,
      filename: file.name || "report",
      createdAt: new Date().toISOString(),
      report: null,
      extractedText: ocr.text,
      analysis,
      insights,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Processing failed."),
      getErrorStatus(error, 500)
    );
  }
}
