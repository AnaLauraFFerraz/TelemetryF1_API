import { TelemetrySample, Corner, CornerSeverity } from "./types";
import { movingAverage } from "./smoothing";
import { findBrakingStartIndex, findThrottleOnIndex } from "./sampleSearch";

const SMOOTHING_WINDOW = 5;
// Diferença mínima de velocidade (km/h) entre um mínimo local e os pontos
// mais altos ao redor, dos dois lados, pra contar como curva de verdade e
// não ruído de amostragem numa reta.
const MIN_PROMINENCE_KMH = 15;
// Mínimos a menos de 50m um do outro são tratados como uma curva composta
// (chicane) em vez de duas curvas separadas.
const MERGE_DISTANCE_M = 50;

const BRAKE_THRESHOLD = 0.1;
const THROTTLE_THRESHOLD = 0.9;

const SLOW_CORNER_MAX_KMH = 110;
const MEDIUM_CORNER_MAX_KMH = 180;

/**
 * Detecta curvas a partir da série de velocidade x distância: suaviza,
 * acha mínimos locais com proeminência mínima (filtra ruído), funde
 * mínimos próximos (chicanes) e delimita cada curva do início da frenagem
 * até a retomada de acelerador pleno.
 */
export function detectCorners(samples: TelemetrySample[]): Corner[] {
  if (samples.length < 3) return [];

  const speedSeries: [number, number][] = samples.map((s) => [s.lapDistance, s.speed]);
  const smoothed = movingAverage(speedSeries, SMOOTHING_WINDOW);

  const minimaIndices = findLocalMinima(smoothed, MIN_PROMINENCE_KMH);
  const mergedIndices = mergeCloseMinima(smoothed, minimaIndices, MERGE_DISTANCE_M);

  return mergedIndices.map((apexIndex, i) => buildCorner(samples, apexIndex, i));
}

function findLocalMinima(series: [number, number][], minProminence: number): number[] {
  const minima: number[] = [];

  for (let i = 1; i < series.length - 1; i++) {
    const value = series[i][1];
    const isLocalMin = value < series[i - 1][1] && value <= series[i + 1][1];
    if (isLocalMin && hasProminence(series, i, minProminence)) {
      minima.push(i);
    }
  }

  return minima;
}

function hasProminence(series: [number, number][], index: number, minProminence: number): boolean {
  const value = series[index][1];

  let leftRise = 0;
  for (let i = index - 1; i >= 0; i--) {
    leftRise = Math.max(leftRise, series[i][1] - value);
    if (leftRise >= minProminence) break;
  }

  let rightRise = 0;
  for (let i = index + 1; i < series.length; i++) {
    rightRise = Math.max(rightRise, series[i][1] - value);
    if (rightRise >= minProminence) break;
  }

  return leftRise >= minProminence && rightRise >= minProminence;
}

// Mantém, de cada grupo de mínimos a menos de mergeDistanceM entre si, só o
// de menor velocidade (o apex "de verdade" da curva composta).
function mergeCloseMinima(series: [number, number][], indices: number[], mergeDistanceM: number): number[] {
  if (indices.length === 0) return [];

  const merged: number[] = [indices[0]];

  for (let i = 1; i < indices.length; i++) {
    const current = indices[i];
    const lastMerged = merged[merged.length - 1];
    const distanceApart = series[current][0] - series[lastMerged][0];

    if (distanceApart < mergeDistanceM) {
      if (series[current][1] < series[lastMerged][1]) {
        merged[merged.length - 1] = current;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function buildCorner(samples: TelemetrySample[], apexIndex: number, cornerNumber: number): Corner {
  const apex = samples[apexIndex];
  const brakingStartIndex = findBrakingStartIndex(samples, apexIndex, BRAKE_THRESHOLD);
  const exitIndex = findThrottleOnIndex(samples, apexIndex, THROTTLE_THRESHOLD);

  return {
    index: cornerNumber,
    apexDistance: apex.lapDistance,
    apexSpeed: apex.speed,
    brakingStartDistance: samples[brakingStartIndex].lapDistance,
    exitDistance: samples[exitIndex].lapDistance,
    severity: classifySeverity(apex.speed),
  };
}

function classifySeverity(apexSpeedKmh: number): CornerSeverity {
  if (apexSpeedKmh <= SLOW_CORNER_MAX_KMH) return "slow";
  if (apexSpeedKmh <= MEDIUM_CORNER_MAX_KMH) return "medium";
  return "fast";
}
