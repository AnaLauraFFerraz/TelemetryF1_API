import { PacketHeader } from "../telemetry/header/types";
import { PacketMotionData } from "../telemetry/motion/types";
import { PacketSessionData } from "../telemetry/session/types";
import { PacketLapData } from "../telemetry/lapData/types";
import { PacketCarTelemetryData } from "../telemetry/carTelemetry/types";
import { handleLapDataPacket, handleMotionPacket, handleCarTelemetryPacket, handleSessionPacket } from "./sessionContext";

// Entry point único chamado por server.ts a cada pacote dispatchado. Sem SQL
// nem regra de negócio própria - só roteia por packetId para sessionContext.
export function persistTelemetry(header: PacketHeader, packetId: number, data: unknown): void {
  // sessionUID=0 é o que o jogo manda fora de uma sessão de verdade (menus) -
  // persistir isso criaria uma "sessão 0" fantasma no banco.
  if (header.sessionUID === 0n) return;

  if (packetId === 1) {
    handleSessionPacket(header, data as PacketSessionData);
    return;
  }

  if (packetId === 2) {
    const lapData = data as PacketLapData;
    handleLapDataPacket(header, lapData.lapData[header.playerCarIndex]);
    return;
  }

  if (packetId === 0) {
    const motion = data as PacketMotionData;
    handleMotionPacket(header, motion.carMotionData[header.playerCarIndex]);
    return;
  }

  if (packetId === 6) {
    const carTelemetry = data as PacketCarTelemetryData;
    handleCarTelemetryPacket(header, carTelemetry.carTelemetryData[header.playerCarIndex]);
    return;
  }
}
