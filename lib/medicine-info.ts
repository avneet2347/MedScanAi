import { chooseLocalizedText } from "@/lib/localization";
import type { MedicineDetail, MedicineEntry, OutputLanguage } from "@/lib/report-types";

type MedicineKnowledgeBaseEntry = {
  aliases: string[];
  category: string;
  summary: {
    en: string;
    hi: string;
    hinglish: string;
  };
  uses: {
    en: string[];
    hi: string[];
    hinglish: string[];
  };
  commonSideEffects: {
    en: string[];
    hi: string[];
    hinglish: string[];
  };
  precautions: {
    en: string[];
    hi: string[];
    hinglish: string[];
  };
};

const MEDICINE_KB: MedicineKnowledgeBaseEntry[] = [
  {
    aliases: ["metformin", "glycomet", "glucophage"],
    category: "Antidiabetic",
    summary: {
      en: "Commonly used to help control blood sugar in type 2 diabetes.",
      hi: "यह दवा टाइप 2 डायबिटीज़ में ब्लड शुगर नियंत्रित करने के लिए आम तौर पर दी जाती है।",
      hinglish: "Ye medicine type 2 diabetes me blood sugar control karne ke liye use hoti hai.",
    },
    uses: {
      en: ["Type 2 diabetes", "Insulin resistance"],
      hi: ["टाइप 2 डायबिटीज़", "इंसुलिन रेजिस्टेंस"],
      hinglish: ["Type 2 diabetes", "Insulin resistance"],
    },
    commonSideEffects: {
      en: ["Nausea", "Loose stools", "Stomach discomfort"],
      hi: ["मतली", "दस्त", "पेट में असहजता"],
      hinglish: ["Nausea", "Loose motions", "Pet me discomfort"],
    },
    precautions: {
      en: ["Take with food if prescribed that way", "Discuss kidney issues with your doctor"],
      hi: ["अगर ऐसा बताया गया हो तो भोजन के साथ लें", "किडनी की समस्या हो तो डॉक्टर से ज़रूर बात करें"],
      hinglish: ["Agar advise ho to food ke sath lein", "Kidney problem ho to doctor ko batayein"],
    },
  },
  {
    aliases: ["amlodipine", "amlong"],
    category: "Blood pressure medicine",
    summary: {
      en: "Often used to lower blood pressure and reduce heart strain.",
      hi: "यह दवा अक्सर ब्लड प्रेशर कम करने और दिल पर दबाव घटाने के लिए दी जाती है।",
      hinglish: "Ye medicine blood pressure kam karne aur heart par pressure kam karne ke liye di jati hai.",
    },
    uses: {
      en: ["High blood pressure", "Angina"],
      hi: ["उच्च रक्तचाप", "एंजाइना"],
      hinglish: ["High blood pressure", "Angina"],
    },
    commonSideEffects: {
      en: ["Ankle swelling", "Headache", "Flushing"],
      hi: ["टखनों में सूजन", "सिरदर्द", "चेहरे पर गर्माहट"],
      hinglish: ["Ankle swelling", "Headache", "Flushing"],
    },
    precautions: {
      en: ["Stand slowly if you feel dizzy", "Monitor blood pressure regularly"],
      hi: ["चक्कर आए तो धीरे से खड़े हों", "ब्लड प्रेशर नियमित रूप से जांचें"],
      hinglish: ["Dizziness ho to dheere khade hon", "Blood pressure regularly check karein"],
    },
  },
  {
    aliases: ["telmisartan", "losartan", "olmesartan"],
    category: "ARB antihypertensive",
    summary: {
      en: "Used to help control blood pressure and support kidney protection in some patients.",
      hi: "यह दवा ब्लड प्रेशर नियंत्रित करने और कुछ मरीजों में किडनी सुरक्षा के लिए दी जाती है।",
      hinglish: "Ye medicine blood pressure control karne aur kuch patients me kidney protection ke liye use hoti hai.",
    },
    uses: {
      en: ["High blood pressure", "Kidney protection in selected patients"],
      hi: ["उच्च रक्तचाप", "कुछ मरीजों में किडनी सुरक्षा"],
      hinglish: ["High blood pressure", "Selected patients me kidney protection"],
    },
    commonSideEffects: {
      en: ["Dizziness", "Low blood pressure", "Raised potassium"],
      hi: ["चक्कर", "लो ब्लड प्रेशर", "पोटैशियम बढ़ना"],
      hinglish: ["Dizziness", "Low BP", "Potassium badhna"],
    },
    precautions: {
      en: ["Check blood pressure and kidney tests as advised", "Review with a doctor if pregnant or planning pregnancy"],
      hi: ["सलाह अनुसार ब्लड प्रेशर और किडनी टेस्ट कराएं", "गर्भावस्था या योजना होने पर डॉक्टर से बात करें"],
      hinglish: ["Advice ke according BP aur kidney tests karayein", "Pregnancy me doctor se review karayein"],
    },
  },
  {
    aliases: ["levothyroxine", "thyronorm", "eltroxin"],
    category: "Thyroid hormone",
    summary: {
      en: "Usually prescribed to replace low thyroid hormone levels.",
      hi: "यह दवा कम थायरॉयड हार्मोन स्तर को पूरा करने के लिए दी जाती है।",
      hinglish: "Ye medicine low thyroid hormone level ko replace karne ke liye di jati hai.",
    },
    uses: {
      en: ["Hypothyroidism"],
      hi: ["हाइपोथायरॉइडिज़्म"],
      hinglish: ["Hypothyroidism"],
    },
    commonSideEffects: {
      en: ["Palpitations if dose is high", "Sweating", "Restlessness"],
      hi: ["डोज़ ज़्यादा हो तो धड़कन तेज होना", "पसीना", "बेचैनी"],
      hinglish: ["Dose zyada ho to palpitations", "Sweating", "Restlessness"],
    },
    precautions: {
      en: ["Often taken on an empty stomach if prescribed", "Thyroid levels may need repeat testing"],
      hi: ["अगर ऐसा बताया गया हो तो खाली पेट लें", "थायरॉयड स्तर दोबारा जांचने पड़ सकते हैं"],
      hinglish: ["Agar advise ho to empty stomach lein", "Thyroid tests repeat karne pad sakte hain"],
    },
  },
  {
    aliases: ["atorvastatin", "rosuvastatin"],
    category: "Cholesterol-lowering medicine",
    summary: {
      en: "Used to lower cholesterol and reduce cardiovascular risk.",
      hi: "यह दवा कोलेस्ट्रॉल कम करने और हृदय संबंधी जोखिम घटाने के लिए दी जाती है।",
      hinglish: "Ye medicine cholesterol kam karne aur heart risk reduce karne ke liye use hoti hai.",
    },
    uses: {
      en: ["High cholesterol", "Cardiovascular risk reduction"],
      hi: ["उच्च कोलेस्ट्रॉल", "हृदय जोखिम कम करना"],
      hinglish: ["High cholesterol", "Heart risk reduction"],
    },
    commonSideEffects: {
      en: ["Muscle aches", "Upset stomach", "Abnormal liver tests"],
      hi: ["मांसपेशियों में दर्द", "पेट खराब", "लिवर टेस्ट असामान्य होना"],
      hinglish: ["Muscle pain", "Upset stomach", "Liver tests abnormal hona"],
    },
    precautions: {
      en: ["Report severe muscle pain", "Liver tests may need monitoring"],
      hi: ["तेज मांसपेशी दर्द हो तो बताएं", "लिवर टेस्ट की निगरानी ज़रूरी हो सकती है"],
      hinglish: ["Severe muscle pain ho to report karein", "Liver tests monitor karne pad sakte hain"],
    },
  },
  {
    aliases: ["paracetamol", "acetaminophen", "crocin", "dolo"],
    category: "Pain and fever relief",
    summary: {
      en: "Used for fever and mild to moderate pain relief.",
      hi: "यह दवा बुखार और हल्के से मध्यम दर्द में राहत के लिए उपयोग की जाती है।",
      hinglish: "Ye medicine fever aur mild to moderate pain relief ke liye use hoti hai.",
    },
    uses: {
      en: ["Fever", "Headache", "Body ache"],
      hi: ["बुखार", "सिरदर्द", "शरीर दर्द"],
      hinglish: ["Fever", "Headache", "Body ache"],
    },
    commonSideEffects: {
      en: ["Usually well tolerated in correct doses", "Liver toxicity in overdose"],
      hi: ["सही डोज़ में आमतौर पर सुरक्षित", "ओवरडोज़ में लिवर को नुकसान"],
      hinglish: ["Correct dose me usually safe", "Overdose me liver damage"],
    },
    precautions: {
      en: ["Avoid exceeding the prescribed dose", "Check for other combination products containing paracetamol"],
      hi: ["निर्धारित डोज़ से अधिक न लें", "अन्य दवाओं में भी paracetamol हो सकता है, यह जांचें"],
      hinglish: ["Prescribed dose se zyada na lein", "Dusri medicines me bhi paracetamol ho sakta hai"],
    },
  },
];

