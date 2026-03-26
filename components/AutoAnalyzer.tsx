"use client";

import { useEffect } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase";

declare global {
  interface Window {
    setResult?: (value: unknown) => void;
  }
}

function getActiveLanguage() {
  const activeButton = document.querySelector<HTMLButtonElement>(".lang-btn.active");
  const language = activeButton?.dataset.lang;

  if (language === "hi" || language === "hinglish") {
    return language;
  }

  return "en";
}

const supabase = getBrowserSupabaseClient();

async function preprocessImageForOcr(file: File) {
  if (!file.type.startsWith("image/")) {
    return {
      file,
      preprocessingApplied: false,
    };
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to load image for OCR preprocessing."));
      image.src = imageUrl;
    });

    const maxWidth = 1800;
    const scale = Math.min(1, maxWidth / Math.max(image.width, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      return {
        file,
        preprocessingApplied: false,
      };
    }

    context.filter = "grayscale(100%) contrast(165%) brightness(110%)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const average = (data[index] + data[index + 1] + data[index + 2]) / 3;
      const next = average > 160 ? 255 : 0;
      data[index] = next;
      data[index + 1] = next;
      data[index + 2] = next;
    }

    context.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 1)
    );

    if (!blob) {
      return {
        file,
        preprocessingApplied: false,
      };
    }

    return {
      file: new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "scan"}-ocr.png`, {
        type: "image/png",
      }),
      preprocessingApplied: true,
    };
  } catch {
    return {
      file,
      preprocessingApplied: false,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function AutoAnalyzer() {
  useEffect(() => {
    let inflight = false;

    const runAnalysis = async (button: HTMLButtonElement | null) => {
      if (!(button instanceof HTMLButtonElement) || inflight) {
        return;
      }

      const input = document.querySelector("input[type='file']") as HTMLInputElement | null;

      if (!input?.files?.[0]) {
        alert("Upload file first");
        return;
      }

      inflight = true;
      const originalText = button.innerText;
      const originalFile = input.files[0];
      const language = getActiveLanguage();

      button.innerText = "Analyzing...";

      try {
        const { file, preprocessingApplied } = await preprocessImageForOcr(originalFile);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("language", language);
        const { data } = await supabase.auth.getSession();

        if (!data.session?.access_token) {
          window.location.assign("/signup");
          return;
        }

        const headers = new Headers();
        headers.set("Authorization", `Bearer ${data.session.access_token}`);

        const response = await fetch("/api/scan-slip", {
          method: "POST",
          headers,
          body: formData,
        });
        const payload = await response.json();

        if (response.status === 401 || response.status === 403) {
          window.location.assign("/signup");
          return;
        }

        if (!response.ok) {
          throw new Error(payload?.error || "Analysis failed");
        }

        window.setResult?.({
          ...payload,
          language,
          filename: payload?.filename || originalFile.name,
          createdAt: payload?.createdAt || new Date().toISOString(),
          preprocessing: {
            applied: preprocessingApplied,
            mode: preprocessingApplied ? "client-threshold-cleanup" : "original-file",
          },
        });
      } catch (error) {
        console.error(error);
        alert(error instanceof Error ? error.message : "Error analyzing file");
      } finally {
        inflight = false;
        button.innerText = originalText || "Analyse Report";
      }
    };

    const handleProgrammaticAnalyze = () => {
      const button = document.querySelector(".btn-analyze") as HTMLButtonElement | null;
      void runAnalysis(button);
    };

    window.addEventListener("medscan:analyze", handleProgrammaticAnalyze);

    return () => {
      window.removeEventListener("medscan:analyze", handleProgrammaticAnalyze);
    };
  }, []);

  return null;
}
