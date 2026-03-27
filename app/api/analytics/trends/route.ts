import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { normalizeOutputLanguage } from "@/lib/localization";
import { ensureUserProfile, listReportsForUser } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";
import {
  buildStoredMetricSeries,
  buildStoredTrendInsights,
  listStoredReportMetricsSafely,
  mergeStoredMetricsWithDerivedReportMetrics,
  syncStoredMetricsForReportsSafely,
} from "@/lib/trends";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const language = normalizeOutputLanguage(
      new URL(request.url).searchParams.get("language")
    );
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const reports = await listReportsForUser(dataClient);
    let storedMetrics = await listStoredReportMetricsSafely(dataClient);
    storedMetrics = await syncStoredMetricsForReportsSafely(dataClient, reports, storedMetrics);
    storedMetrics = mergeStoredMetricsWithDerivedReportMetrics(storedMetrics, reports);
    const metricSeries = buildStoredMetricSeries(storedMetrics, reports);
    const trendInsights = buildStoredTrendInsights(metricSeries, language);

    return NextResponse.json({
      reportsCount: reports.length,
      storedMetricsCount: storedMetrics.length,
      metricSeries,
      trendInsights,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to load health trends."),
      getErrorStatus(error, 500)
    );
  }
}
