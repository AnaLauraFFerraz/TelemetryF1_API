import { LapData } from "../telemetry/lapData/types";
import { CompletedLap } from "./types";

interface LapSnapshot {
  lapNumber: number;
  sector1Ms: number;
  sector2Ms: number;
  currentLapInvalid: number;
}

export interface LapCompletionDetector {
  process(player: LapData): CompletedLap | null;
}

function sector1MsFrom(player: LapData): number {
  return player.sector1TimeMinutesPart * 60_000 + player.sector1TimeMSPart;
}

function sector2MsFrom(player: LapData): number {
  return player.sector2TimeMinutesPart * 60_000 + player.sector2TimeMSPart;
}

/**
 * "Highest seen": compara currentLapNum contra o maior já visto, não contra
 * o pacote anterior recebido. currentLapNum só incrementa +1 por vez, então
 * mesmo perdendo pacotes (UDP não garante entrega/ordem), a primeira vez que
 * um valor maior que o máximo visto chegar, a conclusão "a volta anterior
 * terminou" continua correta - e lastLapTimeInMS desse mesmo pacote é
 * autoritativo, definido pelo próprio jogo nesse instante.
 *
 * Um detector novo deve ser criado por sessão (estado não é compartilhável
 * entre sessões diferentes).
 */
export function createLapCompletionDetector(): LapCompletionDetector {
  let previousSnapshot: LapSnapshot | undefined;

  function process(player: LapData): CompletedLap | null {
    const newLapNum = player.currentLapNum;

    // Sem snapshot ainda: primeiro pacote da sessão (out lap). Nunca tratamos
    // isso como "a volta 0 terminou".
    if (previousSnapshot === undefined) {
      previousSnapshot = {
        lapNumber: newLapNum,
        sector1Ms: sector1MsFrom(player),
        sector2Ms: sector2MsFrom(player),
        currentLapInvalid: player.currentLapInvalid,
      };
      return null;
    }

    // Pacote atrasado/fora de ordem: ignora, não regride o snapshot.
    if (newLapNum < previousSnapshot.lapNumber) {
      return null;
    }

    let completed: CompletedLap | null = null;

    if (newLapNum > previousSnapshot.lapNumber) {
      const lapTimeMs = player.lastLapTimeInMS;

      // sector1/sector2/invalid vêm do snapshot ANTERIOR: no pacote da
      // virada, esses mesmos campos do pacote ATUAL já pertencem à volta
      // nova (resetados), não à que acabou de fechar.
      const sector1Ms = previousSnapshot.sector1Ms;
      const sector2Ms = previousSnapshot.sector2Ms;
      const isValid = previousSnapshot.currentLapInvalid === 0;

      let sector3Ms: number | null = lapTimeMs - sector1Ms - sector2Ms;

      // Guarda: se perdemos pacotes cobrindo a volta inteira, os setores
      // nunca foram atualizados com valores reais - não inventa um número,
      // grava NULL (falha visível é melhor que dado errado).
      if (sector3Ms < 0 || (sector1Ms === 0 && sector2Ms === 0)) {
        sector3Ms = null;
      }

      completed = {
        lapNumber: previousSnapshot.lapNumber,
        lapTimeMs,
        sector1Ms: sector3Ms === null ? null : sector1Ms,
        sector2Ms: sector3Ms === null ? null : sector2Ms,
        sector3Ms,
        isValid,
        carPosition: player.carPosition,
      };
    }

    previousSnapshot = {
      lapNumber: newLapNum,
      sector1Ms: sector1MsFrom(player),
      sector2Ms: sector2MsFrom(player),
      currentLapInvalid: player.currentLapInvalid,
    };

    return completed;
  }

  return { process };
}
