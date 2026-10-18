import { test, after } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { dispatchPacket } from "../telemetry/dispatcher";
import { startUdpListener } from "../network/udpListener";
import { runReplay } from "./runner";
import { buildSyntheticRecording, buildLoopableSyntheticRecording } from "./testFixtures";

// startUdpListener/dispatchPacket não tocam em ./db, então são seguros de
// importar estaticamente; persistTelemetry/sessionContext (e, por tabela,
// ./db) precisam ser carregados via require() só DEPOIS de
// setupIsolatedTestDb() definir DB_PATH - import estático já teria rodado
// antes (ver testDb.ts).
const handle = setupIsolatedTestDb();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("../persistence/db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { persistTelemetry } = require("../persistence/persistTelemetry") as typeof import("../persistence/persistTelemetry");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PASS_RESTART_THRESHOLD_FRAMES } = require("../persistence/sessionContext") as typeof import("../persistence/sessionContext");

after(() => teardownIsolatedTestDb(handle));

test("US1: uma passada da gravação sintética grava a volta e as amostras esperadas", async () => {
  const { packets, expectedLap, expectedSampleCount, sessionUID } = buildSyntheticRecording();

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

    // filtra pelo session_uid deste fixture - outros testes deste mesmo
    // arquivo (mesmo processo, mesmo banco isolado) podem ter criado
    // outras sessões antes.
    const sessions = db.prepare("SELECT id FROM sessions WHERE session_uid = ?").all(sessionUID.toString()) as Array<{
      id: number;
    }>;
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

test("US3: uma passada de loop não grava nenhuma amostra nova e sobrescreve a volta (FR-010+FR-011)", async () => {
  const { packets, expectedLap, expectedSampleCount, overallFrameIdSpan, sessionUID } = buildLoopableSyntheticRecording();

  // Guarda explícita: sem isso, um fixture encolhido no futuro passaria o
  // teste sem nunca exercitar o reset de passada que ele existe pra provar
  // (ver src/replay/testFixtures.ts e research.md, ponto 2).
  assert.ok(
    overallFrameIdSpan > PASS_RESTART_THRESHOLD_FRAMES,
    `o vão do fixture (${overallFrameIdSpan}) precisa ser maior que PASS_RESTART_THRESHOLD_FRAMES (${PASS_RESTART_THRESHOLD_FRAMES})`
  );

  let received = 0;
  const listenerSocket = startUdpListener(0, (buffer) => {
    received += 1;
    const result = dispatchPacket(buffer);
    if (!result) return;
    persistTelemetry(result.header, result.packetId, result.data);
  });

  const sendSocket = dgram.createSocket("udp4");
  const controller = new AbortController();

  try {
    await new Promise<void>((resolve) => listenerSocket.once("listening", resolve));
    const port = (listenerSocket.address() as AddressInfo).port;

    let sent = 0;
    await runReplay(packets, { speed: "1x", loop: true }, {
      send: (buf) => {
        sendSocket.send(buf, port, "127.0.0.1");
        sent += 1;
      },
      // real pacing (timestampMs são só alguns ms) + AbortController real,
      // igual ao que tools/replayer.ts usa pro SIGINT - para exatamente
      // depois de 2 passadas completas, sem deixar uma 3ª passada avançar.
      wait: (ms) => {
        if (sent >= 2 * packets.length) controller.abort();
        return delay(ms, undefined, { signal: controller.signal });
      },
    });

    const deadline = Date.now() + 5000;
    while (received < 2 * packets.length && Date.now() < deadline) {
      await delay(10);
    }
    assert.ok(received >= 2 * packets.length, "nem todos os pacotes de 2 passadas chegaram ao listener a tempo");

    // filtra pelo session_uid deste fixture - o teste US1 acima, no mesmo
    // arquivo/processo/banco, já criou a sua própria sessão.
    const sessions = db.prepare("SELECT id FROM sessions WHERE session_uid = ?").all(sessionUID.toString()) as Array<{
      id: number;
    }>;
    assert.equal(sessions.length, 1, "duas passadas da mesma gravação continuam sendo UMA sessão (FR-011)");
    const sessionId = sessions[0].id;

    const laps = db
      .prepare("SELECT lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, is_valid FROM laps WHERE session_id = ?")
      .all(sessionId);
    assert.deepEqual(
      laps,
      [
        {
          lap_number: expectedLap.lapNumber,
          lap_time_ms: expectedLap.lapTimeMs,
          sector1_ms: expectedLap.sector1Ms,
          sector2_ms: expectedLap.sector2Ms,
          sector3_ms: expectedLap.sector3Ms,
          is_valid: expectedLap.isValid ? 1 : 0,
        },
      ],
      "a volta da 2ª passada deveria sobrescrever a da 1ª (mesmo lap_number), não somar uma segunda linha"
    );

    const carCount = (db.prepare("SELECT COUNT(*) c FROM car_telemetry_samples WHERE session_id = ?").get(sessionId) as {
      c: number;
    }).c;
    const motionCount = (db.prepare("SELECT COUNT(*) c FROM motion_samples WHERE session_id = ?").get(sessionId) as {
      c: number;
    }).c;
    assert.equal(carCount, expectedSampleCount, "a 2ª passada não deveria ter gravado nenhuma amostra nova (FR-010)");
    assert.equal(motionCount, expectedSampleCount, "a 2ª passada não deveria ter gravado nenhuma amostra nova (FR-010)");
  } finally {
    sendSocket.close();
    listenerSocket.close();
  }
});
