import { TelemetrySample, MotionSample, LapInsights, CornerInsight } from "./types";
import { detectCorners } from "./cornerDetection";
import { analyzeBraking } from "./brakingAnalysis";
import { analyzeThrottle } from "./throttleAnalysis";
import { computeDelta, cornerLoss } from "./segmentDelta";
import { computeLineDeviation, summarizeLineDeviation } from "./lineDeviation";
import { findTyreWindowExcursions } from "./tyreAnalysis";
import { round2 } from "./numberUtils";

export interface BuildInsightsInput {
  primaryTelemetry: TelemetrySample[];
  comparisonTelemetry: TelemetrySample[];
  primaryMotion: MotionSample[];
  comparisonMotion: MotionSample[];
}

// Orquestra as funções puras do módulo em um único JSON compacto de
// insights - é isso, e só isso, que a camada de IA (Fase 3) vai receber.
// Nunca passar amostras brutas pro LLM: custo, alucinação numérica e
// impossibilidade de testar a "análise" de forma determinística.
export function buildInsights(input: BuildInsightsInput): LapInsights {
  const { primaryTelemetry, comparisonTelemetry, primaryMotion, comparisonMotion } = input;

  const corners = detectCorners(primaryTelemetry);
  const deltaSeries = computeDelta(primaryTelemetry, comparisonTelemetry);
  const totalDeltaS = deltaSeries.length > 0 ? deltaSeries[deltaSeries.length - 1][1] : 0;

  const lineDeviations =
    primaryMotion.length > 0 && comparisonMotion.length > 0 ? computeLineDeviation(primaryMotion, comparisonMotion) : [];

  const cornerInsights: CornerInsight[] = corners.map((corner) => ({
    corner,
    deltaLossS: cornerLoss(deltaSeries, corner.brakingStartDistance, corner.exitDistance),
    braking: analyzeBraking(corner, primaryTelemetry, comparisonTelemetry),
    throttle: analyzeThrottle(corner, primaryTelemetry, comparisonTelemetry),
    lineDeviation: summarizeLineDeviation(lineDeviations, corner.brakingStartDistance, corner.exitDistance),
  }));

  return {
    totalDeltaS: round2(totalDeltaS),
    corners: cornerInsights,
    tyreWindowExcursions: findTyreWindowExcursions(primaryTelemetry),
  };
}
