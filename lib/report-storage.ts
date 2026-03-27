import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import { serverConfig } from "@/lib/server-config";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

type StorageErrorLike = {
  message?: string | null;
  status?: number | string | null;
  statusCode?: number | string | null;
};

function parseStatusCode(value?: number | string | null) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function getStorageErrorStatus(error?: StorageErrorLike | null) {
  return parseStatusCode(error?.status) ?? parseStatusCode(error?.statusCode);
}

function isBucketAlreadyCreatedError(error?: StorageErrorLike | null) {
  return (
    getStorageErrorStatus(error) === 409 ||
    (error?.message || "").toLowerCase().includes("already exists")
  );
}

function isBucketPermissionError(error?: StorageErrorLike | null) {
  const message = (error?.message || "").toLowerCase();
  return getStorageErrorStatus(error) === 403 || message.includes("row-level security");
}

export function isStorageBucketNotFoundError(error?: StorageErrorLike | null) {
  const message = (error?.message || "").toLowerCase();
  return (
    message.includes("bucket not found") ||
    message.includes(`bucket "${serverConfig.storageBucket.toLowerCase()}" not found`) ||
    message.includes(`bucket '${serverConfig.storageBucket.toLowerCase()}' not found`)
  );
}

export function getMissingStorageBucketMessage() {
  return `Supabase storage bucket "${serverConfig.storageBucket}" is missing. Run supabase/schema.sql in your Supabase project to create the required tables, bucket, and policies.`;
}

export async function ensureReportStorageBucket(currentClient: SupabaseClient) {
  const adminClient = createSupabaseServiceClient();
  const bucketClient = adminClient ?? currentClient;
  const { error } = await bucketClient.storage.createBucket(serverConfig.storageBucket, {
    public: false,
  });

  if (!error || isBucketAlreadyCreatedError(error)) {
    return;
  }

  if (isBucketPermissionError(error) && !adminClient) {
    throw new ApiError(
      `${getMissingStorageBucketMessage()} Add SUPABASE_SERVICE_ROLE_KEY to let the server auto-create the bucket during uploads.`,
      503
    );
  }

  throw new ApiError(error.message || getMissingStorageBucketMessage(), 503);
}
