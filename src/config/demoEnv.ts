import path from "node:path";

export interface DemoConfig {
  port: number;
  allowedOrigin: string;
  maxConnections: number;
  maxConnectionMs: number;
  wsCompression: boolean;
  recordingPath: string;
  seedPath: string;
}

const DEFAULT_MAX_CONNECTIONS = 5;
const DEFAULT_MAX_CONNECTION_MINUTES = 5;

function readPort(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT;
  if (!raw) throw new Error("Variável de ambiente PORT não definida (obrigatória no modo demo).");
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Variável de ambiente PORT="${raw}" não é uma porta válida (1-65535).`);
  }
  return port;
}

function readOrigin(env: NodeJS.ProcessEnv): string {
  const raw = env.DEMO_ALLOWED_ORIGIN;
  if (!raw) throw new Error("Variável de ambiente DEMO_ALLOWED_ORIGIN não definida (obrigatória no modo demo).");
  let origin: string | undefined;
  try {
    origin = new URL(raw).origin;
  } catch {
    origin = undefined;
  }
  if (origin !== raw) {
    throw new Error(
      `Variável de ambiente DEMO_ALLOWED_ORIGIN="${raw}" não é uma origem válida (esquema://host[:porta], sem caminho nem barra no fim).`
    );
  }
  return raw;
}

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`Variável de ambiente ${name}="${raw}" deve ser um inteiro ≥ 1.`);
  }
  return Number(raw);
}

function readCompression(env: NodeJS.ProcessEnv): boolean {
  const raw = env.DEMO_WS_COMPRESSION;
  if (raw === undefined || raw === "" || raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Variável de ambiente DEMO_WS_COMPRESSION="${raw}" inválida: use "true" ou "false".`);
}

// A chave e o DB_PATH são recusados antes de tudo: mesmo com o resto da
// configuração errado, a mensagem que aparece é a que evita custo ou o
// banco errado.
export function parseDemoConfig(env: NodeJS.ProcessEnv, projectRoot: string): DemoConfig {
  if (env.ANTHROPIC_API_KEY) {
    throw new Error("O modo demo não aceita ANTHROPIC_API_KEY: remova a variável (o modo demo nunca faz chamada paga).");
  }
  if (env.DB_PATH?.trim()) {
    throw new Error("O modo demo não aceita DB_PATH: o banco do modo demo é sempre em memória.");
  }

  return {
    port: readPort(env),
    allowedOrigin: readOrigin(env),
    maxConnections: readPositiveInteger(env, "DEMO_MAX_CONNECTIONS", DEFAULT_MAX_CONNECTIONS),
    maxConnectionMs: readPositiveInteger(env, "DEMO_MAX_CONNECTION_MINUTES", DEFAULT_MAX_CONNECTION_MINUTES) * 60 * 1000,
    wsCompression: readCompression(env),
    recordingPath: env.DEMO_RECORDING_PATH || path.join(projectRoot, "recordings", "demo-interlagos-tt-20hz-laps6-8.jsonl"),
    seedPath: env.DEMO_SEED_PATH || path.join(projectRoot, "demo", "coach-seed.json"),
  };
}
