import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoachUserMessage } from "./coachUserMessage";
import { ComparedLap, comparedLapsBlock, invalidComparisonWarning, opportunityBlock } from "./coachReading";
import { topOpportunities } from "./opportunities";
import { CornerInsight, LapInsights } from "../analysis/types";

const LAP_6: ComparedLap = { lapNumber: 6, lapTimeMs: 74306, isValid: false };
const LAP_7: ComparedLap = { lapNumber: 7, lapTimeMs: 74144, isValid: true };
const LAP_8: ComparedLap = { lapNumber: 8, lapTimeMs: 73372, isValid: true };

function corner(apexDistance: number, deltaLossS: number): CornerInsight {
  return {
    corner: { index: 0, apexDistance, apexSpeed: 100, brakingStartDistance: apexDistance - 50, exitDistance: apexDistance + 50, severity: "medium" },
    deltaLossS,
    braking: { brakingPointDiffM: -10, peakBrakeDiff: 0.5, trailBrakingPrimary: true, trailBrakingComparison: false },
    throttle: { throttleOnDiffM: 5, coastingTimePrimaryS: 0.2, coastingTimeComparisonS: 0, throttleOscillationPrimary: 2, throttleOscillationComparison: 2 },
    lineDeviation: null,
  };
}

function insightsOf(...corners: CornerInsight[]): LapInsights {
  return { totalDeltaS: 0.5, corners, tyreWindowExcursions: [] };
}

const OPPORTUNITIES_HEADER = "Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):";

test("os blocos vêm na ordem do contrato, separados por uma linha em branco", () => {
  const insights = insightsOf(corner(100, 0.1), corner(200, 0.3));
  const message = buildCoachUserMessage(insights, LAP_7, LAP_6);
  const top = topOpportunities(insights);

  const expected = [
    comparedLapsBlock(LAP_7, LAP_6),
    invalidComparisonWarning(LAP_6),
    [OPPORTUNITIES_HEADER, opportunityBlock(1, top[0]), opportunityBlock(2, top[1])].join("\n"),
    `Dados completos (JSON):\n${JSON.stringify(insights)}`,
  ].join("\n\n");
  assert.equal(message, expected);
});

test("o aviso só aparece quando a volta de comparação é inválida", () => {
  const insights = insightsOf(corner(100, 0.1));
  assert.ok(buildCoachUserMessage(insights, LAP_7, LAP_6).includes("Aviso: a volta de comparação é inválida."));
  assert.ok(!buildCoachUserMessage(insights, LAP_6, LAP_7).includes("Aviso:"));
  assert.ok(!buildCoachUserMessage(insights, LAP_7, LAP_8).includes("Aviso:"));
});

test("traz o cabeçalho das oportunidades e um bloco por oportunidade, no máximo três", () => {
  const insights = insightsOf(corner(1, 0.1), corner(2, 0.2), corner(3, 0.3), corner(4, 0.4), corner(5, -0.1));
  const message = buildCoachUserMessage(insights, LAP_7, LAP_8);

  assert.ok(message.includes(OPPORTUNITIES_HEADER));
  assert.ok(message.includes("1. 4m · +0.40s"));
  assert.ok(message.includes("2. 3m · +0.30s"));
  assert.ok(message.includes("3. 2m · +0.20s"));
  assert.ok(!message.includes("4. 1m"));
  assert.ok(!message.includes("5m · +"));
});

test("sem curva que perdeu tempo, a mensagem diz isso e não lista oportunidade", () => {
  const message = buildCoachUserMessage(insightsOf(corner(1, 0), corner(2, -0.2)), LAP_7, LAP_8);

  assert.ok(message.includes("Oportunidades: nenhuma curva teve perda de tempo contra a volta de comparação."));
  assert.ok(!message.includes(OPPORTUNITIES_HEADER));
  assert.ok(!message.includes("Ponto de frenagem"));
});

test("o último bloco é o JSON de insights, intacto", () => {
  const insights = insightsOf(corner(1, 0.1));
  const message = buildCoachUserMessage(insights, LAP_7, LAP_8);

  assert.ok(message.endsWith(`\n\nDados completos (JSON):\n${JSON.stringify(insights)}`));
});

test("a mensagem não traz recorde, volta teórica nem setor, e não recebe benchmark", () => {
  assert.equal(buildCoachUserMessage.length, 3);
  const message = buildCoachUserMessage(insightsOf(corner(1, 0.1)), LAP_7, LAP_6);

  for (const word of ["Recorde", "teórica", "setor"]) {
    assert.ok(!message.includes(word), `a mensagem contém "${word}"`);
  }
});

