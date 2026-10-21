import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket, type PerMessageDeflateOptions } from "ws";
import { decideCapacity, decideOrigin } from "../demo/liveConnections";

export interface WsBroadcaster {
  broadcast: (message: unknown) => void;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

// Marca o socket como "vivo" a cada pong recebido - se não responder a
// dois ciclos de heartbeat seguidos, é considerado morto e derrubado
// (ex: PC suspendeu, rede caiu sem um close/FIN limpo). Devolve a função
// que para o heartbeat, chamada no close.
function startHeartbeat(socket: WebSocket): () => void {
  let isAlive = true;
  socket.on("pong", () => {
    isAlive = true;
  });

  const heartbeat = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      return;
    }
    isAlive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(heartbeat);
}

/**
 * Mantém a lista de clientes WebSocket conectados e expõe um único método
 * `broadcast` para mandar a mesma mensagem (JSON) para todos eles.
 */
export function startWsBroadcaster(port: number): WsBroadcaster {
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  wss.on("connection", (socket) => {
    clients.add(socket);
    console.log(`[wsBroadcaster] cliente conectado (${clients.size} no total)`);

    const stopHeartbeat = startHeartbeat(socket);

    socket.on("close", () => {
      stopHeartbeat();
      clients.delete(socket);
      console.log(`[wsBroadcaster] cliente desconectado (${clients.size} no total)`);
    });
  });

  console.log(`[wsBroadcaster] servidor WebSocket em ws://localhost:${port}`);

  function broadcast(message: unknown): void {
    const json = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  return { broadcast };
}

export type DemoWsEvent =
  | { type: "opened"; openConnections: number }
  | { type: "closed"; code: number; openConnections: number }
  | { type: "refused-origin" }
  | { type: "full" };

export interface DemoWsOptions {
  allowedOrigin: string;
  maxConnections: number;
  maxConnectionMs: number;
  perMessageDeflate: false | PerMessageDeflateOptions;
  onEvent?: (event: DemoWsEvent) => void;
}

export interface DemoWsServer {
  broadcast(json: string): void;
  stats(): { openConnections: number; bytesWritten: number };
  close(code: number, reason: string): void;
}

/**
 * WebSocket do modo demo, na mesma porta do HTTP (a hospedagem expõe uma só):
 * a origem é checada antes do upgrade, quem passa do limite é aceito e logo
 * fechado com 4001 (o navegador só vê o motivo num close, não num handshake
 * recusado), e cada conexão vive no máximo maxConnectionMs antes do 4002.
 * Os bytes são contados no socket, depois da compressão, porque é isso que
 * sai pela banda da hospedagem (research.md, ponto 10).
 */
export function attachDemoWsServer(server: http.Server, options: DemoWsOptions): DemoWsServer {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: options.perMessageDeflate });
  const clients = new Set<WebSocket>();
  const liveSockets = new Set<Duplex>();
  let closedSocketBytes = 0;
  const emit = (event: DemoWsEvent) => options.onEvent?.(event);

  function trackBytes(socket: Duplex): void {
    const netSocket = socket as Duplex & { bytesWritten: number };
    liveSockets.add(socket);
    socket.once("close", () => {
      liveSockets.delete(socket);
      closedSocketBytes += netSocket.bytesWritten;
    });
  }

  server.on("upgrade", (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    trackBytes(socket);

    if (decideOrigin(request.headers.origin, options.allowedOrigin) === "refuse") {
      emit({ type: "refused-origin" });
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      if (decideCapacity(clients.size, options.maxConnections) === "full") {
        emit({ type: "full" });
        ws.close(4001, "demo full");
        return;
      }

      clients.add(ws);
      emit({ type: "opened", openConnections: clients.size });
      const stopHeartbeat = startHeartbeat(ws);
      const timeLimit = setTimeout(() => ws.close(4002, "time limit"), options.maxConnectionMs);

      ws.on("close", (code) => {
        clearTimeout(timeLimit);
        stopHeartbeat();
        clients.delete(ws);
        emit({ type: "closed", code, openConnections: clients.size });
      });
    });
  });

  return {
    broadcast(json: string): void {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(json);
      }
    },
    stats() {
      let liveBytes = 0;
      for (const socket of liveSockets) liveBytes += (socket as Duplex & { bytesWritten: number }).bytesWritten;
      return { openConnections: clients.size, bytesWritten: closedSocketBytes + liveBytes };
    },
    close(code: number, reason: string): void {
      for (const client of clients) client.close(code, reason);
    },
  };
}
