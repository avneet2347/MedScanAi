import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError, validateEmail, validatePassword } from "@/lib/api-utils";
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
    const fullName = body?.fullName?.trim() || null;

    if (!email || !validateEmail(email)) {
      return jsonError("A valid email address is required.");
    }

    if (!validatePassword(password)) {
      return jsonError("Password must be at least 8 characters long.");
    }

    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    if (data.session && data.user) {
      const userClient = createSupabaseUserClient(data.session.access_token);
      await ensureUserProfile(userClient, data.user, fullName);
    }

    return NextResponse.json({
      message: data.session
        ? "Signup successful."
        : "Signup successful. Check your email to confirm your account.",
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "Signup failed."), getErrorStatus(error, 500));
  }
}
