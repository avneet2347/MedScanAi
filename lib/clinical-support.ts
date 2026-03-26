import { chooseLocalizedText } from "@/lib/localization";
import type {
  InteractionCheck,
  LifestyleRecommendation,
  MedicalAnalysis,
  MedicineDetail,
  MedicineEntry,
  MedicineReminder,
  OutputLanguage,
  RiskPrediction,
  TestEvaluation,
} from "@/lib/report-types";

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeMedicineName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function medicineKey(name: string) {
  const normalized = normalizeMedicineName(name);

  if (normalized.includes("metformin") || normalized.includes("glycomet") || normalized.includes("glucophage")) {
    return "metformin";
  }

  if (normalized.includes("amlodipine") || normalized.includes("amlong")) {
    return "amlodipine";
  }

  if (
    normalized.includes("telmisartan") ||
    normalized.includes("losartan") ||
    normalized.includes("olmesartan")
  ) {
    return "arb";
  }

  if (
    normalized.includes("levothyroxine") ||
    normalized.includes("thyronorm") ||
    normalized.includes("eltroxin")
  ) {
    return "levothyroxine";
  }

  if (normalized.includes("atorvastatin") || normalized.includes("rosuvastatin")) {
    return "statin";
  }

  if (
    normalized.includes("paracetamol") ||
    normalized.includes("acetaminophen") ||
    normalized.includes("crocin") ||
    normalized.includes("dolo")
  ) {
    return "paracetamol";
  }

  return normalized.split(" ")[0] || normalized;
}

function medicineTags(name: string) {
  const key = medicineKey(name);

  switch (key) {
    case "metformin":
      return ["blood-sugar"];
    case "amlodipine":
      return ["antihypertensive"];
    case "arb":
      return ["antihypertensive", "arb"];
    case "levothyroxine":
      return ["thyroid"];
    case "statin":
      return ["statin"];
    case "paracetamol":
      return ["pain-relief"];
    default:
      return [];
  }
}

function hasMedicineTag(medicines: MedicineEntry[], tag: string) {
  return medicines.some((medicine) => medicineTags(medicine.name).includes(tag));
}

function matchingMedicineNames(medicines: MedicineEntry[], tag: string) {
  return medicines
    .filter((medicine) => medicineTags(medicine.name).includes(tag))
    .map((medicine) => medicine.name);
}

function hasAbnormalMetric(evaluations: TestEvaluation[], metricKey: string, status?: string) {
  return evaluations.some(
    (evaluation) =>
      evaluation.metricKey === metricKey &&
      evaluation.isAbnormal &&
      (!status || evaluation.status === status)
  );
}

function addLifestyleRecommendation(
  recommendations: LifestyleRecommendation[],
  next: LifestyleRecommendation
) {
  if (
    recommendations.some(
      (item) => item.category === next.category && item.title === next.title
    )
  ) {
    return;
  }

  recommendations.push(next);
}

function buildScheduleLabel(frequency: string, language: OutputLanguage) {
  const normalized = frequency.toLowerCase();

  if (
    normalized.includes("twice") ||
    normalized.includes("bd") ||
    normalized.includes("bid")
  ) {
    return chooseLocalizedText(language, {
      en: "Morning and evening",
      hi: "सुबह और शाम",
      hinglish: "Subah aur shaam",
    });
  }

  if (
    normalized.includes("thrice") ||
    normalized.includes("tds") ||
    normalized.includes("three")
  ) {
    return chooseLocalizedText(language, {
      en: "Morning, afternoon, and night",
      hi: "सुबह, दोपहर और रात",
      hinglish: "Subah, dopahar aur raat",
    });
  }

  if (normalized.includes("night") || normalized.includes("hs") || normalized.includes("bed")) {
    return chooseLocalizedText(language, {
      en: "At night",
      hi: "रात में",
      hinglish: "Raat me",
    });
  }

  if (normalized.includes("morning")) {
    return chooseLocalizedText(language, {
      en: "Every morning",
      hi: "हर सुबह",
      hinglish: "Har subah",
    });
  }

  if (normalized.includes("once") || normalized.includes("daily") || normalized.includes("od")) {
    return chooseLocalizedText(language, {
      en: "Once daily at a fixed time",
      hi: "दिन में एक बार, तय समय पर",
      hinglish: "Din me ek baar, fixed time par",
    });
  }

  return chooseLocalizedText(language, {
    en: "Follow the prescription timing",
    hi: "प्रिस्क्रिप्शन में दिए समय का पालन करें",
    hinglish: "Prescription timing follow karein",
  });
}

