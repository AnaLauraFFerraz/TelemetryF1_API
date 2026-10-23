import type { LapInsights } from "../analysis/types";

export function formatAnalyzeOutput(insights: LapInsights, coachMessage: string, promptVersion: string): string {
  return [
    `=== insights ===\n${JSON.stringify(insights, null, 2)}`,
    `=== mensagem do coach ===\n${coachMessage}`,
    `=== versão do prompt ===\n${promptVersion}`,
  ].join("\n\n");
}
