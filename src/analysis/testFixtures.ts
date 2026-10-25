import { TelemetrySample, MotionSample } from "./types";

// Fábricas de amostras sintéticas pra testes do módulo analysis/. Não é um
// arquivo de teste (sem sufixo .test.ts) - fica de fora do glob do test
// runner, só fornece dados pros testes reais.
export function makeSample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    lapDistance: 0,
    sessionTime: 0,
    speed: 300,
    throttle: 1,
    brake: 0,
    steer: 0,
    gear: 8,
    engineRpm: 12000,
    drs: 0,
    tyrePressure: { rearLeft: 22, rearRight: 22, frontLeft: 22, frontRight: 22 },
    tyreSurfaceTemp: { rearLeft: 95, rearRight: 95, frontLeft: 95, frontRight: 95 },
    tyreInnerTemp: { rearLeft: 95, rearRight: 95, frontLeft: 95, frontRight: 95 },
    ...overrides,
  };
}

// Volta a velocidade constante: o sessionTime de cada amostra é o do início
// da volta mais lapDistance / speedMs, e as amostras vão de firstDistance a
// lastDistance de stepM em stepM (a última sempre incluída).
export function makeConstantSpeedLap(options: {
  speedMs: number;
  startSessionTime: number;
  firstDistance: number;
  lastDistance: number;
  stepM?: number;
}): TelemetrySample[] {
  const { speedMs, startSessionTime, firstDistance, lastDistance, stepM = 5 } = options;
  const distances: number[] = [];
  for (let d = firstDistance; d < lastDistance; d += stepM) distances.push(d);
  distances.push(lastDistance);
  return distances.map((d) => makeSample({ lapDistance: d, sessionTime: startSessionTime + d / speedMs, speed: speedMs * 3.6 }));
}

export function makeMotionSample(overrides: Partial<MotionSample> = {}): MotionSample {
  return {
    lapDistance: 0,
    sessionTime: 0,
    worldPosition: { x: 0, y: 0, z: 0 },
    gForce: { lat: 0, lon: 0, vert: 0 },
    ...overrides,
  };
}
