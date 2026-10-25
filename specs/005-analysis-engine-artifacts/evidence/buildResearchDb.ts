// Uso: DB_PATH=<banco temporário> node -r ts-node/register buildResearchDb.ts <gravação.jsonl> <saída-crua.json>
// Monta a sessão da gravação pela ingestão da main (dispatchPacket + persistTelemetry, como src/server.ts),
// sem socket UDP, e grava a série crua do carro do jogador (todos os pacotes 0, 2 e 6) para a investigação.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";

async function main(): Promise<void> {
  const [recordingPath, rawOutPath] = process.argv.slice(2);
  const dbPathEnv = process.env.DB_PATH;
  if (!recordingPath || !rawOutPath || !dbPathEnv) throw new Error("uso: DB_PATH=... buildResearchDb.ts <gravação> <saída>");
  if (path.resolve(dbPathEnv).toLowerCase().includes(path.join("data", "telemetry.db").toLowerCase())) {
    throw new Error("DB_PATH aponta para o banco real");
  }

  const sha = createHash("sha256").update(fs.readFileSync(recordingPath)).digest("hex");
  console.log(`sha256 da gravação: ${sha}`);

  const repo = path.resolve(__dirname, "..", "..", "..");
  const { db } = require(path.join(repo, "src/persistence/db"));
  const { dbPath } = require(path.join(repo, "src/config/dbPath"));
  const { dispatchPacket } = require(path.join(repo, "src/telemetry/dispatcher"));
  const { persistTelemetry } = require(path.join(repo, "src/persistence/persistTelemetry"));
  if (path.resolve(dbPath) !== path.resolve(dbPathEnv)) throw new Error(`banco aberto inesperado: ${dbPath}`);

  const raw: Record<string, unknown>[] = [];
  let lastLap: { lapNum: number; lapDistance: number; driverStatus: number; pitStatus: number; invalid: number } | null = null;
  let packets = 0;
  let dropped = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(recordingPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    packets++;
    const rec = JSON.parse(line) as { data: string };
    const buffer = Buffer.from(rec.data, "base64");
    let result;
    try {
      result = dispatchPacket(buffer);
    } catch {
      dropped++;
      continue;
    }
    if (!result) continue;
    const { header, packetId, data } = result as any;
    if (![0, 1, 2, 6].includes(packetId)) continue;
    persistTelemetry(header, packetId, data);

    const i = header.playerCarIndex;
    const base = {
      packetId,
      sessionTime: header.sessionTime,
      frame: header.frameIdentifier,
      overallFrame: header.overallFrameIdentifier,
    };
    if (packetId === 2) {
      const p = data.lapData[i];
      lastLap = {
        lapNum: p.currentLapNum,
        lapDistance: p.lapDistance,
        driverStatus: p.driverStatus,
        pitStatus: p.pitStatus,
        invalid: p.currentLapInvalid,
      };
      raw.push({ ...base, ...lastLap, lastLapTimeInMS: p.lastLapTimeInMS, currentLapTimeInMS: p.currentLapTimeInMS });
    } else if (packetId === 6) {
      const c = data.carTelemetryData[i];
      raw.push({ ...base, lapNum: lastLap?.lapNum ?? null, lapDistance: lastLap?.lapDistance ?? null, speed: c.speed, throttle: c.throttle, brake: c.brake, steer: c.steer, gear: c.gear });
    }
  }

  fs.writeFileSync(rawOutPath, JSON.stringify(raw));
  const count = (table: string) =>
    db.prepare(`SELECT lap_number AS lap, COUNT(*) AS n FROM ${table} GROUP BY lap_number ORDER BY lap_number`).all();
  console.log(`banco: ${dbPath}`);
  console.log(`pacotes lidos: ${packets}; descartados: ${dropped}`);
  console.log(`sessões: ${JSON.stringify(db.prepare("SELECT id, session_uid, track_id FROM sessions").all())}`);
  console.log(`voltas: ${JSON.stringify(db.prepare("SELECT lap_number, lap_time_ms, is_valid FROM laps ORDER BY lap_number").all())}`);
  console.log(`car_telemetry_samples: ${JSON.stringify(count("car_telemetry_samples"))}`);
  console.log(`motion_samples: ${JSON.stringify(count("motion_samples"))}`);
  console.log(`série crua: ${raw.length} linhas em ${rawOutPath}`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
