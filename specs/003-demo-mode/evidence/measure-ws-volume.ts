// Mede o volume que cada conexão WebSocket recebe hoje, sem banco e sem rede:
// passa a gravação pelos parsers reais e serializa cada mensagem com buildWsMessage.
// Uso (na raiz do repositório):
//   npx ts-node --transpile-only --project tsconfig.json specs/003-demo-mode/evidence/measure-ws-volume.ts <gravação.jsonl>
import fs from "node:fs";
import zlib from "node:zlib";
import { dispatchPacket } from "../../../src/telemetry/dispatcher";
import { buildWsMessage } from "../../../src/ws/messageFormat";

const lines = fs.readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.trim());
const bytesByType: Record<string, { count: number; bytes: number }> = {};
let firstTs = Infinity;
let lastTs = -Infinity;
let deflated = 0;
let deflatedFast = 0;
let playerOnly = 0;
let playerDeflated = 0;
let deflateNs = 0n;
let deflateFastNs = 0n;
let playerDeflateNs = 0n;

for (const line of lines) {
  const { timestampMs, data } = JSON.parse(line) as { timestampMs: number; data: string };
  firstTs = Math.min(firstTs, timestampMs);
  lastTs = Math.max(lastTs, timestampMs);
  const result = dispatchPacket(Buffer.from(data, "base64"));
  if (!result) continue;
  const d = result.data as Record<string, unknown>;
  const arr = (d.carMotionData ?? d.lapData ?? d.carTelemetryData) as unknown[] | undefined;
  if (!arr) continue;
  const msg = buildWsMessage(result.header, result.packetId, arr);
  if (!msg) continue;

  const json = JSON.stringify(msg);
  const entry = (bytesByType[msg.type] ??= { count: 0, bytes: 0 });
  entry.count += 1;
  entry.bytes += Buffer.byteLength(json);

  const t0 = process.hrtime.bigint();
  deflated += zlib.deflateRawSync(json).length;
  deflateNs += process.hrtime.bigint() - t0;
  const t1 = process.hrtime.bigint();
  deflatedFast += zlib.deflateRawSync(json, { level: 1 }).length;
  deflateFastNs += process.hrtime.bigint() - t1;

  const playerJson = JSON.stringify({ ...msg, data: [arr[result.header.playerCarIndex]], playerCarIndex: 0 });
  playerOnly += Buffer.byteLength(playerJson);
  const t2 = process.hrtime.bigint();
  playerDeflated += zlib.deflateRawSync(playerJson).length;
  playerDeflateNs += process.hrtime.bigint() - t2;
}

const seconds = (lastTs - firstTs) / 1000;
const kibs = (bytes: number) => (bytes / seconds / 1024).toFixed(1);
const cpu = (ns: bigint) => ((Number(ns) / 1e9 / seconds) * 100).toFixed(3);
let total = 0;
let count = 0;
for (const [type, entry] of Object.entries(bytesByType)) {
  total += entry.bytes;
  count += entry.count;
  console.log(`${type}: ${entry.count} msgs, avg ${(entry.bytes / entry.count).toFixed(0)} B, ${kibs(entry.bytes)} KiB/s`);
}
console.log(`all 22 cars: ${count} msgs per pass, ${(total / 2 ** 20).toFixed(1)} MiB per pass, ${kibs(total)} KiB/s, ${(((total / seconds) * 3600) / 2 ** 30).toFixed(2)} GiB/h`);
console.log(`deflate per message, default level: ${kibs(deflated)} KiB/s (${(total / deflated).toFixed(1)}x), CPU ${cpu(deflateNs)}% of one core`);
console.log(`deflate per message, level 1: ${kibs(deflatedFast)} KiB/s, CPU ${cpu(deflateFastNs)}% of one core`);
console.log(`player car only: ${kibs(playerOnly)} KiB/s; deflated ${kibs(playerDeflated)} KiB/s, CPU ${cpu(playerDeflateNs)}% of one core`);
console.log(`span ${seconds.toFixed(1)} s`);
