export const MIN_DISTANCE_DELTA_M = 4;
export const MAX_TIME_GAP_MS = 500;

export interface DecimationState {
  lastDistance: number;
  lastTimeMs: number;
}

/**
 * Decide se uma amostra deve ser persistida, com base em quanto
 * tempo/distância passou desde a última amostra gravada. Híbrido:
 * decimar só por distância travaria a gravação com o carro parado
 * (garagem, pit); decimar só por tempo distribuiria os pontos de forma
 * desigual ao longo da volta (mais pontos em curvas lentas, menos em retas
 * rápidas) - o critério de tempo cobre o caso "parado", o de distância
 * garante espaçamento uniforme no eixo X dos gráficos.
 */
export function shouldPersistSample(
  last: DecimationState | undefined,
  currentDistance: number,
  currentTimeMs: number
): boolean {
  if (!last) return true;

  const distanceDelta = Math.abs(currentDistance - last.lastDistance);
  const timeDelta = currentTimeMs - last.lastTimeMs;

  return distanceDelta >= MIN_DISTANCE_DELTA_M || timeDelta >= MAX_TIME_GAP_MS;
}
