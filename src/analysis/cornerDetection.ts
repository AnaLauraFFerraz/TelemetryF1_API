import { TelemetrySample, MotionSample, Corner, CornerSeverity } from "./types";
import { commonGrid, curvature, geometricCorners, GRID_STEP_M, meanPath } from "./trackGeometry";

const SLOW_CORNER_MAX_KMH = 110;
const MEDIUM_CORNER_MAX_KMH = 180;

/**
 * Detecta as curvas como lugares da pista, pela geometria do traçado médio
 * das duas voltas: o mesmo conjunto em (A,B) e (B,A). Cada curva recebe o
 * trecho entre o ponto mais rápido antes e depois dela; brakingStartDistance
 * e exitDistance guardam os limites desse trecho. Sem movimento em uma das
 * voltas não há curvas.
 */
export function detectCorners(
  primaryTelemetry: TelemetrySample[],
  comparisonTelemetry: TelemetrySample[],
  primaryMotion: MotionSample[],
  comparisonMotion: MotionSample[]
): Corner[] {
  if (primaryTelemetry.length === 0 || comparisonTelemetry.length === 0) return [];
  if (primaryMotion.length === 0 || comparisonMotion.length === 0) return [];

  const grid = commonGrid(
    primaryMotion.map((sample) => sample.lapDistance),
    comparisonMotion.map((sample) => sample.lapDistance)
  );
  const geometric = geometricCorners(grid, curvature(meanPath(primaryMotion, comparisonMotion, grid), GRID_STEP_M));
  if (geometric.length === 0) return [];

  const meanSpeed = grid.map((distance) => (speedAt(primaryTelemetry, distance) + speedAt(comparisonTelemetry, distance)) / 2);
  const stretches = cornerStretches(
    grid,
    meanSpeed,
    geometric.map((corner) => grid.indexOf(corner.apexDistance))
  );

  return geometric.map((corner, i) => {
    const { from, to } = stretches[i];
    const isLast = i === geometric.length - 1;
    const primaryMin = minSpeedInStretch(primaryTelemetry, from, to, isLast) ?? speedAt(primaryTelemetry, corner.apexDistance);
    const comparisonMin = minSpeedInStretch(comparisonTelemetry, from, to, isLast);
    const meanMin = comparisonMin === null ? primaryMin : (primaryMin + comparisonMin) / 2;

    return {
      index: i,
      apexDistance: corner.apexDistance,
      apexSpeed: primaryMin,
      brakingStartDistance: from,
      exitDistance: to,
      severity: classifySeverity(meanMin),
    };
  });
}

// Fronteira entre duas curvas vizinhas: o ponto de maior velocidade média
// estritamente entre os dois ápices (primeiro em empate). Sem ponto entre
// eles, a fronteira cai no ápice da primeira.
export function cornerStretches(grid: number[], meanSpeed: number[], apexIndexes: number[]): { from: number; to: number }[] {
  if (apexIndexes.length === 0) return [];

  const bounds = [grid[0]];
  for (let i = 0; i < apexIndexes.length - 1; i++) {
    let fastest = -1;
    for (let j = apexIndexes[i] + 1; j < apexIndexes[i + 1]; j++) {
      if (fastest < 0 || meanSpeed[j] > meanSpeed[fastest]) fastest = j;
    }
    bounds.push(grid[fastest >= 0 ? fastest : apexIndexes[i]]);
  }
  bounds.push(grid[grid.length - 1]);

  return apexIndexes.map((_, i) => ({ from: bounds[i], to: bounds[i + 1] }));
}

// Trechos são [from, to); só o último inclui o fim da malha.
function minSpeedInStretch(samples: TelemetrySample[], from: number, to: number, includeEnd: boolean): number | null {
  let min: number | null = null;
  for (const sample of samples) {
    if (sample.lapDistance < from || sample.lapDistance > to) continue;
    if (!includeEnd && sample.lapDistance === to) continue;
    if (min === null || sample.speed < min) min = sample.speed;
  }
  return min;
}

function speedAt(samples: TelemetrySample[], distance: number): number {
  const last = samples.length - 1;
  if (distance <= samples[0].lapDistance) return samples[0].speed;
  if (distance >= samples[last].lapDistance) return samples[last].speed;
  for (let i = 0; i < last; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (distance >= a.lapDistance && distance <= b.lapDistance) {
      const span = b.lapDistance - a.lapDistance;
      return span === 0 ? a.speed : a.speed + ((b.speed - a.speed) * (distance - a.lapDistance)) / span;
    }
  }
  return samples[last].speed;
}

function classifySeverity(speedKmh: number): CornerSeverity {
  if (speedKmh <= SLOW_CORNER_MAX_KMH) return "slow";
  if (speedKmh <= MEDIUM_CORNER_MAX_KMH) return "medium";
  return "fast";
}
