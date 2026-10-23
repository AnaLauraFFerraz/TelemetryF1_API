import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { buildDemoRecording } from "./testFixtures";
import { sha256Hex } from "./recording";
import type { CoachSeedFile } from "./coachSeed";
import type { LapInsights } from "../analysis/types";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ALLOWED = "http://localhost:5173";
const READY_DEADLINE_MS = 30_000;
const WAIT_MS = 5_000;

// Os insights do cache sintético são calculados aqui, com as mesmas funções
// que o servidor vai usar, num banco descartável deste processo.
const handle = setupIsolatedTestDb();
/* eslint-disable @typescript-eslint/no-var-requires */
const { buildDemoSession } = require("./buildDemoSession") as typeof import("./buildDemoSession");
const { buildInsights } = require("../analysis/buildInsights") as typeof import("../analysis/buildInsights");
const { listCarTelemetrySamplesForLap } = require("../persistence/carTelemetrySampleRepository") as typeof import("../persistence/carTelemetrySampleRepository");
const { listMotionSamplesForLap } = require("../persistence/motionSampleRepository") as typeof import("../persistence/motionSampleRepository");
/* eslint-enable @typescript-eslint/no-var-requires */

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-demoserver-"));
const children: ChildProcess[] = [];

after(() => {
  for (const child of children) if (child.exitCode === null) child.kill();
  teardownIsolatedTestDb(handle);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const recording = buildDemoRecording({ sessionUID: 777n, laps: 2 });
const build = buildDemoSession(recording.packets);
const computeInsights = (lapA: number, lapB: number): LapInsights =>
  buildInsights({
    primaryTelemetry: listCarTelemetrySamplesForLap(build.sessionId, lapA),
    comparisonTelemetry: listCarTelemetrySamplesForLap(build.sessionId, lapB),
    primaryMotion: listMotionSamplesForLap(build.sessionId, lapA),
    comparisonMotion: listMotionSamplesForLap(build.sessionId, lapB),
  });
const samplesPerLap = new Map(recording.completedLaps.map((lap) => [lap, listCarTelemetrySamplesForLap(build.sessionId, lap).length]));

const recordingText = recording.packets
  .map((p) => JSON.stringify({ timestampMs: p.timestampMs, receivedAt: p.receivedAt, data: p.data.toString("base64") }))
  .join("\n");
const recordingPath = path.join(workDir, "demo.jsonl");
fs.writeFileSync(recordingPath, `${recordingText}\n`);
const recordingSha256 = sha256Hex(fs.readFileSync(recordingPath));

function writeSeed(name: string, seed: CoachSeedFile): string {
  const seedPath = path.join(workDir, name);
  fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`);
  return seedPath;
}

const seed: CoachSeedFile = {
  formatVersion: 1,
  recordingSha256,
  sessionUid: build.sessionUid,
  entries: [{ lapA: 2, lapB: 1, model: "modelo-falso", analysisText: "análise 2-1", insights: computeInsights(2, 1) }],
};
const seedPath = writeSeed("seed.json", seed);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve(true)));
  });
}

// Ambiente limpo e cwd fora do repositório (como em serverFailFast.test.ts),
// para nenhum .env, chave ou porta local chegar ao processo filho.
function demoEnv(vars: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["WS_PORT", "UDP_PORT", "HTTP_PORT", "DB_PATH", "ANTHROPIC_API_KEY", "DOTENV_CONFIG_PATH", "PORT", "DEMO_ALLOWED_ORIGIN"]) {
    delete env[name];
  }
  Object.assign(env, { DEMO_MODE: "true", DEMO_ALLOWED_ORIGIN: ALLOWED }, vars);
  env.TS_NODE_PROJECT = path.join(REPO_ROOT, "tsconfig.json");
  return env;
}

const SERVER_ARGS = ["-r", require.resolve("ts-node/register"), path.join(REPO_ROOT, "src", "server.ts")];

function startDemo(port: number): Promise<{ child: ChildProcess; output: () => string }> {
  const child = spawn(process.execPath, SERVER_ARGS, {
    cwd: workDir,
    env: demoEnv({
      PORT: String(port),
      DEMO_RECORDING_PATH: recordingPath,
      DEMO_SEED_PATH: seedPath,
      DEMO_MAX_CONNECTION_MINUTES: "1",
    }),
  });
  children.push(child);
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

  return new Promise((resolve, reject) => {
    const fail = (why: string) => {
      clearInterval(poll);
      clearTimeout(timer);
      reject(new assert.AssertionError({ message: `${why}; saída: ${output}` }));
    };
    const timer = setTimeout(() => fail("prazo esgotado esperando [demo] pronto"), READY_DEADLINE_MS);
    const poll = setInterval(() => {
      if (output.includes("[demo] pronto")) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve({ child, output: () => output });
      }
    }, 50);
    child.once("exit", (code) => fail(`o servidor saiu com código ${code} antes de ficar pronto`));
  });
}

function withDeadline<T>(promise: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new assert.AssertionError({ message: `prazo esgotado: ${what}` })), WAIT_MS)),
  ]);
}

test("modo demo de ponta a ponta: sessão, datas, cache, CORS, WebSocket compactado de um carro só, sem arquivo de banco", async () => {
  const port = await freePort();
  const { child } = await startDemo(port);
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const sessions = (await (await fetch(`${base}/sessions`)).json()) as Array<{ id: number; startedAt: string; lastSeenAt: string }>;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].startedAt, new Date(build.firstReceivedAt as number).toISOString());
    assert.equal(sessions[0].lastSeenAt, new Date(build.lastReceivedAt as number).toISOString());
    const sessionId = sessions[0].id;

    const detail = (await (await fetch(`${base}/sessions/${sessionId}`)).json()) as { laps: Array<{ lapNumber: number }> };
    assert.deepEqual(
      detail.laps.map((lap) => lap.lapNumber),
      recording.completedLaps,
    );
    for (const lap of recording.completedLaps) {
      const telemetry = (await (await fetch(`${base}/sessions/${sessionId}/laps/${lap}/telemetry`)).json()) as {
        carTelemetry: unknown[];
        motion: unknown[];
      };
      assert.equal(telemetry.carTelemetry.length, samplesPerLap.get(lap), `volta ${lap}`);
      assert.equal(telemetry.motion.length, samplesPerLap.get(lap), `volta ${lap}`);
    }

    const first = await fetch(`${base}/sessions`);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    assert.equal(first.headers.get("cache-control"), "no-cache");
    await first.arrayBuffer();
    const revalidated = await new Promise<number>((resolve, reject) => {
      require("node:http")
        .get(`${base}/sessions`, { headers: { "If-None-Match": etag } }, (res: import("node:http").IncomingMessage) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on("error", reject);
    });
    assert.equal(revalidated, 304);

    const post = (lapA: number, lapB: number) =>
      fetch(`${base}/sessions/${sessionId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lapA, lapB }),
      });
    const cached = (await (await post(2, 1)).json()) as { analysis: string; cached: boolean };
    assert.deepEqual([cached.analysis, cached.cached], ["análise 2-1", true]);
    assert.equal((await post(1, 2)).status, 503);

    const allowed = await fetch(`${base}/sessions`, { headers: { Origin: ALLOWED } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), ALLOWED);
    const foreign = await fetch(`${base}/sessions`, { headers: { Origin: "https://example.com" } });
    assert.equal(foreign.headers.get("access-control-allow-origin"), null);

    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ALLOWED });
    const message = await withDeadline(
      new Promise<{ data: unknown[]; playerCarIndex: number }>((resolve, reject) => {
        ws.once("message", (raw) => resolve(JSON.parse(raw.toString())));
        ws.once("error", reject);
      }),
      "primeira mensagem do WebSocket",
    );
    assert.match(ws.extensions, /permessage-deflate/);
    assert.equal(message.data.length, 1);
    assert.equal(message.playerCarIndex, 0);
    ws.close();

    const refused = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "https://example.com" });
    const status = await withDeadline(
      new Promise<number>((resolve) => {
        refused.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        refused.once("open", () => resolve(101));
        refused.once("error", () => undefined);
      }),
      "resposta ao handshake de outra origem",
    );
    assert.equal(status, 403);

    const leftovers = fs.readdirSync(workDir);
    assert.ok(!leftovers.includes("data"), `pasta data/ criada: ${leftovers.join(", ")}`);
    assert.ok(!leftovers.some((name) => name.endsWith(".db")), `arquivo de banco criado: ${leftovers.join(", ")}`);
  } finally {
    child.kill();
  }
});