function buildReminderInstruction(medicine: MedicineEntry, language: OutputLanguage) {
  const key = medicineKey(medicine.name);

  switch (key) {
    case "metformin":
      return chooseLocalizedText(language, {
        en: "Take with food or soon after meals if that matches the prescription, and use a meal-linked alarm to avoid missed doses.",
        hi: "अगर प्रिस्क्रिप्शन में ऐसा ही लिखा हो तो भोजन के साथ या उसके तुरंत बाद लें, और डोज़ मिस न हो इसके लिए खाने से जुड़ा अलार्म लगाएं।",
        hinglish: "Agar prescription me aisa hi ho to food ke sath ya meal ke baad lein, aur dose miss na ho isliye meal-linked alarm lagayein.",
      });
    case "levothyroxine":
      return chooseLocalizedText(language, {
        en: "Take on an empty stomach at the same time each morning if prescribed that way, ideally before breakfast.",
        hi: "अगर इसी तरह बताया गया हो तो इसे खाली पेट हर सुबह एक ही समय पर, बेहतर हो तो नाश्ते से पहले लें।",
        hinglish: "Agar aise hi advise ho to ise empty stomach har subah same time par, ideally breakfast se pehle lein.",
      });
    case "amlodipine":
    case "arb":
      return chooseLocalizedText(language, {
        en: "Take it at the same time every day and keep a simple blood-pressure log if your doctor has asked you to monitor readings.",
        hi: "इसे रोज़ एक ही समय पर लें और अगर डॉक्टर ने कहा हो तो ब्लड प्रेशर की छोटी सी लॉग रखें।",
        hinglish: "Ise roz same time par lein aur agar doctor ne kaha ho to blood pressure ki small log rakhein.",
      });
    case "statin":
      return chooseLocalizedText(language, {
        en: "Use a fixed evening reminder if your clinician has prescribed it for night-time dosing.",
        hi: "अगर डॉक्टर ने रात में लेने के लिए कहा हो तो हर शाम तय रिमाइंडर रखें।",
        hinglish: "Agar doctor ne raat me lene ko kaha ho to fixed evening reminder rakhein.",
      });
    case "paracetamol":
      return chooseLocalizedText(language, {
        en: "Use it only as prescribed and check other cold or pain medicines so you do not double the same ingredient.",
        hi: "इसे केवल प्रिस्क्रिप्शन के अनुसार लें और दूसरी दर्द या सर्दी की दवाओं में वही दवा दोबारा तो नहीं है, यह भी जांचें।",
        hinglish: "Ise sirf prescription ke hisab se lein aur dusri pain/cold medicines me same ingredient repeat to nahi hai, ye check karein.",
      });
    default:
      return chooseLocalizedText(language, {
        en: "Use a phone reminder or pill organizer to keep the dosing schedule consistent.",
        hi: "डोज़ समय पर लेने के लिए फोन रिमाइंडर या पिल ऑर्गेनाइज़र का उपयोग करें।",
        hinglish: "Dose time par lene ke liye phone reminder ya pill organizer use karein.",
      });
  }
}

