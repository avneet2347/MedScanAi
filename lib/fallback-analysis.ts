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
const CLINICAL_NOISE_HINTS =
  /\b(address|road|street|phone|mobile|email|website|bill|invoice|sample collected|registered on|reporting time|patient id)\b/i;
const LAB_UNIT_PATTERN_SOURCE =
  "(?:%|mg\\/dL|g\\/dL|mIU\\/L|uIU\\/mL|ng\\/mL|mmHg|bpm|IU\\/L|U\\/L|mmol\\/L|cells\\/cumm|x10\\^3\\/uL|x10\\^6\\/uL|pg|fL|mEq\\/L)";

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

function normalizeClinicalLine(line: string) {
  return normalizeText(line)
    .replace(/[|]{2,}/g, " | ")
    .replace(/[_=]{2,}/g, " ")
    .replace(/\bH\s*b\s*A\s*1\s*c\b/gi, "HbA1c")
    .replace(/\bT\s*S\s*H\b/gi, "TSH")
    .replace(/\bT\s*3\b/gi, "T3")
    .replace(/\bT\s*4\b/gi, "T4")
    .replace(/\bW\s*B\s*C\b/gi, "WBC")
    .replace(/\bR\s*B\s*C\b/gi, "RBC")
    .replace(/\bm\s*g\s*\/\s*d\s*l\b/gi, "mg/dL")
    .replace(/\bg\s*\/\s*d\s*l\b/gi, "g/dL")
    .replace(/\bm\s*I\s*U\s*\/\s*L\b/gi, "mIU/L")
    .replace(/\bn\s*g\s*\/\s*m\s*l\b/gi, "ng/mL")
    .replace(/\bm\s*m\s*H\s*g\b/gi, "mmHg")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+\|\s+/g, " | ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractCandidateLines(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => normalizeClinicalLine(line))
    .filter(Boolean);
}

function isLikelyTestName(name: string) {
  const normalizedName = normalizeClinicalLine(name);
  const lower = normalizedName.toLowerCase();

  if (!normalizedName || normalizedName.length < 2) {
    return false;
  }

  if (
    CLINICAL_NOISE_HINTS.test(normalizedName) ||
    /\b(patient|name|age|sex|doctor|date|contact|address|phone|mobile|email|specimen|lab no|bill|invoice)\b/i.test(
      normalizedName
    )
  ) {
    return false;
  }

  if (KNOWN_TESTS.some((candidate) => lower.includes(candidate))) {
    return true;
  }

  return (
    /[A-Za-z]/.test(normalizedName) &&
    !/\b(tablet|tab|capsule|cap|syrup|injection|inj|ointment|cream|rx)\b/i.test(normalizedName)
  );
}

