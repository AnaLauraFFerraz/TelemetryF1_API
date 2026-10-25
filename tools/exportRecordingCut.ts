import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";
import { toRecordingCut, RecordingCutLap } from "../src/analysis/recordingCutFormat";

/**
 * Gera src/analysis/recordingCut.json: as voltas 6 a 8 da gravação publicada
 * (release sample-recording-v1), como as amostras já decimadas que o motor lê,
 * mais o tempo oficial e a validade de cada volta e o SHA-256 da gravação.
 * A gravação passa pela ingestão da main num banco temporário, sem socket.
 *
 * Uso: DB_PATH=<banco novo, fora de data/> node -r ts-node/register tools/exportRecordingCut.ts <gravação.jsonl>
 */
const CUT_LAPS = [6, 7, 8];
const PACKET_IDS = [0, 1, 2, 6];
const OUTPUT_PATH = path.resolve(__dirname, "..", "src", "analysis", "recordingCut.json");

// Os repositórios abrem o banco ao serem importados: DB_PATH é conferido antes
// de qualquer import deles, para que um erro nunca abra data/telemetry.db.
function checkDbPath(): string {
  const raw = process.env.DB_PATH?.trim();
  if (!raw) throw new Error("DB_PATH é obrigatório e deve apontar para um banco novo, fora de data/");
  const resolved = path.resolve(raw);
  if (resolved.toLowerCase() === path.resolve(__dirname, "..", "data", "telemetry.db").toLowerCase()) {
    throw new Error("DB_PATH aponta para data/telemetry.db");
  }
  if (fs.existsSync(resolved)) throw new Error(`DB_PATH já existe (${resolved}); use um banco novo`);
  return resolved;
}

async function main(): Promise<void> {
  const recordingPath = process.argv[2];
  if (!recordingPath) throw new Error("uso: DB_PATH=... exportRecordingCut.ts <gravação.jsonl>");
  const expectedDbPath = checkDbPath();

  const sourceSha256 = createHash("sha256").update(fs.readFileSync(recordingPath)).digest("hex");
  console.log(`sha256 da gravação: ${sourceSha256}`);

  const { db } = await import("../src/persistence/db");
  const { dbPath } = await import("../src/config/dbPath");
  const { dispatchPacket } = await import("../src/telemetry/dispatcher");
  const { persistTelemetry } = await import("../src/persistence/persistTelemetry");
  const { listCarTelemetrySamplesForLap } = await import("../src/persistence/carTelemetrySampleRepository");
  const { listMotionSamplesForLap } = await import("../src/persistence/motionSampleRepository");
  const { getLapForSession } = await import("../src/persistence/lapRepository");
  if (path.resolve(dbPath) !== expectedDbPath) throw new Error(`banco aberto inesperado: ${dbPath}`);

  let dropped = 0;
  const lines = readline.createInterface({ input: fs.createReadStream(recordingPath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const result = dispatchPacket(Buffer.from((JSON.parse(line) as { data: string }).data, "base64"));
      if (result && PACKET_IDS.includes(result.packetId)) persistTelemetry(result.header, result.packetId, result.data);
    } catch {
      dropped++;
    }
  }

  const sessions = db.prepare("SELECT id FROM sessions").all() as { id: number }[];
  if (sessions.length !== 1) throw new Error(`esperava 1 sessão na gravação, achei ${sessions.length}`);
  const sessionId = sessions[0].id;

  const laps: RecordingCutLap[] = CUT_LAPS.map((lapNumber) => {
    const lap = getLapForSession(sessionId, lapNumber);
    if (!lap) throw new Error(`a volta ${lapNumber} não está no banco`);
    return {
      lapNumber,
      lapTimeMs: lap.lapTimeMs,
      isValid: lap.isValid,
      telemetry: listCarTelemetrySamplesForLap(sessionId, lapNumber),
      motion: listMotionSamplesForLap(sessionId, lapNumber),
    };
  });
  db.close();

  const json = toRecordingCut({ sourceSha256, laps });
  fs.writeFileSync(OUTPUT_PATH, json);

  console.log(`pacotes descartados: ${dropped}`);
  for (const lap of laps) {
    console.log(`volta ${lap.lapNumber}: ${lap.lapTimeMs} ms, válida=${lap.isValid}, telemetria=${lap.telemetry.length}, movimento=${lap.motion.length}`);
  }
  console.log(`${OUTPUT_PATH}: ${Buffer.byteLength(json)} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