export function buildInteractionChecks(
  medicines: MedicineEntry[],
  evaluations: TestEvaluation[],
  language: OutputLanguage
) {
  const checks: InteractionCheck[] = [];

  if (medicines.length === 0) {
    return checks;
  }

  if (hasMedicineTag(medicines, "blood-sugar") && hasAbnormalMetric(evaluations, "creatinine")) {
    checks.push({
      title: chooseLocalizedText(language, {
        en: "Kidney function caution with diabetes medicine",
        hi: "डायबिटीज़ दवा के साथ किडनी फंक्शन सावधानी",
        hinglish: "Diabetes medicine ke sath kidney function caution",
      }),
      medicines: matchingMedicineNames(medicines, "blood-sugar"),
      severity: hasAbnormalMetric(evaluations, "creatinine", "high") ? "high" : "moderate",
      explanation: chooseLocalizedText(language, {
        en: "When creatinine is above range, medicines such as metformin may need clinician review for dose safety.",
        hi: "जब क्रिएटिनिन सीमा से ऊपर हो, तो मेटफॉर्मिन जैसी दवाओं की सुरक्षित डोज़ के लिए डॉक्टर से समीक्षा जरूरी हो सकती है।",
        hinglish: "Jab creatinine range se upar ho, to metformin jaisi medicines ki dose safety ke liye clinician review zaroori ho sakta hai.",
      }),
      recommendation: chooseLocalizedText(language, {
        en: "Do not stop the medicine on your own, but review kidney function and the prescription promptly with your clinician.",
        hi: "दवा अपने आप बंद न करें, लेकिन किडनी फंक्शन और प्रिस्क्रिप्शन की जल्दी समीक्षा डॉक्टर से कराएं।",
        hinglish: "Medicine khud se band na karein, lekin kidney function aur prescription ka prompt review clinician se karayein.",
      }),
    });
  }

  if (hasMedicineTag(medicines, "arb") && hasAbnormalMetric(evaluations, "potassium", "high")) {
    checks.push({
      title: chooseLocalizedText(language, {
        en: "Potassium-related interaction caution",
        hi: "पोटैशियम से जुड़ी इंटरैक्शन सावधानी",
        hinglish: "Potassium-related interaction caution",
      }),
      medicines: matchingMedicineNames(medicines, "arb"),
      severity: "high",
      explanation: chooseLocalizedText(language, {
        en: "Some blood-pressure medicines in the ARB family can worsen high potassium and need closer monitoring.",
        hi: "ARB परिवार की कुछ ब्लड प्रेशर दवाएं बढ़े हुए पोटैशियम को और प्रभावित कर सकती हैं, इसलिए करीबी निगरानी जरूरी होती है।",
        hinglish: "ARB family ki kuch blood-pressure medicines high potassium ko aur impact kar sakti hain, isliye close monitoring zaroori hoti hai.",
      }),
      recommendation: chooseLocalizedText(language, {
        en: "Review the medicine list, repeat potassium if advised, and avoid self-adding supplements without medical advice.",
        hi: "दवा सूची की समीक्षा कराएं, जरूरत हो तो पोटैशियम दोबारा जांचें, और बिना सलाह के सप्लीमेंट शुरू न करें।",
        hinglish: "Medicine list review karayein, zarurat ho to potassium repeat karayein, aur bina advice supplements start na karein.",
      }),
    });
  }

  const antihypertensives = matchingMedicineNames(medicines, "antihypertensive");
  if (antihypertensives.length >= 2) {
    checks.push({
      title: chooseLocalizedText(language, {
        en: "Multiple blood-pressure medicines detected",
        hi: "एक से अधिक ब्लड प्रेशर दवाएं मिलीं",
        hinglish: "Multiple blood-pressure medicines detect hui",
      }),
      medicines: antihypertensives,
      severity: "moderate",
      explanation: chooseLocalizedText(language, {
        en: "Using more than one blood-pressure medicine can be intentional, but dizziness or low blood pressure is worth monitoring.",
        hi: "एक से अधिक ब्लड प्रेशर दवाएं जानबूझकर दी जा सकती हैं, लेकिन चक्कर या लो ब्लड प्रेशर पर नज़र रखना जरूरी है।",
        hinglish: "Ek se zyada blood-pressure medicines intentional ho sakti hain, lekin dizziness ya low BP ko monitor karna zaroori hai.",
      }),
      recommendation: chooseLocalizedText(language, {
        en: "Take them exactly as prescribed and discuss fainting, weakness, or very low readings with your clinician.",
        hi: "इन्हें बिल्कुल प्रिस्क्रिप्शन के अनुसार लें और बेहोशी, कमजोरी या बहुत कम रीडिंग होने पर डॉक्टर से बात करें।",
        hinglish: "Inhe bilkul prescription ke hisab se lein aur fainting, weakness ya bahut low readings par clinician se baat karein.",
      }),
    });
  }

  if (checks.length === 0 && medicines.length > 1) {
    checks.push({
      title: chooseLocalizedText(language, {
        en: "No major built-in interaction flag",
        hi: "कोई बड़ा बिल्ट-इन इंटरैक्शन फ्लैग नहीं मिला",
        hinglish: "No major built-in interaction flag",
      }),
      medicines: medicines.map((medicine) => medicine.name),
      severity: "low",
      explanation: chooseLocalizedText(language, {
        en: "No high-risk interaction was detected from the small built-in rule set for the extracted medicines.",
        hi: "निकाली गई दवाओं के लिए छोटे बिल्ट-इन नियम सेट में कोई उच्च-जोखिम इंटरैक्शन नहीं मिला।",
        hinglish: "Extracted medicines ke liye small built-in rule set me koi high-risk interaction detect nahi hua.",
      }),
      recommendation: chooseLocalizedText(language, {
        en: "Because OCR can miss brand names or strengths, still verify the exact prescription with a pharmacist or clinician.",
        hi: "क्योंकि OCR ब्रांड नाम या ताकत मिस कर सकता है, इसलिए सही प्रिस्क्रिप्शन की पुष्टि फार्मासिस्ट या डॉक्टर से करें।",
        hinglish: "OCR brand names ya strengths miss kar sakta hai, isliye exact prescription pharmacist ya clinician se verify karein.",
      }),
    });
  }

  return checks.slice(0, 4);
}

