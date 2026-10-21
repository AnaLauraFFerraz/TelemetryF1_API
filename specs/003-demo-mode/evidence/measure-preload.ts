// Monta a sessão da gravação dentro do processo, o mais rápido possível, pelo
// dispatcher e pelo persistTelemetry reais, num banco descartável (nunca o
// data/telemetry.db), e mede tempo, memória, contagens, datas de captura,
// tamanho das respostas REST e o tamanho da entrada do coach (sem chamar a API).
// Uso (na raiz do repositório):
//   npx ts-node --transpile-only --project tsconfig.json specs/003-demo-mode/evidence/measure-preload.ts <gravação.jsonl> <:memory: | caminho temporário>
import fs from "node:fs";
import path from "node:path";

const [recordingPath, dbArg] = process.argv.slice(2);
if (!dbArg || path.resolve(dbArg) === path.resolve("data", "telemetry.db")) {
  throw new Error("recusado: passe :memory: ou um caminho temporário, nunca data/telemetry.db");
}
process.env.DB_PATH = dbArg;

const mem = (label: string) => {
  const m = process.memoryUsage();
  console.log(`${label}: rss ${(m.rss / 2 ** 20).toFixed(1)} MiB, heapUsed ${(m.heapUsed / 2 ** 20).toFixed(1)} MiB, external ${(m.external / 2 ** 20).toFixed(1)} MiB`);
};

mem("start");
const tRead0 = performance.now();
const packets = fs
  .readFileSync(recordingPath, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    const { timestampMs, receivedAt, data } = JSON.parse(l) as { timestampMs: number; receivedAt?: number; data: string };
    return { timestampMs, receivedAt, data: Buffer.from(data, "base64") };
  });
console.log(
  `read+decode ${packets.length} packets: ${(performance.now() - tRead0).toFixed(0)} ms; ` +
    `missing receivedAt: ${packets.filter((p) => typeof p.receivedAt !== "number").length}`
);
mem("after decode");

// require() depois de definir DB_PATH: um import estático abriria o banco antes (ver src/persistence/testDb.ts).
/* eslint-disable @typescript-eslint/no-var-requires */
const { dispatchPacket } = require("../../../src/telemetry/dispatcher");
const { persistTelemetry } = require("../../../src/persistence/persistTelemetry");
const { db } = require("../../../src/persistence/db");
const { listSessions, getSessionById } = require("../../../src/persistence/sessionRepository");
const { listLapsForSession, getTrackBenchmark } = require("../../../src/persistence/lapRepository");
const { listCarTelemetrySamplesForLap } = require("../../../src/persistence/carTelemetrySampleRepository");
const { listMotionSamplesForLap } = require("../../../src/persistence/motionSampleRepository");
const { buildInsights } = require("../../../src/analysis/buildInsights");
const { buildCoachUserMessage } = require("../../../src/coaching/coachUserMessage");
const { COACH_SYSTEM_PROMPT } = require("../../../src/coaching/coachPrompt");
/* eslint-enable @typescript-eslint/no-var-requires */

const lapCount = db.prepare("SELECT COUNT(*) AS n FROM laps");
const latestLap = db.prepare("SELECT lap_number FROM laps ORDER BY id DESC LIMIT 1");
const completions: Array<{ lap: number; at: number | undefined }> = [];
let lastLaps = 0;
let firstSessionAt: number | undefined;
let lastSessionAt: number | undefined;

const t0 = performance.now();
for (const p of packets) {
  const result = dispatchPacket(p.data);
  if (!result) continue;
  if (result.header.sessionUID !== 0n) {
    firstSessionAt ??= p.receivedAt;
    lastSessionAt = p.receivedAt;
  }
  persistTelemetry(result.header, result.packetId, result.data);
  if (result.packetId === 2) {
    const n = (lapCount.get() as { n: number }).n;
    if (n !== lastLaps) {
      completions.push({ lap: (latestLap.get() as { lap_number: number }).lap_number, at: p.receivedAt });
      lastLaps = n;
    }
  }
}
console.log(`in-process preload: ${(performance.now() - t0).toFixed(0)} ms`);
mem("after preload");

const all = (sql: string) => db.prepare(sql).all();
console.log("sessions", JSON.stringify(all("SELECT id, session_uid, track_id, started_at, last_seen_at FROM sessions")));
console.log("laps", JSON.stringify(all("SELECT lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, is_valid, recorded_at FROM laps ORDER BY lap_number")));
console.log("car samples per lap", JSON.stringify(all("SELECT lap_number, COUNT(*) AS n FROM car_telemetry_samples GROUP BY lap_number")));
console.log("motion samples per lap", JSON.stringify(all("SELECT lap_number, COUNT(*) AS n FROM motion_samples GROUP BY lap_number")));
console.log("totals", JSON.stringify(all("SELECT (SELECT COUNT(*) FROM car_telemetry_samples) AS car, (SELECT COUNT(*) FROM motion_samples) AS motion")[0]));
const pages = db.pragma("page_count", { simple: true }) as number;
const pageSize = db.pragma("page_size", { simple: true }) as number;
console.log(`db size ${((pages * pageSize) / 2 ** 20).toFixed(2)} MiB; journal_mode ${db.pragma("journal_mode", { simple: true })}`);

const iso = (ms?: number) => (ms === undefined ? "missing" : new Date(ms).toISOString());
console.log(`capture times: first ${iso(firstSessionAt)} last ${iso(lastSessionAt)} span ${((lastSessionAt! - firstSessionAt!) / 1000).toFixed(3)} s`);
console.log("lap completed at", JSON.stringify(completions.map((c) => ({ lap: c.lap, at: iso(c.at) }))));

const t1 = performance.now();
for (const p of packets) {
  const result = dispatchPacket(p.data);
  if (result) persistTelemetry(result.header, result.packetId, result.data);
}
console.log(
  `second pass (same process): ${(performance.now() - t1).toFixed(0)} ms; counts after ` +
    JSON.stringify(all("SELECT (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM laps) AS laps, (SELECT COUNT(*) FROM car_telemetry_samples) AS car, (SELECT COUNT(*) FROM motion_samples) AS motion")[0])
);
mem("end");

const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
console.log(`GET /sessions body ${size(listSessions())} B`);
console.log(`GET /sessions/1 body ${size({ ...getSessionById(1), laps: listLapsForSession(1) })} B`);
for (const lap of [6, 7, 8]) {
  console.log(`GET /sessions/1/laps/${lap}/telemetry body ${size({ carTelemetry: listCarTelemetrySamplesForLap(1, lap), motion: listMotionSamplesForLap(1, lap) })} B`);
}

const benchmark = getTrackBenchmark(getSessionById(1).trackId);
console.log(`coach system prompt ${COACH_SYSTEM_PROMPT.length} chars`);
for (const [a, b] of [[6, 7], [6, 8], [7, 6], [7, 8], [8, 6], [8, 7]]) {
  const input = () => ({
    primaryTelemetry: listCarTelemetrySamplesForLap(1, a),
    comparisonTelemetry: listCarTelemetrySamplesForLap(1, b),
    primaryMotion: listMotionSamplesForLap(1, a),
    comparisonMotion: listMotionSamplesForLap(1, b),
  });
  const first = JSON.stringify(buildInsights(input()));
  const second = JSON.stringify(buildInsights(input()));
  console.log(
    `pair (${a},${b}): insights ${first.length} chars, deterministic ${first === second}, ` +
      `user message ${buildCoachUserMessage(JSON.parse(first), benchmark).length} chars`
  );
}
