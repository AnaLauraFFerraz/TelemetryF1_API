import { LapCornerBehaviour, TelemetrySample } from "./types";

export const BRAKE_THRESHOLD = 0.1;
export const FULL_THROTTLE_THRESHOLD = 0.9;

// Primeira e última amostra com lapDistance em [from, to), ou null se não há.
function stretchRange(samples: TelemetrySample[], from: number, to: number): { first: number; last: number } | null {
  const first = samples.findIndex((sample) => sample.lapDistance >= from);
  if (first < 0 || samples[first].lapDistance >= to) return null;

  let last = first;
  while (last + 1 < samples.length && samples[last + 1].lapDistance < to) last++;
  return { first, last };
}

export function lastIndexInStretch(samples: TelemetrySample[], from: number, to: number): number {
  return stretchRange(samples, from, to)?.last ?? -1;
}

/**
 * O que a volta fez dentro do trecho [from, to) de uma curva, medido só nas
 * amostras dela que caem ali: o ponto mais lento (o primeiro, em empate), o
 * início da última fase de frenagem que termina nele ou antes e o pico dessa
 * fase, e a primeira amostra com acelerador pleno a partir dele. Volta que
 * não freou ou não chegou ao acelerador pleno no trecho tem null nesses
 * campos (é um fato, não um dado desconhecido); sem amostra no trecho, null.
 */
export function lapBehaviourInStretch(samples: TelemetrySample[], from: number, to: number): LapCornerBehaviour | null {
  const range = stretchRange(samples, from, to);
  if (!range) return null;
  const { first, last } = range;

  let slowestIndex = first;
  for (let i = first + 1; i <= last; i++) {
    if (samples[i].speed < samples[slowestIndex].speed) slowestIndex = i;
  }

  let brakingEnd = slowestIndex;
  while (brakingEnd >= first && samples[brakingEnd].brake <= BRAKE_THRESHOLD) brakingEnd--;

  let brakingStartIndex: number | null = null;
  let brakingPeak = 0;
  if (brakingEnd >= first) {
    brakingStartIndex = brakingEnd;
    while (brakingStartIndex - 1 >= first && samples[brakingStartIndex - 1].brake > BRAKE_THRESHOLD) brakingStartIndex--;
    for (let i = brakingStartIndex; i <= brakingEnd; i++) brakingPeak = Math.max(brakingPeak, samples[i].brake);
  }

  let fullThrottle = slowestIndex;
  while (fullThrottle <= last && samples[fullThrottle].throttle < FULL_THROTTLE_THRESHOLD) fullThrottle++;

  return { slowestIndex, brakingStartIndex, brakingPeak, fullThrottleIndex: fullThrottle <= last ? fullThrottle : null };
}
