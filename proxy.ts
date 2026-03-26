import { NextResponse, type NextRequest } from "next/server";
import { clearAuthCookies, setAuthCookies } from "@/lib/auth-cookies";
import { resolveRequestAuthState } from "@/lib/supabase-server";

export async function proxy(request: NextRequest) {
  try {
    const authState = await resolveRequestAuthState(request);

    if (!authState) {
      const response = NextResponse.next();
      clearAuthCookies(response);
      return response;
    }

    const shouldStripWorkspaceAuthParams =
      request.nextUrl.searchParams.has("mode") ||
      request.nextUrl.searchParams.has("confirmed");

    const response = shouldStripWorkspaceAuthParams
      ? NextResponse.redirect(new URL("/workspace", request.url))
      : NextResponse.next();

    if (authState.refreshedSession) {
      setAuthCookies(response, authState.refreshedSession);
    }

    return response;
  } catch {
    const response = NextResponse.next();
    clearAuthCookies(response);
    return response;
  }
}

export const config = {
  matcher: ["/workspace"],
};
