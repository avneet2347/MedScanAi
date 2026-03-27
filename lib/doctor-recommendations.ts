import type {
  DoctorRecommendation,
  HealthInsights,
  MedicalAnalysis,
  RiskLevel,
  TestEvaluation,
} from "@/lib/report-types";

type SpecialistKey = "cardiologist" | "diabetologist" | "general_physician";

type RecommendationAccumulator = {
  specialist: string;
  enabled: boolean;
  priority: RiskLevel;
  conditionSignals: Set<string>;
  metricSignals: Set<string>;
  riskSignals: Set<string>;
};

const riskOrder: RiskLevel[] = ["low", "moderate", "high", "critical"];

const specialistDisplayNames: Record<SpecialistKey, string> = {
  cardiologist: "Cardiologist",
  diabetologist: "Diabetologist",
  general_physician: "General physician",
};

const specialistSortOrder: Record<SpecialistKey, number> = {
  cardiologist: 0,
  diabetologist: 1,
  general_physician: 2,
};

const diabetesKeywords = [
  "diabet",
  "glucose",
  "sugar",
  "hba1c",
  "a1c",
  "insulin",
];

const cardioKeywords = [
  "cardio",
  "heart",
  "cardiac",
  "hypertens",
  "blood pressure",
  "cholesterol",
  "lipid",
  "triglycer",
  "ldl",
  "hdl",
  "coronary",
  "dyslip",
];

