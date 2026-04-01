import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError, validateEmail, validatePassword } from "@/lib/api-utils";
import {
  buildSignupConfirmationRedirect,
  hasNoAuthIdentities,
  isAlreadyRegisteredError,
} from "@/lib/auth-utils";
import {
  createSupabaseAuthClient,
  createSupabaseServiceClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

async function findExistingAuthUserByEmail(email: string): Promise<User | null> {
  const serviceClient = createSupabaseServiceClient();

  if (!serviceClient) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page > 0) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const matchedUser =
      data.users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail) || null;

    if (matchedUser) {
      return matchedUser;
    }

    if (!data.nextPage || data.nextPage <= page || page >= data.lastPage) {
      break;
    }

    page = data.nextPage;
  }

  return null;
}

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

    const existingUser = await findExistingAuthUserByEmail(email);

    if (existingUser) {
      if (existingUser.email_confirmed_at) {
        return jsonError(
          "This email is already registered. If it still needs confirmation, use resend verification. Otherwise, log in with your password.",
          409
        );
      }

      return NextResponse.json({
        message:
          "Signup request already received. A confirmation email was already sent for this account. Check your inbox or use resend verification if you need another copy.",
        user: existingUser,
        session: null,
        requiresEmailConfirmation: true,
      });
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

    if (error) {
      if (isAlreadyRegisteredError(error)) {
        return jsonError(
          "This email is already registered. If it still needs confirmation, use resend verification. Otherwise, log in with your password.",
          409
        );
      }

      return jsonError(error.message, 400);
    }

    if (hasNoAuthIdentities(data.user)) {
      return NextResponse.json({
        message:
          "Signup request received. Check your inbox for the confirmation email already sent for this account, or use resend verification if you need another copy.",
        user: data.user,
        session: null,
        requiresEmailConfirmation: true,
      });
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
