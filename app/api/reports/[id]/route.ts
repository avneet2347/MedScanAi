import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile, getReportDetail } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const report = await getReportDetail(dataClient, id);

    return NextResponse.json({ report });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to fetch report."),
      getErrorStatus(error, 500)
    );
  }
}
