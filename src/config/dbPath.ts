import "dotenv/config";
import path from "node:path";
import { findProjectRoot } from "./projectRoot";

const FIXED_DB_PATH = path.join(findProjectRoot(), "data", "telemetry.db");

// DB_PATH é uma saída de emergência só para o teste de integração (ver
// specs/001-realtime-replay/research.md, ponto 4) - em produção ela nunca é
// definida e o caminho continua fixo. Uma string vazia é tratada como "não
// definida": passar "" pro better-sqlite3 abre um banco temporário privado
// sem aviso nenhum, o que esconderia o erro em vez de sinalizá-lo.
function resolveDbPath(): string {
  const raw = process.env.DB_PATH?.trim();
  return raw ? raw : FIXED_DB_PATH;
}

export const dbPath = resolveDbPath();
