import fs from "node:fs";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import type { DemoConfig } from "../config/demoEnv";
import type { LapInsights } from "../analysis/types";
import type { PacketMotionData } from "../telemetry/motion/types";
import type { PacketLapData } from "../telemetry/lapData/types";
import type { PacketCarTelemetryData } from "../telemetry/carTelemetry/types";
import { parseRecording, sha256Hex, verifyRecording } from "./recording";
import { buildCaptureTimes } from "./captureTimes";
import { validateCoachSeed } from "./coachSeed";
import { toPlayerOnlyMessage } from "./playerOnly";
import { createRestCounter, formatSummary } from "./demoLog";
import type { DemoWsEvent } from "./demoWsServer";

const SUMMARY_INTERVAL_MS = 15 * 60 * 1000;

function readOrRefuse(filePath: string, missing: string): Buffer {
  try {
    return fs.readFileSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(missing);
    throw err;
  }
}

function describeEvent(event: DemoWsEvent): string {
  switch (event.type) {
    case "opened":
      return `[demo] conexão aberta (${event.openConnections} abertas)`;
    case "closed": {
      const reason = event.code === 4001 ? "demo full" : event.code === 4002 ? "time limit" : "normal";
      return `[demo] conexão fechada: ${event.code} ${reason} (${event.openConnections} abertas)`;
    }
    case "full":
      return "[demo] conexão recusada: 4001 demo full";
    case "refused-origin":
      return "[demo] conexão recusada: 403 origem não permitida";
  }
}

/**
 * Sobe o modo demo na ordem do plano: confere a gravação contra o cache do
 * coach, monta a sessão inteira num banco em memória, aplica as datas de
 * captura, semeia e valida o cache, deixa o banco só leitura e só então
 * escuta na PORT. Qualquer erro até aí rejeita antes de abrir porta.
 */
