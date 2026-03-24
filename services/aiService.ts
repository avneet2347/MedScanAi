export async function analyzeMedicalText(text: string) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are a professional medical AI.

Analyze this OCR text carefully and give:

1. Summary
2. Possible diseases
3. Medicines mentioned
4. Precautions

Even if text is noisy, try your best.

TEXT:
${text}
                  `,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await res.json();

    console.log("🔥 GEMINI RESPONSE:", JSON.stringify(data, null, 2));

    // ✅ safer parsing
    const output =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(" ") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI";

    return { result: output };

  } catch (error) {
    console.error("Gemini Error:", error);
    return { error: "AI failed" };
  }
}