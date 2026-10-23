import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { buildSyntheticRecording, buildLoopableSyntheticRecording } from "../replay/testFixtures";
import { buildCaptureTimes } from "./captureTimes";
import type { DemoPacket } from "./recording";

const handle = setupIsolatedTestDb();
/* eslint-disable @typescript-eslint/no-var-requires */
const { buildDemoSession } = require("./buildDemoSession") as typeof import("./buildDemoSession");
const { applyCaptureTimes } = require("./applyCaptureTimes") as typeof import("./applyCaptureTimes");
const { getSessionById } = require("../persistence/sessionRepository") as typeof import("../persistence/sessionRepository");
const { listLapsForSession } = require("../persistence/lapRepository") as typeof import("../persistence/lapRepository");
/* eslint-enable @typescript-eslint/no-var-requires */

after(() => teardownIsolatedTestDb(handle));

const BASE = 1792168223797;
const SQLITE_NOW_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test("as horas de captura substituem as do relógio na sessão e nas voltas", () => {
  const { packets } = buildSyntheticRecording();
  const demoPackets: DemoPacket[] = packets.map((p, i) => ({ ...p, receivedAt: BASE + i * 50 }));
  const build = buildDemoSession(demoPackets);
  const times = buildCaptureTimes(build.firstReceivedAt, build.lastReceivedAt, build.completions);

  applyCaptureTimes(build.sessionId, times);

  const session = getSessionById(build.sessionId);
  assert.ok(session);
  assert.equal(session.startedAt, times.startedAt);
  assert.equal(session.lastSeenAt, times.lastSeenAt);
  const laps = listLapsForSession(build.sessionId);
  assert.equal(laps.length, 1);
  assert.equal(laps[0].recordedAt, times.lapRecordedAt.get(laps[0].lapNumber));
});

test("uma sessão gravada sem applyCaptureTimes continua com as horas do relógio do SQLite", () => {
  const { packets } = buildLoopableSyntheticRecording();
  const demoPackets: DemoPacket[] = packets.map((p) => ({ ...p, receivedAt: BASE }));
  const before = Date.now();
  const build = buildDemoSession(demoPackets);

  const session = getSessionById(build.sessionId);
  assert.ok(session);
  assert.match(session.startedAt, SQLITE_NOW_FORMAT);
  assert.ok(Date.parse(session.startedAt) >= before - 1000, `startedAt ${session.startedAt} não é a hora atual`);
  assert.notEqual(session.startedAt, new Date(BASE).toISOString());
});
