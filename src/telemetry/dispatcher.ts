import { parseHeader } from "./header/parseHeader";
import { PacketHeader } from "./header/types";
import { parseMotionPacket } from "./motion/parseMotion";
import { parseLapDataPacket } from "./lapData/parseLapData";
import { parseCarTelemetryPacket } from "./carTelemetry/parseCarTelemetry";

type PacketParser = (buffer: Buffer, header: PacketHeader) => unknown;

// Cada tipo de pacote implementado é registrado aqui. Os packetIds ainda não
// suportados (1,3,4,5,7-14 - ver telemetry/packetIds.ts) simplesmente não
// aparecem nesta tabela e são ignorados pelo dispatchPacket.
const PARSERS: Partial<Record<number, PacketParser>> = {
  0: parseMotionPacket,
  2: parseLapDataPacket,
  6: parseCarTelemetryPacket,
};

export interface DispatchedPacket {
  header: PacketHeader;
  packetId: number;
  data: unknown;
}

const SUPPORTED_PACKET_FORMAT = 2024;

export function dispatchPacket(buffer: Buffer): DispatchedPacket | null {
  // o packetId só é conhecido depois de ler o header, então ele é sempre
  // parseado primeiro, independente do tipo de pacote.
  const header = parseHeader(buffer);

  if (header.packetFormat !== SUPPORTED_PACKET_FORMAT) {
    throw new Error(
      `Formato de pacote não suportado: ${header.packetFormat}. Esperado ${SUPPORTED_PACKET_FORMAT} - ` +
        `confira se o jogo está com "UDP Format" = 2024 no menu de telemetria.`
    );
  }

  const parser = PARSERS[header.packetId];
  if (!parser) {
    return null;
  }

  return { header, packetId: header.packetId, data: parser(buffer, header) };
}
