import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import { extractTextFromDocument } from "@/lib/ocr-service";
import { generateHealthInsights } from "@/lib/insights";
import { createAuthenticityProof } from "@/lib/report-authenticity";
import { generateMedicalAnalysis } from "@/lib/openai-service";
import {
  getReportById,
  saveAnalysis,
  saveInsights,
  saveOcrResult,
  updateReportState,
} from "@/lib/reports";
import type { HealthInsights, MedicalAnalysis, OcrResult, ReportRecord } from "@/lib/report-types";

export async function downloadReportFile(
  supabase: SupabaseClient,
  report: ReportRecord
) {
  const { data, error } = await supabase.storage
    .from(report.storage_bucket)
    .download(report.storage_path);

  if (error || !data) {
    throw new Error(error?.message || "Unable to download report from storage.");
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function ensureReportOcr(
  supabase: SupabaseClient,
  reportId: string,
  force = false
): Promise<{ report: ReportRecord; ocr: OcrResult }> {
  const existingReport = await getReportById(supabase, reportId);

  if (existingReport.ocr_text && !force) {
    return {
      report: existingReport,
      ocr: {
        text: existingReport.ocr_text,
        engine: existingReport.ocr_engine || "unknown",
        confidence: "medium",
      },
    };
  }

  const buffer = await downloadReportFile(supabase, existingReport);
  try {
    const ocr = await extractTextFromDocument({
      buffer,
      filename: existingReport.original_filename,
      mimeType: existingReport.mime_type,
    });
    const report = await saveOcrResult(supabase, reportId, ocr);

    return { report, ocr };
  } catch (error) {
    await updateReportState(supabase, reportId, {
      ocr_status: "failed",
      report_status: "ocr_failed",
    }).catch(() => undefined);

    throw error;
  }
}

export async function ensureReportAnalysis(
  supabase: SupabaseClient,
  reportId: string,
  userId?: string,
  force = false
): Promise<{ report: ReportRecord; analysis: MedicalAnalysis }> {
  const report = await getReportById(supabase, reportId);

  if (report.analysis_json && !force) {
    return {
      report,
      analysis: report.analysis_json,
    };
  }

  const ocrState =
    report.ocr_text && !force
    ? {
        report,
        ocr: {
          text: report.ocr_text,
          engine: report.ocr_engine || "unknown",
          confidence: "medium" as const,
        },
      }
    : await ensureReportOcr(supabase, reportId, force);

  if (!ocrState.ocr.text.trim()) {
    throw new ApiError("No readable OCR text is available for analysis.", 422);
  }

  try {
    const analysis = await generateMedicalAnalysis({
      extractedText: ocrState.ocr.text,
      userId,
    });
    const updatedReport = await saveAnalysis(supabase, reportId, analysis);

    return {
      report: updatedReport,
      analysis,
    };
  } catch (error) {
    await updateReportState(supabase, reportId, {
      report_status: "analysis_failed",
    }).catch(() => undefined);

    throw error;
  }
}

export async function ensureReportInsights(
  supabase: SupabaseClient,
  reportId: string,
  userId?: string,
  force = false
): Promise<{ report: ReportRecord; insights: HealthInsights }> {
  const report = await getReportById(supabase, reportId);

  if (
    report.insights_json &&
    !force &&
    report.insights_json.testEvaluations &&
    report.insights_json.riskPredictions &&
    report.insights_json.authenticity
  ) {
    return {
      report,
      insights: report.insights_json,
    };
  }

  const analysisState =
    report.analysis_json && !force
    ? {
        report,
        analysis: report.analysis_json,
      }
    : await ensureReportAnalysis(supabase, reportId, userId, force);

  try {
    const language = report.insights_json?.preferredLanguage || "en";
    const authenticity =
      !force && report.insights_json?.authenticity
        ? report.insights_json.authenticity
        : createAuthenticityProof({
            fileBuffer: await downloadReportFile(supabase, analysisState.report),
            ocrText: analysisState.report.ocr_text || "",
            analysis: analysisState.analysis,
          });
    const insights = generateHealthInsights(analysisState.analysis, {
      language,
      authenticity,
    });
    const updatedReport = await saveInsights(supabase, reportId, insights);

    return {
      report: updatedReport,
      insights,
    };
  } catch (error) {
    await updateReportState(supabase, reportId, {
      report_status: "insights_failed",
    }).catch(() => undefined);

    throw error;
  }
}
