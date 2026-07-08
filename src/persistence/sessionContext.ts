import { PacketHeader } from "../telemetry/header/types";
import { LapData } from "../telemetry/lapData/types";
import { CarMotionData } from "../telemetry/motion/types";
import { CarTelemetryData } from "../telemetry/carTelemetry/types";
import { PacketSessionData } from "../telemetry/session/types";
import { getOrCreateSession, touchSession, setSessionTrackId } from "./sessionRepository";
import { upsertCompletedLap } from "./lapRepository";
import { insertCarTelemetrySample } from "./carTelemetrySampleRepository";
import { insertMotionSample } from "./motionSampleRepository";
import { createLapCompletionDetector, LapCompletionDetector } from "./lapCompletionDetector";
import { shouldPersistSample, DecimationState } from "./decimation";
import { LapProgressSnapshot } from "./types";

interface ActiveSession {
  sessionId: number;
  lapDetector: LapCompletionDetector;
  lastTouchedAt: number;
  lapProgress?: LapProgressSnapshot;
  carTelemetryDecimation?: DecimationState;
  carTelemetryDecimationLap?: number;
  motionDecimation?: DecimationState;
  motionDecimationLap?: number;
  trackId?: number;
}

// Estado em memória por sessão ativa (chave: sessionUID como string). Perdido
// no restart do processo - ver limitação conhecida no plano.
const activeSessions = new Map<string, ActiveSession>();

// getOrCreateSession já faz um UPDATE last_seen_at, mas só roda uma vez (na
// criação da sessão em memória) - sem isso, last_seen_at fica travado no
// valor de started_at pelo resto da sessão. Refresca no máximo a cada
// TOUCH_INTERVAL_MS para não gerar um UPDATE por pacote (até 60/s).
const TOUCH_INTERVAL_MS = 15_000;

function getActiveSession(header: PacketHeader): ActiveSession {
  const sessionUid = header.sessionUID.toString();

  let active = activeSessions.get(sessionUid);
  if (!active) {
    active = {
      sessionId: getOrCreateSession(header),
      lapDetector: createLapCompletionDetector(),
      lastTouchedAt: Date.now(),
    };
    activeSessions.set(sessionUid, active);
    return active;
  }

  const now = Date.now();
  if (now - active.lastTouchedAt >= TOUCH_INTERVAL_MS) {
    touchSession(active.sessionId);
    active.lastTouchedAt = now;
  }

  return active;
}

export function handleSessionPacket(header: PacketHeader, session: PacketSessionData): void {
  // trackId=-1 é "desconhecido" na spec do jogo - não grava lixo em cima de
  // um valor já conhecido. trackId cacheado em memória evita um UPDATE a
  // cada pacote de sessão (~2/s) depois de gravado uma vez.
  if (session.trackId < 0) return;

  const active = getActiveSession(header);
  if (active.trackId === session.trackId) return;

  setSessionTrackId(active.sessionId, session.trackId);
  active.trackId = session.trackId;
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
