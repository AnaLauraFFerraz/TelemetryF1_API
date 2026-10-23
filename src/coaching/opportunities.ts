import { CornerInsight, LapInsights } from "../analysis/types";

export const MAX_OPPORTUNITIES = 3;

// Mesma regra de topOpportunities do frontend (Telemetry-F1/src/utils/coachInsights.ts):
// o sort é estável, então empates mantêm a ordem de insights.corners.
export function topOpportunities(insights: LapInsights, max = MAX_OPPORTUNITIES): CornerInsight[] {
  return [...insights.corners]
    .filter((c) => c.deltaLossS > 0)
    .sort((a, b) => b.deltaLossS - a.deltaLossS)
    .slice(0, max);
}

// Mesma expressão do chip do frontend (CoachPanel.tsx:65), caractere a caractere.
export function opportunityLabel(rank: number, c: CornerInsight): string {
  return `${rank}. ${Math.round(c.corner.apexDistance)}m · +${c.deltaLossS.toFixed(2)}s`;
}
