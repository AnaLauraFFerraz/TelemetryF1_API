import { applySessionCaptureTimes } from "../persistence/sessionRepository";
import { applyLapCaptureTimes } from "../persistence/lapRepository";
import type { CaptureTimes } from "./captureTimes";

// Separado de captureTimes.ts de propósito: os repositórios abrem o banco no
// import (persistence/db), e captureTimes.ts precisa continuar puro.
export function applyCaptureTimes(sessionId: number, times: CaptureTimes): void {
  applySessionCaptureTimes(sessionId, times.startedAt, times.lastSeenAt);
  for (const [lapNumber, recordedAt] of times.lapRecordedAt) {
    applyLapCaptureTimes(sessionId, lapNumber, recordedAt);
  }
}
