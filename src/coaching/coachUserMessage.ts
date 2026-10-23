import { LapInsights } from "../analysis/types";
import { ComparedLap, PHRASE_TEMPLATES, comparedLapsBlock, invalidComparisonWarning, opportunityBlock } from "./coachReading";
import { topOpportunities } from "./opportunities";

const OPPORTUNITIES_HEADER = "Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):";

/**
 * Monta a mensagem do usuário enviada ao Claude: as duas voltas comparadas, o
 * aviso de comparação inválida, a leitura das oportunidades feita pelo código
 * e o JSON de insights bruto. Função pura - separada do coachService pra ser
 * testável sem tocar a API/rede. Depende só das duas voltas e dos insights:
 * nenhum recorde nem benchmark entra aqui.
 */
export function buildCoachUserMessage(insights: LapInsights, primary: ComparedLap, comparison: ComparedLap): string {
  const opportunities = topOpportunities(insights);
  const opportunitiesBlock =
    opportunities.length === 0
      ? PHRASE_TEMPLATES.noOpportunities
      : [OPPORTUNITIES_HEADER, ...opportunities.map((c, i) => opportunityBlock(i + 1, c))].join("\n");

  const blocks = [
    comparedLapsBlock(primary, comparison),
    invalidComparisonWarning(comparison),
    opportunitiesBlock,
    `Dados completos (JSON):\n${JSON.stringify(insights)}`,
  ].filter((block): block is string => block !== null);

  return blocks.join("\n\n");
}
