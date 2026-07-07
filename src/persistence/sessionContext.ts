import { PacketHeader } from "../telemetry/header/types";
import { LapData } from "../telemetry/lapData/types";
import { CarMotionData } from "../telemetry/motion/types";
import { CarTelemetryData } from "../telemetry/carTelemetry/types";
import { getOrCreateSession } from "./sessionRepository";
import { upsertCompletedLap } from "./lapRepository";
import { insertCarTelemetrySample } from "./carTelemetrySampleRepository";
import { insertMotionSample } from "./motionSampleRepository";
import { createLapCompletionDetector, LapCompletionDetector } from "./lapCompletionDetector";
import { shouldPersistSample, DecimationState } from "./decimation";
import { LapProgressSnapshot } from "./types";

interface ActiveSession {
  sessionId: number;
  lapDetector: LapCompletionDetector;
  lapProgress?: LapProgressSnapshot;
  carTelemetryDecimation?: DecimationState;
  carTelemetryDecimationLap?: number;
  motionDecimation?: DecimationState;
  motionDecimationLap?: number;
}

// Estado em memória por sessão ativa (chave: sessionUID como string). Perdido
// no restart do processo - ver limitação conhecida no plano.
const activeSessions = new Map<string, ActiveSession>();

function getActiveSession(header: PacketHeader): ActiveSession {
  const sessionUid = header.sessionUID.toString();

  let active = activeSessions.get(sessionUid);
  if (!active) {
    active = {
      sessionId: getOrCreateSession(header),
      lapDetector: createLapCompletionDetector(),
    };
    activeSessions.set(sessionUid, active);
  }
  return active;
}

export function handleLapDataPacket(header: PacketHeader, player: LapData): void {
  const active = getActiveSession(header);

  const completed = active.lapDetector.process(player);
  if (completed) {
    upsertCompletedLap(active.sessionId, completed);
  }

  active.lapProgress = {
    lapNumber: player.currentLapNum,
    lapDistance: player.lapDistance,
    sessionTime: header.sessionTime,
  };
}

export function handleMotionPacket(header: PacketHeader, player: CarMotionData): void {
  const active = getActiveSession(header);
  if (!active.lapProgress) return; // ainda sem contexto de volta (nenhum LapData chegou ainda)

  if (active.motionDecimationLap !== active.lapProgress.lapNumber) {
    active.motionDecimation = undefined; // reseta decimação ao trocar de volta
    active.motionDecimationLap = active.lapProgress.lapNumber;
  }

  const currentTimeMs = header.sessionTime * 1000;
  if (!shouldPersistSample(active.motionDecimation, active.lapProgress.lapDistance, currentTimeMs)) {
    return;
  }

  insertMotionSample(
    active.sessionId,
    active.lapProgress.lapNumber,
    active.lapProgress.lapDistance,
    header.sessionTime,
    player
  );
  active.motionDecimation = { lastDistance: active.lapProgress.lapDistance, lastTimeMs: currentTimeMs };
}

export function handleCarTelemetryPacket(header: PacketHeader, player: CarTelemetryData): void {
  const active = getActiveSession(header);
  if (!active.lapProgress) return;

  if (active.carTelemetryDecimationLap !== active.lapProgress.lapNumber) {
    active.carTelemetryDecimation = undefined;
    active.carTelemetryDecimationLap = active.lapProgress.lapNumber;
  }

  const currentTimeMs = header.sessionTime * 1000;
  if (!shouldPersistSample(active.carTelemetryDecimation, active.lapProgress.lapDistance, currentTimeMs)) {
    return;
  }

  insertCarTelemetrySample(
    active.sessionId,
    active.lapProgress.lapNumber,
    active.lapProgress.lapDistance,
    header.sessionTime,
    player
  );
  active.carTelemetryDecimation = { lastDistance: active.lapProgress.lapDistance, lastTimeMs: currentTimeMs };
}
