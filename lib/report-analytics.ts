import { chooseLocalizedText } from "@/lib/localization";
import {
  buildInteractionChecks,
  buildLifestyleRecommendations,
  buildMedicineReminders,
  mergeMedicineSupport,
} from "@/lib/clinical-support";
import { buildMedicineDetails } from "@/lib/medicine-info";
import type {
  DoctorRecommendation,
  HealthInsights,
  InteractionCheck,
  LifestyleRecommendation,
  MedicalAnalysis,
  MedicineDetail,
  MedicineReminder,
  OutputLanguage,
  RiskLevel,
  RiskPrediction,
  TestEvaluation,
  TestStatus,
  TestValueEntry,
  TrendDataPoint,
  TrendInsight,
} from "@/lib/report-types";

const riskOrder: RiskLevel[] = ["low", "moderate", "high", "critical"];

export function extractNumericValue(value: string) {
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseBloodPressure(value: string) {
  const match = value.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);

  if (!match) {
    return null;
  }

  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
  };
}

export function parseReferenceRange(referenceRange: string) {
  const betweenMatch = referenceRange.match(
    /(-?\d+(\.\d+)?)\s*(?:to|-|–)\s*(-?\d+(\.\d+)?)/i
  );

  if (betweenMatch) {
    return {
      min: Number(betweenMatch[1]),
      max: Number(betweenMatch[3]),
    };
  }

  const lessThanMatch = referenceRange.match(/<\s*(-?\d+(\.\d+)?)/);

  if (lessThanMatch) {
    return {
      max: Number(lessThanMatch[1]),
    };
  }

  const greaterThanMatch = referenceRange.match(/>\s*(-?\d+(\.\d+)?)/);

  if (greaterThanMatch) {
    return {
      min: Number(greaterThanMatch[1]),
    };
  }

  return null;
}

function severityFromDistance(value: number, min?: number, max?: number): RiskLevel {
  if (min !== undefined && value < min) {
    const distance = (min - value) / Math.max(Math.abs(min), 1);
    return distance >= 0.35 ? "high" : "moderate";
  }

  if (max !== undefined && value > max) {
    const distance = (value - max) / Math.max(Math.abs(max), 1);
    return distance >= 0.35 ? "high" : "moderate";
  }

  return "low";
}

function riskMax(current: RiskLevel, next: RiskLevel) {
  return riskOrder.indexOf(next) > riskOrder.indexOf(current) ? next : current;
}

export function canonicalizeMetricName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (normalized.includes("hba1c") || normalized.includes("glycated hemoglobin")) {
    return "hba1c";
  }

  if (
    normalized.includes("glucose") ||
    normalized.includes("blood sugar") ||
    normalized.includes("fbs") ||
    normalized.includes("ppbs")
  ) {
    return "blood_glucose";
  }

  if (normalized.includes("blood pressure") || normalized === "bp") {
    return "blood_pressure";
  }

  if (normalized.includes("hemoglobin") || normalized === "hb") {
    return "hemoglobin";
  }

  if (normalized.includes("creatinine")) {
    return "creatinine";
  }

  if (normalized.includes("tsh") || normalized.includes("thyroid")) {
    return "tsh";
  }

  if (normalized.includes("cholesterol")) {
    return "cholesterol";
  }

  if (normalized.includes("potassium")) {
    return "potassium";
  }

  if (normalized.includes("sodium")) {
    return "sodium";
  }

  return normalized.replace(/\s+/g, "_");
}

