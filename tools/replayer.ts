import fs from "node:fs";
import readline from "node:readline";
import dgram from "node:dgram";
import { env } from "../src/config/env";

/**
 * Lê um arquivo .jsonl gravado por tools/recorder.ts e reenvia cada pacote
 * via UDP para a própria API (127.0.0.1:UDP_PORT), como se fosse o jogo
 * transmitindo. Permite desenvolver/testar os parsers sem depender do
 * simulador ligado.
 *
 * Primeira versão: reenvia o mais rápido possível, sem respeitar o
 * timestampMs original de cada pacote (replay "rápido", não em tempo real).
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

const socket = dgram.createSocket("udp4");
const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

let sentCount = 0;

rl.on("line", (line) => {
  if (!line.trim()) return;

  const { data } = JSON.parse(line) as { data: string };
  const buffer = Buffer.from(data, "base64");

  socket.send(buffer, env.udpPort, "127.0.0.1", (err) => {
    if (err) console.error("[replayer] erro ao reenviar pacote:", err);
  });

  sentCount += 1;
});

rl.on("close", () => {
  console.log(`[replayer] ${sentCount} pacotes reenviados de ${filePath}`);
  socket.close();
});
