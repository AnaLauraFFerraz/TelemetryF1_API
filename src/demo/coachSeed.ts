import type { LapInsights } from "../analysis/types";
import { insightsMatch } from "./insightsMatch";

const PREFIX = "[demo] cache do coach inválido:";
const FILE_KEYS = ["formatVersion", "recordingSha256", "sessionUid", "entries"];
const ENTRY_KEYS = ["lapA", "lapB", "model", "analysisText", "insights"];

function invalid(detail: string): Error {
  return new Error(`${PREFIX} ${detail}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface CoachSeedEntry {
  lapA: number;
  lapB: number;
  model: string;
  analysisText: string;
  insights: LapInsights;
}

export interface CoachSeedFile {
  formatVersion: 1;
  recordingSha256: string;
  sessionUid: string;
  entries: CoachSeedEntry[];
}

export interface CoachSeedContext {
  recordingSha256: string;
  sessionUid: string;
  completedLaps: number[];
  computeInsights: (lapA: number, lapB: number) => LapInsights;
}

// O arquivo é público depois de commitado: qualquer chave fora do contrato
// (usage, createdAt, ids de requisição) é recusada, para que nada da conta,
// da requisição ou do uso entre nele (contracts/coach-seed-file.md).
export function validateCoachSeed(raw: unknown, context: CoachSeedContext): CoachSeedFile {
  if (!isObject(raw)) throw invalid("o arquivo não é um objeto JSON.");
  for (const key of Object.keys(raw)) {
    if (!FILE_KEYS.includes(key)) throw invalid(`chave fora do contrato: ${key}.`);
  }
  if (raw.formatVersion !== 1) throw invalid(`formatVersion ${String(raw.formatVersion)}, esperado 1.`);
  if (raw.recordingSha256 !== context.recordingSha256) {
    throw invalid(
      `feito para outra gravação (recordingSha256 ${String(raw.recordingSha256)}, gravação em uso ${context.recordingSha256}).`
    );
  }
  if (raw.sessionUid !== context.sessionUid) {
    throw invalid(`sessionUid ${String(raw.sessionUid)}, sessão montada ${context.sessionUid}.`);
  }
  if (!Array.isArray(raw.entries)) throw invalid("entries não é uma lista.");

  const seen = new Set<string>();
  raw.entries.forEach((entry: unknown, i: number) => {
    if (!isObject(entry)) throw invalid(`entries[${i}] não é um objeto.`);
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.includes(key)) throw invalid(`chave fora do contrato em entries[${i}]: ${key}.`);
    }
    if (typeof entry.analysisText !== "string" || !entry.analysisText) throw invalid(`entries[${i}] sem analysisText.`);
    if (typeof entry.model !== "string" || !entry.model) throw invalid(`entries[${i}] sem model.`);
    const { lapA, lapB } = entry;
    if (!Number.isInteger(lapA) || !Number.isInteger(lapB)) throw invalid(`entries[${i}] sem lapA e lapB inteiros.`);
    const a = lapA as number;
    const b = lapB as number;
    if (a === b) throw invalid(`entries[${i}] compara a volta ${a} com ela mesma.`);
    for (const lap of [a, b]) {
      if (!context.completedLaps.includes(lap)) {
        throw invalid(`entries[${i}] cita a volta ${lap}, que a sessão montada não tem (voltas: ${context.completedLaps.join(", ")}).`);
      }
    }
    const pair = `${a},${b}`;
    if (seen.has(pair)) throw invalid(`par (${a}, ${b}) repetido.`);
    seen.add(pair);

    const result = insightsMatch(entry.insights, context.computeInsights(a, b));
    if (!result.match) {
      throw invalid(
        `insights do par (${a}, ${b}) diferem da análise atual em ${result.path}: ` +
          `${String(result.stored)} no arquivo, ${String(result.computed)} agora.`
      );
    }
  });

  return raw as unknown as CoachSeedFile;
}
