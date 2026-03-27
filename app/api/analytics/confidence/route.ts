import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { syncReportAiConfidenceSafely } from "@/lib/ai-confidence";
import { normalizeOutputLanguage } from "@/lib/localization";
import { ensureUserProfile, getReportById } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reportId = url.searchParams.get("reportId")?.trim();
    const language = normalizeOutputLanguage(url.searchParams.get("language"));

    if (!reportId) {
      return jsonError("reportId is required.");
    }

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const report = await getReportById(dataClient, reportId);
    const { confidence, storedConfidence } = await syncReportAiConfidenceSafely(
      dataClient,
      report,
      language
    );

    return NextResponse.json({
      reportId,
      confidence,
      storedConfidence,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to calculate confidence."),
      getErrorStatus(error, 500)
    );
  }
}
