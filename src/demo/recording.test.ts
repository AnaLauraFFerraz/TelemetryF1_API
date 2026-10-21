import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findProjectRoot } from "../config/projectRoot";
import {
  PUBLISHED_RECORDING_SHA256,
  PUBLISHED_RECORDING_URL,
  ensureRecording,
  parseRecording,
  sha256Hex,
  verifyRecording,
} from "./recording";

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDest(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-recording-"));
  tempDirs.push(dir);
  return path.join(dir, "sub", "gravacao.jsonl");
}

const CONTENT = Buffer.from('{"timestampMs":0,"data":"AQID"}\n');
const URL = "https://exemplo.invalid/gravacao.jsonl";

function fakeFetch(body: Buffer, status = 200) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(body, { status });
  }) as typeof fetch;
  return { fn, calls };
}

test("ensureRecording: arquivo presente com o hash certo não baixa nada", async () => {
  const dest = tempDest();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, CONTENT);
  const { fn, calls } = fakeFetch(Buffer.from("outro"));

  assert.equal(await ensureRecording(dest, fn, { url: URL, expectedSha256: sha256Hex(CONTENT) }), "present");
  assert.deepEqual(calls, []);
});

test("ensureRecording: arquivo ausente é baixado, conferido e gravado, criando a pasta", async () => {
  const dest = tempDest();
  const { fn, calls } = fakeFetch(CONTENT);

  assert.equal(await ensureRecording(dest, fn, { url: URL, expectedSha256: sha256Hex(CONTENT) }), "downloaded");
  assert.deepEqual(calls, [URL]);
  assert.deepEqual(fs.readFileSync(dest), CONTENT);
  assert.ok(!fs.existsSync(`${dest}.part`), "o temporário ficou para trás");
});

test("ensureRecording: download com hash errado falha e não deixa arquivo nenhum", async () => {
  const dest = tempDest();
  const { fn } = fakeFetch(Buffer.from("conteúdo errado"));
  const expected = sha256Hex(CONTENT);

  await assert.rejects(ensureRecording(dest, fn, { url: URL, expectedSha256: expected }), {
    message: `[demo] gravação não confere com o SHA-256 esperado (esperado ${expected}, obtido ${sha256Hex(Buffer.from("conteúdo errado"))}).`,
  });
  assert.ok(!fs.existsSync(dest), "ficou um arquivo no destino");
  assert.ok(!fs.existsSync(`${dest}.part`), "o temporário ficou para trás");
});

test("ensureRecording: status HTTP diferente de 2xx falha com mensagem clara", async () => {
  const dest = tempDest();
  const { fn } = fakeFetch(Buffer.from("não encontrado"), 404);

  await assert.rejects(ensureRecording(dest, fn, { url: URL, expectedSha256: sha256Hex(CONTENT) }), {
    message: `[demo] download da gravação falhou: HTTP 404 em ${URL}`,
  });
  assert.ok(!fs.existsSync(dest));
  assert.ok(!fs.existsSync(`${dest}.part`));
});

test("ensureRecording: arquivo existente com hash errado é substituído pelo download conferido, com log", async () => {
  const dest = tempDest();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, "antigo e errado");
  const { fn } = fakeFetch(CONTENT);

  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logged.push(args.join(" "));
  try {
    assert.equal(await ensureRecording(dest, fn, { url: URL, expectedSha256: sha256Hex(CONTENT) }), "downloaded");
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(fs.readFileSync(dest), CONTENT);
  assert.ok(
    logged.some((line) => line.includes("tinha SHA-256 errado") && line.includes("substituída")),
    `log: ${JSON.stringify(logged)}`,
  );
});

test("ensureRecording: se o download falha, o arquivo existente fica como estava", async () => {
  const dest = tempDest();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, "antigo e errado");
  const { fn } = fakeFetch(Buffer.from("também errado"));

  await assert.rejects(ensureRecording(dest, fn, { url: URL, expectedSha256: sha256Hex(CONTENT) }));
  assert.equal(fs.readFileSync(dest, "utf8"), "antigo e errado");
  assert.ok(!fs.existsSync(`${dest}.part`));
});

test("ensureRecording sem opções usa a URL da Release e o SHA-256 publicado", async () => {
  const dest = tempDest();
  const { fn, calls } = fakeFetch(CONTENT);

  await assert.rejects(ensureRecording(dest, fn), {
    message: `[demo] gravação não confere com o SHA-256 esperado (esperado ${PUBLISHED_RECORDING_SHA256}, obtido ${sha256Hex(CONTENT)}).`,
  });
  assert.deepEqual(calls, [PUBLISHED_RECORDING_URL]);
  assert.equal(
    PUBLISHED_RECORDING_URL,
    "https://github.com/AnaLauraFFerraz/TelemetryF1_API/releases/download/sample-recording-v1/demo-interlagos-tt-20hz-laps6-8.jsonl",
  );
});

test("parseRecording decodifica timestampMs, receivedAt e o pacote em base64 de cada linha", () => {
  const text = [
    JSON.stringify({ timestampMs: 0, receivedAt: 1792168223797, size: 3, data: Buffer.from([1, 2, 3]).toString("base64") }),
    "",
    JSON.stringify({ timestampMs: 50, size: 2, data: Buffer.from([9, 8]).toString("base64") }),
    "",
  ].join("\n");

  const packets = parseRecording(text);

  assert.equal(packets.length, 2);
  assert.equal(packets[0].timestampMs, 0);
  assert.equal(packets[0].receivedAt, 1792168223797);
  assert.deepEqual([...packets[0].data], [1, 2, 3]);
  assert.equal(packets[1].timestampMs, 50);
  assert.equal(packets[1].receivedAt, undefined);
  assert.deepEqual([...packets[1].data], [9, 8]);
});

test("sha256Hex calcula o SHA-256 em hexadecimal minúsculo", () => {
  assert.equal(sha256Hex(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("verifyRecording recusa um conteúdo que não confere com o hash esperado", () => {
  const data = Buffer.from("abc");
  const wrong = "0".repeat(64);
  assert.throws(() => verifyRecording(data, wrong), {
    message: `[demo] gravação não confere com o SHA-256 esperado (esperado ${wrong}, obtido ${sha256Hex(data)}).`,
  });
  assert.doesNotThrow(() => verifyRecording(data, sha256Hex(data)));
});

test("o README publica o mesmo SHA-256 da gravação que o código confere", () => {
  const readme = fs.readFileSync(path.join(findProjectRoot(), "README.md"), "utf8");
  assert.ok(readme.includes(PUBLISHED_RECORDING_SHA256), "o README não contém PUBLISHED_RECORDING_SHA256");
});
