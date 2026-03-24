"use client";

import { useEffect, useState } from "react";

export default function ResultViewer() {
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (window as any).setResult = setResult;
  }, []);

  if (!result) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: "350px",
      background: "#fff",
      padding: "15px",
      borderRadius: "10px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
      zIndex: 9999
    }}>
      <h3>🧠 AI Result</h3>
      <pre style={{ fontSize: "12px" }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}