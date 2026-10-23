import { CornerInsight } from "../analysis/types";
import type { LapRow } from "../persistence/lapRepository";
import { opportunityLabel } from "./opportunities";

export interface ComparedLap {
  lapNumber: number;
  lapTimeMs: number | null;
  isValid: boolean | null;
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
  const time = lap.lapTimeMs === null ? "tempo oficial desconhecido" : `tempo oficial ${formatLapTime(lap.lapTimeMs)}`;
  const validity = lap.isValid === null ? "validade desconhecida" : lap.isValid ? "válida" : "inválida";
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
  return "Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.";
}

// Toda magnitude sai do valor absoluto do campo; nenhum número novo entra aqui.
function magnitude(value: number): string {
  return String(Math.abs(value));
}

export function brakingPointPhrase(diffM: number | null): string | null {
  if (diffM === null) return null;
  if (diffM === 0) return "Ponto de frenagem: igual nas duas voltas.";
  const when = diffM < 0 ? "antes" : "depois";
  return `Ponto de frenagem: a volta principal começou a frear ${magnitude(diffM)} m ${when} da volta de comparação.`;
}

export function peakBrakePhrase(diff: number | null): string | null {
  if (diff === null) return null;
  if (diff === 0) return "Pressão máxima de freio: igual nas duas voltas.";
  const how = diff > 0 ? "mais forte" : "mais leve";
  return `Pressão máxima de freio: a volta principal freou ${how} (diferença de ${magnitude(diff)} numa escala de 0 a 1).`;
}

export function throttleOnPhrase(diffM: number | null): string | null {
  if (diffM === null) return null;
  if (diffM === 0) return "Retomada do acelerador: no mesmo ponto nas duas voltas.";
  const when = diffM < 0 ? "antes" : "depois";
  return `Retomada do acelerador: a volta principal voltou ao acelerador ${magnitude(diffM)} m ${when} da volta de comparação.`;
}

export function trailBrakingPhrase(primary: boolean, comparison: boolean): string {
  if (primary && comparison) return "Trail braking: as duas voltas fizeram.";
  if (primary) return "Trail braking: só a volta principal fez.";
  if (comparison) return "Trail braking: só a volta de comparação fez.";
  return "Trail braking: nenhuma das duas voltas fez.";
}

export function coastingPhrase(primaryS: number, comparisonS: number): string {
  return `Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): ${primaryS} s na volta principal, ${comparisonS} s na volta de comparação.`;
}

export function opportunityBlock(rank: number, c: CornerInsight): string {
  const phrases = [
    brakingPointPhrase(c.braking.brakingPointDiffM),
    peakBrakePhrase(c.braking.peakBrakeDiff),
    trailBrakingPhrase(c.braking.trailBrakingPrimary, c.braking.trailBrakingComparison),
    throttleOnPhrase(c.throttle.throttleOnDiffM),
    coastingPhrase(c.throttle.coastingTimePrimaryS, c.throttle.coastingTimeComparisonS),
  ].filter((phrase): phrase is string => phrase !== null);

  return [opportunityLabel(rank, c), ...phrases.map((phrase) => `   - ${phrase}`)].join("\n");
}
