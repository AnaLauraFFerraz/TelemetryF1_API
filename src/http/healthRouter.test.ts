import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createHealthRouter } from "./routes/healthRouter";

const servers: http.Server[] = [];
after(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function listen(isHealthy: () => boolean): Promise<string> {
  const app = express();
  app.use(createHealthRouter(isHealthy));
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("GET /health responde 200 ok enquanto está saudável, sem cache", async () => {
  const base = await listen(() => true);
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("GET /health responde 503 replay stopped quando o replay parou, sem cache", async () => {
  let healthy = true;
  const base = await listen(() => healthy);
  healthy = false;
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "replay stopped" });
});
