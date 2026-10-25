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

export type PathSegment =
  | { kind: "straight"; lengthM: number }
  // side: 1 = curva no sentido em que o rumo (atan2(z, x)) cresce, -1 = o contrário
  | { kind: "arc"; lengthM: number; radiusM: number; side: 1 | -1 };

interface Pose {
  x: number;
  z: number;
  heading: number;
}

function advance(pose: Pose, segment: PathSegment, u: number): Pose {
  if (segment.kind === "straight") {
    return { x: pose.x + u * Math.cos(pose.heading), z: pose.z + u * Math.sin(pose.heading), heading: pose.heading };
  }
  const phi = (segment.side * u) / segment.radiusM;
  const cx = pose.x - segment.side * segment.radiusM * Math.sin(pose.heading);
  const cz = pose.z + segment.side * segment.radiusM * Math.cos(pose.heading);
  const rx = pose.x - cx;
  const rz = pose.z - cz;
  return {
    x: cx + rx * Math.cos(phi) - rz * Math.sin(phi),
    z: cz + rx * Math.sin(phi) + rz * Math.cos(phi),
    heading: pose.heading + phi,
  };
}

// Traçado conhecido (retas e arcos): a posição (x, z) em cada distância
// percorrida, para testar a geometria da pista sem uma gravação.
export function makePath(
  segments: PathSegment[]
): { lengthM: number; positionAt: (distance: number, lateralOffsetM?: number) => { x: number; z: number } } {
  const starts: { distance: number; pose: Pose }[] = [];
  let pose: Pose = { x: 0, z: 0, heading: 0 };
  let distance = 0;
  for (const segment of segments) {
    starts.push({ distance, pose });
    pose = advance(pose, segment, segment.lengthM);
    distance += segment.lengthM;
  }
  return {
    lengthM: distance,
    // lateralOffsetM: deslocamento para a esquerda do rumo (mesmo lado que
    // o desvio lateral de lineDeviation.ts chama de positivo).
    positionAt(d: number, lateralOffsetM = 0) {
      let i = starts.length - 1;
      while (i > 0 && starts[i].distance > d) i--;
      const pose = advance(starts[i].pose, segments[i], d - starts[i].distance);
      return { x: pose.x - lateralOffsetM * Math.sin(pose.heading), z: pose.z + lateralOffsetM * Math.cos(pose.heading) };
    },
  };
}

// Uma volta sobre o traçado: uma amostra de telemetria e uma de movimento a
// cada stepM metros (a última sempre incluída), com a velocidade dada em
// km/h por distância e o sessionTime integrado dela.
export function makeLapOnPath(
  path: ReturnType<typeof makePath>,
  options: {
    speedAt: (distance: number) => number;
    stepM?: number;
    firstDistance?: number;
    lastDistance?: number;
    startSessionTime?: number;
    sessionTimeAt?: (distance: number) => number;
    lateralOffsetM?: number;
    brakeAt?: (distance: number) => number;
    throttleAt?: (distance: number) => number;
  }
): { telemetry: TelemetrySample[]; motion: MotionSample[] } {
  const { speedAt, stepM = 5, firstDistance = 0, lastDistance = path.lengthM, startSessionTime = 0, lateralOffsetM = 0 } = options;
  const distances: number[] = [];
  for (let d = firstDistance; d < lastDistance; d += stepM) distances.push(d);
  distances.push(lastDistance);

  const telemetry: TelemetrySample[] = [];
  const motion: MotionSample[] = [];
  let sessionTime = startSessionTime;
  distances.forEach((d, i) => {
    if (options.sessionTimeAt) {
      sessionTime = options.sessionTimeAt(d);
    } else if (i > 0) {
      const meanSpeedMs = (speedAt(d) + speedAt(distances[i - 1])) / 2 / 3.6;
      sessionTime += (d - distances[i - 1]) / meanSpeedMs;
    }
    telemetry.push(
      makeSample({
        lapDistance: d,
        sessionTime,
        speed: speedAt(d),
        brake: options.brakeAt?.(d) ?? 0,
        throttle: options.throttleAt?.(d) ?? 1,
      })
    );
    const { x, z } = path.positionAt(d, lateralOffsetM);
    motion.push(makeMotionSample({ lapDistance: d, sessionTime, worldPosition: { x, y: 0, z } }));
  });
  return { telemetry, motion };
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