const short = (sha256: string) => `${sha256.slice(0, 8)}…${sha256.slice(-4)}`;

async function assertRefused(vars: Record<string, string>, ...messages: string[]): Promise<void> {
  const port = await freePort();
  const result = spawnSync(process.execPath, SERVER_ARGS, {
    cwd: workDir,
    env: demoEnv({ PORT: String(port), DEMO_RECORDING_PATH: recordingPath, DEMO_SEED_PATH: seedPath, ...vars }),
    encoding: "utf8",
    timeout: READY_DEADLINE_MS,
  });
  assert.notEqual(result.status, null, `o servidor subiu em vez de falhar (timeout); stdout: ${result.stdout}`);
  assert.notEqual(result.status, 0);
  for (const message of messages) assert.ok(result.stderr.includes(message), `falta "${message}"; stderr: ${result.stderr}`);
  assert.equal(await portIsFree(port), true, "a porta ficou ocupada");
}

test("modo demo sem a gravação para na inicialização", async () => {
  await assertRefused({ DEMO_RECORDING_PATH: path.join(workDir, "nao-existe.jsonl") }, "[demo] gravação não encontrada em");
});

test("modo demo com a gravação alterada em um byte para na inicialização", async () => {
  const altered = Buffer.from(fs.readFileSync(recordingPath));
  altered[altered.length - 2] ^= 1;
  const alteredPath = path.join(workDir, "alterada.jsonl");
  fs.writeFileSync(alteredPath, altered);
  await assertRefused(
    { DEMO_RECORDING_PATH: alteredPath },
    "[demo] a gravação não confere com o cache do coach",
    `SHA-256 da gravação lida ${short(sha256Hex(altered))}`,
    `recordingSha256 esperado pelo cache ${short(recordingSha256)}`,
  );
});

test("modo demo com cache do coach de outra gravação para na inicialização", async () => {
  const otherSha256 = "b".repeat(64);
  const other = writeSeed("outra.json", { ...seed, recordingSha256: otherSha256 });
  await assertRefused(
    { DEMO_SEED_PATH: other },
    "[demo] a gravação não confere com o cache do coach",
    `SHA-256 da gravação lida ${short(recordingSha256)}`,
    `recordingSha256 esperado pelo cache ${short(otherSha256)}`,
  );
});

test("modo demo com insights do cache fora da tolerância para na inicialização", async () => {
  const entry = seed.entries[0];
  const off = writeSeed("fora.json", {
    ...seed,
    entries: [{ ...entry, insights: { ...entry.insights, totalDeltaS: entry.insights.totalDeltaS + 0.05 } }],
  });
  await assertRefused({ DEMO_SEED_PATH: off }, "[demo] cache do coach inválido: insights do par (2, 1) diferem da análise atual em totalDeltaS");
});
