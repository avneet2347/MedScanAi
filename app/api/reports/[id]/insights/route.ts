import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile } from "@/lib/reports";
import { ensureReportInsights } from "@/lib/report-pipeline";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const { report, insights } = await ensureReportInsights(
      dataClient,
      id,
      user.id,
      force
    );

    return NextResponse.json({
      message: "Health insights ready.",
      report,
      insights,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to generate health insights."),
      getErrorStatus(error, 500)
    );
  }
}

export const POST = GET;