test("a volta de comparação sem linha: tempo desconhecido e sem diferença oficial", () => {
  const message = buildCoachUserMessage(insightsOf(), LAP_7, { lapNumber: 3, lapTimeMs: null, isValid: null });

  assert.ok(message.includes("tempo oficial desconhecido"));
  assert.ok(message.includes("Diferença oficial: desconhecida"));
  assert.ok(!message.includes("Aviso:"));
});

const INSIGHTS_8_6_JSON =
  '{"totalDeltaS":-0.92,"corners":[{"corner":{"index":0,"apexDistance":401.072265625,"apexSpeed":93,"brakingStartDistance":401.072265625,"exitDistance":480.392578125,"severity":"slow"},"deltaLossS":0.3,"braking":{"brakingPointDiffM":189.82,"peakBrakeDiff":-1,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-17.38,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.34,"throttleOscillationPrimary":4,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":4.49,"avgLateralDeviationM":-3.18}},{"corner":{"index":1,"apexDistance":1439.76171875,"apexSpeed":127,"brakingStartDistance":1306.0390625,"exitDistance":1543.9453125,"severity":"medium"},"deltaLossS":0.29,"braking":{"brakingPointDiffM":18.68,"peakBrakeDiff":0.07,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":47.49,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":2.64,"avgLateralDeviationM":0.08}},{"corner":{"index":2,"apexDistance":2144.044921875,"apexSpeed":206,"brakingStartDistance":2144.044921875,"exitDistance":2167.56640625,"severity":"fast"},"deltaLossS":-0.08,"braking":{"brakingPointDiffM":-6.2,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-76.8,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":2.26,"avgLateralDeviationM":2}},{"corner":{"index":3,"apexDistance":2374.53125,"apexSpeed":76,"brakingStartDistance":2374.53125,"exitDistance":2557.712890625,"severity":"slow"},"deltaLossS":0.05,"braking":{"brakingPointDiffM":-0.61,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-35.27,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.75,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":5.46,"avgLateralDeviationM":1.59}},{"corner":{"index":4,"apexDistance":2490.0625,"apexSpeed":99,"brakingStartDistance":2455.41015625,"exitDistance":2557.712890625,"severity":"slow"},"deltaLossS":0.13,"braking":{"brakingPointDiffM":-2.7,"peakBrakeDiff":0.87,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-35.27,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.29,"throttleOscillationPrimary":2,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":5.46,"avgLateralDeviationM":2.55}},{"corner":{"index":5,"apexDistance":2781.07421875,"apexSpeed":80,"brakingStartDistance":2781.07421875,"exitDistance":2903.05078125,"severity":"slow"},"deltaLossS":0.08,"braking":{"brakingPointDiffM":-17.87,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-62.4,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":3.8,"avgLateralDeviationM":2.78}},{"corner":{"index":6,"apexDistance":3283.45703125,"apexSpeed":95,"brakingStartDistance":3178.296875,"exitDistance":3345.2578125,"severity":"slow"},"deltaLossS":0.36,"braking":{"brakingPointDiffM":-100.7,"peakBrakeDiff":0.99,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":27.03,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.4,"avgLateralDeviationM":-0.75}}],"tyreWindowExcursions":[]}';

// Texto aprovado do par (8, 6) em research.md, seção 4.
const MESSAGE_8_6_BEFORE_JSON = `Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 8, tempo oficial 1:13.372, válida.
- Volta de comparação: volta 6, tempo oficial 1:14.306, inválida.
Diferença oficial: a volta principal foi 0.934 s mais rápida que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 3283m · +0.36s
   - Ponto de frenagem: a volta principal começou a frear 100.7 m antes da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.99 numa escala de 0 a 1).
   - Trail braking: só a volta principal fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 27.03 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
2. 401m · +0.30s
   - Ponto de frenagem: a volta principal começou a frear 189.82 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais leve (diferença de 1 numa escala de 0 a 1).
   - Trail braking: só a volta de comparação fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 17.38 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0.34 s na volta de comparação.
3. 1440m · +0.29s
   - Ponto de frenagem: a volta principal começou a frear 18.68 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.07 numa escala de 0 a 1).
   - Trail braking: as duas voltas fizeram.
   - Retomada do acelerador: a volta principal voltou ao acelerador 47.49 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.

Dados completos (JSON):
`;

test("o par (8, 6) gera exatamente a mensagem aprovada na pesquisa", () => {
  const insights = JSON.parse(INSIGHTS_8_6_JSON) as LapInsights;
  assert.equal(buildCoachUserMessage(insights, LAP_8, LAP_6), MESSAGE_8_6_BEFORE_JSON + INSIGHTS_8_6_JSON);
});
