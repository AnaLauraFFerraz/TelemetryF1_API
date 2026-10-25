import { CornerInsight } from "../analysis/types";
import type { LapRow } from "../persistence/lapRepository";
import { opportunityLabel } from "./opportunities";

export interface ComparedLap {
  lapNumber: number;
  lapTimeMs: number | null;
  isValid: boolean | null;
}

// Conjunto fechado dos modelos de frase que o código escreve: toda frase sai de
// uma entrada daqui ({m} é a magnitude), então um ramo novo precisa de uma
// entrada nova - e o teste de promptVersion exige que cada uma apareça numa
// das mensagens de referência.
export const PHRASE_TEMPLATES = {
  brakingBefore: "Ponto de frenagem: a volta principal começou a frear {m} m antes da volta de comparação.",
  brakingAfter: "Ponto de frenagem: a volta principal começou a frear {m} m depois da volta de comparação.",
  brakingEqual: "Ponto de frenagem: igual nas duas voltas.",
  peakStronger: "Pressão máxima de freio: a volta principal freou mais forte (diferença de {m} numa escala de 0 a 1).",
  peakLighter: "Pressão máxima de freio: a volta principal freou mais leve (diferença de {m} numa escala de 0 a 1).",
  peakEqual: "Pressão máxima de freio: igual nas duas voltas.",
  throttleBefore: "Retomada do acelerador: a volta principal voltou ao acelerador {m} m antes da volta de comparação.",
  throttleAfter: "Retomada do acelerador: a volta principal voltou ao acelerador {m} m depois da volta de comparação.",
  throttleSame: "Retomada do acelerador: no mesmo ponto nas duas voltas.",
  trailBoth: "Trail braking: as duas voltas fizeram.",
  trailPrimaryOnly: "Trail braking: só a volta principal fez.",
  trailComparisonOnly: "Trail braking: só a volta de comparação fez.",
  trailNone: "Trail braking: nenhuma das duas voltas fez.",
  brakedPrimaryOnly: "Frenagem: só a volta principal freou nesta curva; a volta de comparação não freou (só tirou o pé ou passou direto).",
  brakedComparisonOnly: "Frenagem: só a volta de comparação freou nesta curva; a volta principal não freou (só tirou o pé ou passou direto).",
  brakedNeither: "Frenagem: nenhuma das duas voltas freou nesta curva (as duas só tiraram o pé ou passaram direto).",
  noFullThrottlePrimary:
    "Acelerador pleno: a volta de comparação voltou ao acelerador pleno antes da próxima curva; a volta principal não.",
  noFullThrottleComparison:
    "Acelerador pleno: a volta principal voltou ao acelerador pleno antes da próxima curva; a volta de comparação não.",
  noFullThrottleBoth: "Acelerador pleno: nenhuma das duas voltas voltou ao acelerador pleno antes da próxima curva.",
  invalidComparisonWarning:
    "Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.",
  lapTimeUnknown: "tempo oficial desconhecido",
  lapValidityUnknown: "validade desconhecida",
  noOpportunities: "Oportunidades: nenhuma curva teve perda de tempo contra a volta de comparação.",
} as const;

function fill(template: string, magnitude: string): string {
  return template.replace("{m}", magnitude);
}

export function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(3);
  return `${minutes}:${seconds.padStart(6, "0")}`;
}

// Volta sem linha em laps: o fim dela nunca foi visto, então tempo e validade são desconhecidos.
export function toComparedLap(lapNumber: number, row: LapRow | undefined): ComparedLap {
  if (!row) return { lapNumber, lapTimeMs: null, isValid: null };
  return { lapNumber, lapTimeMs: row.lapTimeMs, isValid: row.isValid };
}

function lapDescription(lap: ComparedLap): string {
  const time = lap.lapTimeMs === null ? PHRASE_TEMPLATES.lapTimeUnknown : `tempo oficial ${formatLapTime(lap.lapTimeMs)}`;
  const validity = lap.isValid === null ? PHRASE_TEMPLATES.lapValidityUnknown : lap.isValid ? "válida" : "inválida";
  return `volta ${lap.lapNumber}, ${time}, ${validity}.`;
}

function officialDifferenceLine(primary: ComparedLap, comparison: ComparedLap): string {
  if (primary.lapTimeMs === null || comparison.lapTimeMs === null) {
    return "Diferença oficial: desconhecida (falta o tempo oficial de uma das voltas). Não afirme diferença de tempo de volta.";
  }
  const diffMs = primary.lapTimeMs - comparison.lapTimeMs;
  if (diffMs === 0) return "Diferença oficial: as duas voltas tiveram o mesmo tempo.";
  const how = diffMs > 0 ? "mais lenta" : "mais rápida";
  return `Diferença oficial: a volta principal foi ${(Math.abs(diffMs) / 1000).toFixed(3)} s ${how} que a volta de comparação.`;
}

