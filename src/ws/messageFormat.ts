import { PacketHeader } from "../telemetry/header/types";

export type TelemetryMessageType = "motion" | "lapData" | "carTelemetry";

export interface TelemetryWsMessage<T = unknown> {
  type: TelemetryMessageType;
  sessionUID: string; // bigint serializado como string (JSON.stringify não aceita bigint)
  sessionTime: number;
  frameIdentifier: number;
  playerCarIndex: number; // índice do jogador no array de 22 - filtragem fica a cargo do frontend
  data: T[]; // array completo dos 22 carros, sem pré-filtro
}

const TYPE_BY_PACKET_ID: Partial<Record<number, TelemetryMessageType>> = {
  0: "motion",
  2: "lapData",
  6: "carTelemetry",
};

/**
 * Monta o envelope enviado ao frontend a partir do header já parseado e do
 * array de dados por carro do pacote (ex: PacketMotionData.carMotionData).
 * Retorna null se o packetId ainda não tiver um tipo de mensagem mapeado.
 */
export function buildWsMessage<T>(header: PacketHeader, packetId: number, data: T[]): TelemetryWsMessage<T> | null {
  const type = TYPE_BY_PACKET_ID[packetId];
  if (!type) return null;

  return {
    type,
    sessionUID: header.sessionUID.toString(),
    sessionTime: header.sessionTime,
    frameIdentifier: header.frameIdentifier,
    playerCarIndex: header.playerCarIndex,
    data,
  };
}
