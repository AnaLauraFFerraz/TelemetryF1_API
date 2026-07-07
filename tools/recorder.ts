import fs from "node:fs";
import path from "node:path";
import { env } from "../src/config/env";
import { startUdpListener } from "../src/network/udpListener";

/**
 * Grava, sem interpretar, cada pacote UDP recebido em um arquivo .jsonl.
 * Serve para capturar uma sessão real do jogo e depois reproduzi-la
 * (tools/replayer.ts) sem precisar do simulador ligado o tempo todo.
 *
 * Formato de cada linha: { timestampMs, receivedAt, size, data(base64) }
 * - timestampMs: tempo relativo desde o início da gravação
 * - receivedAt: timestamp absoluto (epoch ms), útil para debug
 * - size: tamanho do buffer em bytes (permite checar sem decodificar)
 * - data: o pacote UDP cru, em base64
 */

const recordingsDir = path.resolve(__dirname, "..", "recordings");
fs.mkdirSync(recordingsDir, { recursive: true });

const fileName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
const filePath = path.join(recordingsDir, fileName);
const outStream = fs.createWriteStream(filePath, { flags: "a" });

const startedAt = Date.now();
let packetCount = 0;

console.log(`[recorder] gravando pacotes UDP da porta ${env.udpPort} em ${filePath}`);
console.log("[recorder] pressione Ctrl+C para parar");

const socket = startUdpListener(env.udpPort, (buffer) => {
  const line = {
    timestampMs: Date.now() - startedAt,
    receivedAt: Date.now(),
    size: buffer.length,
    data: buffer.toString("base64"),
  };

  outStream.write(JSON.stringify(line) + "\n");
  packetCount += 1;

  if (packetCount % 100 === 0) {
    console.log(`[recorder] ${packetCount} pacotes gravados...`);
  }
});

function shutdown(): void {
  console.log(`\n[recorder] parando. Total de pacotes gravados: ${packetCount}`);
  socket.close();
  outStream.end(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
