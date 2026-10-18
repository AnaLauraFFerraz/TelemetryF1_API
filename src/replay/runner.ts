import { setTimeout as delay } from "node:timers/promises";
import { computeDelayMs } from "./scheduler";
import { ReplayOptions, RecordedPacket } from "./types";

export interface ReplayIo {
  send(buffer: Buffer): void;
  now?(): number;
  wait?(ms: number): Promise<void>;
  onPass?(passNumber: number): void;
}

export interface ReplayResult {
  packetsSent: number;
  passes: number;
}

const defaultWait = (ms: number): Promise<void> => delay(ms);

/**
 * Reenvia os pacotes respeitando o timestampMs original de cada um. Com
 * options.loop, reinicia do primeiro pacote ao chegar no fim, indefinidamente,
 * até que io.wait rejeite. now/wait são injetáveis: um relógio falso e um
 * wait que resolve na hora tornam o comportamento de FR-004 (erro não
 * acumula ao longo de uma gravação longa) verificável em milissegundos de
 * tempo real.
 *
 * Cada pacote usa um "deadline absoluto" relativo ao início da PASSADA
 * atual (offset da gravação dividido pela velocidade, menos o tempo já
 * passado desde que essa passada começou) em vez de uma espera relativa
 * encadeada - ver computeDelayMs em scheduler.ts. Cada passada tem seu
 * próprio deadline zerado, incluindo a primeira.
 *
 * Se io.wait rejeitar (ex: AbortSignal abortado pelo chamador), a passada
 * para ali mesmo e devolve a contagem parcial, em vez de propagar o erro -
 * FR-009 exige que uma interrupção termine de forma limpa, mesmo no meio
 * de uma passada de um loop.
 */
export async function runReplay(packets: RecordedPacket[], options: ReplayOptions, io: ReplayIo): Promise<ReplayResult> {
  const now = io.now ?? Date.now;
  const wait = io.wait ?? defaultWait;

  let packetsSent = 0;
  let passes = 0;

  do {
    passes += 1;
    io.onPass?.(passes);
    const passStartTime = now();

    for (const packet of packets) {
      const elapsed = now() - passStartTime;
      const delayMs = computeDelayMs(packet.timestampMs, elapsed, options.speed);

      if (delayMs > 0) {
        try {
          await wait(delayMs);
        } catch {
          return { packetsSent, passes };
        }
      }

      io.send(packet.data);
      packetsSent += 1;
    }
  } while (options.loop);

  return { packetsSent, passes };
}
