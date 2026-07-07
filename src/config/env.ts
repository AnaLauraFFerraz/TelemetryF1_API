import "dotenv/config";

function readPort(name: string): number {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`Variável de ambiente ${name} não definida. Confira seu arquivo .env (veja .env.exemple).`);
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Variável de ambiente ${name}="${raw}" não é uma porta válida (1-65535).`);
  }

  return port;
}

export const env = {
  wsPort: readPort("WS_PORT"),
  udpPort: readPort("UDP_PORT"),
};
