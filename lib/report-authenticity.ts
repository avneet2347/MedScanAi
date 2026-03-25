import crypto from "node:crypto";
import { normalizeText } from "@/lib/api-utils";
import type { AuthenticityProof, MedicalAnalysis } from "@/lib/report-types";

function sha256(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createAuthenticityProof(payload: {
  fileBuffer: Buffer;
  ocrText: string;
  analysis: MedicalAnalysis;
}): AuthenticityProof {
  const issuedAt = new Date().toISOString();
  const documentHash = sha256(payload.fileBuffer);
  const ocrHash = sha256(normalizeText(payload.ocrText || ""));
  const analysisHash = sha256(JSON.stringify(payload.analysis || {}));
  const blockHash = sha256(`${documentHash}:${ocrHash}:${analysisHash}:${issuedAt}`);

  return {
    algorithm: "sha256-hash-chain",
    issuedAt,
    documentHash,
    ocrHash,
    analysisHash,
    blockHash,
    verificationMessage:
      "If the source file, OCR text, or analysis JSON changes, the verification hash will also change. Use this tamper-evident hash chain to validate report authenticity.",
  };
}
