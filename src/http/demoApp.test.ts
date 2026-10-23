import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { buildDemoRecording } from "../demo/testFixtures";
import type { CoachSeedFile } from "../demo/coachSeed";

// O analysisRouter carrega config/env, que no modo local lê as três portas e
// o .env: as portas são fictícias (nada é aberto nelas), e o .env é um vazio
// temporário, para a chave do .env do repositório nunca chegar a este
// processo. O teste ainda confere que o coach não está configurado antes de
// pedir um par sem cache.
const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-demoapp-env-"));
fs.writeFileSync(path.join(envDir, ".env"), "");
process.env.DOTENV_CONFIG_PATH = path.join(envDir, ".env");
delete process.env.ANTHROPIC_API_KEY;
process.env.WS_PORT = "1";
process.env.UDP_PORT = "1";
process.env.HTTP_PORT = "1";

const handle = setupIsolatedTestDb();
/* eslint-disable @typescript-eslint/no-var-requires */
const { db } = require("../persistence/db") as typeof import("../persistence/db");
const { buildDemoSession } = require("../demo/buildDemoSession") as typeof import("../demo/buildDemoSession");
const { applyCoachSeed } = require("../demo/applyCoachSeed") as typeof import("../demo/applyCoachSeed");
const { isCoachingConfigured } = require("../coaching/coachService") as typeof import("../coaching/coachService");
const { createApp } = require("./httpServer") as typeof import("./httpServer");
/* eslint-enable @typescript-eslint/no-var-requires */

const ALLOWED = "http://localhost:5173";
const servers: http.Server[] = [];

after(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  teardownIsolatedTestDb(handle);
  fs.rmSync(envDir, { recursive: true, force: true });
});

const recording = buildDemoRecording({ sessionUID: 4242n, laps: 2 });
const build = buildDemoSession(recording.packets);
const seededInsights = { totalDeltaS: 0.12, corners: [], tyreWindowExcursions: [] };
const seed: CoachSeedFile = {
  formatVersion: 1,
  recordingSha256: "a".repeat(64),
  sessionUid: build.sessionUid,
  entries: [{ lapA: 2, lapB: 1, model: "modelo-falso", analysisText: "análise 2-1", insights: seededInsights }],
};
applyCoachSeed(build.sessionId, seed);

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// A revalidação usa node:http, não fetch: com If-None-Match no pedido, o
// fetch passa ao modo no-store e acrescenta Cache-Control: no-cache, e aí o
// Express nunca responde 304. O navegador revalidando o próprio cache não faz
// isso.
function revalidate(url: string, etag: string): Promise<{ status: number; bodyBytes: number }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers: { "If-None-Match": etag } }, (res) => {
        let bodyBytes = 0;
        res.on("data", (chunk: Buffer) => (bodyBytes += chunk.length));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, bodyBytes }));
      })
      .on("error", reject);
  });
}

const analysisCount = () => (db.prepare("SELECT COUNT(*) AS n FROM lap_analyses").get() as { n: number }).n;

const READ_PATHS = [
  "/sessions",
  `/sessions/${build.sessionId}`,
  `/sessions/${build.sessionId}/benchmark`,
  `/sessions/${build.sessionId}/laps/1/telemetry`,
];

test("modo demo: CORS só para a origem permitida, e sem Origin o corpo é servido", async () => {
  const base = await listen(createApp({ demo: { allowedOrigin: ALLOWED } }));

  const allowed = await fetch(`${base}/sessions`, { headers: { Origin: ALLOWED } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), ALLOWED);
  assert.match(allowed.headers.get("vary") ?? "", /Origin/);

  const foreign = await fetch(`${base}/sessions`, { headers: { Origin: "https://example.com" } });
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);

  const noOrigin = await fetch(`${base}/sessions`);
  assert.equal(noOrigin.status, 200);
  assert.equal(((await noOrigin.json()) as unknown[]).length, 1);
});

test("modo demo: as leituras levam Cache-Control no-cache e ETag, e a revalidação devolve 304 sem corpo", async () => {
  const base = await listen(createApp({ demo: { allowedOrigin: ALLOWED } }));

  for (const readPath of READ_PATHS) {
    const first = await fetch(`${base}${readPath}`);
    assert.equal(first.status, 200, readPath);
    assert.equal(first.headers.get("cache-control"), "no-cache", readPath);
    const etag = first.headers.get("etag");
    assert.ok(etag, `${readPath} sem ETag`);
    await first.arrayBuffer();

    const again = await revalidate(`${base}${readPath}`, etag);
    assert.equal(again.status, 304, readPath);
    assert.equal(again.bodyBytes, 0, readPath);
  }
});

test("modo demo: o POST do coach é no-store, serve o par semeado e dá 503 sem escrever para outro par", async () => {
  assert.equal(isCoachingConfigured(), false, "o coach não pode estar configurado neste teste");
  const base = await listen(createApp({ demo: { allowedOrigin: ALLOWED } }));
  const post = (lapA: number, lapB: number) =>
    fetch(`${base}/sessions/${build.sessionId}/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lapA, lapB }),
    });

  const seeded = await post(2, 1);
  assert.equal(seeded.status, 200);
  assert.equal(seeded.headers.get("cache-control"), "no-store");
  assert.deepEqual(await seeded.json(), { analysis: "análise 2-1", insights: seededInsights, cached: true });

  const before = analysisCount();
  const other = await post(1, 2);
  assert.equal(other.status, 503);
  assert.equal(other.headers.get("cache-control"), "no-store");
  assert.deepEqual(await other.json(), { error: "coaching indisponível: configure ANTHROPIC_API_KEY" });
  assert.equal(analysisCount(), before);
});

test("modo demo: /health responde sem depender da origem e nunca é cacheável", async () => {
  let healthy = true;
  const base = await listen(createApp({ demo: { allowedOrigin: ALLOWED }, isHealthy: () => healthy }));

  const variants: Array<Record<string, string>> = [{}, { Origin: "https://example.com" }];
  for (const headers of variants) {
    const response = await fetch(`${base}/health`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok" });
  }

  healthy = false;
  const stopped = await fetch(`${base}/health`);
  assert.equal(stopped.status, 503);
  assert.equal(stopped.headers.get("cache-control"), "no-store");
});

test("modo local: /health existe e responde 200", async () => {
  const base = await listen(createApp());
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("modo local: createApp() sem opções mantém os cabeçalhos de hoje", async () => {
  const base = await listen(createApp());

  const response = await fetch(`${base}/sessions`, { headers: { Origin: "https://example.com" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://example.com");
  assert.equal(response.headers.get("cache-control"), null);
  assert.ok(response.headers.get("etag"));
});
