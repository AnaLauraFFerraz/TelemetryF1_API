import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";
import { buildSyntheticRecording } from "../replay/testFixtures";
import type { DemoPacket } from "../demo/recording";

const handle = setupIsolatedTestDb();
/* eslint-disable @typescript-eslint/no-var-requires */
const { db, setReadOnly } = require("./db") as typeof import("./db");
const { buildDemoSession } = require("../demo/buildDemoSession") as typeof import("../demo/buildDemoSession");
const { insertAnalysis } = require("./analysisRepository") as typeof import("./analysisRepository");
const { getSessionById } = require("./sessionRepository") as typeof import("./sessionRepository");
/* eslint-enable @typescript-eslint/no-var-requires */

after(() => teardownIsolatedTestDb(handle));

const TABLES = ["sessions", "laps", "car_telemetry_samples", "motion_samples", "lap_analyses"];

function rowCounts(): Record<string, number> {
  return Object.fromEntries(TABLES.map((t) => [t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
}

test("depois de setReadOnly, uma escrita falha e nenhuma tabela muda; leituras seguem funcionando", () => {
  const { packets } = buildSyntheticRecording();
  const build = buildDemoSession(packets.map((p): DemoPacket => ({ ...p, receivedAt: 1792168223797 })));
  const before = rowCounts();

  setReadOnly();

  assert.throws(() => insertAnalysis(build.sessionId, 1, 2, "{}", "texto", "modelo-falso"), /readonly|read-only|attempt to write/i);
  assert.deepEqual(rowCounts(), before);
  assert.equal(getSessionById(build.sessionId)?.id, build.sessionId);
});
