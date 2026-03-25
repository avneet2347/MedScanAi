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

    if (error || !data.session || !data.user) {
      return jsonError(error?.message || "Login failed.", 401);
    }

    const userClient = createSupabaseUserClient(data.session.access_token);
    await ensureUserProfile(userClient, data.user);

    return NextResponse.json({
      message: "Login successful.",
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "Login failed."), getErrorStatus(error, 500));
  }
}
