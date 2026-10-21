import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { findProjectRoot } from "../src/config/projectRoot";
import { assertExportEnvironment, type CoachSeedFile } from "../src/demo/coachSeed";
import { PUBLISHED_RECORDING_SHA256, parseRecording, verifyRecording } from "../src/demo/recording";

/**
 * A única etapa paga do modo demo, rodada uma vez pela mantenedora, na
 * máquina dela, com a chave dela (quickstart.md, seção D): monta a sessão da
 * gravação publicada num banco descartável, pede ao coach os seis pares
 * ordenados das voltas 6, 7 e 8 e grava demo/coach-seed.json. Um par que já
 * está no arquivo, para a mesma gravação, modelo e insights, não é pedido de
 * novo. Nunca roda na CI, nos testes nem pelo agente.
 */

const PAIRS: Array<[number, number]> = [
  [6, 7],
  [6, 8],
  [7, 6],
  [7, 8],
  [8, 6],
  [8, 7],
];

async function main(): Promise<void> {
  const root = findProjectRoot();
  // Antes de qualquer módulo que abra o banco ou leia a configuração do coach.
  assertExportEnvironment(process.env, root);

  const recordingPath = path.join(root, "recordings", "demo-interlagos-tt-20hz-laps6-8.jsonl");
  const seedPath = path.join(root, "demo", "coach-seed.json");
  const recordingBytes = fs.readFileSync(recordingPath);
  verifyRecording(recordingBytes, PUBLISHED_RECORDING_SHA256);
  const existing = fs.existsSync(seedPath) ? (JSON.parse(fs.readFileSync(seedPath, "utf8")) as CoachSeedFile) : undefined;

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { exportCoachSeed } = require("../src/demo/exportCoachSeed") as typeof import("../src/demo/exportCoachSeed");
  const { generateCoaching, MODEL } = require("../src/coaching/coachService") as typeof import("../src/coaching/coachService");
  /* eslint-enable @typescript-eslint/no-var-requires */

  const seed = await exportCoachSeed({
    packets: parseRecording(recordingBytes.toString("utf8")),
    recordingSha256: PUBLISHED_RECORDING_SHA256,
    pairs: PAIRS,
    existing,
    generate: (insights, benchmark) => generateCoaching(insights, benchmark),
    currentModel: MODEL,
  });

  for (const entry of seed.entries) {
    const reused = existing?.entries.includes(entry) ?? false;
    console.log(`[exportCoachSeed] par (${entry.lapA}, ${entry.lapB}): ${reused ? "reutilizado" : "pedido ao coach"}`);
  }

  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`[exportCoachSeed] ${seed.entries.length} pares gravados em ${seedPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