export function evaluateTestValue(
  test: TestValueEntry,
  language: OutputLanguage = "en"
): TestEvaluation {
  const providedStatus = test.status?.toLowerCase() as TestStatus | undefined;
  const lowerName = test.name.toLowerCase();
  const numericValue = extractNumericValue(test.value);
  const parsedRange = parseReferenceRange(test.referenceRange);
  let status: TestStatus = providedStatus || "unknown";
  let severity: RiskLevel = "low";
  let explanation = test.explanation || "";
  let normalRangeSummary = chooseLocalizedText(language, {
    en: "Reference range not clearly available.",
    hi: "रेफरेंस रेंज स्पष्ट रूप से उपलब्ध नहीं है।",
    hinglish: "Reference range clearly available nahi hai.",
  });

  if (lowerName.includes("blood pressure") || lowerName === "bp") {
    const pressure = parseBloodPressure(test.value);

    if (pressure) {
      if (pressure.systolic >= 180 || pressure.diastolic >= 120) {
        status = "high";
        severity = "critical";
        explanation = chooseLocalizedText(language, {
          en: "Blood pressure is in a range that can require urgent medical review.",
          hi: "ब्लड प्रेशर ऐसी रेंज में है जिसमें तुरंत चिकित्सकीय समीक्षा की ज़रूरत हो सकती है।",
          hinglish: "Blood pressure aisi range me hai jisme urgent medical review ki zarurat ho sakti hai.",
        });
      } else if (pressure.systolic >= 140 || pressure.diastolic >= 90) {
        status = "high";
        severity = "high";
        explanation = chooseLocalizedText(language, {
          en: "Blood pressure is above the usual target range.",
          hi: "ब्लड प्रेशर सामान्य लक्ष्य सीमा से ऊपर है।",
          hinglish: "Blood pressure usual target range se upar hai.",
        });
      } else if (pressure.systolic >= 130 || pressure.diastolic >= 80) {
        status = "borderline";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "Blood pressure is mildly above the ideal target range.",
          hi: "ब्लड प्रेशर आदर्श लक्ष्य सीमा से थोड़ा ऊपर है।",
          hinglish: "Blood pressure ideal target range se thoda upar hai.",
        });
      } else {
        status = "normal";
        severity = "low";
        explanation = chooseLocalizedText(language, {
          en: "Blood pressure is within a usual resting range.",
          hi: "ब्लड प्रेशर सामान्य आराम की सीमा में है।",
          hinglish: "Blood pressure usual resting range me hai.",
        });
      }

      normalRangeSummary = chooseLocalizedText(language, {
        en: "Ideal resting blood pressure is usually below 120/80 mmHg.",
        hi: "आदर्श आराम की स्थिति का ब्लड प्रेशर आमतौर पर 120/80 mmHg से कम होता है।",
        hinglish: "Ideal resting blood pressure usually 120/80 mmHg se neeche hota hai.",
      });
    }
  } else if (numericValue !== null && parsedRange) {
    if (parsedRange.min !== undefined && numericValue < parsedRange.min) {
      status = "low";
      severity = severityFromDistance(numericValue, parsedRange.min, parsedRange.max);
      explanation = chooseLocalizedText(language, {
        en: "This value is below the stated reference range.",
        hi: "यह मान दी गई रेफरेंस रेंज से नीचे है।",
        hinglish: "Ye value stated reference range se neeche hai.",
      });
    } else if (parsedRange.max !== undefined && numericValue > parsedRange.max) {
      status = "high";
      severity = severityFromDistance(numericValue, parsedRange.min, parsedRange.max);
      explanation = chooseLocalizedText(language, {
        en: "This value is above the stated reference range.",
        hi: "यह मान दी गई रेफरेंस रेंज से ऊपर है।",
        hinglish: "Ye value stated reference range se upar hai.",
      });
    } else {
      status = "normal";
      severity = "low";
      explanation = chooseLocalizedText(language, {
        en: "This value falls inside the stated reference range.",
        hi: "यह मान दी गई रेफरेंस रेंज के अंदर है।",
        hinglish: "Ye value stated reference range ke andar hai.",
      });
    }

    normalRangeSummary = chooseLocalizedText(language, {
      en: `Expected range: ${test.referenceRange || "Not provided"}.`,
      hi: `अपेक्षित सीमा: ${test.referenceRange || "उपलब्ध नहीं"}.`,
      hinglish: `Expected range: ${test.referenceRange || "Available nahi"}.`,
    });
  } else if (numericValue !== null) {
    if (lowerName.includes("hba1c")) {
      normalRangeSummary = chooseLocalizedText(language, {
        en: "HbA1c is commonly considered elevated at 6.5% or above.",
        hi: "HbA1c आमतौर पर 6.5% या उससे ऊपर होने पर बढ़ा हुआ माना जाता है।",
        hinglish: "HbA1c ko commonly 6.5% ya usse upar elevated maana jata hai.",
      });

      if (numericValue >= 8) {
        status = "high";
        severity = "high";
        explanation = chooseLocalizedText(language, {
          en: "HbA1c is well above the typical diabetes management target.",
          hi: "HbA1c सामान्य डायबिटीज़ नियंत्रण लक्ष्य से काफी ऊपर है।",
          hinglish: "HbA1c typical diabetes target se kaafi upar hai.",
        });
      } else if (numericValue >= 6.5) {
        status = "high";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "HbA1c is above the usual diagnostic threshold for diabetes.",
          hi: "HbA1c डायबिटीज़ की सामान्य निदान सीमा से ऊपर है।",
          hinglish: "HbA1c diabetes ki usual diagnostic threshold se upar hai.",
        });
      } else if (numericValue >= 5.7) {
        status = "borderline";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "HbA1c is mildly elevated and may need monitoring.",
          hi: "HbA1c थोड़ा बढ़ा हुआ है और निगरानी की ज़रूरत हो सकती है।",
          hinglish: "HbA1c thoda elevated hai aur monitoring ki zarurat ho sakti hai.",
        });
      } else {
        status = "normal";
      }
    } else if (lowerName.includes("glucose") || lowerName.includes("sugar")) {
      normalRangeSummary = chooseLocalizedText(language, {
        en: "Fasting glucose is often considered elevated at 126 mg/dL or above.",
        hi: "फास्टिंग ग्लूकोज़ अक्सर 126 mg/dL या उससे ऊपर होने पर बढ़ा हुआ माना जाता है।",
        hinglish: "Fasting glucose ko aksar 126 mg/dL ya usse upar elevated maana jata hai.",
      });

      if (numericValue >= 400) {
        status = "high";
        severity = "critical";
        explanation = chooseLocalizedText(language, {
          en: "Blood sugar is in a critically high range and needs urgent medical review.",
          hi: "ब्लड शुगर गंभीर रूप से ऊंची सीमा में है और तुरंत चिकित्सकीय समीक्षा की ज़रूरत है।",
          hinglish: "Blood sugar critically high range me hai aur urgent medical review ki zarurat hai.",
        });
      } else if (numericValue >= 200) {
        status = "high";
        severity = "high";
        explanation = chooseLocalizedText(language, {
          en: "Blood sugar is considerably elevated.",
          hi: "ब्लड शुगर काफी बढ़ी हुई है।",
          hinglish: "Blood sugar kaafi elevated hai.",
        });
      } else if (numericValue >= 126) {
        status = "high";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "Blood sugar is above the common fasting threshold.",
          hi: "ब्लड शुगर सामान्य फास्टिंग सीमा से ऊपर है।",
          hinglish: "Blood sugar common fasting threshold se upar hai.",
        });
      } else if (numericValue >= 100) {
        status = "borderline";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "Blood sugar is mildly elevated.",
          hi: "ब्लड शुगर थोड़ा बढ़ा हुआ है।",
          hinglish: "Blood sugar thoda elevated hai.",
        });
      } else {
        status = "normal";
      }
    } else if (lowerName.includes("creatinine")) {
      normalRangeSummary = chooseLocalizedText(language, {
        en: "Creatinine above the usual lab range can suggest kidney stress.",
        hi: "सामान्य लैब सीमा से ऊपर creatinine किडनी पर दबाव का संकेत दे सकता है।",
        hinglish: "Usual lab range se upar creatinine kidney stress dikha sakta hai.",
      });

      if (numericValue >= 2) {
        status = "high";
        severity = "high";
        explanation = chooseLocalizedText(language, {
          en: "Creatinine is significantly elevated.",
          hi: "Creatinine काफी बढ़ा हुआ है।",
          hinglish: "Creatinine significantly elevated hai.",
        });
      } else if (numericValue > 1.2) {
        status = "high";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "Creatinine is above a common adult reference range.",
          hi: "Creatinine सामान्य वयस्क रेफरेंस रेंज से ऊपर है।",
          hinglish: "Creatinine common adult reference range se upar hai.",
        });
      } else {
        status = "normal";
      }
    } else if (lowerName.includes("hemoglobin") || lowerName === "hb") {
      normalRangeSummary = chooseLocalizedText(language, {
        en: "Low hemoglobin can indicate anemia and should be interpreted in clinical context.",
        hi: "कम hemoglobin एनीमिया का संकेत हो सकता है और इसे चिकित्सकीय संदर्भ में समझना चाहिए।",
        hinglish: "Low hemoglobin anemia ka signal ho sakta hai aur clinical context me interpret karna chahiye.",
      });

      if (numericValue < 6) {
        status = "low";
        severity = "critical";
        explanation = chooseLocalizedText(language, {
          en: "Hemoglobin is in a critically low range and may need urgent medical attention.",
          hi: "Hemoglobin गंभीर रूप से कम सीमा में है और तुरंत चिकित्सकीय ध्यान की ज़रूरत हो सकती है।",
          hinglish: "Hemoglobin critically low range me hai aur urgent medical attention ki zarurat ho sakti hai.",
        });
      } else if (numericValue < 8) {
        status = "low";
        severity = "high";
        explanation = chooseLocalizedText(language, {
          en: "Hemoglobin is very low and may require prompt medical attention.",
          hi: "Hemoglobin बहुत कम है और तुरंत चिकित्सकीय ध्यान की ज़रूरत हो सकती है।",
          hinglish: "Hemoglobin bahut low hai aur prompt medical attention ki zarurat ho sakti hai.",
        });
      } else if (numericValue < 11) {
        status = "low";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "Hemoglobin is below a common adult reference range.",
          hi: "Hemoglobin सामान्य वयस्क रेफरेंस रेंज से नीचे है।",
          hinglish: "Hemoglobin common adult reference range se neeche hai.",
        });
      } else {
        status = "normal";
      }
    } else if (lowerName.includes("tsh")) {
      normalRangeSummary = chooseLocalizedText(language, {
        en: "TSH outside the usual range can suggest thyroid imbalance.",
        hi: "TSH सामान्य सीमा से बाहर हो तो थायरॉयड असंतुलन का संकेत हो सकता है।",
        hinglish: "TSH usual range se bahar ho to thyroid imbalance ka signal ho sakta hai.",
      });

      if (numericValue > 10) {
        status = "high";
        severity = "high";
        explanation = chooseLocalizedText(language, {
          en: "TSH is markedly elevated.",
          hi: "TSH काफी बढ़ा हुआ है।",
          hinglish: "TSH markedly elevated hai.",
        });
      } else if (numericValue > 4.5) {
        status = "high";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "TSH is above the usual range.",
          hi: "TSH सामान्य सीमा से ऊपर है।",
          hinglish: "TSH usual range se upar hai.",
        });
      } else if (numericValue < 0.4) {
        status = "low";
        severity = "moderate";
        explanation = chooseLocalizedText(language, {
          en: "TSH is below the usual range.",
          hi: "TSH सामान्य सीमा से नीचे है।",
          hinglish: "TSH usual range se neeche hai.",
        });
      } else {
        status = "normal";
      }
    } else if (lowerName.includes("potassium")) {
      normalRangeSummary = chooseLocalizedText(language, {
        en: "Significant potassium abnormalities can require urgent review.",
        hi: "पोटैशियम में बड़ा बदलाव तुरंत चिकित्सकीय समीक्षा की मांग कर सकता है।",
        hinglish: "Potassium me significant abnormality urgent review maang sakti hai.",
      });

      if (numericValue >= 6 || numericValue <= 2.8) {
        status = numericValue >= 6 ? "high" : "low";
        severity = "critical";
        explanation = chooseLocalizedText(language, {
          en: "Potassium is in a potentially dangerous range.",
          hi: "पोटैशियम संभावित रूप से खतरनाक सीमा में है।",
          hinglish: "Potassium potentially dangerous range me hai.",
        });
      }
    }
  }

  if (numericValue !== null) {
    if ((lowerName.includes("glucose") || lowerName.includes("sugar")) && numericValue >= 400) {
      status = "high";
      severity = "critical";
      explanation = chooseLocalizedText(language, {
        en: "Blood sugar is in a critically high range and needs urgent medical review.",
        hi: "ब्लड शुगर गंभीर रूप से ऊंची सीमा में है और तुरंत चिकित्सकीय समीक्षा की ज़रूरत है।",
        hinglish: "Blood sugar critically high range me hai aur urgent medical review ki zarurat hai.",
      });
    } else if ((lowerName.includes("hemoglobin") || lowerName === "hb") && numericValue < 6) {
      status = "low";
      severity = "critical";
      explanation = chooseLocalizedText(language, {
        en: "Hemoglobin is in a critically low range and may need urgent medical attention.",
        hi: "Hemoglobin गंभीर रूप से कम सीमा में है और तुरंत चिकित्सकीय ध्यान की ज़रूरत हो सकती है।",
        hinglish: "Hemoglobin critically low range me hai aur urgent medical attention ki zarurat ho sakti hai.",
      });
    } else if (lowerName.includes("potassium") && (numericValue >= 6 || numericValue <= 2.8)) {
      status = numericValue >= 6 ? "high" : "low";
      severity = "critical";
      explanation = chooseLocalizedText(language, {
        en: "Potassium is in a potentially dangerous range.",
        hi: "पोटैशियम संभावित रूप से खतरनाक सीमा में है।",
        hinglish: "Potassium potentially dangerous range me hai.",
      });
    }
  }

  if ((status === "unknown" || !explanation) && providedStatus) {
    status = providedStatus;
    severity =
      providedStatus === "high" || providedStatus === "low"
        ? "moderate"
        : providedStatus === "abnormal" || providedStatus === "borderline"
          ? "moderate"
          : "low";
    explanation =
      test.explanation ||
      chooseLocalizedText(language, {
        en: "This result may need follow-up with a clinician.",
        hi: "इस परिणाम पर डॉक्टर के साथ आगे चर्चा की ज़रूरत हो सकती है।",
        hinglish: "Is result par clinician ke sath follow-up ki zarurat ho sakti hai.",
      });
  }

  return {
    name: test.name,
    metricKey: canonicalizeMetricName(test.name),
    value: test.value,
    numericValue,
    unit: test.unit,
    referenceRange: test.referenceRange,
    status,
    severity,
    isAbnormal: !["normal", "unknown"].includes(status),
    explanation:
      explanation ||
      chooseLocalizedText(language, {
        en: "No rule-based interpretation was available for this value.",
        hi: "इस मान के लिए नियम-आधारित व्याख्या उपलब्ध नहीं थी।",
        hinglish: "Is value ke liye rule-based interpretation available nahi thi.",
      }),
    normalRangeSummary,
  };
}

