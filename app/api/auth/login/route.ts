import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/auth-cookies";
import { getErrorMessage, getErrorStatus, jsonError, validateEmail, validatePassword } from "@/lib/api-utils";
import { isEmailConfirmationError } from "@/lib/auth-utils";
import { ensureUserProfile } from "@/lib/reports";
import {
  createSupabaseAuthClient,
  createSupabaseUserClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password ?? "";

    if (!email || !validateEmail(email)) {
      return jsonError("A valid email address is required.");
    }

    if (!validatePassword(password)) {
      return jsonError("Password must be at least 8 characters long.");
    }

    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (isEmailConfirmationError(error)) {
      return jsonError(
        "Please confirm your email address before logging in. Use resend verification if you need another confirmation email.",
        403
      );
    }

    if (error || !data.session || !data.user) {
      return jsonError(error?.message || "Login failed.", 401);
    }

    if (!data.user.email_confirmed_at) {
      return jsonError(
        "Please confirm your email address before logging in. Use resend verification if you need another confirmation email.",
        403
      );
    }

    const userClient = createSupabaseUserClient(data.session.access_token);
    await ensureUserProfile(userClient, data.user);

    const response = NextResponse.json({
      message: "Login successful.",
      user: data.user,
      session: data.session,
    });

    setAuthCookies(response, data.session);
    return response;
  } catch (error) {
    return jsonError(getErrorMessage(error, "Login failed."), getErrorStatus(error, 500));
  }
}
