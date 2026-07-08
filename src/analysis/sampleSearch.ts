import { TelemetrySample } from "./types";

/**
 * Índice da amostra de menor velocidade dentro de [distance-windowM,
 * distance+windowM]. Usado pra achar o apex "equivalente" numa volta de
 * comparação, cujas próprias curvas não foram detectadas - a referência
 * espacial (onde procurar) sempre vem da volta principal.
 */
export function findApexIndexNear(samples: TelemetrySample[], distance: number, windowM: number): number | null {
  let bestIndex: number | null = null;
  let bestSpeed = Infinity;

  for (let i = 0; i < samples.length; i++) {
    const d = samples[i].lapDistance;
    if (d < distance - windowM || d > distance + windowM) continue;
    if (samples[i].speed < bestSpeed) {
      bestSpeed = samples[i].speed;
      bestIndex = i;
    }
  }

  return bestIndex;
}

// Caminha pra trás a partir do apex enquanto a amostra anterior ainda está
// freando; para no primeiro ponto (mais próximo do apex) em que o freio já
// estava ativo - aproximação do início real da frenagem.
export function findBrakingStartIndex(samples: TelemetrySample[], apexIndex: number, brakeThreshold: number): number {
  let i = apexIndex;
  while (i > 0 && samples[i - 1].brake > brakeThreshold) {
    i--;
  }
  return i;
}

// Caminha pra frente a partir do apex até o acelerador cruzar o threshold -
// primeiro ponto de "full throttle" na saída da curva.
export function findThrottleOnIndex(samples: TelemetrySample[], apexIndex: number, throttleThreshold: number): number {
  let i = apexIndex;
  while (i < samples.length - 1 && samples[i].throttle < throttleThreshold) {
    i++;
  }
  return i;
}

export function peakInRange(
  samples: TelemetrySample[],
  field: "brake" | "throttle",
  startDistance: number,
  endDistance: number
): number {
  let peak = 0;
  for (const s of samples) {
    if (s.lapDistance < startDistance || s.lapDistance > endDistance) continue;
    peak = Math.max(peak, s[field]);
  }
  return peak;
}
