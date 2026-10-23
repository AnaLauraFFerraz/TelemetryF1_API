import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brakingPointPhrase,
  ComparedLap,
  comparedLapsBlock,
  coastingPhrase,
  invalidComparisonWarning,
  opportunityBlock,
  peakBrakePhrase,
  throttleOnPhrase,
  toComparedLap,
  trailBrakingPhrase,
} from "./coachReading";
import { CornerInsight } from "../analysis/types";
import type { LapRow } from "../persistence/lapRepository";

test("ponto de frenagem negativo: a volta principal freou antes", () => {
  assert.equal(
    brakingPointPhrase(-179.97),
    "Ponto de frenagem: a volta principal começou a frear 179.97 m antes da volta de comparação.",
  );
});

test("ponto de frenagem positivo: a volta principal freou depois", () => {
  assert.equal(
    brakingPointPhrase(5.2),
    "Ponto de frenagem: a volta principal começou a frear 5.2 m depois da volta de comparação.",
  );
});

test("ponto de frenagem zero e null", () => {
  assert.equal(brakingPointPhrase(0), "Ponto de frenagem: igual nas duas voltas.");
  assert.equal(brakingPointPhrase(-0), "Ponto de frenagem: igual nas duas voltas.");
  assert.equal(brakingPointPhrase(null), null);
});

test("pressão máxima de freio: positivo é mais forte, negativo é mais leve", () => {
  assert.equal(
    peakBrakePhrase(0.8),
    "Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.8 numa escala de 0 a 1).",
  );
  assert.equal(
    peakBrakePhrase(-1),
    "Pressão máxima de freio: a volta principal freou mais leve (diferença de 1 numa escala de 0 a 1).",
  );
});

test("pressão máxima de freio zero e null", () => {
  assert.equal(peakBrakePhrase(0), "Pressão máxima de freio: igual nas duas voltas.");
  assert.equal(peakBrakePhrase(null), null);
});

test("retomada do acelerador: negativo é antes, positivo é depois", () => {
  assert.equal(
    throttleOnPhrase(-19.43),
    "Retomada do acelerador: a volta principal voltou ao acelerador 19.43 m antes da volta de comparação.",
  );
  assert.equal(
    throttleOnPhrase(112.93),
    "Retomada do acelerador: a volta principal voltou ao acelerador 112.93 m depois da volta de comparação.",
  );
});

test("retomada do acelerador zero e null", () => {
  assert.equal(throttleOnPhrase(0), "Retomada do acelerador: no mesmo ponto nas duas voltas.");
  assert.equal(throttleOnPhrase(null), null);
});

test("trail braking: as quatro combinações", () => {
  assert.equal(trailBrakingPhrase(true, true), "Trail braking: as duas voltas fizeram.");
  assert.equal(trailBrakingPhrase(false, false), "Trail braking: nenhuma das duas voltas fez.");
  assert.equal(trailBrakingPhrase(true, false), "Trail braking: só a volta principal fez.");
  assert.equal(trailBrakingPhrase(false, true), "Trail braking: só a volta de comparação fez.");
});

test("coasting: os dois valores como vieram", () => {
  assert.equal(
    coastingPhrase(0.34, 0),
    "Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.34 s na volta principal, 0 s na volta de comparação.",
  );
});

// Curva de 334 m do par (6, 7), segundo lugar entre as oportunidades.
const CORNER_334: CornerInsight = {
  corner: { index: 0, apexDistance: 333.693359375, apexSpeed: 114, brakingStartDistance: 211.248046875, exitDistance: 497.76953125, severity: "medium" },
  deltaLossS: 0.29,
  braking: { brakingPointDiffM: -179.97, peakBrakeDiff: 1, trailBrakingPrimary: true, trailBrakingComparison: false },
  throttle: { throttleOnDiffM: 19.43, coastingTimePrimaryS: 0.34, coastingTimeComparisonS: 0, throttleOscillationPrimary: 6, throttleOscillationComparison: 6 },
  lineDeviation: { maxLateralDeviationM: 5.3, avgLateralDeviationM: 1.7 },
};

test("o bloco da oportunidade 334m do par (6, 7) tem as seis linhas aprovadas", () => {
  assert.equal(
    opportunityBlock(2, CORNER_334),
    [
      "2. 334m · +0.29s",
      "   - Ponto de frenagem: a volta principal começou a frear 179.97 m antes da volta de comparação.",
      "   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 1 numa escala de 0 a 1).",
      "   - Trail braking: só a volta principal fez.",
      "   - Retomada do acelerador: a volta principal voltou ao acelerador 19.43 m depois da volta de comparação.",
      "   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.34 s na volta principal, 0 s na volta de comparação.",
    ].join("\n"),
  );
});

test("com throttleOnDiffM null a linha da retomada some do bloco", () => {
  const block = opportunityBlock(2, { ...CORNER_334, throttle: { ...CORNER_334.throttle, throttleOnDiffM: null } });
  assert.ok(!block.includes("Retomada do acelerador"));
  assert.equal(block.split("\n").length, 5);
});

test("com os diffs de frenagem null as linhas de frenagem somem, trail braking e coasting ficam", () => {
  const block = opportunityBlock(1, {
    ...CORNER_334,
    braking: { ...CORNER_334.braking, brakingPointDiffM: null, peakBrakeDiff: null },
  });
  assert.ok(!block.includes("Ponto de frenagem"));
  assert.ok(!block.includes("Pressão máxima de freio"));
  assert.ok(block.includes("Trail braking"));
  assert.ok(block.includes("Coasting"));
});

