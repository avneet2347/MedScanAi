import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError, validateEmail, validatePassword } from "@/lib/api-utils";
import {
  buildSignupConfirmationRedirect,
  hasNoAuthIdentities,
  isAlreadyRegisteredError,
} from "@/lib/auth-utils";
import { createSupabaseAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password ?? "";
    const fullName = body?.fullName?.trim() || null;

    if (!email || !validateEmail(email)) {
      return jsonError("A valid email address is required.");
    }

    if (!validatePassword(password)) {
      return jsonError("Password must be at least 8 characters long.");
    }

    const supabase = createSupabaseAuthClient();
    const emailRedirectTo = buildSignupConfirmationRedirect(request);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fullName,
        },
      },
    });

    if (data.session) {
      return jsonError(
        "Supabase email confirmation is disabled for this project. Enable Confirm email in Supabase Auth before allowing password signups.",
        500
      );
    }

    const shouldResendVerification =
      hasNoAuthIdentities(data.user) || isAlreadyRegisteredError(error);

    if (shouldResendVerification) {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo,
        },
      });

      if (!resendError) {
        return NextResponse.json({
          message:
            "Signup request received. A new confirmation email has been sent. Please verify your email before logging in.",
          user: data.user,
          session: null,
          requiresEmailConfirmation: true,
        });
      }

      return jsonError(
        "This email is already registered. If it is not verified yet, use resend verification. Otherwise, log in with your password.",
        409
      );
    }

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json({
      message: "Signup successful. Check your email to confirm your account before logging in.",
      user: data.user,
      session: null,
      requiresEmailConfirmation: true,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "Signup failed."), getErrorStatus(error, 500));
  }
}
