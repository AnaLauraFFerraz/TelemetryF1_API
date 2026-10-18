import "dotenv/config";
import path from "node:path";

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

const FIXED_DB_PATH = path.resolve(__dirname, "..", "..", "data", "telemetry.db");

// DB_PATH é uma saída de emergência só para o teste de integração (ver
// specs/001-realtime-replay/research.md, ponto 4) - em produção ela nunca é
// definida e o caminho continua fixo. Uma string vazia é tratada como "não
// definida": passar "" pro better-sqlite3 abre um banco temporário privado
// sem aviso nenhum, o que esconderia o erro em vez de sinalizá-lo.
function resolveDbPath(): string {
  const raw = process.env.DB_PATH?.trim();
  return raw ? raw : FIXED_DB_PATH;
}

export const env = {
  wsPort: readPort("WS_PORT"),
  udpPort: readPort("UDP_PORT"),
  httpPort: readPort("HTTP_PORT"),
  dbPath: resolveDbPath(),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
};
