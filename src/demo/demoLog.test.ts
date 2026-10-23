import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import express from "express";
import { createRestCounter, formatSummary, type DemoCounters } from "./demoLog";

const COUNTERS: DemoCounters = {
  openConnections: 2,
  wsBytes: 3 * 1024 * 1024,
  restBytes: 512 * 1024,
  coach503: 1,
  cpuUserMs: 1200,
  cpuSystemMs: 34,
};

test("o resumo é uma linha só, com conexões, bytes de WebSocket, REST e total, 503 do coach e CPU", () => {
  assert.equal(
    formatSummary(COUNTERS),
    "[demo] resumo: 2 conexões abertas; WebSocket 3145728 B (3.00 MiB); REST 524288 B (0.50 MiB); " +
      "total 3670016 B (3.50 MiB); 503 do coach: 1; CPU 1234 ms (usuário 1200, sistema 34); " +
      "bytes escritos nos sockets pela aplicação; não é o número cobrado pela hospedagem"
  );
});

test("o contador de REST soma os bytes do socket nas respostas de um cliente keep-alive e conta os 503 do coach", async () => {
  const counter = createRestCounter();
  const app = express();
  app.use(counter.middleware);
  app.get("/sessions", (_req, res) => {
    res.json({ dados: "x".repeat(5000) });
  });
  app.post("/sessions/:id/analysis", (_req, res) => {
    res.status(503).json({ error: "coaching indisponível: configure ANTHROPIC_API_KEY" });
  });

  const server = http.createServer(app);
  const sockets: Socket[] = [];
  server.on("connection", (socket) => sockets.push(socket));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

  const request = (method: string, path: string) =>
    new Promise<void>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method, path, agent }, (res) => {
        res.resume();
        res.on("end", () => resolve());
      });
      req.on("error", reject);
      req.end();
    });

  try {
    await request("GET", "/sessions");
    await request("POST", "/sessions/1/analysis");

    assert.equal(sockets.length, 1, "as duas requisições deviam usar o mesmo socket");
    const { restBytes, coach503 } = counter.stats();
    assert.equal(restBytes, sockets[0].bytesWritten);
    assert.ok(restBytes > 5000, `restBytes ${restBytes}`);
    assert.equal(coach503, 1);
  } finally {
    agent.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("o resumo não tem quebra de linha nem nada parecido com um endereço IP", () => {
  const line = formatSummary(COUNTERS);
  assert.ok(line.startsWith("[demo] resumo:"), line);
  assert.ok(!line.includes("\n"), line);
  assert.doesNotMatch(line, /\b\d{1,3}(\.\d{1,3}){3}\b/);
  assert.doesNotMatch(line, /\b[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}\b/i);
});
