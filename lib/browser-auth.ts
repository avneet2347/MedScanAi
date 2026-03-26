import type { Session } from "@supabase/supabase-js";

export function extractError(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "error" in data) {
    const error = (data as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return fallback;
}

export function isEmailConfirmationMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("confirm your email") ||
    normalized.includes("email not confirmed") ||
    normalized.includes("verification email")
  );
}

export async function syncBrowserSessionWithServer(nextSession: Session | null) {
  await fetch("/api/auth/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      nextSession
        ? {
            accessToken: nextSession.access_token,
            refreshToken: nextSession.refresh_token,
          }
        : {}
    ),
  });
}