test("nenhum número das frases é diferente do valor absoluto do campo", () => {
  const block = opportunityBlock(1, CORNER_334);
  const numbers = (block.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  // 1 (rank), 334 (ápice), 0.29, 179.97, 1 (peak), 0 e 1 (escala), 19.43, 0.34, 0
  assert.deepEqual(numbers, [1, 334, 0.29, 179.97, 1, 0, 1, 19.43, 0.34, 0]);
});

const LAP_6: ComparedLap = { lapNumber: 6, lapTimeMs: 74306, isValid: false };
const LAP_7: ComparedLap = { lapNumber: 7, lapTimeMs: 74144, isValid: true };
const LAP_8: ComparedLap = { lapNumber: 8, lapTimeMs: 73372, isValid: true };
const LAP_3_SEM_LINHA: ComparedLap = { lapNumber: 3, lapTimeMs: null, isValid: null };

const TODOS_OS_DELTAS = "Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.";
const AVISO_COMPARACAO_INVALIDA =
  "Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.";

test("toComparedLap converte uma linha de laps", () => {
  const row: LapRow = {
    lapNumber: 7,
    lapTimeMs: 74144,
    sector1Ms: 20000,
    sector2Ms: 30000,
    sector3Ms: 24144,
    isValid: true,
    carPosition: 1,
    recordedAt: "2026-10-23T00:00:00.000Z",
  };
  assert.deepEqual(toComparedLap(7, row), { lapNumber: 7, lapTimeMs: 74144, isValid: true });
  assert.deepEqual(toComparedLap(6, { ...row, lapNumber: 6, lapTimeMs: 74306, isValid: false }), LAP_6);
});

test("toComparedLap sem linha dá tempo e validade null", () => {
  assert.deepEqual(toComparedLap(3, undefined), LAP_3_SEM_LINHA);
});

test("bloco das voltas do par (7, 6): volta principal mais rápida", () => {
  assert.equal(
    comparedLapsBlock(LAP_7, LAP_6),
    [
      "Voltas comparadas (mesma sessão):",
      "- Volta principal (a que o piloto quer melhorar): volta 7, tempo oficial 1:14.144, válida.",
      "- Volta de comparação: volta 6, tempo oficial 1:14.306, inválida.",
      "Diferença oficial: a volta principal foi 0.162 s mais rápida que a volta de comparação.",
      TODOS_OS_DELTAS,
    ].join("\n"),
  );
});

test("bloco das voltas do par (6, 8): volta principal mais lenta", () => {
  assert.ok(comparedLapsBlock(LAP_6, LAP_8).includes("Diferença oficial: a volta principal foi 0.934 s mais lenta que a volta de comparação."));
  assert.ok(comparedLapsBlock(LAP_6, LAP_8).includes("volta 8, tempo oficial 1:13.372, válida."));
});

test("bloco das voltas do par (8, 7)", () => {
  assert.ok(comparedLapsBlock(LAP_8, LAP_7).includes("Diferença oficial: a volta principal foi 0.772 s mais rápida que a volta de comparação."));
});

test("tempos iguais: a diferença oficial é zero, sem mais rápida nem mais lenta", () => {
  const block = comparedLapsBlock(LAP_7, { lapNumber: 9, lapTimeMs: 74144, isValid: true });
  assert.ok(block.includes("Diferença oficial: as duas voltas tiveram o mesmo tempo."));
  assert.ok(!block.includes("mais rápida"));
  assert.ok(!block.includes("mais lenta"));
});

test("volta sem linha: tempo e validade desconhecidos e diferença oficial desconhecida", () => {
  const block = comparedLapsBlock(LAP_7, LAP_3_SEM_LINHA);
  assert.ok(block.includes("- Volta de comparação: volta 3, tempo oficial desconhecido, validade desconhecida."));
  assert.ok(
    block.includes("Diferença oficial: desconhecida (falta o tempo oficial de uma das voltas). Não afirme diferença de tempo de volta."),
  );
  assert.ok(!block.includes("mais rápida"));
  assert.ok(!block.includes("mais lenta"));
});

test("a volta principal sem linha também deixa a diferença desconhecida", () => {
  const block = comparedLapsBlock(LAP_3_SEM_LINHA, LAP_7);
  assert.ok(block.includes("volta 3, tempo oficial desconhecido, validade desconhecida."));
  assert.ok(block.includes("Diferença oficial: desconhecida"));
});

test("o bloco das voltas sempre traz a linha dos deltas contra a volta de comparação", () => {
  for (const [a, b] of [[LAP_7, LAP_6], [LAP_6, LAP_8], [LAP_3_SEM_LINHA, LAP_7]]) {
    assert.ok(comparedLapsBlock(a, b).endsWith(TODOS_OS_DELTAS));
  }
});

test("aviso quando a volta de comparação é inválida", () => {
  assert.equal(invalidComparisonWarning(LAP_6), AVISO_COMPARACAO_INVALIDA);
});

test("sem aviso quando só a volta principal é inválida (a de comparação é válida)", () => {
  assert.equal(invalidComparisonWarning(LAP_7), null);
});

test("sem aviso quando a validade da volta de comparação é desconhecida", () => {
  assert.equal(invalidComparisonWarning(LAP_3_SEM_LINHA), null);
});

test("com as duas inválidas o aviso vale, pois a de comparação é inválida", () => {
  assert.equal(invalidComparisonWarning({ lapNumber: 5, lapTimeMs: 75000, isValid: false }), AVISO_COMPARACAO_INVALIDA);
});
