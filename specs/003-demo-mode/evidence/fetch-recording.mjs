// Baixa o asset da Release com o fetch do próprio Node (sem dependência), segue o
// redirecionamento e confere o SHA-256 publicado no README. Também pede um asset
// inexistente, para registrar o status de falha.
// Uso: node specs/003-demo-mode/evidence/fetch-recording.mjs <arquivo de saída numa pasta vazia>
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const url =
  "https://github.com/AnaLauraFFerraz/TelemetryF1_API/releases/download/sample-recording-v1/demo-interlagos-tt-20hz-laps6-8.jsonl";
const expected = "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033";

const t0 = performance.now();
const res = await fetch(url, { redirect: "follow" });
console.log(`status ${res.status}, final host ${new URL(res.url).host}, content-length ${res.headers.get("content-length")}`);
if (!res.ok) process.exit(1);
const body = Buffer.from(await res.arrayBuffer());
const t1 = performance.now();
const sha = createHash("sha256").update(body).digest("hex");
const t2 = performance.now();
await writeFile(process.argv[2], body);
console.log(`bytes ${body.length}, download ${(t1 - t0).toFixed(0)} ms, sha256 ${(t2 - t1).toFixed(0)} ms`);
console.log(`sha256 ${sha}, matches README: ${sha === expected}`);

const missing = await fetch(url.replace("laps6-8", "missing"), { redirect: "follow" });
console.log(`missing asset: status ${missing.status}`);
