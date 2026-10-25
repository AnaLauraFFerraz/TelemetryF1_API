import { TelemetrySample, Corner, ThrottleInsight, LapCornerBehaviour } from "./types";
import { lapBehaviourInStretch, lastIndexInStretch } from "./cornerBehaviour";
import { round2 } from "./numberUtils";

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
  const { brakingStartDistance: from, exitDistance: to } = corner;
  const primary = lapBehaviourInStretch(primarySamples, from, to);
  const comparison = lapBehaviourInStretch(comparisonSamples, from, to);

  const primaryOn = primary?.fullThrottleIndex ?? null;
  const comparisonOn = comparison?.fullThrottleIndex ?? null;

  // Do ponto mais lento até a retomada, ou até o fim do trecho se a volta
  // não voltou ao acelerador pleno nele.
  const range = (samples: TelemetrySample[], behaviour: LapCornerBehaviour | null): [number, number] | null =>
    behaviour ? [behaviour.slowestIndex, behaviour.fullThrottleIndex ?? lastIndexInStretch(samples, from, to)] : null;
  const primaryRange = range(primarySamples, primary);
  const comparisonRange = range(comparisonSamples, comparison);

  return {
    throttleOnDiffM:
      primaryOn !== null && comparisonOn !== null
        ? round2(primarySamples[primaryOn].lapDistance - comparisonSamples[comparisonOn].lapDistance)
        : null,
    fullThrottlePrimary: primary ? primaryOn !== null : null,
    fullThrottleComparison: comparison ? comparisonOn !== null : null,
    coastingTimePrimaryS: primaryRange ? coastingTime(primarySamples, ...primaryRange) : 0,
    coastingTimeComparisonS: comparisonRange ? coastingTime(comparisonSamples, ...comparisonRange) : 0,
    throttleOscillationPrimary: primaryRange ? throttleOscillation(primarySamples, ...primaryRange) : 0,
    throttleOscillationComparison: comparisonRange ? throttleOscillation(comparisonSamples, ...comparisonRange) : 0,
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
