import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";

const handle = setupIsolatedTestDb();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("./db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleLapDataPacket, handleCarTelemetryPacket, PASS_RESTART_THRESHOLD_FRAMES } = require("./sessionContext") as typeof import("./sessionContext");

after(() => teardownIsolatedTestDb(handle));

let sessionUidCounter = 0;

function makeHeader(overrides: Partial<import("../telemetry/header/types").PacketHeader> = {}): import("../telemetry/header/types").PacketHeader {
  return {
    packetFormat: 2024,
    gameYear: 24,
    gameMajorVersion: 1,
    gameMinorVersion: 0,
    packetVersion: 1,
    packetId: 2,
    sessionUID: 0n,
    sessionTime: 0,
    frameIdentifier: 0,
    overallFrameIdentifier: 0,
    playerCarIndex: 0,
    secondaryPlayerCarIndex: 255,
    ...overrides,
  };
}

function makeLapData(overrides: Partial<import("../telemetry/lapData/types").LapData> = {}): import("../telemetry/lapData/types").LapData {
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

const wheel = { rearLeft: 0, rearRight: 0, frontLeft: 0, frontRight: 0 };

function makeCarTelemetryData(): import("../telemetry/carTelemetry/types").CarTelemetryData {
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

function freshSessionUid(): bigint {
  sessionUidCounter += 1;
  return BigInt(1000 + sessionUidCounter);
}

function lapCount(sessionId: number): number {
  return (db.prepare("SELECT COUNT(*) c FROM laps WHERE session_id = ?").get(sessionId) as { c: number }).c;
}

function lapTimeFor(sessionId: number, lapNumber: number): number {
  return (
    db.prepare("SELECT lap_time_ms FROM laps WHERE session_id = ? AND lap_number = ?").get(sessionId, lapNumber) as {
      lap_time_ms: number;
    }
  ).lap_time_ms;
}

function carSampleCount(sessionId: number): number {
  return (db.prepare("SELECT COUNT(*) c FROM car_telemetry_samples WHERE session_id = ?").get(sessionId) as { c: number }).c;
}

function sessionIdFor(sessionUID: bigint): number {
  return (db.prepare("SELECT id FROM sessions WHERE session_uid = ?").get(sessionUID.toString()) as { id: number }).id;
}

test("um recuo pequeno (dentro do limiar) não reinicia o detector de volta", () => {
  const sessionUID = freshSessionUid();

  // volta 1 completa normalmente
  handleLapDataPacket(makeHeader({ sessionUID, overallFrameIdentifier: 1000 }), makeLapData({ currentLapNum: 1 }));
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: 1050 }),
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 60000 })
  );

  const sessionId = sessionIdFor(sessionUID);
  assert.equal(lapCount(sessionId), 1, "volta 1 deveria ter sido fechada");

  // recuo pequeno, menor que o limiar - não é reinício de passada
  const smallRegression = 1050 - PASS_RESTART_THRESHOLD_FRAMES + 1;
  handleLapDataPacket(makeHeader({ sessionUID, overallFrameIdentifier: smallRegression }), makeLapData({ currentLapNum: 1 }));
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: smallRegression + 10 }),
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 61000 })
  );

  // "pacote atrasado" (lapNum 1 < máximo visto 2) é ignorado pelo detector,
  // que não foi resetado - nenhuma volta nova é fechada
  assert.equal(lapCount(sessionId), 1, "um recuo pequeno não deveria disparar o reset");
});

test("uma queda maior que o limiar reinicia o detector de volta e a decimação, preservando sessionId/trackId", () => {
  const sessionUID = freshSessionUid();

  handleLapDataPacket(makeHeader({ sessionUID, overallFrameIdentifier: 5000 }), makeLapData({ currentLapNum: 1, lapDistance: 0 }));
  handleCarTelemetryPacket(makeHeader({ sessionUID, overallFrameIdentifier: 5000, packetId: 6 }), makeCarTelemetryData());
  // segunda amostra bem perto da primeira (1m) - decimação não reseta
  // aqui, então essa amostra NÃO deveria persistir (abaixo do limiar de 4m)
  handleLapDataPacket(makeHeader({ sessionUID, overallFrameIdentifier: 5010 }), makeLapData({ currentLapNum: 1, lapDistance: 1 }));
  handleCarTelemetryPacket(makeHeader({ sessionUID, overallFrameIdentifier: 5010, packetId: 6 }), makeCarTelemetryData());
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: 5050 }),
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 60000 })
  );

  const sessionId = sessionIdFor(sessionUID);
  assert.equal(lapCount(sessionId), 1);
  assert.equal(carSampleCount(sessionId), 1, "a segunda amostra (1m de distância) não deveria ter passado da decimação");

  // queda bem maior que o limiar - reinício de passada
  const bigDrop = 5050 - PASS_RESTART_THRESHOLD_FRAMES - 1;
  handleLapDataPacket(makeHeader({ sessionUID, overallFrameIdentifier: bigDrop }), makeLapData({ currentLapNum: 1, lapDistance: 0 }));
  // mesma distância (0) da primeira amostra da passada anterior - só
  // persiste de novo se a decimação tiver sido mesmo resetada (estado
  // "sem amostra anterior" sempre persiste, independente da distância)
  handleCarTelemetryPacket(makeHeader({ sessionUID, overallFrameIdentifier: bigDrop, packetId: 6 }), makeCarTelemetryData());
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: bigDrop + 50 }),
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 61000 })
  );

  assert.equal(sessionIdFor(sessionUID), sessionId, "mesma sessão, não uma nova");
  assert.equal(
    carSampleCount(sessionId),
    2,
    "a amostra depois do reset deveria ter persistido mesmo repetindo a distância 0 - prova que a decimação foi resetada"
  );
  // mesmo lap_number (1) nas duas passadas: o upsert SOBRESCREVE a linha
  // (FR-011), não soma uma segunda - a contagem continua 1, o valor mudou.
  assert.equal(lapCount(sessionId), 1, "a volta 1 da nova passada deveria sobrescrever a da passada anterior, não somar");
  assert.equal(lapTimeFor(sessionId, 1), 61000, "lap_time_ms deveria refletir a passada nova (sobrescrito)");
});

test("um pacote em formato de flashback (frameIdentifier/sessionTime regridem, overallFrameIdentifier não) não reinicia nada", () => {
  const sessionUID = freshSessionUid();

  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: 2000, frameIdentifier: 2000, sessionTime: 100 }),
    makeLapData({ currentLapNum: 1 })
  );
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: 2050, frameIdentifier: 2050, sessionTime: 105 }),
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 60000 })
  );

  const sessionId = sessionIdFor(sessionUID);
  assert.equal(lapCount(sessionId), 1);

  // flashback: frameIdentifier e sessionTime voltam, mas overallFrameIdentifier
  // continua subindo - não deve disparar o reset de passada
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: 2060, frameIdentifier: 1800, sessionTime: 95 }),
    makeLapData({ currentLapNum: 1 })
  );
  handleLapDataPacket(
    makeHeader({ sessionUID, overallFrameIdentifier: 2070, frameIdentifier: 1810, sessionTime: 96 }),
    makeLapData({ currentLapNum: 2, lastLapTimeInMS: 59000 })
  );

  // pacote "atrasado" (lapNum 1 < máximo visto 2) é ignorado pelo detector
  // não resetado - continua com apenas 1 volta fechada
  assert.equal(lapCount(sessionId), 1, "um flashback não deveria disparar o reset de passada");
});
