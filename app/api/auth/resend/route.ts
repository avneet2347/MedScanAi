import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError, validateEmail } from "@/lib/api-utils";
import { buildSignupConfirmationRedirect } from "@/lib/auth-utils";
import { createSupabaseAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = body?.email?.trim().toLowerCase();

    if (!email || !validateEmail(email)) {
      return jsonError("A valid email address is required.");
    }

    const supabase = createSupabaseAuthClient();
    const emailRedirectTo = buildSignupConfirmationRedirect(request);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json({
      success: true,
      message:
        "Verification email sent. Please check your inbox and spam folder before trying to log in again.",
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to resend verification email."),
      getErrorStatus(error, 500)
    );
  }
}
