export interface CaptureTimes {
  startedAt: string;
  lastSeenAt: string;
  lapRecordedAt: Map<number, string>;
}

function requireReceivedAt(value: number | undefined, where: string): number {
  if (value === undefined) {
    throw new Error(`[demo] a gravação não tem receivedAt em ${where}: o modo demo não inventa datas.`);
  }
  return value;
}

// Mesmo formato que o strftime('%Y-%m-%dT%H:%M:%fZ') do SQLite grava hoje
// (research.md, ponto 4): as datas da demo têm a mesma forma das locais.
export function buildCaptureTimes(
  firstReceivedAt: number | undefined,
  lastReceivedAt: number | undefined,
  completions: Array<{ lapNumber: number; receivedAt: number | undefined }>
): CaptureTimes {
  const first = requireReceivedAt(firstReceivedAt, "primeiro pacote da sessão");
  const last = requireReceivedAt(lastReceivedAt, "último pacote da sessão");
  if (last < first) {
    throw new Error(`[demo] horas de captura fora de ordem: o último pacote (${last}) vem antes do primeiro (${first}).`);
  }

  const lapRecordedAt = new Map<number, string>();
  for (const { lapNumber, receivedAt } of completions) {
    const at = requireReceivedAt(receivedAt, `pacote que fecha a volta ${lapNumber}`);
    lapRecordedAt.set(lapNumber, new Date(at).toISOString());
  }

  return { startedAt: new Date(first).toISOString(), lastSeenAt: new Date(last).toISOString(), lapRecordedAt };
}
