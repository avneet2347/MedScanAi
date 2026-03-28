import { normalizeText } from "@/lib/api-utils";
import { chooseLocalizedText } from "@/lib/localization";
import type {
  ConditionInsight,
  MedicalAnalysis,
  MedicineEntry,
  OutputLanguage,
  TestStatus,
  TestValueEntry,
} from "@/lib/report-types";

const KNOWN_TESTS = [
  "hba1c",
  "hemoglobin",
  "hb",
  "creatinine",
  "glucose",
  "blood sugar",
  "fasting blood sugar",
  "post prandial",
  "ppbs",
  "fbs",
  "tsh",
  "t3",
  "t4",
  "cholesterol",
  "hdl",
  "ldl",
  "triglyceride",
  "vitamin d",
  "vitamin b12",
  "platelet",
  "wbc",
  "rbc",
  "esr",
  "sgpt",
  "sgot",
  "alt",
  "ast",
  "alkaline phosphatase",
  "bilirubin",
  "sodium",
  "potassium",
  "urea",
  "uric acid",
  "calcium",
  "protein",
  "albumin",
  "globulin",
  "hdl",
  "ldl",
  "bp",
  "blood pressure",
];

const MEDICINE_SUFFIXES = [
  "mg",
  "mcg",
  "ml",
  "tablet",
  "tab",
  "capsule",
  "cap",
  "syrup",
  "inj",
  "injection",
  "tab.",
  "cap.",
  "drops",
  "ointment",
  "cream",
];

const CLINICAL_LINE_HINTS =
  /\b(patient|age|sex|doctor|date|diagnosis|impression|advice|remarks|result|range|prescription|rx)\b/i;

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function detectDocumentType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("prescription") || lower.includes("rx")) {
    return "prescription";
  }

  if (lower.includes("report") || lower.includes("laboratory") || lower.includes("investigation")) {
    return "lab-report";
  }

  return "medical-document";
}