function addPrediction(predictions: RiskPrediction[], next: RiskPrediction) {
  const existing = predictions.find((item) => item.condition === next.condition);

  if (!existing) {
    predictions.push(next);
    return;
  }

  existing.probability = Math.max(existing.probability, next.probability);
  existing.severity = riskMax(existing.severity, next.severity);
  existing.rationale = [...new Set([...existing.rationale, ...next.rationale])];
  existing.preventiveSteps = [
    ...new Set([...existing.preventiveSteps, ...next.preventiveSteps]),
  ];
}

export function buildRiskPredictions(
  analysis: MedicalAnalysis,
  evaluations: TestEvaluation[],
  language: OutputLanguage
) {
  const predictions: RiskPrediction[] = [];

  const byMetric = (metricKey: string) =>
    evaluations.filter((evaluation) => evaluation.metricKey === metricKey);

  const glucoseTests = [...byMetric("hba1c"), ...byMetric("blood_glucose")];
  const highGlucose = glucoseTests.filter((item) =>
    ["high", "borderline"].includes(item.status)
  );

  if (highGlucose.length > 0) {
    const highest = highGlucose.reduce((max, item) =>
      riskOrder.indexOf(item.severity) > riskOrder.indexOf(max.severity) ? item : max
    );

    addPrediction(predictions, {
      condition: chooseLocalizedText(language, {
        en: "Diabetes / blood sugar risk",
        hi: "डायबिटीज़ / ब्लड शुगर जोखिम",
        hinglish: "Diabetes / blood sugar risk",
      }),
      probability:
        highest.severity === "critical"
          ? 92
          : highest.metricKey === "hba1c"
            ? 84
            : 76,
      severity: highest.severity,
      rationale: highGlucose.map(
        (item) => `${item.name}: ${item.value} ${item.unit}`.trim()
      ),
      preventiveSteps: [
        chooseLocalizedText(language, {
          en: "Review blood sugar trends with a clinician.",
          hi: "ब्लड शुगर ट्रेंड्स को डॉक्टर के साथ रिव्यू करें।",
          hinglish: "Blood sugar trends ko clinician ke sath review karein.",
        }),
        chooseLocalizedText(language, {
          en: "Discuss diet, exercise, and repeat testing if advised.",
          hi: "जरूरत हो तो आहार, व्यायाम और दोबारा जांच पर चर्चा करें।",
          hinglish: "Diet, exercise aur repeat testing par discuss karein agar advise ho.",
        }),
      ],
      suggestedSpecialist: chooseLocalizedText(language, {
        en: "Endocrinologist / Diabetologist",
        hi: "एंडोक्राइनोलॉजिस्ट / डायबेटोलॉजिस्ट",
        hinglish: "Endocrinologist / Diabetologist",
      }),
    });
  }

  const bpTests = byMetric("blood_pressure").filter((item) => item.isAbnormal);
  if (bpTests.length > 0) {
    addPrediction(predictions, {
      condition: chooseLocalizedText(language, {
        en: "Hypertension risk",
        hi: "हाइपरटेंशन जोखिम",
        hinglish: "Hypertension risk",
      }),
      probability: bpTests.some((item) => item.severity === "critical") ? 90 : 78,
      severity: bpTests.some((item) => item.severity === "critical") ? "critical" : "high",
      rationale: bpTests.map((item) => `${item.name}: ${item.value}`),
      preventiveSteps: [
        chooseLocalizedText(language, {
          en: "Repeat blood pressure with a validated device.",
          hi: "वैलिडेटेड मशीन से ब्लड प्रेशर दोबारा जांचें।",
          hinglish: "Validated device se blood pressure repeat check karein.",
        }),
        chooseLocalizedText(language, {
          en: "Seek urgent care if severe symptoms are present.",
          hi: "गंभीर लक्षण हों तो तुरंत इलाज लें।",
          hinglish: "Severe symptoms hon to urgent care lein.",
        }),
      ],
      suggestedSpecialist: chooseLocalizedText(language, {
        en: "Internal Medicine / Cardiologist",
        hi: "इंटरनल मेडिसिन / कार्डियोलॉजिस्ट",
        hinglish: "Internal Medicine / Cardiologist",
      }),
    });
  }

  const hbTests = byMetric("hemoglobin").filter((item) => item.isAbnormal);
  if (hbTests.length > 0) {
    addPrediction(predictions, {
      condition: chooseLocalizedText(language, {
        en: "Anemia risk",
        hi: "एनीमिया जोखिम",
        hinglish: "Anemia risk",
      }),
      probability: hbTests.some((item) => item.severity === "critical")
        ? 90
        : hbTests.some((item) => item.severity === "high")
          ? 82
          : 68,
      severity: hbTests.some((item) => item.severity === "critical")
        ? "critical"
        : hbTests.some((item) => item.severity === "high")
          ? "high"
          : "moderate",
      rationale: hbTests.map((item) => `${item.name}: ${item.value} ${item.unit}`.trim()),
      preventiveSteps: [
        chooseLocalizedText(language, {
          en: "Review iron studies, B12, or repeat CBC if clinically advised.",
          hi: "जरूरत हो तो आयरन स्टडी, B12 या दोबारा CBC पर चर्चा करें।",
          hinglish: "Iron studies, B12 ya repeat CBC par discuss karein agar clinically advise ho.",
        }),
      ],
      suggestedSpecialist: chooseLocalizedText(language, {
        en: "General Physician / Hematology review",
        hi: "जनरल फिजिशियन / हेमेटोलॉजी समीक्षा",
        hinglish: "General Physician / Hematology review",
      }),
    });
  }

  const thyroidTests = byMetric("tsh").filter((item) => item.isAbnormal);
  if (thyroidTests.length > 0) {
    addPrediction(predictions, {
      condition: chooseLocalizedText(language, {
        en: "Thyroid imbalance risk",
        hi: "थायरॉयड असंतुलन जोखिम",
        hinglish: "Thyroid imbalance risk",
      }),
      probability: thyroidTests.some((item) => item.severity === "high") ? 80 : 66,
      severity: thyroidTests.some((item) => item.severity === "high") ? "high" : "moderate",
      rationale: thyroidTests.map((item) => `${item.name}: ${item.value} ${item.unit}`.trim()),
      preventiveSteps: [
        chooseLocalizedText(language, {
          en: "Discuss repeat thyroid function testing and symptoms with a clinician.",
          hi: "डॉक्टर से दोबारा थायरॉयड जांच और लक्षणों पर चर्चा करें।",
          hinglish: "Repeat thyroid testing aur symptoms par clinician se discuss karein.",
        }),
      ],
      suggestedSpecialist: chooseLocalizedText(language, {
        en: "Endocrinologist",
        hi: "एंडोक्राइनोलॉजिस्ट",
        hinglish: "Endocrinologist",
      }),
    });
  }

  const kidneyTests = evaluations.filter(
    (item) =>
      (item.metricKey === "creatinine" || item.name.toLowerCase().includes("urea")) &&
      item.isAbnormal
  );
  if (kidneyTests.length > 0) {
    addPrediction(predictions, {
      condition: chooseLocalizedText(language, {
        en: "Kidney strain risk",
        hi: "किडनी स्ट्रेन जोखिम",
        hinglish: "Kidney strain risk",
      }),
      probability: kidneyTests.some((item) => item.severity === "high") ? 83 : 70,
      severity: kidneyTests.some((item) => item.severity === "high") ? "high" : "moderate",
      rationale: kidneyTests.map((item) => `${item.name}: ${item.value} ${item.unit}`.trim()),
      preventiveSteps: [
        chooseLocalizedText(language, {
          en: "Review hydration, medicines, and kidney function with a clinician.",
          hi: "डॉक्टर के साथ hydration, medicines और kidney function की समीक्षा करें।",
          hinglish: "Hydration, medicines aur kidney function ko clinician ke sath review karein.",
        }),
      ],
      suggestedSpecialist: chooseLocalizedText(language, {
        en: "Nephrologist / Internal Medicine",
        hi: "नेफ्रोलॉजिस्ट / इंटरनल मेडिसिन",
        hinglish: "Nephrologist / Internal Medicine",
      }),
    });
  }

  if (predictions.length === 0 && analysis.possibleConditions.length > 0) {
    for (const condition of analysis.possibleConditions.slice(0, 3)) {
      predictions.push({
        condition: condition.name,
        probability:
          condition.confidence === "high"
            ? 72
            : condition.confidence === "medium"
              ? 58
              : 40,
        severity: condition.confidence === "high" ? "moderate" : "low",
        rationale: [condition.evidence || condition.explanation],
        preventiveSteps: [
          chooseLocalizedText(language, {
            en: "Confirm these AI suggestions with a qualified clinician.",
            hi: "इन AI सुझावों की पुष्टि योग्य डॉक्टर से करें।",
            hinglish: "In AI suggestions ko qualified clinician se confirm karein.",
          }),
        ],
        suggestedSpecialist: chooseLocalizedText(language, {
          en: "General physician",
          hi: "जनरल फिजिशियन",
          hinglish: "General physician",
        }),
      });
    }
  }

  return predictions
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 5);
}