function extractReferenceRange(fragment: string) {
  const normalized = normalizeClinicalLine(fragment);

  if (!normalized) {
    return "";
  }

  const explicitRange =
    normalized.match(
      /(?:ref(?:erence)?(?: range)?|normal(?: range)?|bio\.?\s*ref\.?\s*interval)\s*[:\-]?\s*(.+)$/i
    )?.[1] || "";

  if (explicitRange) {
    return explicitRange.trim();
  }

  const comparatorRange = normalized.match(
    /(?:<|>)\s*-?\d+(?:\.\d+)?(?:\s*(?:%|[A-Za-z/^\d]+))?/i
  )?.[0];

  if (comparatorRange) {
    return comparatorRange.trim();
  }

  const betweenRange = normalized.match(
    /-?\d+(?:\.\d+)?\s*(?:to|-)\s*-?\d+(?:\.\d+)?(?:\s*(?:%|[A-Za-z/^\d]+))?/i
  )?.[0];

  return betweenRange?.trim() || "";
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

    if (lower.includes("hemoglobin") || lower === "hb") {
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

function buildTestValueEntry(
  name: string,
  value: string,
  unit: string,
  referenceRange: string,
  language: OutputLanguage,
  sourceLabel: "inline" | "table"
): TestValueEntry | null {
  const normalizedName = normalizeClinicalLine(name);
  const normalizedValue = normalizeClinicalLine(value);
  const normalizedUnit = normalizeClinicalLine(unit);
  const normalizedRange = normalizeClinicalLine(referenceRange);

  if (!normalizedName || !normalizedValue || !isLikelyTestName(normalizedName)) {
    return null;
  }

  const status = inferStatus(normalizedName, normalizedValue, normalizedRange);

  return {
    name: normalizedName,
    value: normalizedValue,
    unit: normalizedUnit,
    referenceRange: normalizedRange,
    status,
    explanation:
      status === "unknown"
        ? chooseLocalizedText(language, {
            en: `Auto-detected from a ${sourceLabel} OCR row. A clinician should confirm this value.`,
            hi: `${sourceLabel === "table" ? "Table" : "Inline"} OCR row se auto-detect hua. Clinician ko is value ko confirm karna chahiye.`,
            hinglish: `${sourceLabel === "table" ? "Table" : "Inline"} OCR row se auto-detect hua. Clinician ko is value ko confirm karna chahiye.`,
          })
        : chooseLocalizedText(language, {
            en: `Auto-detected from a ${sourceLabel} OCR row and interpreted with rule-based fallback logic.`,
            hi: `${sourceLabel === "table" ? "Table" : "Inline"} OCR row se auto-detect hua aur rule-based fallback logic se interpret kiya gaya.`,
            hinglish: `${sourceLabel === "table" ? "Table" : "Inline"} OCR row se auto-detect hua aur rule-based fallback logic se interpret kiya gaya.`,
          }),
  };
}

function parseTabularTestLine(line: string, language: OutputLanguage) {
  const segments = line
    .split(/\s+\|\s+|\t+| {2,}/)
    .map((segment) => normalizeClinicalLine(segment))
    .filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const name = segments[0];

  if (!isLikelyTestName(name)) {
    return null;
  }

  let value = "";
  let unit = "";
  let referenceRange = extractReferenceRange(segments.slice(1).join(" "));

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];

    if (!value) {
      value =
        segment.match(/\b\d{2,3}\/\d{2,3}\b/)?.[0] ||
        segment.match(/-?\d+(?:\.\d+)?/)?.[0] ||
        "";
    }

    if (!unit) {
      unit = segment.match(new RegExp(LAB_UNIT_PATTERN_SOURCE, "i"))?.[0] || "";
    }

    if (!referenceRange && index > 1) {
      referenceRange = extractReferenceRange(segment);
    }
  }

  if (!value || (value.includes("/") && !/\b(?:bp|blood pressure)\b/i.test(name))) {
    return null;
  }

  return buildTestValueEntry(name, value, unit, referenceRange, language, "table");
}

function parseInlineTestLine(line: string, language: OutputLanguage) {
  const bpMatch = line.match(/\b(bp|blood pressure)\s*[:\-]?\s*(\d{2,3}\/\d{2,3})\s*(mmHg)?/i);

  if (bpMatch) {
    return buildTestValueEntry(
      bpMatch[1],
      bpMatch[2],
      bpMatch[3] || "mmHg",
      extractReferenceRange(line),
      language,
      "inline"
    );
  }

  const inlinePattern = new RegExp(
    `^([A-Za-z][A-Za-z0-9 ()/%.+-]{2,80}?)\\s*(?:[:\\-]|\\s{2,})\\s*(-?\\d+(?:\\.\\d+)?)\\s*(${LAB_UNIT_PATTERN_SOURCE})?(?:\\s+(.*))?$`,
    "i"
  );
  const loosePattern = new RegExp(
    `^([A-Za-z][A-Za-z0-9 ()/%.+-]{2,80}?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*(${LAB_UNIT_PATTERN_SOURCE})?(?:\\s+(.*))?$`,
    "i"
  );
  const match = line.match(inlinePattern) || line.match(loosePattern);

  if (!match) {
    return null;
  }

  const name = normalizeClinicalLine(match[1]);

  if (!isLikelyTestName(name)) {
    return null;
  }

  const tail = normalizeClinicalLine(match[4] || "");
  return buildTestValueEntry(
    name,
    match[2],
    match[3] || "",
    extractReferenceRange(tail) || tail,
    language,
    "inline"
  );
}

