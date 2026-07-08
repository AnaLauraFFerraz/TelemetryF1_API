import { BufferCursor } from "../shared/BufferCursor";
import { HEADER_SIZE } from "../shared/constants";
import { PacketHeader } from "../header/types";
import { PacketSessionData } from "./types";

/**
 * Parser MÍNIMO do PacketSessionData (id 1) - lê só os campos que
 * precisamos (sessionType, trackId) e para por aí. O struct completo é
 * grande e tem arrays de tamanho variável (marshal zones, previsão do
 * tempo) que não usamos agora - por isso, diferente dos outros parsers
 * deste projeto, este NÃO consome o pacote inteiro e não valida
 * assertBytesRead contra o tamanho total (não faz sentido aqui).
 */
export function parseSessionPacket(buffer: Buffer, header: PacketHeader): PacketSessionData {
  const cursor = new BufferCursor(buffer, HEADER_SIZE);

  cursor.readUInt8(); // m_weather
  cursor.readInt8(); // m_trackTemperature
  cursor.readInt8(); // m_airTemperature
  cursor.readUInt8(); // m_totalLaps
  cursor.readUInt16LE(); // m_trackLength
  const sessionType = cursor.readUInt8();
  const trackId = cursor.readInt8();

  return { header, trackId, sessionType };
}
