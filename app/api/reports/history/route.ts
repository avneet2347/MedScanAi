import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile, listReportsForUser } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const reports = await listReportsForUser(dataClient);

    return NextResponse.json({ reports });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to fetch report history."),
      getErrorStatus(error, 500)
    );
  }
}
