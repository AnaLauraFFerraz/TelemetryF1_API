import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { buildSyntheticRecording } from "../replay/testFixtures";
import type { DemoPacket } from "./recording";

// buildDemoSession abre o banco por persistence/db: só pode ser carregado
// depois de setupIsolatedTestDb() definir DB_PATH (ver testDb.ts).
const handle = setupIsolatedTestDb();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("../persistence/db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildDemoSession } = require("./buildDemoSession") as typeof import("./buildDemoSession");

after(() => teardownIsolatedTestDb(handle));

const BASE_RECEIVED_AT = 1792168223797;

test("monta a sessão da gravação no próprio processo e devolve as horas de captura", () => {
  const { packets, expectedLap, expectedSampleCount, sessionUID } = buildSyntheticRecording();
  const demoPackets: DemoPacket[] = packets.map((p, i) => ({ ...p, receivedAt: BASE_RECEIVED_AT + i * 50 }));
  // um pacote truncado no fim: dispatchPacket lança, e a montagem segue
  demoPackets.push({ timestampMs: 999, data: Buffer.alloc(10), receivedAt: BASE_RECEIVED_AT + 999_999 });

  const closingIndex = packets.length - 1;
  const build = buildDemoSession(demoPackets);

  assert.equal(build.sessionUid, sessionUID.toString());
  assert.ok(build.sessionId > 0, `sessionId ${build.sessionId}`);
  assert.equal(build.firstReceivedAt, BASE_RECEIVED_AT);
  assert.equal(build.lastReceivedAt, BASE_RECEIVED_AT + closingIndex * 50, "o pacote truncado não pode contar como o último");
  assert.deepEqual(build.completions, [{ lapNumber: expectedLap.lapNumber, receivedAt: BASE_RECEIVED_AT + closingIndex * 50 }]);

  const count = (sql: string) => (db.prepare(sql).get({ id: build.sessionId }) as { n: number }).n;
  assert.equal(count("SELECT COUNT(*) AS n FROM sessions WHERE id = @id"), 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM laps WHERE session_id = @id"), 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM car_telemetry_samples WHERE session_id = @id"), expectedSampleCount);
  assert.equal(count("SELECT COUNT(*) AS n FROM motion_samples WHERE session_id = @id"), expectedSampleCount);
});
