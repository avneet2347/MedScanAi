import { NextResponse } from "next/server";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
]);

export class ApiError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function jsonError(
  message: string,
  status = 400,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function getErrorStatus(error: unknown, fallback = 500) {
  if (error instanceof ApiError) {
    return error.status;
  }

  return fallback;
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim() || null;
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string) {
  return password.trim().length >= 8;
}

export function isAllowedUploadMimeType(mimeType: string) {
  return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
}

export function titleFromFilename(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
}
