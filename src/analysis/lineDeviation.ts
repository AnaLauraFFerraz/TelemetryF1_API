import { MotionSample, LineDeviationInsight } from "./types";
import { round2 } from "./numberUtils";

interface Point2D {
  x: number;
  z: number;
}

export interface LineDeviationPoint {
  distance: number;
  deviationM: number;
}

function toPoint(sample: MotionSample): Point2D {
  return { x: sample.worldPosition.x, z: sample.worldPosition.z };
}

function interpolatePositionAtDistance(samples: MotionSample[], distance: number): Point2D {
  const lastIndex = samples.length - 1;
  if (distance <= samples[0].lapDistance) return toPoint(samples[0]);
  if (distance >= samples[lastIndex].lapDistance) return toPoint(samples[lastIndex]);

  for (let i = 0; i < lastIndex; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (distance >= a.lapDistance && distance <= b.lapDistance) {
      const span = b.lapDistance - a.lapDistance;
      const ratio = span === 0 ? 0 : (distance - a.lapDistance) / span;
      return {
        x: a.worldPosition.x + (b.worldPosition.x - a.worldPosition.x) * ratio,
        z: a.worldPosition.z + (b.worldPosition.z - a.worldPosition.z) * ratio,
      };
    }
  }
  return toPoint(samples[lastIndex]);
}

// Vetor tangente local da linha de comparação em `distance` - sem ele não dá
// pra saber se o desvio é pra um lado ou pro outro da pista, só a magnitude.
function tangentAt(samples: MotionSample[], distance: number, deltaM: number): Point2D {
  const before = interpolatePositionAtDistance(samples, distance - deltaM);
  const after = interpolatePositionAtDistance(samples, distance + deltaM);
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

/**
 * Desvio lateral com sinal entre a volta principal e a de comparação,
 * casado por lapDistance (posição absoluta na pista é impossível - o UDP
 * não transmite a geometria da pista, só a posição do carro; a única
 * referência disponível é a linha da própria volta de comparação). O sinal
 * é arbitrário (perpendicular à direita da tangente da comparação) - o que
 * importa é a consistência ao longo da volta pra "abriu"/"fechou" fazer
 * sentido relativo entre pontos.
 */
export function computeLineDeviation(primary: MotionSample[], comparison: MotionSample[]): LineDeviationPoint[] {
  if (primary.length === 0 || comparison.length === 0) return [];

  return primary.map((sample) => {
    const comparisonPos = interpolatePositionAtDistance(comparison, sample.lapDistance);
    const tangent = tangentAt(comparison, sample.lapDistance, 10);
    const normal = { x: -tangent.z, z: tangent.x };

    const dx = sample.worldPosition.x - comparisonPos.x;
    const dz = sample.worldPosition.z - comparisonPos.z;

    return { distance: sample.lapDistance, deviationM: round2(dx * normal.x + dz * normal.z) };
  });
}

export function summarizeLineDeviation(
  deviations: LineDeviationPoint[],
  startDistance: number,
  endDistance: number
): LineDeviationInsight | null {
  const inRange = deviations.filter((d) => d.distance >= startDistance && d.distance <= endDistance);
  if (inRange.length === 0) return null;

  const maxAbs = Math.max(...inRange.map((d) => Math.abs(d.deviationM)));
  const avg = inRange.reduce((sum, d) => sum + d.deviationM, 0) / inRange.length;

  return {
    maxLateralDeviationM: round2(maxAbs),
    avgLateralDeviationM: round2(avg),
  };
}
