import { TelemetrySample, Corner, ThrottleInsight } from "./types";
import { findApexIndexNear, findThrottleOnIndex } from "./sampleSearch";
import { round2 } from "./numberUtils";

const CORNER_SEARCH_WINDOW_M = 80;
const THROTTLE_THRESHOLD = 0.9;
const COASTING_BRAKE_THRESHOLD = 0.05;
const COASTING_THROTTLE_THRESHOLD = 0.05;
// Variação de acelerador abaixo disso entre amostras consecutivas é ruído,
// não uma correção de traçado de verdade.
const OSCILLATION_MIN_DELTA = 0.02;

export function analyzeThrottle(
  corner: Corner,
  primarySamples: TelemetrySample[],
  comparisonSamples: TelemetrySample[]
): ThrottleInsight {
  const primaryApexIndex = findApexIndexNear(primarySamples, corner.apexDistance, CORNER_SEARCH_WINDOW_M);
  const comparisonApexIndex = findApexIndexNear(comparisonSamples, corner.apexDistance, CORNER_SEARCH_WINDOW_M);

  if (primaryApexIndex === null || comparisonApexIndex === null) {
    return {
      throttleOnDiffM: null,
      coastingTimePrimaryS: 0,
      coastingTimeComparisonS: 0,
      throttleOscillationPrimary: 0,
      throttleOscillationComparison: 0,
    };
  }

  const primaryExitIndex = findThrottleOnIndex(primarySamples, primaryApexIndex, THROTTLE_THRESHOLD);
  const comparisonExitIndex = findThrottleOnIndex(comparisonSamples, comparisonApexIndex, THROTTLE_THRESHOLD);

  const primaryExitDistance = primarySamples[primaryExitIndex].lapDistance;
  const comparisonExitDistance = comparisonSamples[comparisonExitIndex].lapDistance;

  return {
    throttleOnDiffM: round2(primaryExitDistance - comparisonExitDistance),
    coastingTimePrimaryS: coastingTime(primarySamples, primaryApexIndex, primaryExitIndex),
    coastingTimeComparisonS: coastingTime(comparisonSamples, comparisonApexIndex, comparisonExitIndex),
    throttleOscillationPrimary: throttleOscillation(primarySamples, primaryApexIndex, primaryExitIndex),
    throttleOscillationComparison: throttleOscillation(comparisonSamples, comparisonApexIndex, comparisonExitIndex),
  };
}

// Soma o tempo (s) entre apex e saída em que nem freio nem acelerador estão
// pressionados de forma significativa - "tempo morto" clássico de quem não
// decidiu ainda entre frear mais ou acelerar.
function coastingTime(samples: TelemetrySample[], startIndex: number, endIndex: number): number {
  let coastingMs = 0;
  for (let i = startIndex; i < endIndex; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.brake <= COASTING_BRAKE_THRESHOLD && a.throttle <= COASTING_THROTTLE_THRESHOLD) {
      coastingMs += b.sessionTime - a.sessionTime;
    }
  }
  return round2(coastingMs);
}

// Conta quantas vezes o acelerador muda de direção (sobe->desce->sobe) entre
// apex e saída - oscilação alta indica correção de tração/traçado na saída.
function throttleOscillation(samples: TelemetrySample[], startIndex: number, endIndex: number): number {
  let reversals = 0;
  let direction = 0;

  for (let i = startIndex; i < endIndex; i++) {
    const delta = samples[i + 1].throttle - samples[i].throttle;
    if (Math.abs(delta) < OSCILLATION_MIN_DELTA) continue;

    const newDirection = delta > 0 ? 1 : -1;
    if (direction !== 0 && newDirection !== direction) reversals++;
    direction = newDirection;
  }

  return reversals;
}