export function comparedLapsBlock(primary: ComparedLap, comparison: ComparedLap): string {
  return [
    "Voltas comparadas (mesma sessão):",
    `- Volta principal (a que o piloto quer melhorar): ${lapDescription(primary)}`,
    `- Volta de comparação: ${lapDescription(comparison)}`,
    officialDifferenceLine(primary, comparison),
    "Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.",
  ].join("\n");
}

export function invalidComparisonWarning(comparison: ComparedLap): string | null {
  if (comparison.isValid !== false) return null;
  return PHRASE_TEMPLATES.invalidComparisonWarning;
}

// Toda magnitude sai do valor absoluto do campo; nenhum número novo entra aqui.
function magnitude(value: number): string {
  return String(Math.abs(value));
}

export function brakingPointPhrase(diffM: number | null): string | null {
  if (diffM === null) return null;
  if (diffM === 0) return PHRASE_TEMPLATES.brakingEqual;
  return fill(diffM < 0 ? PHRASE_TEMPLATES.brakingBefore : PHRASE_TEMPLATES.brakingAfter, magnitude(diffM));
}

export function peakBrakePhrase(diff: number | null): string | null {
  if (diff === null) return null;
  if (diff === 0) return PHRASE_TEMPLATES.peakEqual;
  return fill(diff > 0 ? PHRASE_TEMPLATES.peakStronger : PHRASE_TEMPLATES.peakLighter, magnitude(diff));
}

export function throttleOnPhrase(diffM: number | null): string | null {
  if (diffM === null) return null;
  if (diffM === 0) return PHRASE_TEMPLATES.throttleSame;
  return fill(diffM < 0 ? PHRASE_TEMPLATES.throttleBefore : PHRASE_TEMPLATES.throttleAfter, magnitude(diffM));
}

export function trailBrakingPhrase(primary: boolean, comparison: boolean): string {
  if (primary && comparison) return PHRASE_TEMPLATES.trailBoth;
  if (primary) return PHRASE_TEMPLATES.trailPrimaryOnly;
  if (comparison) return PHRASE_TEMPLATES.trailComparisonOnly;
  return PHRASE_TEMPLATES.trailNone;
}

// Só diz algo quando as duas voltas têm amostras no trecho e pelo menos uma
// delas não freou: o que não é booleano (null, sem amostras, ou um insights
// anterior a estes campos) é omitido, como nos demais campos.
export function brakedPhrase(primary: boolean | null, comparison: boolean | null): string | null {
  if (typeof primary !== "boolean" || typeof comparison !== "boolean") return null;
  if (primary && comparison) return null;
  if (primary) return PHRASE_TEMPLATES.brakedPrimaryOnly;
  if (comparison) return PHRASE_TEMPLATES.brakedComparisonOnly;
  return PHRASE_TEMPLATES.brakedNeither;
}

export function fullThrottlePhrase(primary: boolean | null, comparison: boolean | null): string | null {
  if (typeof primary !== "boolean" || typeof comparison !== "boolean") return null;
  if (primary && comparison) return null;
  if (primary) return PHRASE_TEMPLATES.noFullThrottleComparison;
  if (comparison) return PHRASE_TEMPLATES.noFullThrottlePrimary;
  return PHRASE_TEMPLATES.noFullThrottleBoth;
}

export function coastingPhrase(primaryS: number, comparisonS: number): string {
  return `Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): ${primaryS} s na volta principal, ${comparisonS} s na volta de comparação.`;
}

export function opportunityBlock(rank: number, c: CornerInsight): string {
  const phrases = [
    brakedPhrase(c.braking.brakedPrimary, c.braking.brakedComparison),
    brakingPointPhrase(c.braking.brakingPointDiffM),
    peakBrakePhrase(c.braking.peakBrakeDiff),
    trailBrakingPhrase(c.braking.trailBrakingPrimary, c.braking.trailBrakingComparison),
    fullThrottlePhrase(c.throttle.fullThrottlePrimary, c.throttle.fullThrottleComparison),
    throttleOnPhrase(c.throttle.throttleOnDiffM),
    coastingPhrase(c.throttle.coastingTimePrimaryS, c.throttle.coastingTimeComparisonS),
  ].filter((phrase): phrase is string => phrase !== null);

  return [opportunityLabel(rank, c), ...phrases.map((phrase) => `   - ${phrase}`)].join("\n");
}
