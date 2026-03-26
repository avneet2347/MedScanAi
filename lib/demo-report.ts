import { generateHealthInsights } from "@/lib/insights";
import { chooseLocalizedText } from "@/lib/localization";
import type {
  ChatMessageRecord,
  MedicalAnalysis,
  OutputLanguage,
} from "@/lib/report-types";

type DemoChatMessage = Pick<ChatMessageRecord, "role" | "message">;

function buildDemoAnalysis(language: OutputLanguage): MedicalAnalysis {
  return {
    documentType: chooseLocalizedText(language, {
      en: "Metabolic and thyroid follow-up report",
      hi: "Metabolic aur thyroid follow-up report",
      hinglish: "Metabolic aur thyroid follow-up report",
    }),
    overview: chooseLocalizedText(language, {
      en: "This sample report suggests poorly controlled blood sugar, thyroid imbalance, anemia, and mild kidney stress that should be reviewed with a clinician.",
      hi: "Ye sample report blood sugar control issue, thyroid imbalance, anemia, aur mild kidney stress suggest karta hai jise clinician ke sath review karna chahiye.",
      hinglish: "Ye sample report blood sugar control issue, thyroid imbalance, anemia, aur mild kidney stress suggest karta hai jise clinician ke sath review karna chahiye.",
    }),
    plainLanguageSummary: chooseLocalizedText(language, {
      en: "A few key blood tests are outside the usual range. The sample medicines and follow-up guidance are shown so you can explore how each feature works before uploading your own document.",
      hi: "Kuch key blood tests usual range se bahar hain. Sample medicines aur follow-up guidance isliye dikhai gayi hai taki aap apna document upload karne se pehle har feature explore kar saken.",
      hinglish: "Kuch key blood tests usual range se bahar hain. Sample medicines aur follow-up guidance isliye dikhai gayi hai taki aap apna document upload karne se pehle har feature explore kar saken.",
    }),
    possibleConditions: [
      {
        name: chooseLocalizedText(language, {
          en: "Poorly controlled diabetes",
          hi: "Poorly controlled diabetes",
          hinglish: "Poorly controlled diabetes",
        }),
        confidence: "high",
        evidence: "HbA1c 8.2%, fasting glucose 168 mg/dL",
        explanation: chooseLocalizedText(language, {
          en: "Both the long-term and fasting sugar markers are elevated in this sample report.",
          hi: "Is sample report me long-term aur fasting sugar dono markers elevated hain.",
          hinglish: "Is sample report me long-term aur fasting sugar dono markers elevated hain.",
        }),
      },
      {
        name: chooseLocalizedText(language, {
          en: "Iron deficiency anemia",
          hi: "Iron deficiency anemia",
          hinglish: "Iron deficiency anemia",
        }),
        confidence: "medium",
        evidence: "Hemoglobin 9.4 g/dL",
        explanation: chooseLocalizedText(language, {
          en: "Low hemoglobin can fit with anemia and should be interpreted with symptoms and iron studies.",
          hi: "Low hemoglobin anemia ke sath fit ho sakta hai aur ise symptoms aur iron studies ke sath interpret karna chahiye.",
          hinglish: "Low hemoglobin anemia ke sath fit ho sakta hai aur ise symptoms aur iron studies ke sath interpret karna chahiye.",
        }),
      },
      {
        name: chooseLocalizedText(language, {
          en: "Hypothyroidism trend",
          hi: "Hypothyroidism trend",
          hinglish: "Hypothyroidism trend",
        }),
        confidence: "medium",
        evidence: "TSH 6.8 mIU/L",
        explanation: chooseLocalizedText(language, {
          en: "The thyroid marker is above range and can require clinician review with symptoms and repeat testing.",
          hi: "Thyroid marker range se upar hai aur symptoms aur repeat testing ke sath clinician review mang sakta hai.",
          hinglish: "Thyroid marker range se upar hai aur symptoms aur repeat testing ke sath clinician review mang sakta hai.",
        }),
      },
    ],
    medicines: [
      {
        name: "Metformin",
        dosage: "500 mg",
        frequency: "Twice daily",
        purpose: chooseLocalizedText(language, {
          en: "Used for blood sugar control.",
          hi: "Blood sugar control ke liye use hoti hai.",
          hinglish: "Blood sugar control ke liye use hoti hai.",
        }),
        notes: chooseLocalizedText(language, {
          en: "Take with meals if prescribed that way.",
          hi: "Agar aisa advise ho to meals ke sath lein.",
          hinglish: "Agar aisa advise ho to meals ke sath lein.",
        }),
      },
      {
        name: "Telmisartan",
        dosage: "40 mg",
        frequency: "Once daily",
        purpose: chooseLocalizedText(language, {
          en: "Used for blood pressure control.",
          hi: "Blood pressure control ke liye use hoti hai.",
          hinglish: "Blood pressure control ke liye use hoti hai.",
        }),
        notes: chooseLocalizedText(language, {
          en: "Monitor pressure readings if your clinician has asked for it.",
          hi: "Agar clinician ne kaha ho to pressure readings monitor karein.",
          hinglish: "Agar clinician ne kaha ho to pressure readings monitor karein.",
        }),
      },
      {
        name: "Levothyroxine",
        dosage: "50 mcg",
        frequency: "Every morning",
        purpose: chooseLocalizedText(language, {
          en: "Supports thyroid hormone replacement.",
          hi: "Thyroid hormone replacement support karta hai.",
          hinglish: "Thyroid hormone replacement support karta hai.",
        }),
        notes: chooseLocalizedText(language, {
          en: "Often taken on an empty stomach.",
          hi: "Aksar empty stomach li jati hai.",
          hinglish: "Aksar empty stomach li jati hai.",
        }),
      },
    ],
    testValues: [
      {
        name: "HbA1c",
        value: "8.2",
        unit: "%",
        referenceRange: "< 5.7%",
        status: "high",
        explanation: "",
      },
      {
        name: "Blood Glucose (Fasting)",
        value: "168",
        unit: "mg/dL",
        referenceRange: "70-99 mg/dL",
        status: "high",
        explanation: "",
      },
      {
        name: "Hemoglobin",
        value: "9.4",
        unit: "g/dL",
        referenceRange: "13-17 g/dL",
        status: "low",
        explanation: "",
      },
      {
        name: "Creatinine",
        value: "1.6",
        unit: "mg/dL",
        referenceRange: "0.6-1.2 mg/dL",
        status: "high",
        explanation: "",
      },
      {
        name: "Potassium",
        value: "5.7",
        unit: "mmol/L",
        referenceRange: "3.5-5.1 mmol/L",
        status: "high",
        explanation: "",
      },
      {
        name: "TSH",
        value: "6.8",
        unit: "mIU/L",
        referenceRange: "0.4-4.0 mIU/L",
        status: "high",
        explanation: "",
      },
    ],
    precautions: [
      chooseLocalizedText(language, {
        en: "Do not change or stop medicines without advice from your clinician.",
        hi: "Clinician ki advice ke bina medicines change ya stop na karein.",
        hinglish: "Clinician ki advice ke bina medicines change ya stop na karein.",
      }),
      chooseLocalizedText(language, {
        en: "Review the kidney, potassium, and thyroid findings together with the prescription list.",
        hi: "Kidney, potassium, aur thyroid findings ko prescription list ke sath review karein.",
        hinglish: "Kidney, potassium, aur thyroid findings ko prescription list ke sath review karein.",
      }),
      chooseLocalizedText(language, {
        en: "Seek urgent care for chest pain, severe weakness, confusion, or fainting.",
        hi: "Chest pain, severe weakness, confusion, ya fainting ho to urgent care lein.",
        hinglish: "Chest pain, severe weakness, confusion, ya fainting ho to urgent care lein.",
      }),
    ],
    followUpQuestions: [
      chooseLocalizedText(language, {
        en: "Should the blood sugar medicines or diet plan be adjusted?",
        hi: "Kya blood sugar medicines ya diet plan adjust karna chahiye?",
        hinglish: "Kya blood sugar medicines ya diet plan adjust karna chahiye?",
      }),
      chooseLocalizedText(language, {
        en: "Do the creatinine and potassium values change the blood-pressure plan?",
        hi: "Kya creatinine aur potassium values blood-pressure plan ko change karte hain?",
        hinglish: "Kya creatinine aur potassium values blood-pressure plan ko change karte hain?",
      }),
      chooseLocalizedText(language, {
        en: "When should thyroid and hemoglobin testing be repeated?",
        hi: "Thyroid aur hemoglobin testing kab repeat karni chahiye?",
        hinglish: "Thyroid aur hemoglobin testing kab repeat karni chahiye?",
      }),
    ],
    safetyFlags: [
      chooseLocalizedText(language, {
        en: "Sample report for feature exploration only",
        hi: "Sirf feature exploration ke liye sample report",
        hinglish: "Sirf feature exploration ke liye sample report",
      }),
    ],
  };
}

