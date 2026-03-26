"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import {
  extractError,
  isEmailConfirmationMessage,
  syncBrowserSessionWithServer,
} from "@/lib/browser-auth";
import WorkspaceAuthScreen from "@/components/WorkspaceAuthScreen";

type AuthMode = "login" | "signup";

type Notice = {
  type: "error" | "success" | "info";
  text: string;
} | null;

type AuthResult = "signup-success" | "login-success" | null;

const supabase = getBrowserSupabaseClient();

function buildAuthHref(mode: AuthMode, email?: string | null) {
  const params = new URLSearchParams();
  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedEmail) {
    params.set("email", normalizedEmail);
  }

  const query = params.toString();
  return query ? `/${mode}?${query}` : `/${mode}`;
}

export default function AuthPageClient({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmed = searchParams.get("confirmed") === "1";
  const initialEmail = searchParams.get("email")?.trim().toLowerCase() || "";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState(initialEmail);
  const [authResult, setAuthResult] = useState<AuthResult>(null);
  const [notice, setNotice] = useState<Notice>(
    confirmed
      ? {
          type: "success",
          text: "Email confirmed successfully. Your account is ready.",
        }
      : null
  );

  useEffect(() => {
    if (!confirmed) {
      return;
    }

    router.replace(buildAuthHref(mode, initialEmail));
  }, [confirmed, initialEmail, mode, router]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      const nextSession = data.session ?? null;
      setAuthChecked(true);

      if (nextSession) {
        setAuthResult("login-success");
        void syncBrowserSessionWithServer(nextSession).catch(() => undefined);
        router.replace("/workspace");
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return;
      }

      setAuthChecked(true);

      if (nextSession) {
        setAuthResult("login-success");
        void syncBrowserSessionWithServer(nextSession).catch(() => undefined);

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION"
        ) {
          router.replace("/workspace");
        }
      } else {
        void fetch("/api/auth/logout", {
          method: "POST",
        }).catch(() => undefined);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  function handleModeChange(nextMode: AuthMode) {
    setAuthResult(null);
    setNotice(null);
    router.replace(buildAuthHref(nextMode, pendingVerificationEmail || email));
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthResult(null);
    setNotice(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email: normalizedEmail,
          password,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(extractError(payload, "Authentication failed."));
      }

      const nextSession = payload.session as
        | { access_token?: string; refresh_token?: string }
        | undefined;

      if (nextSession?.access_token && nextSession.refresh_token) {
        await supabase.auth.setSession({
          access_token: nextSession.access_token,
          refresh_token: nextSession.refresh_token,
        });
      }

      const requiresEmailConfirmation =
        mode === "signup" && (Boolean(payload.requiresEmailConfirmation) || !nextSession?.access_token);

      setFirstName("");
      setLastName("");
      setPassword("");

      if (requiresEmailConfirmation) {
        setEmail(normalizedEmail);
        setPendingVerificationEmail(normalizedEmail);
        setAuthResult("signup-success");
      } else {
        setEmail("");
        setPendingVerificationEmail("");
        setAuthResult(mode === "login" ? "login-success" : null);
      }

      setNotice({
        type: "success",
        text:
          (payload.message as string | undefined) ||
          "Authentication completed successfully.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";

      if (isEmailConfirmationMessage(message)) {
        const normalizedEmail = email.trim().toLowerCase();

        if (normalizedEmail) {
          setPendingVerificationEmail(normalizedEmail);
        }
      }

      setAuthResult(null);
      setNotice({
        type: "error",
        text: message,
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResendVerification() {
    const verificationEmail = pendingVerificationEmail || email.trim().toLowerCase();

    if (!verificationEmail) {
      setNotice({
        type: "error",
        text: "Enter the email address you used to sign up first.",
      });
      return;
    }

    setResendLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: verificationEmail,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(extractError(payload, "Unable to resend verification email."));
      }

      setPendingVerificationEmail(verificationEmail);
      setNotice({
        type: "success",
        text:
          (payload.message as string | undefined) ||
          "Verification email sent successfully.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to resend verification email.",
      });
    } finally {
      setResendLoading(false);
    }
  }

  const verificationEmail = pendingVerificationEmail || email.trim().toLowerCase();
  const authScreenNotice =
    notice ||
    (!authChecked
      ? {
          type: "info" as const,
          text: "Checking for an existing session...",
        }
      : null);

  return (
    <WorkspaceAuthScreen
      key={`${mode}-${authResult ?? "form"}`}
      mode={mode}
      firstName={firstName}
      lastName={lastName}
      email={email}
      password={password}
      authLoading={authLoading}
      resendLoading={resendLoading}
      verificationEmail={verificationEmail}
      notice={authScreenNotice}
      authResult={authResult}
      onModeChange={handleModeChange}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleAuthSubmit}
      onResendVerification={handleResendVerification}
    />
  );
}
