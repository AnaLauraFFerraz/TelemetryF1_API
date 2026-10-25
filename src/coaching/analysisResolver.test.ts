import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnalysisResolver, AnalysisResolverDeps } from "./analysisResolver";
import type { CachedAnalysis } from "../persistence/analysisRepository";
import type { ComparedLap } from "./coachReading";
import type { LapInsights } from "../analysis/types";

const MODEL = "claude-opus-4-8";
const VERSION = "0123456789abcdef";
const INSIGHTS: LapInsights = { totalDeltaS: 0.5, corners: [], tyreWindowExcursions: [] };
const PRIMARY: ComparedLap = { lapNumber: 8, lapTimeMs: 73372, isValid: true };
const COMPARISON: ComparedLap = { lapNumber: 7, lapTimeMs: 74144, isValid: true };

function row(overrides: Partial<CachedAnalysis> = {}): CachedAnalysis {
  return {
    insightsJson: JSON.stringify(INSIGHTS),
    analysisText: "texto em cache",
    model: MODEL,
    promptVersion: VERSION,
    createdAt: "2026-10-23T00:00:00.000Z",
    ...overrides,
  };
}

const CHANGED_INSIGHTS: LapInsights = { ...INSIGHTS, totalDeltaS: 0.9 };

interface Harness {
  deps: AnalysisResolverDeps;
  generateCalls: number;
  buildInputsCalls: number;
  saved: { sessionId: number; lapA: number; lapB: number; text: string; model: string; promptVersion: string }[];
  release(): void;
}

function harness(options: {
  cached?: CachedAnalysis;
  configured?: boolean;
  inputs?: boolean;
  insights?: LapInsights;
  generate?: () => Promise<{ text: string; model: string }>;
  gated?: boolean;
}): Harness {
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  const h: Harness = {
    generateCalls: 0,
    buildInputsCalls: 0,
    saved: [],
    release: () => releaseGate(),
    deps: {
      getCached: () => options.cached,
      isConfigured: () => options.configured ?? true,
      buildInputs: () => {
        h.buildInputsCalls++;
        return options.inputs === false ? null : { insights: options.insights ?? INSIGHTS, primary: PRIMARY, comparison: COMPARISON };
      },
      generate: async () => {
        h.generateCalls++;
        if (options.gated) await gate;
        if (options.generate) return options.generate();
        return { text: "texto novo", model: MODEL };
      },
      save: (sessionId, lapA, lapB, _insightsJson, text, model, promptVersion) => {
        h.saved.push({ sessionId, lapA, lapB, text, model, promptVersion });
      },
      currentModel: MODEL,
      currentPromptVersion: VERSION,
    },
  };
  return h;
}

test("linha em dia: devolve o texto em cache e os insights, sem gerar, com ou sem chave", async () => {
  for (const configured of [true, false]) {
    const h = harness({ cached: row(), configured });
    const outcome = await createAnalysisResolver(h.deps).resolve(1, 8, 7);

    assert.deepEqual(outcome, { kind: "cached", analysis: "texto em cache", insights: INSIGHTS });
    assert.equal(h.generateCalls, 0);
  }
});

test("os insights guardados diferem dos recalculados além da tolerância: gera de novo com chave e substitui a linha", async () => {
  const h = harness({ cached: row(), insights: CHANGED_INSIGHTS });
  const outcome = await createAnalysisResolver(h.deps).resolve(1, 8, 7);

  assert.deepEqual(outcome, { kind: "generated", analysis: "texto novo", insights: CHANGED_INSIGHTS });
  assert.equal(h.generateCalls, 1);
  assert.deepEqual(h.saved, [{ sessionId: 1, lapA: 8, lapB: 7, text: "texto novo", model: MODEL, promptVersion: VERSION }]);

  // dentro da tolerância (virada do round2) o texto em cache é servido, sem gerar e sem chave
  const within = harness({ cached: row({ insightsJson: JSON.stringify({ ...INSIGHTS, totalDeltaS: 0.51 }) }), configured: false });
  assert.equal((await createAnalysisResolver(within.deps).resolve(1, 8, 7)).kind, "cached");
  assert.equal(within.generateCalls, 0);
});

