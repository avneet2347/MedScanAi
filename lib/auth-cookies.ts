import type { Session } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

export const ACCESS_TOKEN_COOKIE_NAME = "medscan-access-token";
export const REFRESH_TOKEN_COOKIE_NAME = "medscan-refresh-token";

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type AuthCookieTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

function shouldUseSecureCookies() {
  const configuredAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    process.env.NODE_ENV === "production" ||
    configuredAppUrl.toLowerCase().startsWith("https://")
  );
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((item) => item.trim());

  for (const cookie of cookies) {
    if (!cookie) {
      continue;
    }

    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = cookie.slice(0, separatorIndex).trim();

    if (key !== name) {
      continue;
    }

    return cookie.slice(separatorIndex + 1).trim() || null;
  }

  return null;
}

export function readAuthCookiesFromRequest(
  request: Request | NextRequest
): AuthCookieTokens {
  const cookieHeader = request.headers.get("cookie");

  return {
    accessToken: getCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE_NAME),
    refreshToken: getCookieValue(cookieHeader, REFRESH_TOKEN_COOKIE_NAME),
  };
}

export function setAuthCookies(
  response: NextResponse,
  session: Pick<Session, "access_token" | "refresh_token">
) {
  const secure = shouldUseSecureCookies();

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: session.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: session.refresh_token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export function clearAuthCookies(response: NextResponse) {
  const secure = shouldUseSecureCookies();

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });

  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}
