import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { ApiError, getBearerToken } from "@/lib/api-utils";
import { readAuthCookiesFromRequest } from "@/lib/auth-cookies";
import { publicConfig } from "@/lib/public-config";

const authOptions = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
};

export function createSupabaseAuthClient() {
  return createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: authOptions,
  });
}

export function createSupabaseUserClient(accessToken: string) {
  return createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: authOptions,
    accessToken: async () => accessToken,
  });
}

function assertEmailConfirmed(user: User) {
  if (!user.email_confirmed_at) {
    throw new ApiError(
      "Please confirm your email address before continuing.",
      403
    );
  }
}

async function validateAccessToken(accessToken: string) {
  const authClient = createSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  assertEmailConfirmed(data.user);
  return data.user;
}

async function refreshSession(refreshToken: string) {
  const authClient = createSupabaseAuthClient();
  const { data, error } = await authClient.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    return null;
  }

  assertEmailConfirmed(data.user);
  return {
    user: data.user,
    session: data.session,
  };
}

export async function resolveRequestAuthState(request: Request): Promise<{
  user: User;
  accessToken: string;
  refreshToken: string | null;
  dataClient: SupabaseClient;
  refreshedSession: Session | null;
} | null> {
  const bearerToken = getBearerToken(request);
  const { accessToken: cookieAccessToken, refreshToken } =
    readAuthCookiesFromRequest(request);
  const accessToken = bearerToken || cookieAccessToken;

  if (accessToken) {
    const user = await validateAccessToken(accessToken);

    if (user) {
      return {
        user,
        accessToken,
        refreshToken,
        dataClient: createSupabaseUserClient(accessToken),
        refreshedSession: null,
      };
    }
  }

  if (!refreshToken) {
    return null;
  }

  const refreshed = await refreshSession(refreshToken);

  if (!refreshed) {
    return null;
  }

  return {
    user: refreshed.user,
    accessToken: refreshed.session.access_token,
    refreshToken: refreshed.session.refresh_token,
    dataClient: createSupabaseUserClient(refreshed.session.access_token),
    refreshedSession: refreshed.session,
  };
}

export async function requireAuthenticatedUser(request: Request): Promise<{
  user: User;
  accessToken: string;
  refreshToken: string | null;
  dataClient: SupabaseClient;
  refreshedSession: Session | null;
}> {
  const authState = await resolveRequestAuthState(request);

  if (!authState) {
    throw new ApiError("Invalid or expired session.", 401);
  }

  return authState;
}

export async function getOptionalAuthenticatedUser(request: Request): Promise<{
  user: User;
  accessToken: string;
  refreshToken: string | null;
  dataClient: SupabaseClient;
  refreshedSession: Session | null;
} | null> {
  return resolveRequestAuthState(request);
}