export function buildLifestyleRecommendations(
  analysis: MedicalAnalysis,
  evaluations: TestEvaluation[],
  riskPredictions: RiskPrediction[],
  language: OutputLanguage
) {
  const recommendations: LifestyleRecommendation[] = [];
  const hasGlucoseRisk =
    riskPredictions.some((item) => /diabet|sugar/i.test(item.condition)) ||
    hasAbnormalMetric(evaluations, "hba1c") ||
    hasAbnormalMetric(evaluations, "blood_glucose");
  const hasAnemiaRisk =
    riskPredictions.some((item) => /anemia/i.test(item.condition)) ||
    hasAbnormalMetric(evaluations, "hemoglobin");
  const hasThyroidRisk =
    riskPredictions.some((item) => /thyroid/i.test(item.condition)) ||
    hasAbnormalMetric(evaluations, "tsh");
  const hasHeartRisk =
    riskPredictions.some((item) => /hypertension|cholesterol|cardio/i.test(item.condition)) ||
    hasAbnormalMetric(evaluations, "blood_pressure") ||
    hasAbnormalMetric(evaluations, "cholesterol");
  const hasKidneyRisk =
    riskPredictions.some((item) => /kidney/i.test(item.condition)) ||
    hasAbnormalMetric(evaluations, "creatinine");

  if (hasGlucoseRisk) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Diet focus",
        hi: "आहार फोकस",
        hinglish: "Diet focus",
      }),
      category: "diet",
      details: chooseLocalizedText(language, {
        en: "Favor high-fiber meals, reduce sugary drinks and refined snacks, and keep meal timing consistent if your clinician has advised diabetes monitoring.",
        hi: "फाइबर वाले भोजन को प्राथमिकता दें, मीठे पेय और रिफाइंड स्नैक्स कम करें, और अगर डॉक्टर ने कहा हो तो खाने का समय नियमित रखें।",
        hinglish: "High-fiber meals ko prefer karein, sugary drinks aur refined snacks kam karein, aur agar clinician ne kaha ho to meal timing regular rakhein.",
      }),
    });
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Activity habit",
        hi: "गतिविधि आदत",
        hinglish: "Activity habit",
      }),
      category: "activity",
      details: chooseLocalizedText(language, {
        en: "A routine daily walk or other clinician-approved activity can support sugar control and weight management.",
        hi: "रोज़ाना टहलना या डॉक्टर द्वारा अनुमोदित गतिविधि ब्लड शुगर नियंत्रण और वजन प्रबंधन में मदद कर सकती है।",
        hinglish: "Daily walk ya clinician-approved activity blood sugar control aur weight management me help kar sakti hai.",
      }),
    });
  }

  if (hasAnemiaRisk) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Iron-supportive meals",
        hi: "आयरन सपोर्टिव भोजन",
        hinglish: "Iron-supportive meals",
      }),
      category: "diet",
      details: chooseLocalizedText(language, {
        en: "Discuss iron-rich foods, protein intake, and whether B12 or folate testing is needed instead of self-starting supplements.",
        hi: "आयरन-समृद्ध भोजन, प्रोटीन सेवन और B12 या फोलेट जांच की जरूरत पर डॉक्टर से चर्चा करें, अपने आप सप्लीमेंट शुरू न करें।",
        hinglish: "Iron-rich foods, protein intake aur B12/folate testing ki zarurat par clinician se discuss karein, khud se supplements start na karein.",
      }),
    });
  }

  if (hasThyroidRisk) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Monitoring plan",
        hi: "मॉनिटरिंग प्लान",
        hinglish: "Monitoring plan",
      }),
      category: "monitoring",
      details: chooseLocalizedText(language, {
        en: "Track fatigue, weight change, or temperature intolerance and review repeat thyroid testing with your clinician.",
        hi: "थकान, वजन में बदलाव या ठंड/गर्मी असहिष्णुता पर नज़र रखें और दोबारा थायरॉयड जांच की योजना डॉक्टर से बनाएं।",
        hinglish: "Fatigue, weight change ya temperature intolerance ko track karein aur repeat thyroid testing clinician ke sath plan karein.",
      }),
    });
  }

  if (hasHeartRisk) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Heart-friendly routine",
        hi: "हार्ट-फ्रेंडली रूटीन",
        hinglish: "Heart-friendly routine",
      }),
      category: "diet",
      details: chooseLocalizedText(language, {
        en: "Limit extra salt and heavily processed foods, and keep a simple home blood-pressure or weight log if advised.",
        hi: "अतिरिक्त नमक और बहुत प्रोसेस्ड भोजन कम करें, और अगर सलाह दी गई हो तो घर पर ब्लड प्रेशर या वजन की छोटी लॉग रखें।",
        hinglish: "Extra namak aur heavily processed foods kam karein, aur agar advise ho to ghar par BP ya weight ki simple log rakhein.",
      }),
    });
  }

  if (hasKidneyRisk) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Hydration and medicine review",
        hi: "हाइड्रेशन और दवा समीक्षा",
        hinglish: "Hydration aur medicine review",
      }),
      category: "hydration",
      details: chooseLocalizedText(language, {
        en: "Stay hydrated unless a doctor has restricted fluids, and review over-the-counter painkillers or supplements before using them.",
        hi: "अगर डॉक्टर ने तरल कम करने को न कहा हो तो हाइड्रेटेड रहें, और कोई भी ओवर-द-काउंटर दर्द की दवा या सप्लीमेंट लेने से पहले समीक्षा कराएं।",
        hinglish: "Agar doctor ne fluids restrict na kiye hon to hydrated rahein, aur OTC painkillers ya supplements use karne se pehle review karayein.",
      }),
    });
  }

  if (recommendations.length === 0) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Balanced routine",
        hi: "संतुलित दिनचर्या",
        hinglish: "Balanced routine",
      }),
      category: "activity",
      details: chooseLocalizedText(language, {
        en: "Keep meals balanced, stay active within your comfort level, and review symptoms rather than relying only on the automated summary.",
        hi: "भोजन संतुलित रखें, अपनी क्षमता के अनुसार सक्रिय रहें, और केवल ऑटोमेटेड सारांश पर निर्भर रहने के बजाय लक्षणों की समीक्षा करें।",
        hinglish: "Meals balanced rakhein, comfort level ke hisab se active rahein, aur sirf automated summary par rely karne ke bajay symptoms review karein.",
      }),
    });
  }

  if ((analysis.precautions || []).length > 0) {
    addLifestyleRecommendation(recommendations, {
      title: chooseLocalizedText(language, {
        en: "Follow-up habit",
        hi: "फॉलो-अप आदत",
        hinglish: "Follow-up habit",
      }),
      category: "monitoring",
      details: analysis.precautions[0],
    });
  }

  return recommendations.slice(0, 4);
}

