import "dotenv/config";
import { dbPath } from "./dbPath";
import { parseRunMode } from "./mode";

function readPort(name: string): number {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`Variável de ambiente ${name} não definida. Confira seu arquivo .env (veja .env.example).`);
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Variável de ambiente ${name}="${raw}" não é uma porta válida (1-65535).`);
  }

  return port;
}

interface LocalPorts {
  wsPort: number;
  udpPort: number;
  httpPort: number;
}

// No modo demo as três portas não existem (a hospedagem dá uma só, PORT, lida
// em demoEnv.ts): não são lidas, e acessá-las é erro de programação.
const localPorts: LocalPorts | undefined =
  parseRunMode(process.env.DEMO_MODE) === "local"
    ? { wsPort: readPort("WS_PORT"), udpPort: readPort("UDP_PORT"), httpPort: readPort("HTTP_PORT") }
    : undefined;

function requireLocalPort(name: keyof LocalPorts): number {
  if (!localPorts) throw new Error(`[env] ${name} não existe no modo demo.`);
  return localPorts[name];
}

export const env = {
  get wsPort(): number {
    return requireLocalPort("wsPort");
  },
  get udpPort(): number {
    return requireLocalPort("udpPort");
  },
  get httpPort(): number {
    return requireLocalPort("httpPort");
  },
  dbPath,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
};
