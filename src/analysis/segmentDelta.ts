import { TelemetrySample } from "./types";
import { round2 } from "./numberUtils";

/**
 * sessionTime é um timestamp absoluto da sessão (segundos, float do
 * protocolo do jogo) - duas voltas diferentes aconteceram em instantes
 * absolutos diferentes. Normalizamos subtraindo o sessionTime da primeira
 * amostra de cada volta, aproximando "tempo decorrido desde o início da
 * volta" (a primeira amostra decimada fica a poucos metros da linha de
 * largada, então o erro dessa aproximação é pequeno).
 *
 * Porta de src/components/chart/computeDelta.ts do frontend - duplicação
 * intencional (repositórios separados, mesma regra dos tipos WS/REST).
 */
function normalizeToLapStart(samples: TelemetrySample[]): TelemetrySample[] {
  if (samples.length === 0) return samples;
  const startTime = samples[0].sessionTime;
  return samples.map((s) => ({ ...s, sessionTime: s.sessionTime - startTime }));
}

function interpolateElapsedAtDistance(samples: TelemetrySample[], distance: number): number {
  const lastIndex = samples.length - 1;
  if (distance <= samples[0].lapDistance) return samples[0].sessionTime;
  if (distance >= samples[lastIndex].lapDistance) return samples[lastIndex].sessionTime;

  for (let i = 0; i < lastIndex; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (distance >= a.lapDistance && distance <= b.lapDistance) {
      const span = b.lapDistance - a.lapDistance;
      const ratio = span === 0 ? 0 : (distance - a.lapDistance) / span;
      return a.sessionTime + (b.sessionTime - a.sessionTime) * ratio;
    }
  }
  return samples[lastIndex].sessionTime;
}

/**
 * Delta acumulado (segundos) entre a volta principal e a de comparação,
 * ponto a ponto ao longo da distância da volta principal. Positivo =
 * principal está mais devagar (atrás) da comparação naquele ponto da pista.
 */
export function computeDelta(primary: TelemetrySample[], comparison: TelemetrySample[]): [number, number][] {
  if (primary.length === 0 || comparison.length === 0) return [];

  const normalizedPrimary = normalizeToLapStart(primary);
  const normalizedComparison = normalizeToLapStart(comparison);

  return normalizedPrimary.map((sample) => {
    const comparisonElapsed = interpolateElapsedAtDistance(normalizedComparison, sample.lapDistance);
    return [sample.lapDistance, sample.sessionTime - comparisonElapsed] as [number, number];
  });
}

// Delta ganho/perdido especificamente dentro de [startDistance, endDistance]
// (tipicamente os limites de uma curva): a diferença do delta acumulado
// entre o fim e o início do trecho isola a perda daquele segmento, sem
// carregar o delta acumulado de tudo que veio antes.
export function cornerLoss(deltaSeries: [number, number][], startDistance: number, endDistance: number): number {
  if (deltaSeries.length === 0) return 0;
  const startDelta = deltaAtDistance(deltaSeries, startDistance);
  const endDelta = deltaAtDistance(deltaSeries, endDistance);
  return round2(endDelta - startDelta);
}

// deltaSeries está ordenada por distância (mesma ordem das amostras da
// volta principal) - primeira amostra com distância >= alvo é a aproximação
// mais próxima sem precisar interpolar de novo.
function deltaAtDistance(deltaSeries: [number, number][], distance: number): number {
  for (const [d, value] of deltaSeries) {
    if (d >= distance) return value;
  }
  return deltaSeries[deltaSeries.length - 1][1];
}
