import { test } from "node:test";
import assert from "node:assert/strict";
import { createLapCompletionDetector } from "./lapCompletionDetector";
import type { LapData } from "../telemetry/lapData/types";

function makeLapData(overrides: Partial<LapData> = {}): LapData {
  return {
    lastLapTimeInMS: 0,
    currentLapTimeInMS: 0,
    sector1TimeMSPart: 0,
    sector1TimeMinutesPart: 0,
    sector2TimeMSPart: 0,
    sector2TimeMinutesPart: 0,
    deltaToCarInFrontMSPart: 0,
    deltaToCarInFrontMinutesPart: 0,
    deltaToRaceLeaderMSPart: 0,
    deltaToRaceLeaderMinutesPart: 0,
    lapDistance: 0,
    totalDistance: 0,
    safetyCarDelta: 0,
    carPosition: 1,
    currentLapNum: 1,
    pitStatus: 0,
    numPitStops: 0,
    sector: 0,
    currentLapInvalid: 0,
    penalties: 0,
    totalWarnings: 0,
    cornerCuttingWarnings: 0,
    numUnservedDriveThroughPens: 0,
    numUnservedStopGoPens: 0,
    gridPosition: 1,
    driverStatus: 4,
    resultStatus: 2,
    pitLaneTimerActive: 0,
    pitLaneTimeInLaneInMS: 0,
    pitStopTimerInMS: 0,
    pitStopShouldServePen: 0,
    speedTrapFastestSpeed: 0,
    speedTrapFastestLap: 255,
    ...overrides,
  };
}

test("primeiro pacote da sessão nunca conclui uma volta (out lap)", () => {
  const detector = createLapCompletionDetector();
  const result = detector.process(makeLapData({ currentLapNum: 1, lastLapTimeInMS: 0 }));
  assert.equal(result, null);
});

test("virada de volta conclui a volta anterior com o lastLapTimeInMS do pacote atual", () => {
  const detector = createLapCompletionDetector();
  detector.process(makeLapData({ currentLapNum: 1, sector1TimeMSPart: 30000, sector2TimeMSPart: 35000, currentLapInvalid: 0 }));
  const completed = detector.process(
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 90000, sector1TimeMSPart: 0, sector2TimeMSPart: 0 })
  );

  assert.ok(completed);
  assert.equal(completed?.lapNumber, 1);
  assert.equal(completed?.lapTimeMs, 90000);
  assert.equal(completed?.sector1Ms, 30000);
  assert.equal(completed?.sector2Ms, 35000);
  assert.equal(completed?.sector3Ms, 90000 - 30000 - 35000);
  assert.equal(completed?.isValid, true);
});

test("captura o flag de invalidade da volta que TERMINOU, não da que está começando", () => {
  const detector = createLapCompletionDetector();
  detector.process(makeLapData({ currentLapNum: 1, sector1TimeMSPart: 20000, sector2TimeMSPart: 20000, currentLapInvalid: 1 }));
  const completed = detector.process(makeLapData({ currentLapNum: 2, lastLapTimeInMS: 60000, currentLapInvalid: 0 }));

  // usa o invalid=1 do snapshot anterior (volta 1), não o 0 do pacote de virada (já é da volta 2)
  assert.equal(completed?.isValid, false);
});

test("pacote atrasado/fora de ordem (lapNum menor que o máximo visto) é ignorado", () => {
  const detector = createLapCompletionDetector();
  detector.process(makeLapData({ currentLapNum: 1 }));
  detector.process(makeLapData({ currentLapNum: 2, lastLapTimeInMS: 90000 }));
  detector.process(makeLapData({ currentLapNum: 3, lastLapTimeInMS: 85000 }));

  const result = detector.process(makeLapData({ currentLapNum: 2, lastLapTimeInMS: 999 }));
  assert.equal(result, null);
});

test("sector3 fica null se os setores nunca foram atualizados (pacotes perdidos)", () => {
  const detector = createLapCompletionDetector();
  detector.process(makeLapData({ currentLapNum: 1, sector1TimeMSPart: 0, sector2TimeMSPart: 0 }));
  const completed = detector.process(makeLapData({ currentLapNum: 2, lastLapTimeInMS: 90000 }));

  assert.equal(completed?.sector1Ms, null);
  assert.equal(completed?.sector2Ms, null);
  assert.equal(completed?.sector3Ms, null);
});
