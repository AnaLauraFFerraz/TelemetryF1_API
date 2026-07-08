import { CarTelemetrySampleRow } from "../persistence/carTelemetrySampleRepository";
import { MotionSampleRow } from "../persistence/motionSampleRepository";

// Reexporta os tipos de amostra da camada de persistência - o módulo de
// análise consome exatamente o que o REST já devolve, sem tipo próprio
// duplicado (diferente do frontend, que é outro repositório).
export type TelemetrySample = CarTelemetrySampleRow;
export type MotionSample = MotionSampleRow;

export type Wheel = "rearLeft" | "rearRight" | "frontLeft" | "frontRight";

export type CornerSeverity = "slow" | "medium" | "fast";

export interface Corner {
  index: number;
  apexDistance: number;
  apexSpeed: number;
  brakingStartDistance: number;
  exitDistance: number;
  severity: CornerSeverity;
}

export interface BrakingInsight {
  // primaryDistance - comparisonDistance: negativo = principal freou antes
  // (mais longe da curva) que a comparação.
  brakingPointDiffM: number | null;
  peakBrakeDiff: number | null;
  trailBrakingPrimary: boolean;
  trailBrakingComparison: boolean;
}

export interface ThrottleInsight {
  // primaryDistance - comparisonDistance: positivo = principal voltou ao
  // acelerador depois (mais longe da curva) que a comparação.
  throttleOnDiffM: number | null;
  coastingTimePrimaryS: number;
  coastingTimeComparisonS: number;
  throttleOscillationPrimary: number;
  throttleOscillationComparison: number;
}

export interface LineDeviationInsight {
  maxLateralDeviationM: number;
  avgLateralDeviationM: number;
}

export interface TyreWindowInsight {
  wheel: Wheel;
  distanceStart: number;
  distanceEnd: number;
  avgTempC: number;
  status: "cold" | "hot";
}

export interface CornerInsight {
  corner: Corner;
  // Delta acumulado (segundos) perdido/ganho pela volta principal nesta
  // curva especificamente, positivo = principal mais lenta que a comparação.
  deltaLossS: number;
  braking: BrakingInsight;
  throttle: ThrottleInsight;
  lineDeviation: LineDeviationInsight | null;
}

export interface LapInsights {
  totalDeltaS: number;
  corners: CornerInsight[];
  tyreWindowExcursions: TyreWindowInsight[];
}