export function buildDoctorRecommendations(
  riskPredictions: RiskPrediction[],
  language: OutputLanguage
) {
  const recommendations: DoctorRecommendation[] = [];

  for (const prediction of riskPredictions) {
    const existing = recommendations.find(
      (recommendation) => recommendation.specialist === prediction.suggestedSpecialist
    );

    if (existing) {
      existing.priority = riskMax(existing.priority, prediction.severity);
      existing.reason = `${existing.reason}; ${prediction.condition}`;
      continue;
    }

    recommendations.push({
      specialist: prediction.suggestedSpecialist,
      priority: prediction.severity,
      reason: chooseLocalizedText(language, {
        en: `Consider this specialty because of ${prediction.condition}.`,
        hi: `${prediction.condition} के कारण इस विशेषज्ञता पर विचार करें।`,
        hinglish: `${prediction.condition} ki wajah se is specialty ko consider karein.`,
      }),
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      specialist: chooseLocalizedText(language, {
        en: "General physician",
        hi: "जनरल फिजिशियन",
        hinglish: "General physician",
      }),
      priority: "low",
      reason: chooseLocalizedText(language, {
        en: "Start with a general physician if you need report review.",
        hi: "अगर रिपोर्ट रिव्यू चाहिए तो शुरुआत जनरल फिजिशियन से करें।",
        hinglish: "Report review chahiye to start general physician se karein.",
      }),
    });
  }

  return recommendations;
}

