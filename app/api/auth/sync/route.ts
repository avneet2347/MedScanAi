import { NextResponse } from "next/server";
import { clearAuthCookies, setAuthCookies } from "@/lib/auth-cookies";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { createSupabaseAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type SyncBody = {
  accessToken?: string | null;
  refreshToken?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SyncBody | null;
    const accessToken = body?.accessToken?.trim() || null;
    const refreshToken = body?.refreshToken?.trim() || null;
    const response = NextResponse.json({ success: true });

    if (!accessToken || !refreshToken) {
      clearAuthCookies(response);
      return response;
    }

    const supabase = createSupabaseAuthClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (!userError && userData.user?.email_confirmed_at) {
      setAuthCookies(response, {
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return response;
    }

    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

    if (
      refreshError ||
      !refreshData.session ||
      !refreshData.user?.email_confirmed_at
    ) {
      const unauthorized = NextResponse.json(
        { error: "Unable to sync the current session." },
        { status: 401 }
      );
      clearAuthCookies(unauthorized);
      return unauthorized;
    }

    setAuthCookies(response, refreshData.session);
    return response;
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to sync the current session."),
      getErrorStatus(error, 500)
    );
  }
}
