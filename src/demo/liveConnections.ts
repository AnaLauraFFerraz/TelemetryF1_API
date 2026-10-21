// Sem Origin é um cliente fora do navegador: a regra de origem só limita
// navegadores, já que qualquer outro cliente manda o Origin que quiser
// (spec, FR-018). Comparação exata, sem normalizar caixa nem barra.
export function decideOrigin(origin: string | undefined, allowedOrigin: string): "accept" | "refuse" {
  if (origin === undefined) return "accept";
  return origin === allowedOrigin ? "accept" : "refuse";
}

export function decideCapacity(openConnections: number, maxConnections: number): "accept" | "full" {
  return openConnections < maxConnections ? "accept" : "full";
}
