import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";
import type { CarTelemetryData } from "../telemetry/carTelemetry/types";

const handle = setupIsolatedTestDb();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("./db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertCarTelemetrySample } = require("./carTelemetrySampleRepository") as typeof import("./carTelemetrySampleRepository");

after(() => teardownIsolatedTestDb(handle));

function createSession(): number {
  const result = db
    .prepare(`INSERT INTO sessions (session_uid, game_year, game_major_version, game_minor_version) VALUES (?, 24, 1, 0)`)
    .run(String(Date.now()) + Math.random());
  return Number(result.lastInsertRowid);
}

function countSamples(sessionId: number): number {
  return (db.prepare("SELECT COUNT(*) c FROM car_telemetry_samples WHERE session_id = ?").get(sessionId) as { c: number }).c;
}

const wheel = { rearLeft: 0, rearRight: 0, frontLeft: 0, frontRight: 0 };

function makeCarTelemetryData(): CarTelemetryData {
  return {
    speed: 200,
    throttle: 1,
    steer: 0,
    brake: 0,
    clutch: 0,
    gear: 4,
    engineRPM: 10000,
    drs: 0,
    revLightsPercent: 0,
    revLightsBitValue: 0,
    brakesTemperature: wheel,
    tyresSurfaceTemperature: wheel,
    tyresInnerTemperature: wheel,
    engineTemperature: 90,
    tyresPressure: wheel,
    surfaceType: wheel,
  };
}

test("inserir a mesma (sessionId, overallFrameIdentifier) duas vezes grava uma linha, não duas", () => {
  const sessionId = createSession();
  const data = makeCarTelemetryData();

  insertCarTelemetrySample(sessionId, 1, 100, 10, 500, data);
  insertCarTelemetrySample(sessionId, 1, 100, 10, 500, data); // mesmo frame, repetido

  assert.equal(countSamples(sessionId), 1);
});

test("duas linhas sem overallFrameIdentifier (NULL) convivem sem erro", () => {
  const sessionId = createSession();
  const data = makeCarTelemetryData();

  insertCarTelemetrySample(sessionId, 1, 100, 10, null as unknown as number, data);
  insertCarTelemetrySample(sessionId, 1, 200, 20, null as unknown as number, data);

  assert.equal(countSamples(sessionId), 2);
});
