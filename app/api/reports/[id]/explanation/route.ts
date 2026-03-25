import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile } from "@/lib/reports";
import { ensureReportAnalysis } from "@/lib/report-pipeline";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const { report, analysis } = await ensureReportAnalysis(
      dataClient,
      id,
      user.id,
      force
    );

    return NextResponse.json({
      message: "AI explanation generated.",
      report,
      analysis,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "AI explanation failed."),
      getErrorStatus(error, 500)
    );
  }
}
