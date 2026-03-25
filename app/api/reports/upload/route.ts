import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getErrorStatus,
  isAllowedUploadMimeType,
  jsonError,
} from "@/lib/api-utils";
import { uploadReportForUser } from "@/lib/report-upload";
import { ensureUserProfile } from "@/lib/reports";
import { serverConfig } from "@/lib/server-config";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return jsonError("A file is required.");
    }

    if (!isAllowedUploadMimeType(file.type)) {
      return jsonError("Only JPG, PNG, and PDF files are supported.");
    }

    if (file.size > serverConfig.maxUploadBytes) {
      return jsonError(
        `File size must be ${Math.round(serverConfig.maxUploadBytes / (1024 * 1024))}MB or less.`
      );
    }

    const { report, fileReference } = await uploadReportForUser(dataClient, user, file);

    return NextResponse.json({
      message: "File uploaded successfully.",
      report,
      fileReference,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "Upload failed."), getErrorStatus(error, 500));
  }
}
