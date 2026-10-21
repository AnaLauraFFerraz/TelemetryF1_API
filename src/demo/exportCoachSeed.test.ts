import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import type { LapInsights } from "../analysis/types";
import { validateCoachSeed, type CoachSeedFile } from "./coachSeed";
import { buildDemoRecording } from "./testFixtures";

const handle = setupIsolatedTestDb();
/* eslint-disable @typescript-eslint/no-var-requires */
const { exportCoachSeed } = require("./exportCoachSeed") as typeof import("./exportCoachSeed");
/* eslint-enable @typescript-eslint/no-var-requires */

after(() => teardownIsolatedTestDb(handle));

const HASH = "c".repeat(64);
const PAIRS: Array<[number, number]> = [
  [1, 2],
  [2, 1],
];

// Coach falso: nenhuma chamada paga em teste. Conta as chamadas e devolve
// um texto que identifica a ordem em que foi chamado.
function fakeCoach() {
  const calls: LapInsights[] = [];
  const generate = async (insights: LapInsights) => {
    calls.push(insights);
    return { text: `análise ${calls.length}`, model: "modelo-falso" };
  };
  return { generate, calls };
}

const recording = buildDemoRecording({ sessionUID: 77n, laps: 2 });

async function firstRun() {
  const first = await run(undefined);
  assert.equal(first.calls, 2, "a primeira exportação deveria chamar o coach para os dois pares");
  assert.equal(first.seed.entries.length, 2, "a primeira exportação deveria ter os dois pares");
  return first;
}

async function run(existing: CoachSeedFile | undefined, currentModel = "modelo-falso") {
  const coach = fakeCoach();
  const seed = await exportCoachSeed({
    packets: recording.packets,
    recordingSha256: HASH,
    pairs: PAIRS,
    existing,
    generate: coach.generate,
    currentModel,
  });
  return { seed, calls: coach.calls.length };
}

test("sem cache anterior, chama o coach uma vez por par e monta um cache válido", async () => {
  const { seed, calls } = await run(undefined);

  assert.equal(calls, 2);
  assert.equal(seed.recordingSha256, HASH);
  assert.equal(seed.sessionUid, "77");
  assert.deepEqual(
    seed.entries.map((e) => [e.lapA, e.lapB]),
    [
      [1, 2],
      [2, 1],
    ],
  );
  for (const entry of seed.entries) assert.deepEqual(Object.keys(entry).sort(), ["analysisText", "insights", "lapA", "lapB", "model"]);
  assert.doesNotThrow(() =>
    validateCoachSeed(seed, {
      recordingSha256: HASH,
      sessionUid: "77",
      completedLaps: recording.completedLaps,
      computeInsights: (a, b) => seed.entries.find((e) => e.lapA === a && e.lapB === b)!.insights,
    }),
  );
});

test("rodando de novo com o próprio resultado, não chama o coach", async () => {
  const first = await firstRun();
  const second = await run(first.seed);

  assert.equal(second.calls, 0);
  assert.deepEqual(second.seed, first.seed);
});

test("um par com insights fora da tolerância é pedido de novo, só ele", async () => {
  const first = await firstRun();
  const stale: CoachSeedFile = structuredClone(first.seed);
  stale.entries[0].insights.totalDeltaS += 1;

  const second = await run(stale);
  assert.equal(second.calls, 1);
  assert.deepEqual(second.seed.entries[1], first.seed.entries[1]);
});

test("um par gerado por outro modelo é pedido de novo", async () => {
  const first = await firstRun();
  const otherModel: CoachSeedFile = structuredClone(first.seed);
  otherModel.entries[1].model = "modelo-antigo";

  const second = await run(otherModel);
  assert.equal(second.calls, 1);
  assert.deepEqual(second.seed.entries[0], first.seed.entries[0]);
});

test("um cache de outra gravação não é reaproveitado", async () => {
  const first = await firstRun();
  const otherRecording: CoachSeedFile = { ...structuredClone(first.seed), recordingSha256: "d".repeat(64) };

  const second = await run(otherRecording);
  assert.equal(second.calls, 2);
});
