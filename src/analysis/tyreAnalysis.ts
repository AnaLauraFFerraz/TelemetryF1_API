import { TelemetrySample, TyreWindowInsight, Wheel } from "./types";
import { classifyTyreTemp, TyreTempStatus } from "./tyreWindows";
import { round2 } from "./numberUtils";

const WHEELS: Wheel[] = ["rearLeft", "rearRight", "frontLeft", "frontRight"];

// Excursões mais curtas que isso são ruído/transição, não um trecho real
// onde o pneu ficou fora da janela.
const MIN_EXCURSION_DISTANCE_M = 30;

// Detecta trechos contínuos (por roda) em que a temperatura de superfície
// ficou fora da janela ideal. "ideal" nunca vira insight - só cold/hot.
export function findTyreWindowExcursions(samples: TelemetrySample[]): TyreWindowInsight[] {
  const excursions: TyreWindowInsight[] = [];
  for (const wheel of WHEELS) {
    excursions.push(...findExcursionsForWheel(samples, wheel));
  }
  return excursions;
}

function findExcursionsForWheel(samples: TelemetrySample[], wheel: Wheel): TyreWindowInsight[] {
  const excursions: TyreWindowInsight[] = [];

  let runStart: number | null = null;
  let runStatus: TyreTempStatus | null = null;
  let runTemps: number[] = [];

  function flush(endDistance: number): void {
    if (runStart !== null && runStatus !== null && runStatus !== "ideal" && endDistance - runStart >= MIN_EXCURSION_DISTANCE_M) {
      const avg = runTemps.reduce((a, b) => a + b, 0) / runTemps.length;
      excursions.push({
        wheel,
        distanceStart: runStart,
        distanceEnd: endDistance,
        avgTempC: round2(avg),
        status: runStatus as "cold" | "hot",
      });
    }
    runStart = null;
    runStatus = null;
    runTemps = [];
  }

  for (const sample of samples) {
    const temp = sample.tyreSurfaceTemp[wheel];
    const status = classifyTyreTemp(temp);

    if (runStatus === null) {
      runStart = sample.lapDistance;
      runStatus = status;
      runTemps = [temp];
    } else if (status === runStatus) {
      runTemps.push(temp);
    } else {
      flush(sample.lapDistance);
      runStart = sample.lapDistance;
      runStatus = status;
      runTemps = [temp];
    }
  }

  if (samples.length > 0) {
    flush(samples[samples.length - 1].lapDistance);
  }

  return excursions;
}