export function buildEmergencyAssessment(
  evaluations: TestEvaluation[],
  language: OutputLanguage
) {
  const criticalTests = evaluations.filter((item) => item.severity === "critical");
  const highTests = evaluations.filter((item) => item.severity === "high");

  if (criticalTests.length > 0) {
    return {
      requiresUrgentCare: true,
      severity: "critical" as const,
      headline: chooseLocalizedText(language, {
        en: "Critical values detected",
        hi: "गंभीर मान पाए गए",
        hinglish: "Critical values detect hue",
      }),
      action: chooseLocalizedText(language, {
        en: "Consult urgent medical care immediately, especially if symptoms are present.",
        hi: "खासकर लक्षण हों तो तुरंत आपातकालीन चिकित्सा सलाह लें।",
        hinglish: "Symptoms hon to turant urgent medical care lein.",
      }),
      criticalTests: criticalTests.map((item) => item.name),
    };
  }

  if (highTests.length >= 2) {
    return {
      requiresUrgentCare: false,
      severity: "high" as const,
      headline: chooseLocalizedText(language, {
        en: "Multiple high-risk abnormalities detected",
        hi: "कई उच्च-जोखिम असामान्यताएं मिलीं",
        hinglish: "Multiple high-risk abnormalities detect hui",
      }),
      action: chooseLocalizedText(language, {
        en: "Arrange clinician follow-up soon and review the flagged values promptly.",
        hi: "जल्द डॉक्टर से फॉलो-अप करें और फ्लैग किए गए मानों की समीक्षा कराएं।",
        hinglish: "Jaldi clinician follow-up karein aur flagged values ka review karayein.",
      }),
      criticalTests: highTests.map((item) => item.name),
    };
  }

  return {
    requiresUrgentCare: false,
    severity: "low" as const,
    headline: chooseLocalizedText(language, {
      en: "No immediate emergency signal detected",
      hi: "तुरंत आपातकाल का स्पष्ट संकेत नहीं मिला",
      hinglish: "Immediate emergency signal detect nahi hua",
    }),
    action: chooseLocalizedText(language, {
      en: "Continue with routine follow-up unless symptoms worsen.",
      hi: "लक्षण बढ़ें तो छोड़कर सामान्य फॉलो-अप जारी रखें।",
      hinglish: "Symptoms worsen na hon to routine follow-up continue rakhein.",
    }),
    criticalTests: [],
  };
}

