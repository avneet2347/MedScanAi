import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sanitizeFilename, titleFromFilename } from "@/lib/api-utils";
import { createReportRecord } from "@/lib/reports";
import type { ReportRecord } from "@/lib/report-types";
import { serverConfig } from "@/lib/server-config";

export async function uploadReportForUser(
  supabase: SupabaseClient,
  user: User,
  file: File
): Promise<{
  report: ReportRecord;
  fileReference: {
    bucket: string;
    path: string;
    signedUrl: string | null;
  };
}> {
  const safeFilename = sanitizeFilename(file.name || "report");
  const storagePath = `${user.id}/${Date.now()}-${safeFilename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(serverConfig.storageBucket)
    .upload(storagePath, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  try {
    const report = await createReportRecord(supabase, {
      user_id: user.id,
      title: titleFromFilename(file.name),
      original_filename: file.name,
      mime_type: file.type,
      file_size: file.size,
      storage_bucket: serverConfig.storageBucket,
      storage_path: storagePath,
    });

    const { data: signedUrlData } = await supabase.storage
      .from(serverConfig.storageBucket)
      .createSignedUrl(storagePath, 60 * 60);

    return {
      report,
      fileReference: {
        bucket: serverConfig.storageBucket,
        path: storagePath,
        signedUrl: signedUrlData?.signedUrl || null,
      },
    };
  } catch (error) {
    await supabase.storage
      .from(serverConfig.storageBucket)
      .remove([storagePath])
      .catch(() => undefined);

    throw error;
  }
}
