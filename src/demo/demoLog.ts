import type { Socket } from "node:net";
import type { RequestHandler } from "express";
import type { RestCounter } from "../http/httpServer";

export interface DemoCounters {
  openConnections: number;
  wsBytes: number;
  restBytes: number;
  coach503: number;
  cpuUserMs: number;
  cpuSystemMs: number;
}

const mib = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

export function formatSummary(c: DemoCounters): string {
  const total = c.wsBytes + c.restBytes;
  return (
    `[demo] resumo: ${c.openConnections} conexões abertas; ` +
    `WebSocket ${c.wsBytes} B (${mib(c.wsBytes)} MiB); REST ${c.restBytes} B (${mib(c.restBytes)} MiB); ` +
    `total ${total} B (${mib(total)} MiB); 503 do coach: ${c.coach503}; ` +
    `CPU ${c.cpuUserMs + c.cpuSystemMs} ms (usuário ${c.cpuUserMs}, sistema ${c.cpuSystemMs}); ` +
    "bytes escritos nos sockets pela aplicação; não é o número cobrado pela hospedagem"
  );
}

const COACH_ROUTE = /^\/sessions\/[^/]+\/analysis$/;

// Conta o que sai pelo socket (cabeçalhos incluídos), não o tamanho do corpo.
// Com keep-alive o mesmo socket serve várias respostas: o WeakMap guarda até
// onde cada socket já foi contado.
export function createRestCounter(): RestCounter {
  const counted = new WeakMap<Socket, number>();
  let restBytes = 0;
  let coach503 = 0;

  const middleware: RequestHandler = (req, res, next) => {
    res.on("finish", () => {
      const socket = req.socket;
      const previous = counted.get(socket) ?? 0;
      restBytes += socket.bytesWritten - previous;
      counted.set(socket, socket.bytesWritten);
      if (req.method === "POST" && COACH_ROUTE.test(req.path) && res.statusCode === 503) coach503 += 1;
    });
    next();
  };

  return { middleware, stats: () => ({ restBytes, coach503 }) };
}