export function buildMedicineReminders(
  medicines: MedicineEntry[],
  language: OutputLanguage
) {
  return medicines.slice(0, 6).map((medicine) => ({
    medicineName: medicine.name,
    dosage: medicine.dosage,
    schedule: buildScheduleLabel(medicine.frequency || "", language),
    instructions: buildReminderInstruction(medicine, language),
  }));
}

export function mergeMedicineSupport(
  details: MedicineDetail[],
  interactionChecks: InteractionCheck[],
  medicineReminders: MedicineReminder[]
) {
  return details.map((detail) => {
    const key = medicineKey(detail.name);
    const relatedChecks = interactionChecks.filter(
      (check) =>
        check.severity !== "low" &&
        check.medicines.some((medicineName) => medicineKey(medicineName) === key)
    );
    const reminder =
      medicineReminders.find((item) => medicineKey(item.medicineName) === key) || null;
    const interactionWarnings = uniqueStrings(
      relatedChecks.map((check) => `${check.title}: ${check.recommendation}`)
    );
    const timingAdvice = reminder?.instructions || "";

    return {
      ...detail,
      interactionWarnings,
      timingAdvice,
      precautions: uniqueStrings([
        ...detail.precautions,
        ...interactionWarnings,
        ...(timingAdvice ? [timingAdvice] : []),
      ]),
    };
  });
}
