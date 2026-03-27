import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { buildDoctorRecommendationsLayer } from "@/lib/doctor-recommendations";
import { ensureReportInsights } from "@/lib/report-pipeline";
import { ensureUserProfile } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

function normalizeReportId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function buildDoctorRecommendationResponse(request: Request, reportId: string) {
  if (!reportId) {
    return jsonError("Select a report to get doctor recommendations.");
  }

  const { user, dataClient } = await requireAuthenticatedUser(request);
  await ensureUserProfile(dataClient, user);

  const { report, insights } = await ensureReportInsights(dataClient, reportId, user.id, false);
  const recommendations = buildDoctorRecommendationsLayer(report.analysis_json, insights);

  return NextResponse.json({
    reportId: report.id,
    recommendations,
  });
}

export async function GET(request: Request) {
  try {
    const reportId = normalizeReportId(new URL(request.url).searchParams.get("reportId"));
    return await buildDoctorRecommendationResponse(request, reportId);
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to load doctor recommendations."),
      getErrorStatus(error, 500)
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { reportId?: string } | null;
    const reportId = normalizeReportId(body?.reportId);
    return await buildDoctorRecommendationResponse(request, reportId);
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to load doctor recommendations."),
      getErrorStatus(error, 500)
    );
  }
}
