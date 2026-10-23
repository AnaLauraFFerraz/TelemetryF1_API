// Mede, sem chamada paga e sem tocar no data/telemetry.db:
// 1. o WebSocket de verdade (ws, loopback) com a mensagem de um carro, sem e com
//    perMessageDeflate, contando os bytes que saem pelo socket do servidor e a CPU
//    do processo durante uma passada inteira enviada sem pausa;
// 2. o corpo da telemetria de uma volta (REST) sem compressão, com gzip e com brotli.
// Uso (na raiz do repositório):
//   npx ts-node --transpile-only --project tsconfig.json specs/003-demo-mode/evidence/measure-compression.ts <gravação.jsonl>
import fs from "node:fs";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket, type PerMessageDeflateOptions } from "ws";

process.env.DB_PATH = ":memory:";
/* eslint-disable @typescript-eslint/no-var-requires */
const { dispatchPacket } = require("../../../src/telemetry/dispatcher");
const { buildWsMessage } = require("../../../src/ws/messageFormat");
const { persistTelemetry } = require("../../../src/persistence/persistTelemetry");
const { listCarTelemetrySamplesForLap } = require("../../../src/persistence/carTelemetrySampleRepository");
const { listMotionSamplesForLap } = require("../../../src/persistence/motionSampleRepository");
/* eslint-enable @typescript-eslint/no-var-requires */

const lines = fs.readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.trim());
let firstTs = Infinity;
let lastTs = -Infinity;
const playerMessages: string[] = [];
const sizeByType: Record<string, { count: number; bytes: number }> = {};

for (const line of lines) {
  const { timestampMs, data } = JSON.parse(line) as { timestampMs: number; data: string };
  firstTs = Math.min(firstTs, timestampMs);
  lastTs = Math.max(lastTs, timestampMs);
  const result = dispatchPacket(Buffer.from(data, "base64"));
  if (!result) continue;
  persistTelemetry(result.header, result.packetId, result.data);
  const d = result.data as Record<string, unknown[] | undefined>;
  const arr = d.carMotionData ?? d.lapData ?? d.carTelemetryData;
  if (!arr) continue;
  const msg = buildWsMessage(result.header, result.packetId, arr);
  if (!msg) continue;
  const json = JSON.stringify({ ...msg, data: [arr[result.header.playerCarIndex]], playerCarIndex: 0 });
  playerMessages.push(json);
  const entry = (sizeByType[msg.type] ??= { count: 0, bytes: 0 });
  entry.count += 1;
  entry.bytes += Buffer.byteLength(json);
}
const seconds = (lastTs - firstTs) / 1000;
for (const [type, e] of Object.entries(sizeByType)) {
  console.log(`player-only ${type}: avg ${(e.bytes / e.count).toFixed(0)} B per message`);
}

async function measureWs(label: string, perMessageDeflate: false | PerMessageDeflateOptions): Promise<void> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", perMessageDeflate });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const port = (wss.address() as AddressInfo).port;
  const serverSide = new Promise<WebSocket>((resolve) => wss.once("connection", (ws) => resolve(ws)));
  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve) => client.once("open", () => resolve()));
  const ws = await serverSide;
  const socket = (ws as unknown as { _socket: import("node:net").Socket })._socket;

  let received = 0;
  const done = new Promise<void>((resolve) =>
    client.on("message", () => {
      received += 1;
      if (received === playerMessages.length) resolve();
    })
  );
  const before = socket.bytesWritten;
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  for (const json of playerMessages) ws.send(json);
  await done;
  const cpu = process.cpuUsage(cpu0);
  const wall = performance.now() - t0;
  const bytes = socket.bytesWritten - before;
  console.log(
    `ws ${label}: extension "${ws.extensions || "none"}", ${(bytes / 2 ** 20).toFixed(2)} MiB on the wire per pass, ` +
      `${(bytes / seconds / 1024).toFixed(1)} KiB/s at 1x, process CPU ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms per pass ` +
      `(${(((cpu.user + cpu.system) / 1e6 / seconds) * 100).toFixed(3)}% of one core at 1x; sender and receiver in one process), wall ${wall.toFixed(0)} ms`
  );
  client.close();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
}

// Mesmo envio, mas com o cliente num processo separado (ws-sink.mjs): a CPU medida
// aqui é só a do servidor (serialização já feita, compressão e escrita no socket).
async function measureWsServerOnly(label: string, perMessageDeflate: false | PerMessageDeflateOptions): Promise<void> {
  const { spawn } = await import("node:child_process");
  const path = await import("node:path");
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", perMessageDeflate });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const port = (wss.address() as AddressInfo).port;
  const serverSide = new Promise<WebSocket>((resolve) => wss.once("connection", (ws) => resolve(ws)));
  const sink = spawn(process.execPath, [path.join(__dirname, "ws-sink.mjs"), `ws://127.0.0.1:${port}`, String(playerMessages.length)]);
  const done = new Promise<void>((resolve) => sink.stdout.on("data", (chunk: Buffer) => chunk.toString().includes("done") && resolve()));
  const ws = await serverSide;
  const socket = (ws as unknown as { _socket: import("node:net").Socket })._socket;
  const before = socket.bytesWritten;
  const cpu0 = process.cpuUsage();
  for (const json of playerMessages) ws.send(json);
  await done;
  const cpu = process.cpuUsage(cpu0);
  const bytes = socket.bytesWritten - before;
  console.log(
    `ws server only, ${label}: ${(bytes / 2 ** 20).toFixed(2)} MiB per pass, ${(bytes / seconds / 1024).toFixed(1)} KiB/s at 1x, ` +
      `server CPU ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms per pass (${(((cpu.user + cpu.system) / 1e6 / seconds) * 100).toFixed(3)}% of one core at 1x)`
  );
  sink.kill();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
}

async function main(): Promise<void> {
  await measureWsServerOnly("uncompressed", false);
  await measureWsServerOnly("perMessageDeflate (defaults: context takeover)", {});
  await measureWsServerOnly("perMessageDeflate, zlib level 1", { zlibDeflateOptions: { level: 1 } });
  await measureWs("uncompressed", false);
  await measureWs("perMessageDeflate threshold 0, context takeover", { threshold: 0 });
  await measureWs("perMessageDeflate threshold 0, no context takeover", {
    threshold: 0,
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
  });
  await measureWs("perMessageDeflate default threshold (1024 B)", {});

  for (const lap of [6, 7, 8]) {
    const body = Buffer.from(JSON.stringify({ carTelemetry: listCarTelemetrySamplesForLap(1, lap), motion: listMotionSamplesForLap(1, lap) }));
    const time = (fn: () => Buffer) => {
      const t = performance.now();
      const out = fn();
      return { size: out.length, ms: performance.now() - t };
    };
    const gzip = time(() => zlib.gzipSync(body));
    const br4 = time(() => zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }));
    const br11 = time(() => zlib.brotliCompressSync(body));
    console.log(
      `REST lap ${lap} telemetry: raw ${body.length} B; gzip(6) ${gzip.size} B in ${gzip.ms.toFixed(1)} ms; ` +
        `brotli(4) ${br4.size} B in ${br4.ms.toFixed(1)} ms; brotli(11) ${br11.size} B in ${br11.ms.toFixed(1)} ms`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
