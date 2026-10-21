import { buildInsights } from "../analysis/buildInsights";
import type { LapInsights } from "../analysis/types";
import { listCarTelemetrySamplesForLap } from "../persistence/carTelemetrySampleRepository";
import { getTrackBenchmark, listLapsForSession, type TrackBenchmark } from "../persistence/lapRepository";
import { listMotionSamplesForLap } from "../persistence/motionSampleRepository";
import { getSessionById } from "../persistence/sessionRepository";
import { applyCaptureTimes } from "./applyCaptureTimes";
import { buildDemoSession } from "./buildDemoSession";
import { buildCaptureTimes } from "./captureTimes";
import { validateCoachSeed, type CoachSeedEntry, type CoachSeedFile } from "./coachSeed";
import { insightsMatch } from "./insightsMatch";
import type { DemoPacket } from "./recording";

export type GenerateCoaching = (insights: LapInsights, benchmark: TrackBenchmark | null) => Promise<{ text: string; model: string }>;

export interface ExportCoachSeedInput {
  packets: DemoPacket[];
  recordingSha256: string;
  pairs: Array<[number, number]>;
  existing: CoachSeedFile | undefined;
  generate: GenerateCoaching;
  currentModel: string;
}

/**
 * Monta o cache do coach a partir da gravação, num banco que quem chama já
 * isolou (DB_PATH temporário ou :memory:). O coach entra por parâmetro: a
 * ferramenta passa o de verdade, os testes passam um falso. Um par só é
 * pedido de novo quando não existe no cache anterior da mesma gravação, ou
 * quando os insights saíram da tolerância ou o modelo mudou - a mesma
 * entrada nunca é paga duas vezes (constituição, princípio III).
 */
export async function exportCoachSeed(input: ExportCoachSeedInput): Promise<CoachSeedFile> {
  const build = buildDemoSession(input.packets);
  applyCaptureTimes(build.sessionId, buildCaptureTimes(build.firstReceivedAt, build.lastReceivedAt, build.completions));

  const session = getSessionById(build.sessionId);
  const benchmark = session && session.trackId !== null ? getTrackBenchmark(session.trackId) : null;
  const completedLaps = listLapsForSession(build.sessionId).map((lap) => lap.lapNumber);
  const computeInsights = (lapA: number, lapB: number): LapInsights =>
    buildInsights({
      primaryTelemetry: listCarTelemetrySamplesForLap(build.sessionId, lapA),
      comparisonTelemetry: listCarTelemetrySamplesForLap(build.sessionId, lapB),
      primaryMotion: listMotionSamplesForLap(build.sessionId, lapA),
      comparisonMotion: listMotionSamplesForLap(build.sessionId, lapB),
    });

  const reusable =
    input.existing && input.existing.recordingSha256 === input.recordingSha256 && input.existing.sessionUid === build.sessionUid
      ? input.existing.entries
      : [];

  const pairs = [...input.pairs].sort(([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2);
  const entries: CoachSeedEntry[] = [];
  for (const [lapA, lapB] of pairs) {
    const insights = computeInsights(lapA, lapB);
    const previous = reusable.find((entry) => entry.lapA === lapA && entry.lapB === lapB);
    if (previous && previous.model === input.currentModel && insightsMatch(previous.insights, insights).match) {
      entries.push(previous);
      continue;
    }
    const { text, model } = await input.generate(insights, benchmark);
    entries.push({ lapA, lapB, model, analysisText: text, insights });
  }

  const seed: CoachSeedFile = { formatVersion: 1, recordingSha256: input.recordingSha256, sessionUid: build.sessionUid, entries };
  return validateCoachSeed(seed, { recordingSha256: input.recordingSha256, sessionUid: build.sessionUid, completedLaps, computeInsights });
}
