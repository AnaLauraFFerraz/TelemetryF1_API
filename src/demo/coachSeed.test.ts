import { test } from "node:test";
import assert from "node:assert/strict";
import type { LapInsights } from "../analysis/types";
import { validateCoachSeed, type CoachSeedContext } from "./coachSeed";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const PREFIX = "[demo] cache do coach inválido:";

function insightsFor(lapA: number, lapB: number): LapInsights {
  return { totalDeltaS: (lapA - lapB) / 10, corners: [], tyreWindowExcursions: [] };
}

function context(overrides: Partial<CoachSeedContext> = {}): CoachSeedContext {
  return { recordingSha256: HASH, sessionUid: "42", completedLaps: [1, 2], computeInsights: insightsFor, ...overrides };
}

function seed(): Record<string, unknown> {
  return {
    formatVersion: 1,
    recordingSha256: HASH,
    sessionUid: "42",
    entries: [
      { lapA: 1, lapB: 2, model: "modelo", analysisText: "texto 1-2", insights: insightsFor(1, 2) },
      { lapA: 2, lapB: 1, model: "modelo", analysisText: "texto 2-1", insights: insightsFor(2, 1) },
    ],
  };
}

function entries(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  return raw.entries as Array<Record<string, unknown>>;
}

test("um cache válido é devolvido", () => {
  const raw = seed();
  assert.deepEqual(validateCoachSeed(raw, context()), raw);
});

test("recusa o que não é um objeto", () => {
  assert.throws(() => validateCoachSeed([], context()), { message: `${PREFIX} o arquivo não é um objeto JSON.` });
});

test("recusa outro formatVersion", () => {
  assert.throws(() => validateCoachSeed({ ...seed(), formatVersion: 2 }, context()), {
    message: `${PREFIX} formatVersion 2, esperado 1.`,
  });
});

test("recusa o cache de outra gravação, citando os dois hashes", () => {
  assert.throws(() => validateCoachSeed({ ...seed(), recordingSha256: OTHER_HASH }, context()), {
    message: `${PREFIX} feito para outra gravação (recordingSha256 ${OTHER_HASH}, gravação em uso ${HASH}).`,
  });
});

test("recusa outro sessionUid", () => {
  assert.throws(() => validateCoachSeed({ ...seed(), sessionUid: "43" }, context()), {
    message: `${PREFIX} sessionUid 43, sessão montada 42.`,
  });
});

test("recusa uma volta que a sessão montada não tem", () => {
  const raw = seed();
  entries(raw)[1].lapA = 7;
  assert.throws(() => validateCoachSeed(raw, context()), {
    message: `${PREFIX} entries[1] cita a volta 7, que a sessão montada não tem (voltas: 1, 2).`,
  });
});

test("recusa um par da volta com ela mesma", () => {
  const raw = seed();
  entries(raw)[0].lapB = 1;
  assert.throws(() => validateCoachSeed(raw, context()), { message: `${PREFIX} entries[0] compara a volta 1 com ela mesma.` });
});

test("recusa um par repetido", () => {
  const raw = seed();
  entries(raw).push({ ...entries(raw)[0] });
  assert.throws(() => validateCoachSeed(raw, context()), { message: `${PREFIX} par (1, 2) repetido.` });
});

test("recusa uma entrada sem analysisText", () => {
  const raw = seed();
  delete entries(raw)[0].analysisText;
  assert.throws(() => validateCoachSeed(raw, context()), { message: `${PREFIX} entries[0] sem analysisText.` });
});

test("recusa chaves fora do contrato, no topo e numa entrada", () => {
  assert.throws(() => validateCoachSeed({ ...seed(), usage: { input_tokens: 1 } }, context()), {
    message: `${PREFIX} chave fora do contrato: usage.`,
  });
  const raw = seed();
  entries(raw)[1].createdAt = "2026-10-21T00:00:00Z";
  assert.throws(() => validateCoachSeed(raw, context()), { message: `${PREFIX} chave fora do contrato em entries[1]: createdAt.` });
});

test("recusa insights além da tolerância, citando o par, o caminho e os dois valores", () => {
  const raw = seed();
  (entries(raw)[0].insights as LapInsights).totalDeltaS = -0.15;
  assert.throws(() => validateCoachSeed(raw, context()), {
    message: `${PREFIX} insights do par (1, 2) diferem da análise atual em totalDeltaS: -0.15 no arquivo, -0.1 agora.`,
  });
});

test("aceita insights dentro da tolerância", () => {
  const raw = seed();
  (entries(raw)[0].insights as LapInsights).totalDeltaS = -0.11;
  assert.doesNotThrow(() => validateCoachSeed(raw, context()));
});
