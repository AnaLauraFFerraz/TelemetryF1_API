// Progresso de volta mais recente conhecido para uma sessão, atualizado a
// cada LapData recebido. Usado para taguear samples de Motion/CarTelemetry,
// que não trazem lapNumber/lapDistance no próprio pacote.
export interface LapProgressSnapshot {
  lapNumber: number;
  lapDistance: number;
  sessionTime: number;
}

export interface CompletedLap {
  lapNumber: number;
  lapTimeMs: number;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  isValid: boolean;
  carPosition: number;
}
