// Janela de temperatura ideal de superfície pra slicks no F1 24, segundo
// consenso da comunidade - o jogo NÃO transmite isso via UDP. Chute inicial
// a calibrar com dados reais (ver Fase 6 do plano: correlacionar temps x
// melhores voltas do histórico do próprio piloto, e refinar por composto
// quando o parser de CarStatus existir).
export const TYRE_SURFACE_TEMP_MIN_C = 85;
export const TYRE_SURFACE_TEMP_MAX_C = 105;

export type TyreTempStatus = "cold" | "ideal" | "hot";

export function classifyTyreTemp(celsius: number): TyreTempStatus {
  if (celsius < TYRE_SURFACE_TEMP_MIN_C) return "cold";
  if (celsius > TYRE_SURFACE_TEMP_MAX_C) return "hot";
  return "ideal";
}