export function enrichReportIntelligence(
  analysis: MedicalAnalysis,
  language: OutputLanguage
): {
  evaluations: TestEvaluation[];
  riskPredictions: RiskPrediction[];
  medicineDetails: MedicineDetail[];
  interactionChecks: InteractionCheck[];
  lifestyleRecommendations: LifestyleRecommendation[];
  medicineReminders: MedicineReminder[];
  doctorRecommendations: DoctorRecommendation[];
} {
  const medicines = analysis.medicines || [];
  const evaluations = (analysis.testValues || []).map((test) =>
    evaluateTestValue(test, language)
  );
  const riskPredictions = buildRiskPredictions(analysis, evaluations, language);
  const interactionChecks = buildInteractionChecks(medicines, evaluations, language);
  const medicineReminders = buildMedicineReminders(medicines, language);
  const lifestyleRecommendations = buildLifestyleRecommendations(
    analysis,
    evaluations,
    riskPredictions,
    language
  );
  const medicineDetails = mergeMedicineSupport(
    buildMedicineDetails(medicines, language),
    interactionChecks,
    medicineReminders
  );

  return {
    evaluations,
    riskPredictions,
    medicineDetails,
    interactionChecks,
    lifestyleRecommendations,
    medicineReminders,
    doctorRecommendations: buildDoctorRecommendations(riskPredictions, language),
  };
}

