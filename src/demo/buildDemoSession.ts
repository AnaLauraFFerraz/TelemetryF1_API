import { dispatchPacket } from "../telemetry/dispatcher";
import { persistTelemetry } from "../persistence/persistTelemetry";
import { listSessions } from "../persistence/sessionRepository";
import { DemoPacket } from "./recording";

export interface DemoSessionBuild {
  sessionId: number;
  sessionUid: string;
  firstReceivedAt: number | undefined;
  lastReceivedAt: number | undefined;
  completions: Array<{ lapNumber: number; receivedAt: number | undefined }>;
}

/**
 * Passa a gravação inteira pelo dispatcher e pela persistência de verdade, o
 * mais rápido possível, antes de o servidor aceitar visitas: a decimação usa
 * o sessionTime do jogo e a distância, não a hora de chegada, então o banco
 * fica igual ao de uma passada a 1x (research.md, ponto 3), sem a perda de
 * buffer do UDP.
 */
export function buildDemoSession(packets: DemoPacket[]): DemoSessionBuild {
  let sessionUid: string | undefined;
  let firstReceivedAt: number | undefined;
  let lastReceivedAt: number | undefined;
  const completions: DemoSessionBuild["completions"] = [];

  for (const packet of packets) {
    try {
      const result = dispatchPacket(packet.data);
      if (!result) continue;
      if (result.header.sessionUID !== 0n) {
        sessionUid ??= result.header.sessionUID.toString();
        if (firstReceivedAt === undefined) firstReceivedAt = packet.receivedAt;
        lastReceivedAt = packet.receivedAt;
      }
      const completed = persistTelemetry(result.header, result.packetId, result.data);
      if (completed) completions.push({ lapNumber: completed.lapNumber, receivedAt: packet.receivedAt });
    } catch (err) {
      console.error("[demo] pacote descartado na montagem:", err instanceof Error ? err.message : err);
    }
  }

  const session = listSessions().find((s) => s.sessionUid === sessionUid);
  if (!sessionUid || !session) {
    throw new Error("[demo] a gravação não tem nenhum pacote de sessão: não há sessão para montar.");
  }

  return { sessionId: session.id, sessionUid, firstReceivedAt, lastReceivedAt, completions };
}
