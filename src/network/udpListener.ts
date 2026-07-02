import dgram from "node:dgram";

export type PacketHandler = (buffer: Buffer) => void;

/**
 * Escuta pacotes UDP crus e entrega cada um para o handler, sem saber nada
 * sobre o protocolo do F1 24. Essa mesma função é reusada pelo servidor
 * principal e pelo gravador (tools/recorder.ts) - transporte e parsing
 * ficam desacoplados.
 */
export function startUdpListener(port: number, onPacket: PacketHandler): dgram.Socket {
  const socket = dgram.createSocket("udp4");

  socket.on("message", (msg) => {
    onPacket(msg);
  });

  socket.on("error", (err) => {
    console.error("[udpListener] erro no socket UDP:", err);
  });

  socket.bind(port, () => {
    console.log(`[udpListener] escutando pacotes UDP em 0.0.0.0:${port}`);
  });

  return socket;
}
