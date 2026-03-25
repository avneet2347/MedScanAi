import { publicConfig } from "@/lib/public-config";

function requireServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readNumberEnv(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }

  return parsed;
}

export const serverConfig = {
  ...publicConfig,
  openAiApiKey: requireServerEnv("OPENAI_API_KEY"),
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "medical-reports",
  openAiAnalysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4.1-mini",
  openAiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
  openAiOcrModel: process.env.OPENAI_OCR_MODEL || "gpt-4.1-mini",
  geminiAnalysisModel: process.env.GEMINI_ANALYSIS_MODEL || "gemini-2.5-flash",
  maxUploadBytes: readNumberEnv("MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
};
