import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoachUserMessage } from "./coachUserMessage";
import { LapInsights } from "../analysis/types";

const EMPTY_INSIGHTS: LapInsights = {
  totalDeltaS: 0,
  corners: [],
  tyreWindowExcursions: [],
};

test("sem benchmark, a mensagem é só o JSON de insights (sem cabeçalho)", () => {
  const message = buildCoachUserMessage(EMPTY_INSIGHTS);
  assert.equal(message, JSON.stringify(EMPTY_INSIGHTS));
});

test("benchmark null é tratado como ausente, sem cabeçalho", () => {
  const message = buildCoachUserMessage(EMPTY_INSIGHTS, null);
  assert.equal(message, JSON.stringify(EMPTY_INSIGHTS));
});

test("com bestLapTimeMs, formata o recorde pessoal como m:ss.mmm", () => {
  const message = buildCoachUserMessage(EMPTY_INSIGHTS, {
    bestLapTimeMs: 92345, // 1min 32.345s
    bestLapSessionId: 1,
    bestLapNumber: 3,
    theoreticalBestMs: null,
  });

  assert.ok(message.startsWith("Recorde pessoal do piloto nesta pista: 1:32.345."));
  assert.ok(message.endsWith(JSON.stringify(EMPTY_INSIGHTS)));
});

test("com theoreticalBestMs, formata a volta teórica junto do recorde", () => {
  const message = buildCoachUserMessage(EMPTY_INSIGHTS, {
    bestLapTimeMs: 92345,
    bestLapSessionId: 1,
    bestLapNumber: 3,
    theoreticalBestMs: 91000, // 1min 31.000s
  });

  assert.ok(message.includes("Recorde pessoal do piloto nesta pista: 1:32.345."));
  assert.ok(message.includes("Volta teórica na pista (melhores setores combinados, podem ser de voltas diferentes): 1:31.000."));
});

test("segundos abaixo de 10 ficam com zero à esquerda (m:0ss.mmm)", () => {
  const message = buildCoachUserMessage(EMPTY_INSIGHTS, {
    bestLapTimeMs: 65005, // 1min 05.005s
    bestLapSessionId: 1,
    bestLapNumber: 1,
    theoreticalBestMs: null,
  });

  assert.ok(message.startsWith("Recorde pessoal do piloto nesta pista: 1:05.005."));
});

test("o JSON de insights sempre vem intacto ao final da mensagem, mesmo com contexto", () => {
  const insights: LapInsights = {
    totalDeltaS: 1.23,
    corners: [],
    tyreWindowExcursions: [],
  };
  const message = buildCoachUserMessage(insights, { bestLapTimeMs: 90000, bestLapSessionId: 1, bestLapNumber: 1, theoreticalBestMs: null });

  assert.ok(message.endsWith(JSON.stringify(insights)));
});
