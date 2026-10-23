import { test } from "node:test";
import assert from "node:assert/strict";
import { createSingleFlight } from "./singleFlight";

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(err: Error): void } {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("duas chamadas com a mesma chave enquanto a primeira não termina chamam fn uma vez e recebem o mesmo valor", async () => {
  const flight = createSingleFlight<string>();
  const gate = deferred<string>();
  let calls = 0;
  const fn = () => {
    calls++;
    return gate.promise;
  };

  const first = flight.run("8:7", fn);
  const second = flight.run("8:7", fn);
  gate.resolve("texto");

  assert.deepEqual(await Promise.all([first, second]), ["texto", "texto"]);
  assert.equal(calls, 1);
});

test("chaves diferentes chamam fn duas vezes", async () => {
  const flight = createSingleFlight<string>();
  let calls = 0;
  const fn = async () => `chamada ${++calls}`;

  await Promise.all([flight.run("8:7", fn), flight.run("9:7", fn)]);

  assert.equal(calls, 2);
});

test("depois que a primeira termina, uma nova chamada com a mesma chave chama fn de novo", async () => {
  const flight = createSingleFlight<string>();
  let calls = 0;
  const fn = async () => `chamada ${++calls}`;

  assert.equal(await flight.run("8:7", fn), "chamada 1");
  assert.equal(await flight.run("8:7", fn), "chamada 2");
});

test("uma rejeição chega às duas chamadas e não fica guardada", async () => {
  const flight = createSingleFlight<string>();
  const gate = deferred<string>();
  let calls = 0;
  const failing = () => {
    calls++;
    return gate.promise;
  };

  const first = flight.run("8:7", failing);
  const second = flight.run("8:7", failing);
  gate.reject(new Error("falhou"));

  await assert.rejects(first, /falhou/);
  await assert.rejects(second, /falhou/);
  assert.equal(calls, 1);

  assert.equal(await flight.run("8:7", async () => "ok"), "ok");
});