function extractCandidateLines(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) =>
      line
        .replace(/[|]{2,}/g, " | ")
        .replace(/[_=]{2,}/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function inferStatus(name: string, value: string, referenceRange: string): TestStatus {
  const lower = name.toLowerCase();
  const numeric = Number(value.match(/-?\d+(\.\d+)?/)?.[0] || Number.NaN);

  if (!Number.isNaN(numeric)) {
    if (lower.includes("hba1c")) {
      if (numeric >= 6.5) return "high";
      if (numeric >= 5.7) return "borderline";
      return "normal";
    }

    if (lower.includes("glucose") || lower.includes("sugar")) {
      if (numeric >= 126) return "high";
      if (numeric >= 100) return "borderline";
      return "normal";
    }

    if (lower.includes("hemoglobin")) {
      if (numeric < 11) return "low";
      return "normal";
    }

    if (lower.includes("creatinine")) {
      if (numeric > 1.2) return "high";
      return "normal";
    }

    if (lower.includes("tsh")) {
      if (numeric > 4.5) return "high";
      if (numeric < 0.4) return "low";
      return "normal";
    }

    if (lower.includes("cholesterol")) {
      if (numeric >= 200) return "high";
      return "normal";
    }
  }

  if (/high|increased|elevated/i.test(referenceRange)) {
    return "high";
  }

  if (/low|decreased/i.test(referenceRange)) {
    return "low";
  }

  return "unknown";
}

function extractTestValues(lines: string[], language: OutputLanguage): TestValueEntry[] {
  const entries: TestValueEntry[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const labRowMatch =
      line.match(
        /^([A-Za-z][A-Za-z0-9 ()/%.+-]{2,80}?)\s+(-?\d+(?:\.\d+)?)\s*(%|mg\/dL|g\/dL|mIU\/L|uIU\/mL|ng\/mL|mmHg|bpm|IU\/L|U\/L|mmol\/L|cells\/cumm)?(?:\s+(?:ref(?:erence)?(?: range)?|normal)\s*[:\-]?\s*(.+))?$/i
      ) || null;

    if (!KNOWN_TESTS.some((candidate) => lower.includes(candidate)) && !labRowMatch) {
      continue;
    }

    const valueMatch =
      line.match(/(-?\d+(?:\.\d+)?)\s*(%|mg\/dL|g\/dL|mIU\/L|ng\/mL|mmHg|bpm)?/i) || null;

    if (!valueMatch) {
      continue;
    }

    const name = (labRowMatch?.[1] ||
      line
        .split(/[:\-]/)[0]
        .replace(/\s{2,}/g, " ")
        .trim()) as string;
    const value = labRowMatch?.[2] || valueMatch[1];
    const unit = labRowMatch?.[3] || valueMatch[2] || "";
    const referenceRange =
      labRowMatch?.[4]?.trim() ||
      line.match(/(?:ref(?:erence)?(?: range)?|normal)[:\s-]*(.+)$/i)?.[1]?.trim() ||
      "";
    const status = inferStatus(name, value, referenceRange);

    entries.push({
      name,
      value,
      unit,
      referenceRange,
      status,
      explanation:
        status === "unknown"
          ? chooseLocalizedText(language, {
              en: "Auto-detected from the OCR text. A clinician should confirm this value.",
              hi: "यह OCR टेक्स्ट से स्वतः निकाला गया है। डॉक्टर को इस मान की पुष्टि करनी चाहिए।",
              hinglish: "Ye OCR text se auto-detect hua hai. Clinician ko is value ko confirm karna chahiye.",
            })
          : chooseLocalizedText(language, {
              en: "Auto-detected from the OCR text and interpreted with rule-based fallback logic.",
              hi: "यह OCR टेक्स्ट से स्वतः निकाला गया है और नियम-आधारित fallback logic से समझा गया है।",
              hinglish: "Ye OCR text se auto-detect hua hai aur rule-based fallback logic se interpret kiya gaya hai.",
            }),
    });
  }

  return entries.slice(0, 12);
}

function extractMedicines(lines: string[], language: OutputLanguage): MedicineEntry[] {
  const medicines: MedicineEntry[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (
      !MEDICINE_SUFFIXES.some((suffix) => lower.includes(suffix)) &&
      !(lower.includes("rx") && /\b\d+(?:\.\d+)?\s*(mg|mcg|ml)\b/i.test(line))
    ) {
      continue;
    }

    if (CLINICAL_LINE_HINTS.test(line) && !/\b(tab|tablet|cap|capsule|syrup|inj|injection|mg|mcg|ml)\b/i.test(line)) {
      continue;
    }

    const name = line.split(/[:\-]/)[0].trim();
    const dosage = line.match(/\b\d+(?:\.\d+)?\s*(mg|mcg|ml)\b/i)?.[0] || "";
    const frequency =
      line.match(/\b(once daily|twice daily|thrice daily|od|bd|tds|hs|morning|night)\b/i)?.[0] ||
      "";

    medicines.push({
      name,
      dosage,
      frequency,
      purpose: "",
      notes: chooseLocalizedText(language, {
        en: "Extracted with a fallback parser from OCR text.",
        hi: "OCR टेक्स्ट से fallback parser द्वारा निकाला गया।",
        hinglish: "OCR text se fallback parser ke through extract hua.",
      }),
    });
  }

  return medicines.slice(0, 10);
}

function extractConditions(text: string, language: OutputLanguage): ConditionInsight[] {
  const lower = text.toLowerCase();
  const conditions: ConditionInsight[] = [];

  if (/\b(?:diagnosis|impression)\b/i.test(text) && /\bdiabetes\b/i.test(text)) {
    conditions.push({
      name: chooseLocalizedText(language, {
        en: "Diabetes mentioned in report",
        hi: "Report me diabetes mention hai",
        hinglish: "Report me diabetes mention hai",
      }),
      confidence: "high",
      evidence: chooseLocalizedText(language, {
        en: "The OCR text explicitly mentions diabetes in a diagnosis or impression context.",
        hi: "OCR text me diagnosis ya impression context me diabetes explicitly mention hai.",
        hinglish: "OCR text me diagnosis ya impression context me diabetes explicitly mention hai.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "This is based on text explicitly present in the report.",
        hi: "Ye report me explicitly present text par based hai.",
        hinglish: "Ye report me explicitly present text par based hai.",
      }),
    });
  }

  if (lower.includes("hba1c") || lower.includes("glucose") || lower.includes("diabetes")) {
    conditions.push({
      name: chooseLocalizedText(language, {
        en: "Possible diabetes or glucose regulation issue",
        hi: "संभावित डायबिटीज़ या ग्लूकोज़ नियंत्रण समस्या",
        hinglish: "Possible diabetes ya glucose regulation issue",
      }),
      confidence: "medium",
      evidence: chooseLocalizedText(language, {
        en: "Terms such as HbA1c, glucose, or diabetes were detected in the report text.",
        hi: "रिपोर्ट टेक्स्ट में HbA1c, glucose या diabetes जैसे शब्द मिले।",
        hinglish: "Report text me HbA1c, glucose ya diabetes jaise terms detect hue.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "This is a fallback hypothesis based on the OCR text only and is not a diagnosis.",
        hi: "यह केवल OCR टेक्स्ट पर आधारित fallback अनुमान है, निदान नहीं।",
        hinglish: "Ye sirf OCR text par based fallback hypothesis hai, diagnosis nahi.",
      }),
    });
  }

  if (lower.includes("hemoglobin") || lower.includes("anemia")) {
    conditions.push({
      name: chooseLocalizedText(language, {
        en: "Possible anemia",
        hi: "संभावित एनीमिया",
        hinglish: "Possible anemia",
      }),
      confidence: "medium",
      evidence: chooseLocalizedText(language, {
        en: "Hemoglobin-related text was detected in the report.",
        hi: "रिपोर्ट में hemoglobin से जुड़ा टेक्स्ट मिला।",
        hinglish: "Report me hemoglobin related text detect hua.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "Low hemoglobin can suggest anemia, but a clinician should interpret the full report.",
        hi: "कम hemoglobin एनीमिया का संकेत हो सकता है, लेकिन पूरी रिपोर्ट डॉक्टर को समझनी चाहिए।",
        hinglish: "Low hemoglobin anemia ka signal ho sakta hai, lekin full report clinician ko interpret karni chahiye.",
      }),
    });
  }

  if (lower.includes("tsh") || lower.includes("thyroid")) {
    conditions.push({
      name: chooseLocalizedText(language, {
        en: "Possible thyroid imbalance",
        hi: "संभावित थायरॉयड असंतुलन",
        hinglish: "Possible thyroid imbalance",
      }),
      confidence: "low",
      evidence: chooseLocalizedText(language, {
        en: "TSH or thyroid-related text was detected in the report.",
        hi: "रिपोर्ट में TSH या thyroid से जुड़ा टेक्स्ट मिला।",
        hinglish: "Report me TSH ya thyroid-related text detect hua.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "This is a tentative flag based on OCR text and not a confirmed condition.",
        hi: "यह OCR टेक्स्ट पर आधारित प्रारंभिक संकेत है, पुष्टि की गई स्थिति नहीं।",
        hinglish: "Ye OCR text based tentative flag hai, confirmed condition nahi.",
      }),
    });
  }

  return conditions.slice(0, 5);
}

export function generateFallbackMedicalAnalysis(
  extractedText: string,
  language: OutputLanguage = "en"
): MedicalAnalysis {
  const normalized = normalizeText(extractedText);
  const lines = extractCandidateLines(normalized);
  const testValues = extractTestValues(lines, language);
  const medicines = extractMedicines(lines, language);
  const possibleConditions = extractConditions(normalized, language);
  const leadingLines = lines.slice(0, 6).join(" ");

  return {
    documentType: detectDocumentType(normalized),
    overview:
      leadingLines ||
      chooseLocalizedText(language, {
        en: "A fallback summary was generated because the primary AI analysis service was unavailable.",
        hi: "मुख्य AI analysis service उपलब्ध न होने के कारण fallback summary बनाई गई।",
        hinglish: "Primary AI analysis service unavailable hone ki wajah se fallback summary generate hui.",
      }),
    plainLanguageSummary: chooseLocalizedText(language, {
      en: "This report was analyzed with a fallback parser because the main AI service was temporarily unavailable. The extracted values and medicines may be incomplete and should be reviewed manually.",
      hi: "मुख्य AI service अस्थायी रूप से उपलब्ध न होने के कारण इस रिपोर्ट का विश्लेषण fallback parser से किया गया। निकाले गए मान और दवाएं अधूरी हो सकती हैं, इसलिए इन्हें मैन्युअली जांचें।",
      hinglish: "Main AI service temporarily unavailable thi, isliye is report ko fallback parser se analyze kiya gaya. Extracted values aur medicines incomplete ho sakte hain, isliye manually review karein.",
    }),
    possibleConditions,
    medicines,
    testValues,
    precautions: uniqueStrings([
      chooseLocalizedText(language, {
        en: "Verify the extracted values against the original report before acting on them.",
        hi: "किसी भी कार्रवाई से पहले निकाले गए मानों को मूल रिपोर्ट से मिलाएं।",
        hinglish: "Kisi action se pehle extracted values ko original report se verify karein.",
      }),
      chooseLocalizedText(language, {
        en: "Do not change medicines or treatment based only on this automated fallback result.",
        hi: "केवल इस automated fallback result के आधार पर दवा या इलाज न बदलें।",
        hinglish: "Sirf is automated fallback result ke base par medicine ya treatment change na karein.",
      }),
      chooseLocalizedText(language, {
        en: "Seek urgent care for severe symptoms such as chest pain, fainting, confusion, or trouble breathing.",
        hi: "सीने में दर्द, बेहोशी, भ्रम या सांस लेने में दिक्कत जैसे गंभीर लक्षण हों तो तुरंत इलाज लें।",
        hinglish: "Chest pain, fainting, confusion ya breathing trouble jaise severe symptoms hon to urgent care lein.",
      }),
    ]),
    followUpQuestions: uniqueStrings([
      chooseLocalizedText(language, {
        en: "Which values in this report are outside the expected range?",
        hi: "इस रिपोर्ट में कौन से मान अपेक्षित सीमा से बाहर हैं?",
        hinglish: "Is report me kaun si values expected range se bahar hain?",
      }),
      chooseLocalizedText(language, {
        en: "Should any of these findings be repeated or confirmed with a clinician?",
        hi: "क्या इनमें से किसी finding को दोबारा जांचना या डॉक्टर से पुष्टि करना चाहिए?",
        hinglish: "Kya in findings me se kisi ko repeat ya clinician se confirm karna chahiye?",
      }),
      chooseLocalizedText(language, {
        en: "Do the listed medicines match the original prescription exactly?",
        hi: "क्या सूचीबद्ध दवाएं मूल प्रिस्क्रिप्शन से पूरी तरह मेल खाती हैं?",
        hinglish: "Kya listed medicines original prescription se exactly match karti hain?",
      }),
    ]),
    safetyFlags: uniqueStrings([
      testValues.some((entry) => entry.status === "high" || entry.status === "low")
        ? chooseLocalizedText(language, {
            en: "One or more values may be outside the usual range.",
            hi: "एक या अधिक मान सामान्य सीमा से बाहर हो सकते हैं।",
            hinglish: "Ek ya zyada values usual range se bahar ho sakti hain.",
          })
        : "",
      chooseLocalizedText(language, {
        en: "Fallback analysis was used because the main AI provider was unavailable.",
        hi: "मुख्य AI provider उपलब्ध न होने के कारण fallback analysis इस्तेमाल किया गया।",
        hinglish: "Main AI provider unavailable tha isliye fallback analysis use hua.",
      }),
    ]),
  };
}
