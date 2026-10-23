import path from "node:path";
import { findProjectRoot } from "../src/config/projectRoot";
import { ensureRecording } from "../src/demo/recording";

/**
 * Passo final do `npm run build`: garante a gravação do modo demo em
 * recordings/ (ou em DEMO_RECORDING_PATH), baixando-a da Release e
 * conferindo o SHA-256 publicado no README. Se ela já está lá e confere,
 * não baixa nada. Qualquer falha sai com código 1, o que falha o build.
 */
async function main(): Promise<void> {
  const destPath =
    process.env.DEMO_RECORDING_PATH || path.join(findProjectRoot(), "recordings", "demo-interlagos-tt-20hz-laps6-8.jsonl");

  const outcome = await ensureRecording(destPath, fetch);
  console.log(
    outcome === "present"
      ? `[fetchDemoRecording] gravação já presente e conferida em ${destPath}; nada baixado.`
      : `[fetchDemoRecording] gravação baixada e conferida em ${destPath}.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
