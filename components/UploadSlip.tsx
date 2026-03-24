"use client";

import { useState } from "react";

export default function UploadSlip() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Upload file first");

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/scan-slip", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    // ✅ FIXED HERE
    setResult(data.extractedText);

    setLoading(false);
  };

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(result);
    speechSynthesis.speak(utterance);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>MediScan AI</h2>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <br /><br />

      <button onClick={handleUpload}>
        {loading ? "Processing..." : "Analyze"}
      </button>

      <br /><br />

      {result && (
        <>
          <button onClick={speak}>🔊 Speak</button>
          <pre style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
        </>
      )}
    </div>
  );
}