import { NextRequest, NextResponse } from "next/server";
import tesseract from "node-tesseract-ocr";
import fs from "fs";
import path from "path";
import { fromPath } from "pdf2pic";
import { analyzeMedicalText } from "@/services/aiService";

export async function POST(req: NextRequest) {
  let filePath = "";

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // ✅ Allow image + PDF
    if (
      !file.type.startsWith("image/") &&
      file.type !== "application/pdf"
    ) {
      return NextResponse.json(
        { error: "Only image or PDF files allowed" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ✅ Fix extension dynamically
    const ext = file.name.split(".").pop();
    const fileName = `temp-${Date.now()}.${ext}`;
    filePath = path.join(process.cwd(), fileName);

    fs.writeFileSync(filePath, buffer);

    // ✅ If PDF → convert to image
    fs.writeFileSync(filePath, buffer);

    // ✅ PDF → convert to image
    if (file.type === "application/pdf") {
      const converter = fromPath(filePath, {
        density: 100,
        saveFilename: "page",
        savePath: process.cwd(),
        format: "png",
        width: 1024,
        height: 1024,
      });

      const result = await converter(1);
      filePath = result.path;
    }

    // 🧠 OCR
    let text = "";
    try {
      text = await tesseract.recognize(filePath, {
        lang: "eng",
        oem: 1,
        psm: 3,
      });
    } catch (ocrError) {
      console.error("OCR Error:", ocrError);
      return NextResponse.json(
        { error: "OCR failed" },
        { status: 500 }
      );
    }

    // 🤖 AI ANALYSIS
    const analysis = await analyzeMedicalText(text);

    return NextResponse.json({
      success: true,
      extractedText: text,
      analysis,
    });

  } 
  catch (error: any) {
  console.error("🔥 FULL ERROR:", error);

  return NextResponse.json(
    { error: error.message || "Processing failed" },
    { status: 500 }
  );
}
 finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}