import type { LapInsights } from "../analysis/types";
import type { CachedAnalysis } from "../persistence/analysisRepository";
import type { ComparedLap } from "./coachReading";
import { isCachedAnalysisCurrent } from "./analysisStaleness";
import { createSingleFlight } from "./singleFlight";

export type AnalysisOutcome =
  | { kind: "cached" | "generated"; analysis: string; insights: LapInsights }
  | { kind: "unavailable" }
  | { kind: "no-samples" };

export interface AnalysisResolverDeps {
  getCached(sessionId: number, lapA: number, lapB: number): CachedAnalysis | undefined;
  isConfigured(): boolean;
  buildInputs(
    sessionId: number,
    lapA: number,
    lapB: number
  ): { insights: LapInsights; primary: ComparedLap; comparison: ComparedLap } | null;
  generate(insights: LapInsights, primary: ComparedLap, comparison: ComparedLap): Promise<{ text: string; model: string }>;
  save(
    sessionId: number,
    lapA: number,
    lapB: number,
    insightsJson: string,
    text: string,
    model: string,
    promptVersion: string
  ): void;
  currentModel: string;
  currentPromptVersion: string;
}

export function createAnalysisResolver(deps: AnalysisResolverDeps): {
  resolve(sessionId: number, lapA: number, lapB: number): Promise<AnalysisOutcome>;
} {
  const flight = createSingleFlight<AnalysisOutcome>();
  const current = { model: deps.currentModel, promptVersion: deps.currentPromptVersion };

  return {
    async resolve(sessionId: number, lapA: number, lapB: number): Promise<AnalysisOutcome> {
      const cached = deps.getCached(sessionId, lapA, lapB);
      if (cached && isCachedAnalysisCurrent(cached, current)) {
        return { kind: "cached", analysis: cached.analysisText, insights: JSON.parse(cached.insightsJson) as LapInsights };
      }

      // Texto de prompt ou modelo velho nunca é servido: sem chave o par fica indisponível.
      if (!deps.isConfigured()) return { kind: "unavailable" };

      return flight.run(`${sessionId}:${lapA}:${lapB}`, async () => {
        const inputs = deps.buildInputs(sessionId, lapA, lapB);
        if (!inputs) return { kind: "no-samples" };

        const { text, model } = await deps.generate(inputs.insights, inputs.primary, inputs.comparison);
        deps.save(sessionId, lapA, lapB, JSON.stringify(inputs.insights), text, model, current.promptVersion);
        return { kind: "generated", analysis: text, insights: inputs.insights };
      });
    },
  };
}
