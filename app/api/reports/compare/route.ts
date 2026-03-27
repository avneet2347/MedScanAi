import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { buildReportComparison } from "@/lib/comparison";
import { normalizeOutputLanguage } from "@/lib/localization";
import { ensureUserProfile, listReportsForUser } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";
import {
  listStoredReportMetricsSafely,
  mergeStoredMetricsWithDerivedReportMetrics,
  syncStoredMetricsForReportsSafely,
} from "@/lib/trends";

export const runtime = "nodejs";

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

    if (selectedReports.length < 2) {
      return jsonError("The selected reports are not available for comparison.", 404);
    }

    const selectedReportIds = new Set(selectedReports.map((report) => report.id));
    let storedMetrics = await listStoredReportMetricsSafely(dataClient);
    storedMetrics = await syncStoredMetricsForReportsSafely(
      dataClient,
      selectedReports,
      storedMetrics
    );
    storedMetrics = mergeStoredMetricsWithDerivedReportMetrics(storedMetrics, selectedReports);
    const comparison = buildReportComparison(
      storedMetrics.filter((row) => selectedReportIds.has(row.report_id)),
      selectedReports,
      language
    );

    return NextResponse.json({
      comparison,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to compare reports."),
      getErrorStatus(error, 500)
    );
  }
}