export function buildTrendDataPoints(
  reports: Array<{
    id: string;
    title?: string | null;
    createdAt: string;
    analysis: MedicalAnalysis | null | undefined;
  }>
): TrendDataPoint[] {
  const points: TrendDataPoint[] = [];

  for (const report of reports) {
    for (const test of report.analysis?.testValues || []) {
      const evaluation = evaluateTestValue(test);

      if (evaluation.numericValue === null) {
        continue;
      }

      points.push({
        reportId: report.id,
        reportLabel: report.title || report.id,
        createdAt: report.createdAt,
        metricKey: evaluation.metricKey,
        testName: test.name,
        value: evaluation.numericValue,
        unit: test.unit,
        status: evaluation.status,
      });
    }
  }

  return points.sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

export function buildTrendInsights(
  reports: Array<{
    id: string;
    title?: string | null;
    createdAt: string;
    analysis: MedicalAnalysis | null | undefined;
  }>,
  language: OutputLanguage
) {
  const grouped = new Map<string, TrendDataPoint[]>();

  for (const point of buildTrendDataPoints(reports)) {
    const list = grouped.get(point.metricKey) || [];
    list.push(point);
    grouped.set(point.metricKey, list);
  }

  const trends: TrendInsight[] = [];

  for (const [metricKey, points] of grouped.entries()) {
    if (points.length < 2) {
      continue;
    }

    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    const delta = Number((latest.value - previous.value).toFixed(2));
    const deltaPercent =
      previous.value !== 0
        ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(1))
        : null;
    const direction =
      Math.abs(delta) < Math.max(Math.abs(previous.value) * 0.05, 0.2)
        ? "stable"
        : delta > 0
          ? "up"
          : "down";

    trends.push({
      metricKey,
      testName: latest.testName,
      unit: latest.unit,
      latestValue: latest.value,
      previousValue: previous.value,
      direction,
      delta,
      deltaPercent,
      summary: chooseLocalizedText(language, {
        en: `${latest.testName} moved from ${previous.value}${previous.unit ? ` ${previous.unit}` : ""} to ${latest.value}${latest.unit ? ` ${latest.unit}` : ""}.`,
        hi: `${latest.testName} ${previous.value}${previous.unit ? ` ${previous.unit}` : ""} से बदलकर ${latest.value}${latest.unit ? ` ${latest.unit}` : ""} हो गया।`,
        hinglish: `${latest.testName} ${previous.value}${previous.unit ? ` ${previous.unit}` : ""} se ${latest.value}${latest.unit ? ` ${latest.unit}` : ""} ho gaya.`,
      }),
      status: latest.status,
    });
  }

  return trends
    .sort((left, right) => {
      const leftWeight = left.direction === "stable" ? 0 : 1;
      const rightWeight = right.direction === "stable" ? 0 : 1;
      return rightWeight - leftWeight;
    })
    .slice(0, 8);
}

export function buildHistoricalContext(
  reports: Array<{
    title?: string | null;
    createdAt?: string;
    analysis?: MedicalAnalysis | null;
    insights?: HealthInsights | null;
  }>,
  language: OutputLanguage
) {
  if (reports.length === 0) {
    return chooseLocalizedText(language, {
      en: "No previous report history available.",
      hi: "पहले की रिपोर्ट हिस्ट्री उपलब्ध नहीं है।",
      hinglish: "Previous report history available nahi hai.",
    });
  }

  return reports
    .slice(-5)
    .map((report) => {
      const dateLabel = report.createdAt
        ? new Date(report.createdAt).toLocaleDateString("en-IN")
        : "Unknown date";
      const overview =
        report.analysis?.overview ||
        report.analysis?.plainLanguageSummary ||
        report.insights?.summary ||
        "";
      const risk = report.insights?.overallRisk || "unknown";

      return `- ${report.title || "Report"} (${dateLabel}) | risk=${risk} | ${overview}`;
    })
    .join("\n");
}

export function buildFallbackChatReply(payload: {
  question: string;
  currentAnalysis: MedicalAnalysis | null | undefined;
  currentInsights: HealthInsights | null | undefined;
  history: Array<{
    title?: string | null;
    createdAt?: string;
    analysis?: MedicalAnalysis | null;
  }>;
  language: OutputLanguage;
}) {
  const normalizedQuestion = payload.question.toLowerCase();
  const evaluations =
    payload.currentInsights?.testEvaluations ||
    (payload.currentAnalysis?.testValues || []).map((test) =>
      evaluateTestValue(test, payload.language)
    );
  const abnormal = evaluations.filter((item) => item.isAbnormal);
  const trends = buildTrendInsights(
    payload.history
      .map((report, index) => ({
        id: `history-${index}`,
        title: report.title,
        createdAt: report.createdAt || new Date().toISOString(),
        analysis: report.analysis,
      }))
      .concat(
        payload.currentAnalysis
          ? [
              {
                id: "current",
                title: "Current report",
                createdAt: new Date().toISOString(),
                analysis: payload.currentAnalysis,
              },
            ]
          : []
      ),
    payload.language
  );

  if (normalizedQuestion.includes("trend") || normalizedQuestion.includes("compare")) {
    if (trends.length === 0) {
      return chooseLocalizedText(payload.language, {
        en: "I do not have enough previous numeric reports to compare trends yet.",
        hi: "मेरे पास अभी ट्रेंड तुलना के लिए पर्याप्त पुरानी संख्यात्मक रिपोर्ट नहीं हैं।",
        hinglish: "Mere paas abhi trend compare karne ke liye enough previous numeric reports nahi hain.",
      });
    }

    return trends.map((trend) => trend.summary).join(" ");
  }

  if (
    normalizedQuestion.includes("abnormal") ||
    normalizedQuestion.includes("risk") ||
    normalizedQuestion.includes("danger")
  ) {
    if (abnormal.length === 0) {
      return chooseLocalizedText(payload.language, {
        en: "I did not detect clear abnormal values in the structured data, but you should still review the original report with a clinician if you have symptoms.",
        hi: "संरचित डेटा में मुझे स्पष्ट असामान्य मान नहीं मिले, लेकिन लक्षण हों तो मूल रिपोर्ट डॉक्टर को दिखाएं।",
        hinglish: "Structured data me clear abnormal values detect nahi hue, lekin symptoms hon to original report clinician ko dikhayein.",
      });
    }

    return abnormal
      .slice(0, 4)
      .map((item) => `${item.name}: ${item.explanation}`)
      .join(" ");
  }

  if (normalizedQuestion.includes("medicine")) {
    const medicineDetails = buildMedicineDetails(
      payload.currentAnalysis?.medicines || [],
      payload.language
    );

    if (medicineDetails.length === 0) {
      return chooseLocalizedText(payload.language, {
        en: "No medicines were clearly extracted from the current report.",
        hi: "मौजूदा रिपोर्ट से कोई दवा स्पष्ट रूप से नहीं निकली।",
        hinglish: "Current report se koi medicine clearly extract nahi hui.",
      });
    }

    return medicineDetails
      .slice(0, 2)
      .map((item) => `${item.name}: ${item.summary}`)
      .join(" ");
  }

  return (
    payload.currentAnalysis?.plainLanguageSummary ||
    payload.currentInsights?.summary ||
    chooseLocalizedText(payload.language, {
      en: "I can answer questions about the report summary, medicines, abnormal values, and trends.",
      hi: "मैं रिपोर्ट सारांश, दवाओं, असामान्य मानों और ट्रेंड्स पर सवालों के जवाब दे सकता हूँ।",
      hinglish: "Main report summary, medicines, abnormal values aur trends par sawalon ka jawab de sakta hoon.",
    })
  );
}

