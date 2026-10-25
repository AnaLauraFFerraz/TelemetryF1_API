import { TelemetrySample } from "./types";
import { round2 } from "./numberUtils";

/**
 * sessionTime é um timestamp absoluto da sessão (segundos, float do
 * protocolo do jogo) - duas voltas diferentes aconteceram em instantes
 * absolutos diferentes. O início de cada volta é a primeira amostra
 * extrapolada até 0 m pela velocidade das duas primeiras: a primeira
 * amostra decimada cai de 1,7 a 4 m depois da linha, e onde o primeiro
 * pacote cai (taxa de envio, decimação) não é o início da volta
 * (research.md, seção 2.2).
 */
export function lapStartTime(samples: TelemetrySample[]): number {
  const first = samples[0];
  if (samples.length < 2) return first.sessionTime;
  const second = samples[1];
  const elapsed = second.sessionTime - first.sessionTime;
  const covered = second.lapDistance - first.lapDistance;
  if (elapsed <= 0 || covered <= 0) return first.sessionTime;
  return first.sessionTime - first.lapDistance * (elapsed / covered);
}

function elapsedAtDistance(samples: TelemetrySample[], startTime: number, distance: number): number {
  const lastIndex = samples.length - 1;
  if (distance <= samples[0].lapDistance) return samples[0].sessionTime - startTime;
  for (let i = 0; i < lastIndex; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (distance >= a.lapDistance && distance <= b.lapDistance) {
      const span = b.lapDistance - a.lapDistance;
      const ratio = span === 0 ? 0 : (distance - a.lapDistance) / span;
      return a.sessionTime + (b.sessionTime - a.sessionTime) * ratio - startTime;
    }
  }
  return samples[lastIndex].sessionTime - startTime;
}

// Distâncias que as duas voltas cobrem: fora dela uma das voltas teria de
// ser estendida, e o delta passaria a depender de qual volta é a principal.
export function commonRange(primary: TelemetrySample[], comparison: TelemetrySample[]): { from: number; to: number } | null {
  if (primary.length === 0 || comparison.length === 0) return null;
  const from = Math.max(primary[0].lapDistance, comparison[0].lapDistance);
  const to = Math.min(primary[primary.length - 1].lapDistance, comparison[comparison.length - 1].lapDistance);
  return from <= to ? { from, to } : null;
}

export function deltaAtDistance(primary: TelemetrySample[], comparison: TelemetrySample[], distance: number): number | null {
  const range = commonRange(primary, comparison);
  if (!range || distance < range.from || distance > range.to) return null;
  return (
    elapsedAtDistance(primary, lapStartTime(primary), distance) - elapsedAtDistance(comparison, lapStartTime(comparison), distance)
  );
}

export function totalDelta(primary: TelemetrySample[], comparison: TelemetrySample[]): number {
  const range = commonRange(primary, comparison);
  if (!range) return 0;
  return deltaAtDistance(primary, comparison, range.to) ?? 0;
}

/**
 * Delta acumulado (segundos) entre a volta principal e a de comparação,
 * nas distâncias da volta principal que as duas voltas cobrem. Positivo =
 * principal está mais devagar (atrás) da comparação naquele ponto da pista.
 *
 * Porta de src/components/chart/computeDelta.ts do frontend - duplicação
 * intencional (repositórios separados, mesma regra dos tipos WS/REST). A
 * cópia do frontend ainda usa a definição antiga e agora difere desta
 * (specs/005-analysis-engine-artifacts, FR-020). Esta é a referência da série
 * nova para a spec do frontend; o motor não a usa.
 */
export function computeDelta(primary: TelemetrySample[], comparison: TelemetrySample[]): [number, number][] {
  const range = commonRange(primary, comparison);
  if (!range) return [];

  return primary
    .filter((sample) => sample.lapDistance >= range.from && sample.lapDistance <= range.to)
    .map((sample) => [sample.lapDistance, deltaAtDistance(primary, comparison, sample.lapDistance) ?? 0] as [number, number]);
}

// Delta ganho/perdido especificamente dentro de [startDistance, endDistance]
// (o trecho de uma curva): a diferença do delta acumulado entre o fim e o
// início do trecho isola a perda daquele segmento, sem carregar o delta
// acumulado de tudo que veio antes. Os limites são presos à faixa comum.
export function cornerLoss(primary: TelemetrySample[], comparison: TelemetrySample[], startDistance: number, endDistance: number): number {
  const range = commonRange(primary, comparison);
  if (!range) return 0;
  const clamp = (distance: number) => Math.min(Math.max(distance, range.from), range.to);
  const startDelta = deltaAtDistance(primary, comparison, clamp(startDistance)) ?? 0;
  const endDelta = deltaAtDistance(primary, comparison, clamp(endDistance)) ?? 0;
  return round2(endDelta - startDelta);
}