function findMedicineInfo(name: string) {
  const normalized = name.trim().toLowerCase();

  return MEDICINE_KB.find((entry) =>
    entry.aliases.some((alias) => normalized.includes(alias))
  );
}

function pickLocalizedArray(
  language: OutputLanguage,
  value: MedicineKnowledgeBaseEntry["uses"]
) {
  if (language === "hi") {
    return value.hi;
  }

  if (language === "hinglish") {
    return value.hinglish;
  }

  return value.en;
}

export function buildMedicineDetails(
  medicines: MedicineEntry[],
  language: OutputLanguage
): MedicineDetail[] {
  return medicines.map((medicine) => {
    const match = findMedicineInfo(medicine.name);

    if (!match) {
      return {
        name: medicine.name,
        category: chooseLocalizedText(language, {
          en: "Medication",
          hi: "दवा",
          hinglish: "Medicine",
        }),
        summary: chooseLocalizedText(language, {
          en: "Specific medicine details were not found in the built-in knowledge base. Confirm the name and review the original prescription.",
          hi: "इस दवा की सटीक जानकारी बिल्ट-इन ज्ञानकोश में नहीं मिली। नाम की पुष्टि करें और मूल प्रिस्क्रिप्शन देखें।",
          hinglish: "Is medicine ki exact details built-in knowledge base me nahi mili. Name confirm karein aur original prescription dekhein.",
        }),
        uses: [medicine.purpose || chooseLocalizedText(language, {
          en: "Use not clearly extracted from the report.",
          hi: "रिपोर्ट से उपयोग स्पष्ट रूप से नहीं निकला।",
          hinglish: "Report se use clearly extract nahi hua.",
        })],
        commonSideEffects: [chooseLocalizedText(language, {
          en: "Side effects depend on the exact drug and dose.",
          hi: "साइड इफेक्ट्स दवा और डोज़ पर निर्भर करते हैं।",
          hinglish: "Side effects exact drug aur dose par depend karte hain.",
        })],
        precautions: [chooseLocalizedText(language, {
          en: "Verify the medicine name with a pharmacist or doctor before acting on this summary.",
          hi: "इस सारांश पर भरोसा करने से पहले दवा का नाम फार्मासिस्ट या डॉक्टर से पुष्टि करें।",
          hinglish: "Is summary par act karne se pehle medicine name pharmacist ya doctor se confirm karein.",
        })],
        interactionWarnings: [],
        timingAdvice: "",
        source: "heuristic",
      };
    }

    return {
      name: medicine.name,
      category: match.category,
      summary:
        language === "hi"
          ? match.summary.hi
          : language === "hinglish"
            ? match.summary.hinglish
            : match.summary.en,
      uses: pickLocalizedArray(language, match.uses),
      commonSideEffects: pickLocalizedArray(language, match.commonSideEffects),
      precautions: pickLocalizedArray(language, match.precautions),
      interactionWarnings: [],
      timingAdvice: "",
      source: "knowledge-base",
    };
  });
}
