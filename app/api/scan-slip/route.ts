import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getErrorStatus,
  isAllowedUploadMimeType,
  jsonError,
} from "@/lib/api-utils";
import { normalizeOutputLanguage } from "@/lib/localization";
import { ensureReportInsights } from "@/lib/report-pipeline";
import { uploadReportForUser } from "@/lib/report-upload";
import { ensureUserProfile } from "@/lib/reports";
import { serverConfig } from "@/lib/server-config";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

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

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const { report } = await uploadReportForUser(dataClient, user, file);
    const { report: processedReport, insights } = await ensureReportInsights(
      dataClient,
      report.id,
      user.id,
      true,
      language
    );

    return NextResponse.json({
      success: true,
      language,
      reportId: processedReport.id,
      filename: processedReport.title || processedReport.original_filename,
      createdAt: processedReport.created_at,
      report: processedReport,
      extractedText: processedReport.ocr_text,
      analysis: processedReport.analysis_json,
      insights,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Processing failed."),
      getErrorStatus(error, 500)
    );
  }
}
