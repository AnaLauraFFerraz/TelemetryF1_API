import { test } from "node:test";
import assert from "node:assert/strict";
import { runReplay } from "./runner";
import { RecordedPacket } from "./types";

function packet(timestampMs: number, tag: string): RecordedPacket {
  return { timestampMs, data: Buffer.from(tag) };
}

test("ordem de envio preserva a ordem do arquivo, mesmo com offsets repetidos", async () => {
  const packets = [packet(0, "a"), packet(0, "b"), packet(0, "c"), packet(10, "d"), packet(10, "e")];
  const sent: string[] = [];

  const result = await runReplay(packets, { speed: "max", loop: false }, {
    send: (buf) => sent.push(buf.toString()),
  });

  assert.deepEqual(sent, ["a", "b", "c", "d", "e"]);
  assert.equal(result.packetsSent, 5);
  assert.equal(result.passes, 1);
});

test("max: nunca espera, envia tudo imediatamente independente do now/wait injetados", async () => {
  const packets = [packet(0, "a"), packet(100000, "b")];
  let waitCalls = 0;

  const result = await runReplay(packets, { speed: "max", loop: false }, {
    send: () => {},
    now: () => 0,
    wait: async () => {
      waitCalls += 1;
    },
  });

  assert.equal(waitCalls, 0);
  assert.equal(result.packetsSent, 2);
});

test("1x: deadline absoluto não acumula erro ao longo de uma gravação longa (FR-004)", async () => {
  const GAP_MS = 50;
  const OVERHEAD_MS = 2; // custo fixo simulado de cada wait() de verdade
  const PACKET_COUNT = 100;

  const packets: RecordedPacket[] = [];
  for (let i = 0; i < PACKET_COUNT; i += 1) {
    packets.push(packet(i * GAP_MS, String(i)));
  }

  let clock = 0;
  let waitCallCount = 0;

  const result = await runReplay(packets, { speed: "1x", loop: false }, {
    send: () => {},
    now: () => clock,
    wait: async (ms) => {
      waitCallCount += 1;
      clock += ms + OVERHEAD_MS; // cada wait "de verdade" sempre atrasa OVERHEAD_MS além do pedido
    },
  });

  const targetTotalMs = (PACKET_COUNT - 1) * GAP_MS;

  assert.equal(result.packetsSent, PACKET_COUNT);
  assert.ok(waitCallCount > 0, "o teste não testaria nada se nenhuma espera real ocorresse");
  // Com deadline absoluto, cada espera encolhe pelo atraso da anterior - o
  // relógio final fica a UM overhead do alvo, não a (nº de esperas × overhead).
  // Uma implementação que encadeasse esperas relativas terminaria em
  // targetTotalMs + waitCallCount * OVERHEAD_MS (~ targetTotalMs + 190ms aqui).
  assert.ok(
    clock <= targetTotalMs + OVERHEAD_MS + 1,
    `esperava no máximo ${targetTotalMs + OVERHEAD_MS + 1}ms, terminou em ${clock}ms - erro acumulando?`
  );
});

test("2x: offset dividido por 2 chega à metade do tempo total", async () => {
  const packets = [packet(0, "a"), packet(1000, "b")];
  let clock = 0;

  await runReplay(packets, { speed: "2x", loop: false }, {
    send: () => {},
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  });

  assert.equal(clock, 500);
});

test("loop: reinicia do primeiro pacote ao chegar no fim, contando passadas", async () => {
  const packets = [packet(0, "a"), packet(10, "b")];
  const sent: string[] = [];
  const passesSeen: number[] = [];

  // 1x: todo pacote com offset > 0 passa por wait() - usa isso pra parar o
  // teste de forma determinística depois de 3 passadas completas, em vez
  // de depender de um loop "infinito" de verdade com uma rede de segurança.
  const result = await runReplay(packets, { speed: "1x", loop: true }, {
    send: (buf) => sent.push(buf.toString()),
    now: () => 0,
    onPass: (n) => passesSeen.push(n),
    wait: async () => {
      if (passesSeen.length >= 3) throw new Error("para o teste depois de 3 passadas");
    },
  });

  assert.deepEqual(passesSeen, [1, 2, 3]);
  assert.deepEqual(sent, ["a", "b", "a", "b", "a"]);
  assert.equal(result.packetsSent, 5);
  assert.equal(result.passes, 3);
});

test("loop: abortado no meio de uma passada (não a primeira) devolve a contagem parcial, sem lançar", async () => {
  const packets = [packet(0, "a"), packet(10, "b"), packet(20, "c")];
  const sent: string[] = [];
  let pass = 0;

  const result = await runReplay(packets, { speed: "1x", loop: true }, {
    send: (buf) => sent.push(buf.toString()),
    now: () => 0, // todo pacote após o primeiro de cada passada precisa de wait()
    onPass: (n) => {
      pass = n;
    },
    wait: async () => {
      // deixa a 1ª passada completa, aborta no meio da 2ª (depois de "a")
      if (pass === 2 && sent[sent.length - 1] === "a") throw new Error("abortado");
    },
  });

  assert.deepEqual(sent, ["a", "b", "c", "a"]);
  assert.equal(result.packetsSent, 4);
  assert.equal(result.passes, 2);
});

test("sem loop (padrão): uma única passada, mesmo que options.loop esteja ausente", async () => {
  const packets = [packet(0, "a")];
  const result = await runReplay(packets, { speed: "max", loop: false }, { send: () => {} });
  assert.equal(result.passes, 1);
});

test("wait rejeitado (sinal abortado pelo chamador) para a passada e devolve a contagem parcial, sem lançar", async () => {
  const packets = [packet(0, "a"), packet(10, "b"), packet(20, "c")];
  const sent: string[] = [];

  const result = await runReplay(packets, { speed: "1x", loop: false }, {
    send: (buf) => sent.push(buf.toString()),
    now: () => 0, // nunca avança - todo pacote após o primeiro precisa de wait()
    wait: async () => {
      throw new Error("abortado");
    },
  });

  assert.deepEqual(sent, ["a"]);
  assert.equal(result.packetsSent, 1);
  assert.equal(result.passes, 1);
});
