import type { LapInsights } from "../analysis/types";
import { insightsMatch } from "./insightsMatch";

// Uma análise em cache só vale enquanto a versão do prompt, o modelo e os
// insights são os atuais; os insights guardados são comparados com os
// recém-calculados pela mesma regra de tolerância do cache da demo.
export function isCachedAnalysisCurrent(
  row: { model: string; promptVersion: string | null; insightsJson: string },
  current: { model: string; promptVersion: string; insights: LapInsights }
): boolean {
  if (row.promptVersion === null || row.promptVersion !== current.promptVersion || row.model !== current.model) return false;
  return insightsMatch(JSON.parse(row.insightsJson), current.insights).match;
}
