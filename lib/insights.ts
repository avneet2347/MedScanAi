import { chooseLocalizedText } from "@/lib/localization";
import {
  buildEmergencyAssessment,
  enrichReportIntelligence,
  evaluateTestValue,
} from "@/lib/report-analytics";
import type {
  AbnormalFinding,
  AuthenticityProof,
  HealthAlert,
  HealthInsights,
  MedicalAnalysis,
  OutputLanguage,
  RiskLevel,
} from "@/lib/report-types";

const riskOrder: RiskLevel[] = ["low", "moderate", "high", "critical"];

function maxRisk(current: RiskLevel, next: RiskLevel) {
  return riskOrder.indexOf(next) > riskOrder.indexOf(current) ? next : current;
}

function buildAlert(
  finding: AbnormalFinding,
  language: OutputLanguage
): HealthAlert {
  const lowerName = finding.name.toLowerCase();

  if (lowerName.includes("glucose") || lowerName.includes("sugar") || lowerName.includes("hba1c")) {
    return {
      title: chooseLocalizedText(language, {
        en: "Elevated blood sugar marker",
        hi: "ब्लड शुगर मार्कर बढ़ा हुआ",
        hinglish: "Elevated blood sugar marker",
      }),
      severity: finding.severity,
      reason: finding.explanation,
      recommendation: chooseLocalizedText(language, {
        en: "Discuss this result with a clinician, especially if you have thirst, frequent urination, weakness, or prior diabetes history.",
        hi: "अगर प्यास, बार-बार पेशाब, कमजोरी या पहले से डायबिटीज़ का इतिहास हो तो डॉक्टर से ज़रूर चर्चा करें।",
        hinglish: "Agar thirst, frequent urination, weakness ya prior diabetes history ho to clinician se discuss karein.",
      }),
    };
  }

  if (lowerName.includes("blood pressure") || lowerName === "bp") {
    return {
      title: chooseLocalizedText(language, {
        en: "Blood pressure requires follow-up",
        hi: "ब्लड प्रेशर फॉलो-अप मांगता है",
        hinglish: "Blood pressure follow-up maangta hai",
      }),
      severity: finding.severity,
      reason: finding.explanation,
      recommendation: chooseLocalizedText(language, {
        en: "Recheck blood pressure with a validated device and seek urgent care if severe headache, chest pain, or shortness of breath is present.",
        hi: "वैलिडेटेड मशीन से ब्लड प्रेशर दोबारा जांचें और गंभीर सिरदर्द, सीने में दर्द या सांस फूलने पर तुरंत इलाज लें।",
        hinglish: "Validated device se BP recheck karein aur severe headache, chest pain ya breathlessness ho to urgent care lein.",
      }),
    };
  }

  if (lowerName.includes("hemoglobin")) {
    return {
      title: chooseLocalizedText(language, {
        en: "Possible anemia risk",
        hi: "संभावित एनीमिया जोखिम",
        hinglish: "Possible anemia risk",
      }),
      severity: finding.severity,
      reason: finding.explanation,
      recommendation: chooseLocalizedText(language, {
        en: "Review this result with a clinician, especially if there is fatigue, dizziness, shortness of breath, or active bleeding.",
        hi: "थकान, चक्कर, सांस फूलना या खून बहना हो तो इस परिणाम की डॉक्टर से समीक्षा कराएं।",
        hinglish: "Fatigue, dizziness, breathlessness ya bleeding ho to is result ko clinician ke sath review karein.",
      }),
    };
  }

  return {
    title: `${finding.name} ${chooseLocalizedText(language, {
      en: "is outside the expected range",
      hi: "अपेक्षित सीमा से बाहर है",
      hinglish: "expected range se bahar hai",
    })}`,
    severity: finding.severity,
    reason: finding.explanation,
    recommendation: chooseLocalizedText(language, {
      en: "Use this as a discussion point with your clinician rather than making medication changes on your own.",
      hi: "इसे डॉक्टर से चर्चा का बिंदु बनाएं, अपने आप दवा में बदलाव न करें।",
      hinglish: "Isko clinician discussion point ki tarah use karein, khud se medicine change na karein.",
    }),
  };
}