function extractTestValues(lines: string[], language: OutputLanguage): TestValueEntry[] {
  const entries: TestValueEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsedEntry = parseTabularTestLine(line, language) || parseInlineTestLine(line, language);

    if (!parsedEntry) {
      continue;
    }

    const key = [
      parsedEntry.name.toLowerCase(),
      parsedEntry.value.toLowerCase(),
      parsedEntry.unit.toLowerCase(),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push(parsedEntry);
  }

  return entries.slice(0, 16);
}

function extractMedicines(lines: string[], language: OutputLanguage): MedicineEntry[] {
  const medicines: MedicineEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (
      !MEDICINE_SUFFIXES.some((suffix) => lower.includes(suffix)) &&
      !(lower.includes("rx") && /\b\d+(?:\.\d+)?\s*(mg|mcg|ml)\b/i.test(line))
    ) {
      continue;
    }

    if (
      CLINICAL_LINE_HINTS.test(line) &&
      !/\b(tab|tablet|cap|capsule|syrup|inj|injection|mg|mcg|ml)\b/i.test(line)
    ) {
      continue;
    }

    const medicineNameMatch =
      line.match(
        /^([A-Za-z][A-Za-z0-9+()./%-]{1,50}?)(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ml)\b|\s+(?:tablet|tab|capsule|cap|syrup|inj|injection|drops|ointment|cream)\b)/i
      ) ||
      line.match(
        /\b(?:tablet|tab|capsule|cap|syrup|inj|injection|drops|ointment|cream)\.?\s+([A-Za-z][A-Za-z0-9+()./%-]{1,40})/i
      );
    const rawName =
      medicineNameMatch?.[1] ||
      line
        .split(/[:\-]/)[0]
        .replace(/^rx\.?\s*/i, "")
        .replace(/\b(?:tablet|tab|capsule|cap|syrup|inj|injection|drops|ointment|cream)\b\.?/gi, "")
        .trim();
    const name = normalizeClinicalLine(rawName);
    const dosage = line.match(/\b\d+(?:\.\d+)?\s*(mg|mcg|ml)\b/i)?.[0] || "";
    const frequency =
      line.match(
        /\b(once daily|twice daily|thrice daily|daily|od|bd|tds|hs|morning|evening|night|after food|before food|sos|stat)\b/i
      )?.[0] || "";

    if (!name || CLINICAL_NOISE_HINTS.test(name) || isLikelyTestName(name)) {
      continue;
    }

    const key = [name.toLowerCase(), dosage.toLowerCase(), frequency.toLowerCase()].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    medicines.push({
      name,
      dosage,
      frequency,
      purpose: "",
      notes: chooseLocalizedText(language, {
        en: "Extracted with a fallback parser from OCR text.",
        hi: "OCR text se fallback parser ke through extract hua.",
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
        hi: "Possible diabetes ya glucose regulation issue",
        hinglish: "Possible diabetes ya glucose regulation issue",
      }),
      confidence: "medium",
      evidence: chooseLocalizedText(language, {
        en: "Terms such as HbA1c, glucose, or diabetes were detected in the report text.",
        hi: "Report text me HbA1c, glucose ya diabetes jaise terms detect hue.",
        hinglish: "Report text me HbA1c, glucose ya diabetes jaise terms detect hue.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "This is a fallback hypothesis based on the OCR text only and is not a diagnosis.",
        hi: "Ye sirf OCR text par based fallback hypothesis hai, diagnosis nahi.",
        hinglish: "Ye sirf OCR text par based fallback hypothesis hai, diagnosis nahi.",
      }),
    });
  }

  if (lower.includes("hemoglobin") || lower.includes("anemia")) {
    conditions.push({
      name: chooseLocalizedText(language, {
        en: "Possible anemia",
        hi: "Possible anemia",
        hinglish: "Possible anemia",
      }),
      confidence: "medium",
      evidence: chooseLocalizedText(language, {
        en: "Hemoglobin-related text was detected in the report.",
        hi: "Report me hemoglobin related text detect hua.",
        hinglish: "Report me hemoglobin related text detect hua.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "Low hemoglobin can suggest anemia, but a clinician should interpret the full report.",
        hi: "Low hemoglobin anemia ka signal ho sakta hai, lekin full report clinician ko interpret karni chahiye.",
        hinglish: "Low hemoglobin anemia ka signal ho sakta hai, lekin full report clinician ko interpret karni chahiye.",
      }),
    });
  }

  if (lower.includes("tsh") || lower.includes("thyroid")) {
    conditions.push({
      name: chooseLocalizedText(language, {
        en: "Possible thyroid imbalance",
        hi: "Possible thyroid imbalance",
        hinglish: "Possible thyroid imbalance",
      }),
      confidence: "low",
      evidence: chooseLocalizedText(language, {
        en: "TSH or thyroid-related text was detected in the report.",
        hi: "Report me TSH ya thyroid-related text detect hua.",
        hinglish: "Report me TSH ya thyroid-related text detect hua.",
      }),
      explanation: chooseLocalizedText(language, {
        en: "This is a tentative flag based on OCR text and not a confirmed condition.",
        hi: "Ye OCR text based tentative flag hai, confirmed condition nahi.",
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
        hi: "Primary AI analysis service unavailable hone ki wajah se fallback summary generate hui.",
        hinglish: "Primary AI analysis service unavailable hone ki wajah se fallback summary generate hui.",
      }),
    plainLanguageSummary: chooseLocalizedText(language, {
      en: "This report was analyzed with a fallback parser because the main AI service was temporarily unavailable. The extracted values and medicines may be incomplete and should be reviewed manually.",
      hi: "Main AI service temporarily unavailable thi, isliye is report ko fallback parser se analyze kiya gaya. Extracted values aur medicines incomplete ho sakte hain, isliye manually review karein.",
      hinglish:
        "Main AI service temporarily unavailable thi, isliye is report ko fallback parser se analyze kiya gaya. Extracted values aur medicines incomplete ho sakte hain, isliye manually review karein.",
    }),
    possibleConditions,
    medicines,
    testValues,
    precautions: uniqueStrings([
      chooseLocalizedText(language, {
        en: "Verify the extracted values against the original report before acting on them.",
        hi: "Kisi action se pehle extracted values ko original report se verify karein.",
        hinglish: "Kisi action se pehle extracted values ko original report se verify karein.",
      }),
      chooseLocalizedText(language, {
        en: "Do not change medicines or treatment based only on this automated fallback result.",
        hi: "Sirf is automated fallback result ke base par medicine ya treatment change na karein.",
        hinglish: "Sirf is automated fallback result ke base par medicine ya treatment change na karein.",
      }),
      chooseLocalizedText(language, {
        en: "Seek urgent care for severe symptoms such as chest pain, fainting, confusion, or trouble breathing.",
        hi: "Chest pain, fainting, confusion ya breathing trouble jaise severe symptoms hon to urgent care lein.",
        hinglish:
          "Chest pain, fainting, confusion ya breathing trouble jaise severe symptoms hon to urgent care lein.",
      }),
    ]),
    followUpQuestions: uniqueStrings([
      chooseLocalizedText(language, {
        en: "Which values in this report are outside the expected range?",
        hi: "Is report me kaun si values expected range se bahar hain?",
        hinglish: "Is report me kaun si values expected range se bahar hain?",
      }),
      chooseLocalizedText(language, {
        en: "Should any of these findings be repeated or confirmed with a clinician?",
        hi: "Kya in findings me se kisi ko repeat ya clinician se confirm karna chahiye?",
        hinglish: "Kya in findings me se kisi ko repeat ya clinician se confirm karna chahiye?",
      }),
      chooseLocalizedText(language, {
        en: "Do the listed medicines match the original prescription exactly?",
        hi: "Kya listed medicines original prescription se exactly match karti hain?",
        hinglish: "Kya listed medicines original prescription se exactly match karti hain?",
      }),
    ]),
    safetyFlags: uniqueStrings([
      testValues.some((entry) => entry.status === "high" || entry.status === "low")
        ? chooseLocalizedText(language, {
            en: "One or more values may be outside the usual range.",
            hi: "Ek ya zyada values usual range se bahar ho sakti hain.",
            hinglish: "Ek ya zyada values usual range se bahar ho sakti hain.",
          })
        : "",
      chooseLocalizedText(language, {
        en: "Fallback analysis was used because the main AI provider was unavailable.",
        hi: "Main AI provider unavailable tha isliye fallback analysis use hua.",
        hinglish: "Main AI provider unavailable tha isliye fallback analysis use hua.",
      }),
    ]),
  };
}
