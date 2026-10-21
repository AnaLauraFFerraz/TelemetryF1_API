import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { attachDemoWsServer, type DemoWsEvent, type DemoWsOptions, type DemoWsServer } from "./demoWsServer";

const ALLOWED = "http://localhost:5173";
const WAIT_MS = 2000;

const cleanups: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

async function startServer(overrides: Partial<DemoWsOptions> = {}) {
  const events: DemoWsEvent[] = [];
  const server = http.createServer();
  const demo: DemoWsServer = attachDemoWsServer(server, {
    allowedOrigin: ALLOWED,
    maxConnections: 5,
    maxConnectionMs: 60_000,
    perMessageDeflate: {},
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return { url, demo, events };
}

// Toda espera tem prazo próprio e, se estourar, falha num assert: o vermelho
// contra o esboço tem que ser uma asserção, não um timeout do runner.
function waitFor<T>(register: (resolve: (value: T) => void, fail: (reason: string) => void) => void, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new assert.AssertionError({ message: `prazo esgotado esperando ${what}` })), WAIT_MS);
    register(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(new assert.AssertionError({ message: `${what}: ${reason}` }));
      },
    );
  });
}

function connect(url: string, origin?: string): WebSocket {
  const client = new WebSocket(url, origin ? { origin } : {});
  cleanups.push(() => client.terminate());
  return client;
}

function opened(client: WebSocket): Promise<void> {
  return waitFor<void>((resolve, fail) => {
    client.once("open", () => resolve());
    client.once("error", (err) => fail(`erro em vez de abrir: ${err.message}`));
  }, "a conexão abrir");
}

function closed(client: WebSocket): Promise<{ code: number; reason: string }> {
  return waitFor((resolve, fail) => {
    client.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    client.once("error", (err) => fail(`erro em vez de fechar: ${err.message}`));
  }, "a conexão fechar");
}

test("origem estrangeira recebe 403 no handshake", async () => {
  const { url, events } = await startServer();
  const client = connect(url, "https://example.com");
  const status = await waitFor<number>((resolve, fail) => {
    client.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    client.once("open", () => fail("abriu"));
    client.once("error", (err) => fail(`erro sem resposta HTTP: ${err.message}`));
  }, "a resposta do handshake");
  assert.equal(status, 403);
  assert.ok(events.some((e) => e.type === "refused-origin"), JSON.stringify(events));
});

test("sem Origin e com a origem permitida a conexão abre", async () => {
  const { url, events } = await startServer();
  await opened(connect(url));
  await opened(connect(url, ALLOWED));
  assert.equal(events.filter((e) => e.type === "opened").length, 2);
});

test("acima do limite a conexão é aceita e fechada com 4001 demo full", async () => {
  const { url, events } = await startServer({ maxConnections: 1 });
  await opened(connect(url, ALLOWED));
  const second = connect(url, ALLOWED);
  const result = await closed(second);
  assert.deepEqual(result, { code: 4001, reason: "demo full" });
  assert.ok(events.some((e) => e.type === "full"), JSON.stringify(events));
});

test("no tempo máximo a conexão é fechada com 4002 time limit", async () => {
  const { url, events } = await startServer({ maxConnectionMs: 300 });
  const client = connect(url, ALLOWED);
  await opened(client);
  const result = await closed(client);
  assert.deepEqual(result, { code: 4002, reason: "time limit" });
  assert.ok(events.some((e) => e.type === "closed" && e.code === 4002), JSON.stringify(events));
});

test("fechada antes do tempo máximo, a conexão não recebe o 4002 depois", async () => {
  const { url, events } = await startServer({ maxConnectionMs: 300 });
  const client = connect(url, ALLOWED);
  await opened(client);
  client.close(1000, "tchau");
  await closed(client);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(!events.some((e) => e.type === "closed" && e.code === 4002), JSON.stringify(events));
  assert.ok(events.some((e) => e.type === "closed"), JSON.stringify(events));
});

test("com compressão ligada, o cliente que oferece negocia permessage-deflate", async () => {
  const { url } = await startServer({ perMessageDeflate: {} });
  const client = connect(url, ALLOWED);
  await opened(client);
  assert.match(client.extensions, /permessage-deflate/);
});

test("com compressão desligada, nenhuma extensão é negociada", async () => {
  const { url } = await startServer({ perMessageDeflate: false });
  const client = connect(url, ALLOWED);
  await opened(client);
  assert.equal(client.extensions, "");
});

test("broadcast chega a todos os abertos, e stats conta conexões e bytes escritos", async () => {
  const { url, demo } = await startServer();
  const a = connect(url, ALLOWED);
  const b = connect(url, ALLOWED);
  await opened(a);
  await opened(b);
  await waitFor<void>((resolve, fail) => {
    const started = Date.now();
    const poll = () => {
      if (demo.stats().openConnections === 2) return resolve();
      if (Date.now() - started > WAIT_MS / 2) return fail(`openConnections=${demo.stats().openConnections}`);
      setTimeout(poll, 20);
    };
    poll();
  }, "as duas conexões contarem");

  const got = (client: WebSocket) =>
    waitFor<string>((resolve) => client.once("message", (data) => resolve(data.toString())), "a mensagem chegar");
  const pending = [got(a), got(b)];
  demo.broadcast('{"ola":1}');
  assert.deepEqual(await Promise.all(pending), ['{"ola":1}', '{"ola":1}']);
  assert.ok(demo.stats().bytesWritten > 0, `bytesWritten=${demo.stats().bytesWritten}`);
});

test("close fecha todas as conexões com o código pedido", async () => {
  const { url, demo } = await startServer();
  const client = connect(url, ALLOWED);
  await opened(client);
  const pending = closed(client);
  demo.close(1001, "going away");
  assert.deepEqual(await pending, { code: 1001, reason: "going away" });
});
