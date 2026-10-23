import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";
import type { CompletedLap } from "./types";

const handle = setupIsolatedTestDb();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("./db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { upsertCompletedLap, getLapForSession } = require("./lapRepository") as typeof import("./lapRepository");

after(() => teardownIsolatedTestDb(handle));

function createSession(): number {
  const result = db
    .prepare(`INSERT INTO sessions (session_uid, game_year, game_major_version, game_minor_version) VALUES (?, 24, 1, 0)`)
    .run(String(Date.now()) + Math.random());
  return Number(result.lastInsertRowid);
}

function lap(lapNumber: number, lapTimeMs: number, isValid: boolean): CompletedLap {
  return { lapNumber, lapTimeMs, sector1Ms: 20000, sector2Ms: 30000, sector3Ms: lapTimeMs - 50000, isValid, carPosition: 1 };
}

test("getLapForSession devolve a volta pedida com tempo e validade", () => {
  const sessionId = createSession();
  upsertCompletedLap(sessionId, lap(6, 74306, false));
  upsertCompletedLap(sessionId, lap(7, 74144, true));

  const row = getLapForSession(sessionId, 7);
  assert.ok(row);
  assert.equal(row.lapNumber, 7);
  assert.equal(row.lapTimeMs, 74144);
  assert.equal(row.isValid, true);
  assert.equal(row.sector3Ms, 24144);

  assert.equal(getLapForSession(sessionId, 6)?.isValid, false);
});

test("getLapForSession devolve undefined para uma volta sem linha", () => {
  const sessionId = createSession();
  upsertCompletedLap(sessionId, lap(7, 74144, true));

  assert.equal(getLapForSession(sessionId, 9), undefined);
});

test("getLapForSession não devolve a volta de outra sessão", () => {
  const sessionA = createSession();
  const sessionB = createSession();
  upsertCompletedLap(sessionA, lap(7, 74144, true));

  assert.equal(getLapForSession(sessionB, 7), undefined);
  assert.equal(getLapForSession(sessionA, 7)?.lapTimeMs, 74144);
});
