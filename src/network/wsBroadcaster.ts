import { WebSocketServer, WebSocket } from "ws";

export interface WsBroadcaster {
  broadcast: (message: unknown) => void;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

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

    // Marca o socket como "vivo" a cada pong recebido - se não responder a
    // dois ciclos de heartbeat seguidos, é considerado morto e derrubado
    // (ex: PC suspendeu, rede caiu sem um close/FIN limpo).
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

    socket.on("close", () => {
      clearInterval(heartbeat);
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