export function generateHealthInsights(
  analysis: MedicalAnalysis,
  options?: {
    language?: OutputLanguage;
    authenticity?: AuthenticityProof | null;
  }
): HealthInsights {
  const language = options?.language || "en";
  const {
    evaluations,
    riskPredictions,
    medicineDetails,
    interactionChecks,
    lifestyleRecommendations,
    medicineReminders,
    doctorRecommendations,
  } = enrichReportIntelligence(analysis, language);
  const abnormalFindings: AbnormalFinding[] = [];
  const alerts: HealthAlert[] = [];
  let overallRisk: RiskLevel = "low";

  for (const evaluation of evaluations) {
    if (!evaluation.isAbnormal) {
      continue;
    }

    const finding: AbnormalFinding = {
      name: evaluation.name,
      value: [evaluation.value, evaluation.unit].filter(Boolean).join(" ").trim(),
      referenceRange: evaluation.referenceRange,
      status: evaluation.status,
      severity: evaluation.severity,
      explanation: evaluation.explanation,
    };

    abnormalFindings.push(finding);
    alerts.push(buildAlert(finding, language));
    overallRisk = maxRisk(overallRisk, evaluation.severity);
  }

  if (abnormalFindings.length >= 3 && overallRisk === "moderate") {
    overallRisk = "high";
  }

  if (riskPredictions.some((item) => item.severity === "critical")) {
    overallRisk = "critical";
  }

  const emergencyAssessment = buildEmergencyAssessment(evaluations, language);
  overallRisk = maxRisk(overallRisk, emergencyAssessment.severity);

  const abnormalCount = abnormalFindings.length;
  const topPrediction = riskPredictions[0];
  const summary =
    abnormalCount > 0
      ? chooseLocalizedText(language, {
          en: `${abnormalCount} result(s) appear outside the expected range.${topPrediction ? ` Top predicted concern: ${topPrediction.condition}.` : ""} Review the flagged items with a qualified clinician.`,
          hi: `${abnormalCount} परिणाम अपेक्षित सीमा से बाहर दिखते हैं।${topPrediction ? ` प्रमुख संभावित चिंता: ${topPrediction.condition}।` : ""} फ्लैग किए गए मानों की योग्य डॉक्टर से समीक्षा कराएं।`,
          hinglish: `${abnormalCount} result(s) expected range se bahar lag rahe hain.${topPrediction ? ` Top predicted concern: ${topPrediction.condition}.` : ""} Flagged values ko qualified clinician ke sath review karein.`,
        })
      : chooseLocalizedText(language, {
          en: "No clearly abnormal values were identified from the structured report data.",
          hi: "संरचित रिपोर्ट डेटा से कोई स्पष्ट असामान्य मान नहीं मिला।",
          hinglish: "Structured report data se koi clear abnormal value identify nahi hui.",
        });

  const contextualGuidance = [
    interactionChecks[0]?.recommendation,
    lifestyleRecommendations[0]?.details,
    medicineReminders[0]
      ? `${medicineReminders[0].medicineName}: ${medicineReminders[0].schedule}.`
      : "",
  ].filter(Boolean);

  const generalGuidance = [
    ...contextualGuidance,
    chooseLocalizedText(language, {
      en: "Use these results for awareness and discussion, not as a diagnosis or treatment plan.",
      hi: "इन परिणामों का उपयोग जागरूकता और चर्चा के लिए करें, निदान या इलाज योजना के रूप में नहीं।",
      hinglish: "In results ko awareness aur discussion ke liye use karein, diagnosis ya treatment plan ke liye nahi.",
    }),
    chooseLocalizedText(language, {
      en: "Avoid starting, stopping, or changing medicines without clinician advice.",
      hi: "डॉक्टर की सलाह के बिना दवा शुरू, बंद या बदलें नहीं।",
      hinglish: "Clinician advice ke bina medicines start, stop ya change na karein.",
    }),
    chooseLocalizedText(language, {
      en: "Seek urgent medical care for severe symptoms such as chest pain, confusion, fainting, severe shortness of breath, or heavy bleeding.",
      hi: "सीने में दर्द, भ्रम, बेहोशी, गंभीर सांस फूलना या भारी रक्तस्राव जैसे लक्षण हों तो तुरंत चिकित्सा सहायता लें।",
      hinglish: "Chest pain, confusion, fainting, severe breathlessness ya heavy bleeding ho to urgent medical care lein.",
    }),
  ];

  if (analysis.possibleConditions?.length) {
    generalGuidance.unshift(
      chooseLocalizedText(language, {
        en: "Possible conditions listed by AI are hypotheses only and should be confirmed by a clinician.",
        hi: "AI द्वारा बताई गई संभावित स्थितियां केवल अनुमान हैं, उनकी पुष्टि डॉक्टर से करें।",
        hinglish: "AI listed possible conditions sirf hypotheses hain, unhe clinician se confirm karein.",
      })
    );
  }

  return {
    overallRisk,
    summary,
    abnormalFindings,
    alerts,
    generalGuidance,
    safetyNotice: chooseLocalizedText(language, {
      en: "This tool provides educational insights and cannot replace medical diagnosis, emergency care, or prescription decisions.",
      hi: "यह टूल केवल शैक्षिक जानकारी देता है और चिकित्सा निदान, आपातकालीन इलाज या प्रिस्क्रिप्शन निर्णय का विकल्प नहीं है।",
      hinglish: "Ye tool educational insights deta hai aur medical diagnosis, emergency care ya prescription decisions ko replace nahi karta.",
    }),
    preferredLanguage: language,
    testEvaluations:
      analysis.testValues?.map((test) => evaluateTestValue(test, language)) || [],
    riskPredictions,
    medicineDetails,
    interactionChecks,
    lifestyleRecommendations,
    medicineReminders,
    emergencyAssessment,
    doctorRecommendations,
    authenticity: options?.authenticity || null,
  };
}
