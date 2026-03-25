import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, dataClient } = await requireAuthenticatedUser(request);
    const { data: profile } = await dataClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      user,
      profile,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "Unauthorized."), getErrorStatus(error, 401));
  }
}
