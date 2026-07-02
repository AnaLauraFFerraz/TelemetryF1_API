/**
 * Todos os 15 tipos de pacote definidos na spec do F1 24. Documentamos os 15
 * aqui mesmo sem ter parser para todos ainda - deixa claro o que falta
 * implementar e evita "números mágicos" espalhados pelo código.
 */
export const PACKET_NAMES: Record<number, string> = {
  0: "motion",
  1: "session",
  2: "lapData",
  3: "event",
  4: "participants",
  5: "carSetups",
  6: "carTelemetry",
  7: "carStatus",
  8: "finalClassification",
  9: "lobbyInfo",
  10: "carDamage",
  11: "sessionHistory",
  12: "tyreSets",
  13: "motionEx",
  14: "timeTrial",
};

export function packetName(packetId: number): string {
  return PACKET_NAMES[packetId] ?? `unknown(${packetId})`;
}