test("os insights guardados diferem dos recalculados e não há chave: indisponível, e o texto velho não é servido", async () => {
  const h = harness({ cached: row(), insights: CHANGED_INSIGHTS, configured: false });

  assert.deepEqual(await createAnalysisResolver(h.deps).resolve(1, 8, 7), { kind: "unavailable" });
  assert.equal(h.generateCalls, 0);
  assert.equal(h.saved.length, 0);
});

test("o resolvedor monta as entradas do par antes de decidir, uma vez", async () => {
  const h = harness({ cached: row() });
  await createAnalysisResolver(h.deps).resolve(1, 8, 7);

  assert.equal(h.buildInputsCalls, 1);
});

test("par sem amostras: no-samples, seja qual for o conteúdo do cache e com ou sem chave", async () => {
  for (const configured of [true, false]) {
    const h = harness({ cached: row(), inputs: false, configured });

    assert.deepEqual(await createAnalysisResolver(h.deps).resolve(1, 8, 7), { kind: "no-samples" });
    assert.equal(h.generateCalls, 0);
  }
});

test("linha velha (outra versão, outro modelo, versão null) com chave: gera uma vez e salva com o modelo e a versão atuais", async () => {
  for (const stale of [{ promptVersion: "fedcba9876543210" }, { model: "outro-modelo" }, { promptVersion: null }]) {
    const h = harness({ cached: row(stale) });
    const outcome = await createAnalysisResolver(h.deps).resolve(1, 8, 7);

    assert.deepEqual(outcome, { kind: "generated", analysis: "texto novo", insights: INSIGHTS });
    assert.equal(h.generateCalls, 1);
    assert.deepEqual(h.saved, [{ sessionId: 1, lapA: 8, lapB: 7, text: "texto novo", model: MODEL, promptVersion: VERSION }]);
  }
});

test("linha velha sem chave: indisponível, não gera e não devolve o texto velho", async () => {
  const h = harness({ cached: row({ promptVersion: "fedcba9876543210" }), configured: false });
  const outcome = await createAnalysisResolver(h.deps).resolve(1, 8, 7);

  assert.deepEqual(outcome, { kind: "unavailable" });
  assert.equal(h.generateCalls, 0);
});

test("sem linha e sem chave: indisponível", async () => {
  const h = harness({ configured: false });

  assert.deepEqual(await createAnalysisResolver(h.deps).resolve(1, 8, 7), { kind: "unavailable" });
  assert.equal(h.generateCalls, 0);
});

test("sem linha e com chave: gera e salva", async () => {
  const h = harness({});
  const outcome = await createAnalysisResolver(h.deps).resolve(1, 8, 7);

  assert.equal(outcome.kind, "generated");
  assert.equal(h.saved.length, 1);
});

test("buildInputs devolvendo null: sem amostras, não gera", async () => {
  const h = harness({ inputs: false });

  assert.deepEqual(await createAnalysisResolver(h.deps).resolve(1, 8, 7), { kind: "no-samples" });
  assert.equal(h.generateCalls, 0);
  assert.equal(h.saved.length, 0);
});

test("dois resolve concorrentes do mesmo par velho: generate uma vez e os dois recebem generated", async () => {
  const h = harness({ cached: row({ promptVersion: null }), gated: true });
  const resolver = createAnalysisResolver(h.deps);

  const first = resolver.resolve(1, 8, 7);
  const second = resolver.resolve(1, 8, 7);
  h.release();
  const outcomes = await Promise.all([first, second]);

  assert.equal(h.generateCalls, 1);
  assert.equal(h.saved.length, 1);
  assert.deepEqual(outcomes.map((o) => o.kind), ["generated", "generated"]);
});

test("um generate que lança: os dois recebem o erro, nada é salvo e o próximo resolve chama generate de novo", async () => {
  let fail = true;
  const h = harness({
    gated: true,
    generate: async () => {
      if (fail) throw new Error("API fora");
      return { text: "texto novo", model: MODEL };
    },
  });
  const resolver = createAnalysisResolver(h.deps);

  const first = resolver.resolve(1, 8, 7);
  const second = resolver.resolve(1, 8, 7);
  h.release();
  await assert.rejects(first, /API fora/);
  await assert.rejects(second, /API fora/);
  assert.equal(h.generateCalls, 1);
  assert.equal(h.saved.length, 0);

  fail = false;
  assert.equal((await resolver.resolve(1, 8, 7)).kind, "generated");
  assert.equal(h.generateCalls, 2);
});
