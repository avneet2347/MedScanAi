import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, isAiProviderQuotaError, jsonError } from "@/lib/api-utils";
import { buildReportComparison } from "@/lib/comparison";
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
import {
  listStoredReportMetricsSafely,
  mergeStoredMetricsWithDerivedReportMetrics,
} from "@/lib/trends";

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

function mapDeterministicDirection(direction: "up" | "down" | "stable" | "mixed"): AiComparisonDirection {
  switch (direction) {
    case "stable":
      return "stable";
    case "mixed":
      return "mixed";
    default:
      return "changed";
  }
}

function buildFallbackDifference(metric: ReportComparisonResult["metrics"][number]): AiComparisonDifference {
  return {
    id: metric.metricKey,
    label: metric.testName,
    direction: mapDeterministicDirection(metric.direction),
    summary: metric.summary,
    healthImpact: metric.hasUnitMismatch
      ? "Units differ across reports, so this change should be reviewed manually."
      : metric.direction === "stable"
        ? "This metric appears relatively stable across the selected reports."
        : "This metric changed across the selected reports. Clinical significance depends on the reference range and the full report context.",
    confidence:
      metric.hasUnitMismatch || metric.values.length < 2 ? "low" : metric.values.length >= 3 ? "high" : "medium",
    values: metric.values.map((value) => ({
      reportId: value.reportId,
      reportTitle: value.reportLabel,
      reportDate: value.createdAt,
      value: `${value.value}${value.unit ? ` ${value.unit}` : ""}`,
      note:
        value.percentChangeFromPrevious !== null
          ? `Change vs previous: ${value.percentChangeFromPrevious > 0 ? "+" : ""}${value.percentChangeFromPrevious}%`
          : value.differenceFromPrevious !== null
            ? `Change vs previous: ${value.differenceFromPrevious > 0 ? "+" : ""}${value.differenceFromPrevious}`
            : "",
    })),
  };
}

function buildDeterministicComparisonFallback(
  comparison: ReportComparisonResult
): AiReportComparisonResult {
  const differenceCount = comparison.metrics.length;

  return {
    reports: comparison.reports,
    summary:
      differenceCount > 0
        ? `AI comparison is temporarily unavailable, so a structured fallback compared ${differenceCount} metric${differenceCount === 1 ? "" : "s"} from the selected reports.`
        : "AI comparison is temporarily unavailable, and there was not enough structured metric data to build a reliable fallback comparison.",
    healthImpact:
      differenceCount > 0
        ? "The fallback highlights numeric or structured changes only. Clinical interpretation should still be reviewed alongside the full report text."
        : "No clear report-to-report health impact could be determined from the available structured data.",
    keyDifferences: comparison.metrics.slice(0, 8).map(buildFallbackDifference),
    notes: [
      "OpenAI quota was exceeded, so the comparison used structured fallback logic instead of an AI-generated summary.",
    ],
    followUpQuestions:
      differenceCount > 0
        ? [
            "Which of these changed values are clinically important in context?",
            "Do any of these changes need repeat testing or follow-up with a clinician?",
          ]
        : [],
    generatedBy: "unknown",
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
      ocrText: report.ocr_text,
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
      if (!isAiProviderQuotaError(error)) {
        throw error;
      }

      const storedMetricRows = await listStoredReportMetricsSafely(dataClient);
      const mergedMetricRows = mergeStoredMetricsWithDerivedReportMetrics(
        storedMetricRows,
        selectedReports
      );
      const deterministicComparison = buildReportComparison(
        mergedMetricRows,
        selectedReports,
        language
      );
      comparison = buildDeterministicComparisonFallback(deterministicComparison);
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