export function buildFeatureAwareFallbackChatReply(payload: {
  question: string;
  currentAnalysis: MedicalAnalysis | null | undefined;
  currentInsights: HealthInsights | null | undefined;
  history: Array<{
    title?: string | null;
    createdAt?: string;
    analysis?: MedicalAnalysis | null;
  }>;
  language: OutputLanguage;
}) {
  const normalizedQuestion = payload.question.toLowerCase();
  const fallbackEnrichment = payload.currentAnalysis
    ? enrichReportIntelligence(payload.currentAnalysis, payload.language)
    : null;
  const interactionChecks =
    payload.currentInsights?.interactionChecks ||
    fallbackEnrichment?.interactionChecks ||
    [];
  const lifestyleRecommendations =
    payload.currentInsights?.lifestyleRecommendations ||
    fallbackEnrichment?.lifestyleRecommendations ||
    [];
  const medicineReminders =
    payload.currentInsights?.medicineReminders ||
    fallbackEnrichment?.medicineReminders ||
    [];

  if (
    normalizedQuestion.includes("interaction") ||
    normalizedQuestion.includes("combine") ||
    normalizedQuestion.includes("together") ||
    normalizedQuestion.includes("saath")
  ) {
    if (interactionChecks.length === 0) {
      return chooseLocalizedText(payload.language, {
        en: "I could not identify enough medicine context to run an interaction check from the current report.",
        hi: "मौजूदा रिपोर्ट से इंटरैक्शन चेक के लिए पर्याप्त दवा संदर्भ नहीं मिला।",
        hinglish: "Current report se interaction check ke liye enough medicine context nahi mila.",
      });
    }

    return interactionChecks
      .slice(0, 3)
      .map((item) => `${item.title}: ${item.recommendation}`)
      .join(" ");
  }

  if (
    normalizedQuestion.includes("diet") ||
    normalizedQuestion.includes("food") ||
    normalizedQuestion.includes("lifestyle") ||
    normalizedQuestion.includes("exercise") ||
    normalizedQuestion.includes("aahar") ||
    normalizedQuestion.includes("khana")
  ) {
    if (lifestyleRecommendations.length === 0) {
      return chooseLocalizedText(payload.language, {
        en: "I do not have enough structured findings to suggest a focused lifestyle plan from this report alone.",
        hi: "केवल इस रिपोर्ट से केंद्रित लाइफस्टाइल प्लान सुझाने के लिए मेरे पास पर्याप्त संरचित जानकारी नहीं है।",
        hinglish: "Sirf is report se focused lifestyle plan suggest karne ke liye mere paas enough structured info nahi hai.",
      });
    }

    return lifestyleRecommendations
      .slice(0, 3)
      .map((item) => `${item.title}: ${item.details}`)
      .join(" ");
  }

  if (
    normalizedQuestion.includes("reminder") ||
    normalizedQuestion.includes("schedule") ||
    normalizedQuestion.includes("timing") ||
    normalizedQuestion.includes("dose") ||
    normalizedQuestion.includes("kab")
  ) {
    if (medicineReminders.length === 0) {
      return chooseLocalizedText(payload.language, {
        en: "No medicine schedule could be inferred because the report did not clearly include medicines or dosing frequency.",
        hi: "कोई दवा शेड्यूल नहीं निकाला जा सका क्योंकि रिपोर्ट में दवाएं या डोज़ फ्रीक्वेंसी स्पष्ट नहीं थी।",
        hinglish: "Medicine schedule infer nahi ho saka kyunki report me medicines ya dosing frequency clear nahi thi.",
      });
    }

    return medicineReminders
      .slice(0, 3)
      .map((item) => `${item.medicineName}: ${item.schedule}. ${item.instructions}`)
      .join(" ");
  }

  return buildFallbackChatReply(payload);
}
