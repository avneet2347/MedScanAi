"use client";

import { useEffect } from "react";

export default function AutoAnalyzer() {
  useEffect(() => {
    document.addEventListener("click", async (e: any) => {
      const btn = e.target.closest(".btn-analyze");
      if (!btn) return;

      const input = document.querySelector("input[type='file']") as HTMLInputElement;

      if (!input?.files?.[0]) {
        alert("Upload file first");
        return;
      }

      const file = input.files[0];
      const formData = new FormData();
      formData.append("file", file);

      btn.innerText = "Analyzing...";

      try {
        const res = await fetch("/api/scan-slip", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        (window as any).setResult?.(data);

        alert("✅ Analysis Complete (check console)");

      } catch (err) {
        console.error(err);
        alert("Error analyzing file");
      }

      btn.innerText = "🧬 Analyse Report";
    });
  }, []);

  return null;
}