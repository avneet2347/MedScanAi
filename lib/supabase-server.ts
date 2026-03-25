import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ApiError, getBearerToken } from "@/lib/api-utils";
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

export async function requireAuthenticatedUser(request: Request): Promise<{
  user: User;
  accessToken: string;
  dataClient: SupabaseClient;
}> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new ApiError("Missing bearer token.", 401);
  }

  const authClient = createSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new ApiError("Invalid or expired session.", 401);
  }

  return {
    user: data.user,
    accessToken,
    dataClient: createSupabaseUserClient(accessToken),
  };
}

export async function getOptionalAuthenticatedUser(request: Request): Promise<{
  user: User;
  accessToken: string;
  dataClient: SupabaseClient;
} | null> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return null;
  }

  const authClient = createSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new ApiError("Invalid or expired session.", 401);
  }

  return {
    user: data.user,
    accessToken,
    dataClient: createSupabaseUserClient(accessToken),
  };
}
