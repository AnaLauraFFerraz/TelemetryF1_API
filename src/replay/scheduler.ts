import { ReplaySpeed } from "./types";

const SPEED_MULTIPLIER: Record<"1x" | "2x", number> = { "1x": 1, "2x": 2 };

/**
 * Quanto falta esperar antes de mandar o próximo pacote, dado o offset
 * original dele na gravação e quanto tempo de parede já passou desde o
 * início da passada atual - não desde o pacote anterior. Calcular a partir
 * de um "deadline absoluto" (em vez de encadear esperas relativas, pacote a
 * pacote) evita que o erro de cada espera individual se acumule ao longo
 * de uma gravação longa (FR-004).
 *
 * "max" não espera nada - é o modo "o mais rápido possível" de hoje.
 */
export function computeDelayMs(targetOffsetMs: number, elapsedMsSincePassStart: number, speed: ReplaySpeed): number {
  if (speed === "max") return 0;

  const multiplier = SPEED_MULTIPLIER[speed];
  const remaining = targetOffsetMs / multiplier - elapsedMsSincePassStart;
  return Math.max(0, remaining);
}
