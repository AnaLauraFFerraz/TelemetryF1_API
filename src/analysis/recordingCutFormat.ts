import { MotionSample, TelemetrySample } from "./types";

export interface RecordingCutLap {
  lapNumber: number;
  lapTimeMs: number;
  isValid: boolean;
  telemetry: TelemetrySample[];
  motion: MotionSample[];
}

export interface RecordingCutInput {
  sourceSha256: string;
  laps: RecordingCutLap[];
}

type Wheels = TelemetrySample["tyreSurfaceTemp"];

interface CutTelemetry {
  lapDistance: number;
  sessionTime: number;
  speed: number;
  throttle: number;
  brake: number;
  steer: number;
  tyreSurfaceTemp: Wheels;
}

interface CutMotion {
  lapDistance: number;
  worldPosition: { x: number; z: number };
}

interface CutLap {
  lapNumber: number;
  lapTimeMs: number;
  isValid: boolean;
  telemetry: CutTelemetry[];
  motion: CutMotion[];
}

interface Cut {
  sourceSha256: string;
  laps: CutLap[];
}

// 9 algarismos significativos é a menor forma decimal que devolve cada
// float32 do jogo exatamente (research.md, seção 13).
function digits(value: number): number {
  return Number(value.toPrecision(9));
}

// O banco guarda o float32 do jogo como double; Math.fround devolve ao motor
// o mesmo double que ele lê do banco.
function f32(value: number): number {
  return Math.fround(value);
}

function writeWheels(wheels: Wheels): Wheels {
  return {
    rearLeft: digits(wheels.rearLeft),
    rearRight: digits(wheels.rearRight),
    frontLeft: digits(wheels.frontLeft),
    frontRight: digits(wheels.frontRight),
  };
}

function readWheels(wheels: Wheels): Wheels {
  return {
    rearLeft: f32(wheels.rearLeft),
    rearRight: f32(wheels.rearRight),
    frontLeft: f32(wheels.frontLeft),
    frontRight: f32(wheels.frontRight),
  };
}

const NO_WHEELS: Wheels = { rearLeft: 0, rearRight: 0, frontLeft: 0, frontRight: 0 };

export function toRecordingCut(input: RecordingCutInput): string {
  const cut: Cut = {
    sourceSha256: input.sourceSha256,
    laps: input.laps.map((lap) => ({
      lapNumber: lap.lapNumber,
      lapTimeMs: lap.lapTimeMs,
      isValid: lap.isValid,
      telemetry: lap.telemetry.map((sample) => ({
        lapDistance: digits(sample.lapDistance),
        sessionTime: digits(sample.sessionTime),
        speed: digits(sample.speed),
        throttle: digits(sample.throttle),
        brake: digits(sample.brake),
        steer: digits(sample.steer),
        tyreSurfaceTemp: writeWheels(sample.tyreSurfaceTemp),
      })),
      motion: lap.motion.map((sample) => ({
        lapDistance: digits(sample.lapDistance),
        worldPosition: { x: digits(sample.worldPosition.x), z: digits(sample.worldPosition.z) },
      })),
    })),
  };
  return JSON.stringify(cut);
}

export function fromRecordingCut(json: string): RecordingCutInput {
  const cut = JSON.parse(json) as Cut;
  return {
    sourceSha256: cut.sourceSha256,
    laps: cut.laps.map((lap) => ({
      lapNumber: lap.lapNumber,
      lapTimeMs: lap.lapTimeMs,
      isValid: lap.isValid,
      telemetry: lap.telemetry.map((sample) => ({
        lapDistance: f32(sample.lapDistance),
        sessionTime: f32(sample.sessionTime),
        speed: f32(sample.speed),
        throttle: f32(sample.throttle),
        brake: f32(sample.brake),
        steer: f32(sample.steer),
        gear: 0,
        engineRpm: 0,
        drs: 0,
        tyrePressure: { ...NO_WHEELS },
        tyreSurfaceTemp: readWheels(sample.tyreSurfaceTemp),
        tyreInnerTemp: { ...NO_WHEELS },
      })),
      motion: lap.motion.map((sample) => ({
        lapDistance: f32(sample.lapDistance),
        sessionTime: 0,
        worldPosition: { x: f32(sample.worldPosition.x), y: 0, z: f32(sample.worldPosition.z) },
        gForce: { lat: 0, lon: 0, vert: 0 },
      })),
    })),
  };
}
