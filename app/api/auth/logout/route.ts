import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth-cookies";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Signed out successfully.",
  });

  clearAuthCookies(response);
  return response;
}
