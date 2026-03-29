import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import { syncReportAiConfidenceSafely } from "@/lib/ai-confidence";
import { extractTextFromDocument } from "@/lib/ocr-service";
import { syncReportHealthAlertsSafely } from "@/lib/health-alerts";
import { generateFallbackMedicalAnalysis } from "@/lib/fallback-analysis";
import { generateHealthInsights } from "@/lib/insights";
import { createAuthenticityProof } from "@/lib/report-authenticity";
import { generateMedicalAnalysis } from "@/lib/openai-service";
import { getMissingStorageBucketMessage, isStorageBucketNotFoundError } from "@/lib/report-storage";
import {
  getReportById,
  saveAnalysis,
  saveInsights,
  saveOcrResult,
  updateReportState,
} from "@/lib/reports";
import { syncStoredMetricsForReportsSafely } from "@/lib/trends";
import type {
  HealthInsights,
  MedicalAnalysis,
  OcrResult,
  OutputLanguage,
  ReportRecord,
} from "@/lib/report-types";

export async function downloadReportFile(
  supabase: SupabaseClient,
  report: ReportRecord
) {
  const { data, error } = await supabase.storage
    .from(report.storage_bucket)
    .download(report.storage_path);

  if (error || !data) {
    if (isStorageBucketNotFoundError(error)) {
      throw new ApiError(getMissingStorageBucketMessage(), 503);
    }

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
        rawText: existingReport.ocr_raw_text || existingReport.ocr_text,
        structured: existingReport.ocr_structured || undefined,
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
  force = false,
  language?: OutputLanguage
): Promise<{ report: ReportRecord; analysis: MedicalAnalysis }> {
  const report = await getReportById(supabase, reportId);

  if (
    report.analysis_json &&
    !force &&
    (!language || !report.insights_json?.preferredLanguage || report.insights_json.preferredLanguage === language)
  ) {
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
          rawText: report.ocr_raw_text || report.ocr_text,
          structured: report.ocr_structured || undefined,
          engine: report.ocr_engine || "unknown",
          confidence: "medium" as const,
        },
      }
    : await ensureReportOcr(supabase, reportId, force);

  if (!ocrState.ocr.text.trim()) {
    throw new ApiError("No readable OCR text is available for analysis.", 422);
  }

  if (ocrState.ocr.engine.startsWith("fallback-message")) {
    const fallbackAnalysis = generateFallbackMedicalAnalysis(
      ocrState.ocr.text,
      language || report.insights_json?.preferredLanguage || "en"
    );
    const updatedReport = await saveAnalysis(supabase, reportId, fallbackAnalysis);

    return {
      report: updatedReport,
      analysis: fallbackAnalysis,
    };
  }

  try {
    const analysis = await generateMedicalAnalysis({
      extractedText: ocrState.ocr.text,
      rawText: ocrState.ocr.rawText,
      structuredOcr: ocrState.ocr.structured,
      ocrEngine: ocrState.ocr.engine,
      userId,
      language: language || report.insights_json?.preferredLanguage || "en",
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
  force = false,
  language?: OutputLanguage
): Promise<{ report: ReportRecord; insights: HealthInsights }> {
  const report = await getReportById(supabase, reportId);

  if (
    report.insights_json &&
    !force &&
    (!language || report.insights_json.preferredLanguage === language) &&
    report.insights_json.testEvaluations &&
    report.insights_json.riskPredictions &&
    report.insights_json.medicineDetails &&
    report.insights_json.interactionChecks &&
    report.insights_json.lifestyleRecommendations &&
    report.insights_json.medicineReminders &&
    report.insights_json.emergencyAssessment &&
    report.insights_json.doctorRecommendations &&
    report.insights_json.authenticity
  ) {
    await syncReportAiConfidenceSafely(
      supabase,
      report,
      report.insights_json.preferredLanguage || language || "en"
    );
    await syncReportHealthAlertsSafely(
      supabase,
      reportId,
      report.insights_json,
      report.insights_json.preferredLanguage || language || "en"
    );
    await syncStoredMetricsForReportsSafely(supabase, [report]);

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
    : await ensureReportAnalysis(supabase, reportId, userId, force, language);

  try {
    const insightLanguage = language || report.insights_json?.preferredLanguage || "en";
    const authenticity =
      !force && report.insights_json?.authenticity
        ? report.insights_json.authenticity
        : createAuthenticityProof({
            fileBuffer: await downloadReportFile(supabase, analysisState.report),
            ocrText: analysisState.report.ocr_text || "",
            analysis: analysisState.analysis,
          });
    const insights = generateHealthInsights(analysisState.analysis, {
      language: insightLanguage,
      authenticity,
    });
    const updatedReport = await saveInsights(supabase, reportId, insights);
    await syncReportAiConfidenceSafely(supabase, updatedReport, insightLanguage);
    await syncReportHealthAlertsSafely(supabase, reportId, insights, insightLanguage);
    await syncStoredMetricsForReportsSafely(supabase, [updatedReport]);

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
