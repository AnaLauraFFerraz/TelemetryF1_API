import { WebSocketServer, WebSocket } from "ws";

export interface WsBroadcaster {
  broadcast: (message: unknown) => void;
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

    socket.on("close", () => {
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