export async function startDemoServer(config: DemoConfig): Promise<void> {
  const startedAt = Date.now();

  const seedText = readOrRefuse(config.seedPath, `[demo] cache do coach não encontrado em ${config.seedPath}.`).toString("utf8");
  let rawSeed: unknown;
  try {
    rawSeed = JSON.parse(seedText);
  } catch (err) {
    throw new Error(`[demo] cache do coach inválido: o arquivo não é JSON válido (${err instanceof Error ? err.message : err}).`);
  }
  const expectedSha256 = (rawSeed as { recordingSha256?: unknown } | null)?.recordingSha256;
  if (typeof expectedSha256 !== "string") throw new Error("[demo] cache do coach inválido: sem recordingSha256.");

  const recordingData = readOrRefuse(
    config.recordingPath,
    `[demo] gravação não encontrada em ${config.recordingPath}: o npm run build baixa e confere a gravação.`
  );
  const hashStart = Date.now();
  verifyRecording(recordingData, expectedSha256);
  const hashMs = Date.now() - hashStart;
  const packets = parseRecording(recordingData.toString("utf8"));

  // A persistência abre o banco (:memory: no modo demo) no import: só é
  // carregada depois de a gravação e o cache passarem na conferência.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { buildDemoSession } = require("./buildDemoSession") as typeof import("./buildDemoSession");
  const { applyCaptureTimes } = require("./applyCaptureTimes") as typeof import("./applyCaptureTimes");
  const { applyCoachSeed } = require("./applyCoachSeed") as typeof import("./applyCoachSeed");
  const { setReadOnly, closeDb } = require("../persistence/db") as typeof import("../persistence/db");
  const { listLapsForSession } = require("../persistence/lapRepository") as typeof import("../persistence/lapRepository");
  const { listCarTelemetrySamplesForLap } = require("../persistence/carTelemetrySampleRepository") as typeof import("../persistence/carTelemetrySampleRepository");
  const { listMotionSamplesForLap } = require("../persistence/motionSampleRepository") as typeof import("../persistence/motionSampleRepository");
  const { buildInsights } = require("../analysis/buildInsights") as typeof import("../analysis/buildInsights");
  const { createApp } = require("../http/httpServer") as typeof import("../http/httpServer");
  const { attachDemoWsServer } = require("./demoWsServer") as typeof import("./demoWsServer");
  const { runReplay } = require("../replay/runner") as typeof import("../replay/runner");
  const { dispatchPacket } = require("../telemetry/dispatcher") as typeof import("../telemetry/dispatcher");
  const { NUM_CARS } = require("../telemetry/shared/constants") as typeof import("../telemetry/shared/constants");
  const { buildWsMessage } = require("../ws/messageFormat") as typeof import("../ws/messageFormat");
  /* eslint-enable @typescript-eslint/no-var-requires */

  const buildStart = Date.now();
  const build = buildDemoSession(packets);
  applyCaptureTimes(build.sessionId, buildCaptureTimes(build.firstReceivedAt, build.lastReceivedAt, build.completions));
  const buildMs = Date.now() - buildStart;

  const seedStart = Date.now();
  const computeInsights = (lapA: number, lapB: number): LapInsights =>
    buildInsights({
      primaryTelemetry: listCarTelemetrySamplesForLap(build.sessionId, lapA),
      comparisonTelemetry: listCarTelemetrySamplesForLap(build.sessionId, lapB),
      primaryMotion: listMotionSamplesForLap(build.sessionId, lapA),
      comparisonMotion: listMotionSamplesForLap(build.sessionId, lapB),
    });
  const seed = validateCoachSeed(rawSeed, {
    recordingSha256: sha256Hex(recordingData),
    sessionUid: build.sessionUid,
    completedLaps: listLapsForSession(build.sessionId).map((lap) => lap.lapNumber),
    computeInsights,
  });
  applyCoachSeed(build.sessionId, seed);
  const seedMs = Date.now() - seedStart;

  setReadOnly();

  let replayRunning = false;
  const restCounter = createRestCounter();
  const server = http.createServer(
    createApp({ demo: { allowedOrigin: config.allowedOrigin, restCounter }, isHealthy: () => replayRunning })
  );
  const live = attachDemoWsServer(server, {
    allowedOrigin: config.allowedOrigin,
    maxConnections: config.maxConnections,
    maxConnectionMs: config.maxConnectionMs,
    perMessageDeflate: config.wsCompression ? {} : false,
    onEvent: (event) => console.log(describeEvent(event)),
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  function send(buffer: Buffer): void {
    // Mesma regra do servidor local: um pacote malformado é descartado, o
    // loop segue (constituição, princípio II).
    try {
      const result = dispatchPacket(buffer);
      if (!result) return;
      const { header, packetId, data } = result;
      if (header.playerCarIndex < 0 || header.playerCarIndex >= NUM_CARS) {
        throw new Error(`playerCarIndex fora do intervalo (0-${NUM_CARS - 1}): ${header.playerCarIndex}`);
      }
      const cars =
        packetId === 0
          ? (data as PacketMotionData).carMotionData
          : packetId === 2
            ? (data as PacketLapData).lapData
            : packetId === 6
              ? (data as PacketCarTelemetryData).carTelemetryData
              : null;
      if (!cars) return;
      const message = buildWsMessage<unknown>(header, packetId, cars);
      if (message) live.broadcast(JSON.stringify(toPlayerOnlyMessage(message)));
    } catch (err) {
      console.error("[demo] pacote descartado no loop:", err instanceof Error ? err.message : err);
    }
  }

  const abort = new AbortController();
  replayRunning = true;
  // O loop só transmite: o banco já está completo e só leitura (FR-005).
  void runReplay(
    packets,
    { speed: "1x", loop: true },
    {
      send,
      wait: (ms) => delay(ms, undefined, { signal: abort.signal }),
      onPass: (pass) => console.log(`[demo] passada ${pass} do loop`),
    }
  )
    .catch((err) => console.error("[demo] o loop parou com erro:", err instanceof Error ? err.message : err))
    .finally(() => {
      replayRunning = false;
    });

  console.log(
    `[demo] pronto em ${Date.now() - startedAt} ms (montagem ${buildMs} ms, hash ${hashMs} ms, cache ${seedMs} ms; ` +
      `compressão do WebSocket ${config.wsCompression ? "ligada" : "desligada"})`
  );

  setInterval(() => {
    const cpu = process.cpuUsage();
    const ws = live.stats();
    const rest = restCounter.stats();
    console.log(
      formatSummary({
        openConnections: ws.openConnections,
        wsBytes: ws.bytesWritten,
        restBytes: rest.restBytes,
        coach503: rest.coach503,
        cpuUserMs: Math.round(cpu.user / 1000),
        cpuSystemMs: Math.round(cpu.system / 1000),
      })
    );
  }, SUMMARY_INTERVAL_MS).unref();

  const shutdown = () => {
    abort.abort();
    live.close(1001, "going away");
    server.closeAllConnections();
    server.close();
    closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
