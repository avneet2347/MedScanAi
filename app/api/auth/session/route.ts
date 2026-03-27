import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/auth-cookies";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import {
  buildUserProfileRecord,
  ensureUserProfile,
  isMissingProfilesTableError,
} from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, dataClient, refreshedSession } = await requireAuthenticatedUser(request);
    const fallbackProfile = await ensureUserProfile(dataClient, user);
    const { data: profile, error: profileError } = await dataClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError && !isMissingProfilesTableError(profileError)) {
      throw new Error(profileError.message);
    }

    const response = NextResponse.json({
      user,
      profile: profile ?? fallbackProfile ?? buildUserProfileRecord(user),
    });

    if (refreshedSession) {
      setAuthCookies(response, refreshedSession);
    }

    return response;
  } catch (error) {
    return jsonError(getErrorMessage(error, "Unauthorized."), getErrorStatus(error, 401));
  }
}
