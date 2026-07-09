import { LapInsights } from "../analysis/types";
import { TrackBenchmark } from "../persistence/lapRepository";

function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(3);
  return `${minutes}:${seconds.padStart(6, "0")}`;
}

/**
 * Monta a mensagem do usuário enviada ao Claude: contexto de benchmark (se
 * disponível) em texto legível + o JSON de insights bruto. Função pura -
 * separada do coachService pra ser testável sem tocar a API/rede.
 *
 * benchmark é opcional: a sessão pode não ter trackId ainda (Fase 2 exige
 * um PacketSession recebido) ou não haver voltas válidas suficientes na
 * pista pra calcular um benchmark histórico.
 */
export function buildCoachUserMessage(insights: LapInsights, benchmark?: TrackBenchmark | null): string {
  const contextLines: string[] = [];

  if (benchmark?.bestLapTimeMs != null) {
    contextLines.push(`Recorde pessoal do piloto nesta pista: ${formatLapTime(benchmark.bestLapTimeMs)}.`);
  }
  if (benchmark?.theoreticalBestMs != null) {
    contextLines.push(`Volta teórica na pista (melhores setores combinados, podem ser de voltas diferentes): ${formatLapTime(benchmark.theoreticalBestMs)}.`);
  }

  const header = contextLines.length > 0 ? `${contextLines.join(" ")}\n\n` : "";

  return `${header}${JSON.stringify(insights)}`;
}