function buildDemoChatMessages(language: OutputLanguage): DemoChatMessage[] {
  return [
    {
      role: "user",
      message: chooseLocalizedText(language, {
        en: "What should I ask my doctor about first?",
        hi: "Mujhe sabse pehle doctor se kya puchna chahiye?",
        hinglish: "Mujhe sabse pehle doctor se kya puchna chahiye?",
      }),
    },
    {
      role: "assistant",
      message: chooseLocalizedText(language, {
        en: "Start with the high sugar markers, kidney function, and the potassium result because those findings can change how the medicines are monitored.",
        hi: "High sugar markers, kidney function, aur potassium result se shuru karein kyunki ye findings medicine monitoring ko affect kar sakti hain.",
        hinglish: "High sugar markers, kidney function, aur potassium result se shuru karein kyunki ye findings medicine monitoring ko affect kar sakti hain.",
      }),
    },
  ];
}

export function buildDemoReport(language: OutputLanguage) {
  const analysis = buildDemoAnalysis(language);
  const insights = generateHealthInsights(analysis, { language });

  return {
    reportId: `demo-report-${language}`,
    filename: chooseLocalizedText(language, {
      en: "Demo report - metabolic-thyroid-follow-up.pdf",
      hi: "Demo report - metabolic-thyroid-follow-up.pdf",
      hinglish: "Demo report - metabolic-thyroid-follow-up.pdf",
    }),
    createdAt: "2026-03-14T09:30:00.000Z",
    language,
    extractedText:
      "Patient follow-up note. HbA1c 8.2%. Fasting glucose 168 mg/dL. Hemoglobin 9.4 g/dL. Creatinine 1.6 mg/dL. Potassium 5.7 mmol/L. TSH 6.8 mIU/L. Medicines: Metformin 500 mg BD, Telmisartan 40 mg OD, Levothyroxine 50 mcg morning.",
    analysis,
    insights,
    chatMessages: buildDemoChatMessages(language),
  };
}
