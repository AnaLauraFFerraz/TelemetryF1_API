import test from "node:test";
import assert from "node:assert/strict";
import { COACH_SYSTEM_PROMPT } from "./coachPrompt";

function assertContains(fragment: string): void {
  assert.ok(COACH_SYSTEM_PROMPT.includes(fragment), `o prompt deveria conter: ${fragment}`);
}

function assertLacks(fragment: string): void {
  assert.ok(!COACH_SYSTEM_PROMPT.includes(fragment), `o prompt não deveria conter: ${fragment}`);
}

test("rótulos: usa só os dados, na ordem dada, com o exemplo do formato", () => {
  assertContains("Explique as oportunidades na ordem em que vieram, cada uma identificada só pelo rótulo dado");
  assertContains("Não escolha, não reordene, não renumere");
  assertContains("1. 334m · +0.29s");
});

test("nenhuma curva ganha nome ou número próprio", () => {
  assertContains('nada de "Curva 4"');
});

test("não fala de setores", () => {
  assertContains("Não fale de setores");
});

test("não contradiz o trail braking false", () => {
  assertContains("se trailBraking de uma volta é false, não diga que ela fez trail braking");
});

test("coasting: definição e o que ele não é", () => {
  assertContains("o carro anda sem freio e sem acelerador, só rolando");
  assertContains("Coasting não é patinar, derrapar nem perder tração");
});

test("os quatro sinais: frenagem, pressão de freio, acelerador e perda por curva", () => {
  assertContains("braking.brakingPointDiffM: negativo = a volta principal começou a frear ANTES");
  assertContains("braking.peakBrakeDiff: diferença da pressão máxima de freio, numa escala de 0 a 1");
  assertContains("Positivo = a volta principal freou mais forte; negativo = mais leve");
  assertContains("throttle.throttleOnDiffM: negativo = a volta principal voltou ao acelerador ANTES");
  assertContains("deltaLossS: tempo (segundos) perdido nessa curva. Positivo = a volta principal perdeu tempo ali");
});

test("o sinal do desvio lateral médio é arbitrário e não vira dentro/fora", () => {
  assertContains("O sinal de avgLateralDeviationM é arbitrário");
  assertContains("não diga para que lado (dentro, fora, esquerda, direita)");
});

test("volta inválida: repete o aviso e não afirma onde nem por que", () => {
  assertContains("Nunca afirme onde nem por que uma volta foi invalidada");
});

test("totalDeltaS é uma medida pelas amostras, próxima da diferença oficial, e continua sem ser citado", () => {
  assertContains("medido pelas amostras, próximo da diferença oficial de tempo de volta");
  assertContains("use a diferença oficial da mensagem e não o cite");
  assertLacks("Não é a diferença oficial de tempo de volta");
});

test("as curvas são as da pista, as mesmas qualquer que seja a volta principal", () => {
  assertContains("as curvas da pista, as mesmas qualquer que seja a volta principal");
  assertLacks("curvas detectadas na volta principal");
});

test("os limites da curva são o trecho dela, não um ponto de frenagem", () => {
  assertContains("corner.brakingStartDistance / corner.exitDistance: início e fim do trecho da curva");
  assertContains("do ponto mais rápido antes da curva ao ponto mais rápido depois dela");
  assertContains("não são um ponto de frenagem nem de retomada");
});

test("deltaLossS inclui a saída para a reta seguinte", () => {
  assertContains("incluindo a saída para a reta seguinte");
});

test("os quatro booleanos de quem freou e de quem voltou ao acelerador pleno, e os null das diferenças", () => {
  assertContains("braking.brakedPrimary / brakedComparison: true se a volta freou nesta curva; false se só tirou o pé ou passou direto");
  assertContains("throttle.fullThrottlePrimary / fullThrottleComparison: true se a volta voltou ao acelerador pleno dentro do trecho");
  assertContains("false se não voltou antes da próxima curva");
  assertContains("null quando uma das voltas não freou nessa curva");
  assertContains("null quando uma das voltas não voltou ao acelerador pleno antes da próxima curva");
});

test("o coasting vai do ponto mais lento da volta até a retomada", () => {
  assertContains("do ponto mais lento da volta até a retomada do acelerador (ou o fim do trecho)");
});

test("não diz que uma volta freou ou voltou ao acelerador pleno quando o campo é false", () => {
  assertContains("se brakedPrimary ou brakedComparison de uma volta é false, não diga que ela freou");
  assertContains("se fullThrottlePrimary ou fullThrottleComparison de uma volta é false, não diga que ela voltou ao acelerador pleno");
});

test("regras da revisão: retomada do acelerador, estados não medidos, soma das perdas, proporção", () => {
  assertContains("retomada do acelerador na saída");
  assertContains("insegurança, hesitação, medo, falta de confiança");
  assertContains("Não some as perdas das curvas nem as compare com a diferença oficial");
  assertContains("ajuste fino");
});

test("não sobrou nada do prompt antigo", () => {
  assertLacks("normalmente a melhor volta");
  assertLacks("tração na saída");
  assertLacks("Curva 4 -");
});
