import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";
import type { CarMotionData } from "../telemetry/motion/types";

const handle = setupIsolatedTestDb();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("./db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertMotionSample } = require("./motionSampleRepository") as typeof import("./motionSampleRepository");

after(() => teardownIsolatedTestDb(handle));

function createSession(): number {
  const result = db
    .prepare(`INSERT INTO sessions (session_uid, game_year, game_major_version, game_minor_version) VALUES (?, 24, 1, 0)`)
    .run(String(Date.now()) + Math.random());
  return Number(result.lastInsertRowid);
}

function countSamples(sessionId: number): number {
  return (db.prepare("SELECT COUNT(*) c FROM motion_samples WHERE session_id = ?").get(sessionId) as { c: number }).c;
}

function makeCarMotionData(): CarMotionData {
  return {
    worldPosition: { x: 0, y: 0, z: 0 },
    worldVelocity: { x: 0, y: 0, z: 0 },
    worldForwardDir: { x: 1, y: 0, z: 0 },
    worldRightDir: { x: 0, y: 1, z: 0 },
    gForceLateral: 0,
    gForceLongitudinal: 0,
    gForceVertical: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
  };
}

test("inserir a mesma (sessionId, overallFrameIdentifier) duas vezes grava uma linha, não duas", () => {
  const sessionId = createSession();
  const data = makeCarMotionData();

  insertMotionSample(sessionId, 1, 100, 10, 500, data);
  insertMotionSample(sessionId, 1, 100, 10, 500, data); // mesmo frame, repetido

  assert.equal(countSamples(sessionId), 1);
});

test("duas linhas sem overallFrameIdentifier (NULL) convivem sem erro", () => {
  const sessionId = createSession();
  const data = makeCarMotionData();

  insertMotionSample(sessionId, 1, 100, 10, null as unknown as number, data);
  insertMotionSample(sessionId, 1, 200, 20, null as unknown as number, data);

  assert.equal(countSamples(sessionId), 2);
});
