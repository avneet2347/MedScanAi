"use client";

import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/public-config";

let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabaseClient() {
  if (!browserClient) {
    browserClient = createClient(
      publicConfig.supabaseUrl,
      publicConfig.supabaseAnonKey
    );
  }

  return browserClient;
}
