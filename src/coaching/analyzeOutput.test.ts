import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAnalyzeOutput } from "./analyzeOutput";
import { buildCoachUserMessage } from "./coachUserMessage";
import { toComparedLap } from "./coachReading";
import type { LapInsights } from "../analysis/types";

const INSIGHTS: LapInsights = { totalDeltaS: 0.25, corners: [], tyreWindowExcursions: [] };
const MESSAGE = "primeira linha\n\nsegundo bloco\nlinha final";
const VERSION = "0123456789abcdef";

const H_INSIGHTS = "=== insights ===";
const H_MESSAGE = "=== mensagem do coach ===";
const H_VERSION = "=== versão do prompt ===";

test("os três cabeçalhos aparecem uma vez cada e nesta ordem", () => {
  const output = formatAnalyzeOutput(INSIGHTS, MESSAGE, VERSION);

  for (const header of [H_INSIGHTS, H_MESSAGE, H_VERSION]) {
    assert.equal(output.split(header).length - 1, 1, `cabeçalho ${header}`);
  }
  assert.ok(output.indexOf(H_INSIGHTS) < output.indexOf(H_MESSAGE));
  assert.ok(output.indexOf(H_MESSAGE) < output.indexOf(H_VERSION));
});

test("a saída é exatamente as três seções separadas por uma linha vazia, sem quebra no fim", () => {
  const expected = [
    `${H_INSIGHTS}\n${JSON.stringify(INSIGHTS, null, 2)}`,
    `${H_MESSAGE}\n${MESSAGE}`,
    `${H_VERSION}\n${VERSION}`,
  ].join("\n\n");

  const output = formatAnalyzeOutput(INSIGHTS, MESSAGE, VERSION);

  assert.equal(output, expected);
  assert.ok(!output.endsWith("\n"));
});

test("a mensagem do coach vai inalterada, com a linha em branco que ela tem dentro", () => {
  const output = formatAnalyzeOutput(INSIGHTS, MESSAGE, VERSION);

  assert.ok(output.includes(`${H_MESSAGE}\n${MESSAGE}\n\n${H_VERSION}`));
});

test("com a mensagem real de uma volta sem linha em laps, o tempo desconhecido aparece", () => {
  const message = buildCoachUserMessage(INSIGHTS, toComparedLap(8, undefined), toComparedLap(3, undefined));

  const output = formatAnalyzeOutput(INSIGHTS, message, VERSION);

  assert.ok(output.includes("tempo oficial desconhecido"));
});
