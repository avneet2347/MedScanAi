import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/auth-cookies";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile } from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, dataClient, refreshedSession } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);
    const { data: profile } = await dataClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const response = NextResponse.json({
      user,
      profile,
    });

    if (refreshedSession) {
      setAuthCookies(response, refreshedSession);
    }

    return response;
  } catch (error) {
    return jsonError(getErrorMessage(error, "Unauthorized."), getErrorStatus(error, 401));
  }
}
