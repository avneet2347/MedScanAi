import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { humanizeChatReply } from "@/lib/openai-service";
import { ensureReportInsights } from "@/lib/report-pipeline";
import { ensureUserProfile, getReportDetail } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          reportId?: string;
          message?: string;
        }
      | null;
    const reportId = body?.reportId?.trim();
    const message = body?.message?.trim();

    if (!reportId) {
      return jsonError("reportId is required.");
    }

    if (!message) {
      return jsonError("message is required.");
    }

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    await ensureReportInsights(dataClient, reportId, user.id, false);
    const report = await getReportDetail(dataClient, reportId);
    const reply = await humanizeChatReply({
      message,
      userId: user.id,
      language: report.insights_json?.preferredLanguage || "en",
      currentReport: {
        title: report.title || report.original_filename,
        analysis: report.analysis_json,
        insights: report.insights_json,
      },
    });

    return NextResponse.json({
      message: "Humanized chat response generated.",
      reply,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to humanize the assistant reply."),
      getErrorStatus(error, 500)
    );
  }
}