function riskMax(current: RiskLevel, next: RiskLevel) {
  return riskOrder.indexOf(next) > riskOrder.indexOf(current) ? next : current;
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function confidenceToRiskLevel(confidence: "low" | "medium" | "high"): RiskLevel {
  switch (confidence) {
    case "high":
      return "high";
    case "medium":
      return "moderate";
    default:
      return "low";
  }
}

function uniqueSignals(signals: Iterable<string>) {
  return Array.from(new Set(Array.from(signals).map((item) => item.trim()).filter(Boolean)));
}

function formatSignalList(signals: Iterable<string>) {
  const items = uniqueSignals(signals).slice(0, 3);

  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildReason(
  key: SpecialistKey,
  accumulator: RecommendationAccumulator
) {
  const fragments: string[] = [];
  const conditions = formatSignalList(accumulator.conditionSignals);
  const metrics = formatSignalList(accumulator.metricSignals);
  const risks = formatSignalList(accumulator.riskSignals);

  if (conditions) {
    fragments.push(`detected conditions include ${conditions}`);
  }

  if (metrics) {
    fragments.push(`abnormal findings include ${metrics}`);
  }

  if (risks) {
    fragments.push(`risk flags include ${risks}`);
  }

  if (fragments.length === 0) {
    if (key === "general_physician") {
      return "Consider a general physician for an overall clinical review of this report.";
    }

    return `Consider a ${accumulator.specialist.toLowerCase()} because stored findings suggest a focused review.`;
  }

  if (key === "general_physician") {
    return `Consider a general physician because ${fragments.join("; ")}.`;
  }

  return `Consider a ${accumulator.specialist.toLowerCase()} because ${fragments.join("; ")}.`;
}

function isAbnormalEvaluation(evaluation: TestEvaluation) {
  return evaluation.isAbnormal || evaluation.status === "high" || evaluation.status === "low";
}

function createAccumulator(key: SpecialistKey): RecommendationAccumulator {
  return {
    specialist: specialistDisplayNames[key],
    enabled: false,
    priority: "low",
    conditionSignals: new Set<string>(),
    metricSignals: new Set<string>(),
    riskSignals: new Set<string>(),
  };
}

function addSignal(
  accumulators: Record<SpecialistKey, RecommendationAccumulator>,
  key: SpecialistKey,
  payload: {
    priority: RiskLevel;
    condition?: string | null;
    metric?: string | null;
    risk?: string | null;
  }
) {
  const accumulator = accumulators[key];
  accumulator.enabled = true;
  accumulator.priority = riskMax(accumulator.priority, payload.priority);

  if (payload.condition?.trim()) {
    accumulator.conditionSignals.add(payload.condition.trim());
  }

  if (payload.metric?.trim()) {
    accumulator.metricSignals.add(payload.metric.trim());
  }

  if (payload.risk?.trim()) {
    accumulator.riskSignals.add(payload.risk.trim());
  }
}

function buildEvaluationSearchText(evaluation: TestEvaluation) {
  return `${evaluation.metricKey} ${evaluation.name}`.toLowerCase();
}

export function buildDoctorRecommendationsLayer(
  analysis?: MedicalAnalysis | null,
  insights?: HealthInsights | null
): DoctorRecommendation[] {
  if (!analysis && !insights) {
    return [];
  }

  const accumulators: Record<SpecialistKey, RecommendationAccumulator> = {
    cardiologist: createAccumulator("cardiologist"),
    diabetologist: createAccumulator("diabetologist"),
    general_physician: createAccumulator("general_physician"),
  };

  const possibleConditions = analysis?.possibleConditions || [];
  const riskPredictions = insights?.riskPredictions || [];
  const abnormalEvaluations = (insights?.testEvaluations || []).filter(isAbnormalEvaluation);
  const overallRisk = insights?.overallRisk || "low";
  const emergencyAssessment = insights?.emergencyAssessment;

  for (const prediction of riskPredictions) {
    const searchText = `${prediction.condition} ${prediction.suggestedSpecialist} ${prediction.rationale.join(" ")}`.toLowerCase();

    if (includesAny(searchText, cardioKeywords)) {
      addSignal(accumulators, "cardiologist", {
        priority: prediction.severity,
        condition: prediction.condition,
        risk: prediction.condition,
      });
    }

    if (includesAny(searchText, diabetesKeywords)) {
      addSignal(accumulators, "diabetologist", {
        priority: prediction.severity,
        condition: prediction.condition,
        risk: prediction.condition,
      });
    }
  }

  for (const evaluation of abnormalEvaluations) {
    const searchText = buildEvaluationSearchText(evaluation);

    if (includesAny(searchText, cardioKeywords)) {
      addSignal(accumulators, "cardiologist", {
        priority: evaluation.severity,
        metric: evaluation.name,
      });
    }

    if (includesAny(searchText, diabetesKeywords)) {
      addSignal(accumulators, "diabetologist", {
        priority: evaluation.severity,
        metric: evaluation.name,
      });
    }
  }

  for (const condition of possibleConditions) {
    const searchText =
      `${condition.name} ${condition.evidence} ${condition.explanation}`.toLowerCase();
    const priority = confidenceToRiskLevel(condition.confidence);

    if (includesAny(searchText, cardioKeywords)) {
      addSignal(accumulators, "cardiologist", {
        priority,
        condition: condition.name,
      });
    }

    if (includesAny(searchText, diabetesKeywords)) {
      addSignal(accumulators, "diabetologist", {
        priority,
        condition: condition.name,
      });
    }
  }

  if (emergencyAssessment?.requiresUrgentCare) {
    for (const criticalTest of emergencyAssessment.criticalTests || []) {
      const searchText = criticalTest.toLowerCase();

      if (includesAny(searchText, cardioKeywords)) {
        addSignal(accumulators, "cardiologist", {
          priority: emergencyAssessment.severity,
          metric: criticalTest,
          risk: emergencyAssessment.headline,
        });
      }

      if (includesAny(searchText, diabetesKeywords)) {
        addSignal(accumulators, "diabetologist", {
          priority: emergencyAssessment.severity,
          metric: criticalTest,
          risk: emergencyAssessment.headline,
        });
      }
    }
  }

  for (const condition of possibleConditions.slice(0, 2)) {
    addSignal(accumulators, "general_physician", {
      priority: confidenceToRiskLevel(condition.confidence),
      condition: condition.name,
    });
  }

  for (const evaluation of abnormalEvaluations.slice(0, 2)) {
    addSignal(accumulators, "general_physician", {
      priority: evaluation.severity,
      metric: evaluation.name,
    });
  }

  for (const prediction of riskPredictions.slice(0, 2)) {
    addSignal(accumulators, "general_physician", {
      priority: prediction.severity,
      risk: prediction.condition,
    });
  }

  if (emergencyAssessment?.requiresUrgentCare) {
    addSignal(accumulators, "general_physician", {
      priority: emergencyAssessment.severity,
      risk: emergencyAssessment.headline || "urgent care assessment",
    });
  } else {
    addSignal(accumulators, "general_physician", {
      priority: overallRisk,
    });
  }

  return (Object.entries(accumulators) as Array<[SpecialistKey, RecommendationAccumulator]>)
    .filter(([, accumulator]) => accumulator.enabled)
    .sort((left, right) => {
      const priorityDelta =
        riskOrder.indexOf(right[1].priority) - riskOrder.indexOf(left[1].priority);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return specialistSortOrder[left[0]] - specialistSortOrder[right[0]];
    })
    .map(([key, accumulator]) => ({
      specialist: accumulator.specialist,
      priority: accumulator.priority,
      reason: buildReason(key, accumulator),
    }));
}
