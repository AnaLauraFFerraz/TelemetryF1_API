import { test, after } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { dispatchPacket } from "../telemetry/dispatcher";
import { startUdpListener } from "../network/udpListener";
import { runReplay } from "./runner";
import { buildSyntheticRecording } from "./testFixtures";

// startUdpListener/dispatchPacket não tocam em ./db, então são seguros de
// importar estaticamente; persistTelemetry (e, por tabela, ./db) precisa
// ser carregado via require() só DEPOIS de setupIsolatedTestDb() definir
// DB_PATH - import estático já teria rodado antes (ver testDb.ts).
const handle = setupIsolatedTestDb();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("../persistence/db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { persistTelemetry } = require("../persistence/persistTelemetry") as typeof import("../persistence/persistTelemetry");

after(() => teardownIsolatedTestDb(handle));

test("US1: uma passada da gravação sintética grava a volta e as amostras esperadas", async () => {
  const { packets, expectedLap, expectedSampleCount } = buildSyntheticRecording();

  let received = 0;
  const listenerSocket = startUdpListener(0, (buffer) => {
    received += 1;
    const result = dispatchPacket(buffer);
    if (!result) return;
    persistTelemetry(result.header, result.packetId, result.data);
  });

  const sendSocket = dgram.createSocket("udp4");

  try {
    // bind(0) é assíncrono (libuv) - chamar .address() antes do socket
    // terminar de vincular lança EBADF. Registra o listener de "listening"
    // já na mesma volta síncrona em que startUdpListener() devolveu o
    // socket, antes do event loop ter chance de emitir o evento.
    await new Promise<void>((resolve) => listenerSocket.once("listening", resolve));
    const port = (listenerSocket.address() as AddressInfo).port;

    await runReplay(packets, { speed: "max", loop: false }, {
      send: (buf) => sendSocket.send(buf, port, "127.0.0.1"),
    });

    // UDP é assíncrono mesmo em loopback - runReplay() já devolveu o
    // controle depois de ENVIAR tudo, não depois do listener RECEBER tudo.
    // Espera a contagem bater, com um teto, em vez de um sleep arbitrário.
    const deadline = Date.now() + 5000;
    while (received < packets.length && Date.now() < deadline) {
      await delay(10);
    }
    assert.equal(received, packets.length, "nem todos os pacotes enviados chegaram ao listener a tempo");

    const sessions = db.prepare("SELECT id FROM sessions").all() as Array<{ id: number }>;
    assert.equal(sessions.length, 1);
    const sessionId = sessions[0].id;

    const laps = db
      .prepare("SELECT lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, is_valid FROM laps WHERE session_id = ?")
      .all(sessionId);
    assert.deepEqual(laps, [
      {
        lap_number: expectedLap.lapNumber,
        lap_time_ms: expectedLap.lapTimeMs,
        sector1_ms: expectedLap.sector1Ms,
        sector2_ms: expectedLap.sector2Ms,
        sector3_ms: expectedLap.sector3Ms,
        is_valid: expectedLap.isValid ? 1 : 0,
      },
    ]);

    const carCount = (db.prepare("SELECT COUNT(*) c FROM car_telemetry_samples WHERE session_id = ?").get(sessionId) as {
      c: number;
    }).c;
    const motionCount = (db.prepare("SELECT COUNT(*) c FROM motion_samples WHERE session_id = ?").get(sessionId) as {
      c: number;
    }).c;
    assert.equal(carCount, expectedSampleCount);
    assert.equal(motionCount, expectedSampleCount);
  } finally {
    sendSocket.close();
    listenerSocket.close();
  }
});
