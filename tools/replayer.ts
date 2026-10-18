import fs from "node:fs";
import readline from "node:readline";
import dgram from "node:dgram";
import { setTimeout as delay } from "node:timers/promises";
import { env } from "../src/config/env";
import { runReplay } from "../src/replay/runner";
import { RecordedPacket, ReplayOptions } from "../src/replay/types";

/**
 * Lê um arquivo .jsonl gravado por tools/recorder.ts e reenvia cada pacote
 * via UDP para a própria API (127.0.0.1:UDP_PORT), respeitando o
 * timestampMs original de cada um - como se fosse o jogo transmitindo em
 * tempo real. Lê o arquivo inteiro antes de mandar qualquer pacote, pra
 * poder validar e reportar a duração/contagem de antemão (FR-006/FR-007).
 */

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: npm run replay -- <caminho-do-arquivo.jsonl>");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`[replayer] arquivo não encontrado: ${filePath}`);
  process.exit(1);
}

function readRecordingSync(path: string): RecordedPacket[] {
  const packets: RecordedPacket[] = [];
  const lines = fs.readFileSync(path, "utf8").split("\n");

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      const { timestampMs, data } = JSON.parse(line) as { timestampMs: number; data: string };
      packets.push({ timestampMs, data: Buffer.from(data, "base64") });
    } catch (err) {
      console.error(
        `[replayer] linha ${index + 1} ignorada (não foi possível interpretar): ${err instanceof Error ? err.message : err}`
      );
    }
  }

  return packets;
}

async function main(): Promise<void> {
  const packets = readRecordingSync(filePath);

  if (packets.length === 0) {
    console.error(`[replayer] gravação vazia (nenhuma linha válida encontrada em ${filePath})`);
    process.exit(1);
  }

  const options: ReplayOptions = { speed: "1x", loop: false };

  const timestamps = packets.map((p) => p.timestampMs);
  const durationMs = Math.max(...timestamps) - Math.min(...timestamps);

  console.log(
    `[replayer] ${filePath} - velocidade=${options.speed} loop=${options.loop} ` +
      `${packets.length} pacotes, duração original ${durationMs}ms`
  );

  const socket = dgram.createSocket("udp4");
  const controller = new AbortController();

  function shutdown(): void {
    controller.abort();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const result = await runReplay(packets, options, {
    send: (buffer) => {
      socket.send(buffer, env.udpPort, "127.0.0.1", (err) => {
        if (err) console.error("[replayer] erro ao reenviar pacote:", err);
      });
    },
    wait: (ms) => delay(ms, undefined, { signal: controller.signal }),
  });

  console.log(`[replayer] ${result.packetsSent} pacotes reenviados, ${result.passes} passada(s)`);

  process.off("SIGINT", shutdown);
  process.off("SIGTERM", shutdown);
  socket.close();
}

main();
