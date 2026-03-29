import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { normalizeOutputLanguage } from "@/lib/localization";
import { generateAiReportComparison } from "@/lib/openai-service";
import type {
  AiComparisonDifference,
  AiComparisonDirection,
  AiReportComparisonResult,
  ReportComparisonResult,
} from "@/lib/report-types";
import { ensureUserProfile, listReportsForUser } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

function buildComparisonDiagnostics(
  requestedReportIds: string[],
  selectedReports: Awaited<ReturnType<typeof listReportsForUser>>
) {
  return {
    requestedReportIds,
    selectedReportIds: selectedReports.map((report) => report.id),
    missingReportIds: requestedReportIds.filter(
      (reportId) => !selectedReports.some((report) => report.id === reportId)
    ),
    comparableReportCount: selectedReports.filter(
      (report) =>
        Boolean(report.ocr_text?.trim()) ||
        Boolean(report.analysis_json) ||
        Boolean(report.insights_json)
    ).length,
    reportsByReport: selectedReports.map((report) => ({
      reportId: report.id,
      title: report.title || report.original_filename || "Report",
      hasOcrText: Boolean(report.ocr_text?.trim()),
      hasAnalysis: Boolean(report.analysis_json),
      hasInsights: Boolean(report.insights_json),
      hasComparableContent:
        Boolean(report.ocr_text?.trim()) ||
        Boolean(report.analysis_json) ||
        Boolean(report.insights_json),
    })),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          reportIds?: string[];
          language?: string;
        }
      | null;
    const reportIds = Array.isArray(body?.reportIds)
      ? Array.from(
          new Set(
            body.reportIds
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          )
        )
      : [];
    const language = normalizeOutputLanguage(body?.language);

    if (reportIds.length < 2) {
      return jsonError("Select at least two reports to compare.");
    }

    if (reportIds.length > 6) {
      return jsonError("You can compare up to six reports at a time.");
    }

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const reports = await listReportsForUser(dataClient);
    const reportsById = new Map(reports.map((report) => [report.id, report]));
    const selectedReports = reportIds
      .map((reportId) => reportsById.get(reportId))
      .filter((report): report is typeof reports[number] => Boolean(report));
    const diagnostics = buildComparisonDiagnostics(reportIds, selectedReports);

    if (selectedReports.length < 2) {
      return jsonError("The selected reports are not available for comparison.", 404);
    }

    const normalizedSelectedReports = selectedReports.map((report) => ({
      id: report.id,
      title: report.title || report.original_filename || "Report",
      createdAt: report.created_at,
      reportStatus: report.report_status,
      ocrText: report.ocr_text || undefined,
      analysis: report.analysis_json,
      insights: report.insights_json,
    }));
    let comparison: AiReportComparisonResult;

    try {
      comparison = await generateAiReportComparison({
        reports: normalizedSelectedReports,
        userId: user.id,
        language,
      });
    } catch (error) {
      console.error("AI comparison failed:", error);

      comparison = {
        reports: normalizedSelectedReports.map((r) => ({
          id: r.id,
          title: r.title,
          createdAt: r.createdAt,
          reportStatus: r.reportStatus || "completed",
          overallRisk: "unknown",
        })),
        summary: "AI comparison is temporarily unavailable.",
        healthImpact: "Unable to determine due to AI failure.",
        keyDifferences: [],
        notes: ["AI service failed. Please try again later."],
        followUpQuestions: [],
        generatedBy: "unknown",
      };
    }    
    
    return NextResponse.json({
      comparison,
      diagnostics,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to compare reports."),
      getErrorStatus(error, 500)
    );
  }
}
