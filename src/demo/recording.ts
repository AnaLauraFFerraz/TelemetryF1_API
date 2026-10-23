import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RecordedPacket } from "../replay/types";

export const PUBLISHED_RECORDING_SHA256 = "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033";

export const PUBLISHED_RECORDING_URL =
  "https://github.com/AnaLauraFFerraz/TelemetryF1_API/releases/download/sample-recording-v1/demo-interlagos-tt-20hz-laps6-8.jsonl";

// receivedAt é a hora absoluta da captura (epoch ms) que tools/recorder.ts
// grava em cada linha; o modo demo tira dele as datas da sessão.
export interface DemoPacket extends RecordedPacket {
  receivedAt: number | undefined;
}

export function parseRecording(text: string): DemoPacket[] {
  const packets: DemoPacket[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const { timestampMs, receivedAt, data } = JSON.parse(line) as { timestampMs: number; receivedAt?: number; data: string };
    packets.push({ timestampMs, receivedAt: typeof receivedAt === "number" ? receivedAt : undefined, data: Buffer.from(data, "base64") });
  }
  return packets;
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function verifyRecording(data: Buffer, expectedSha256: string): void {
  const actual = sha256Hex(data);
  if (actual !== expectedSha256) {
    throw new Error(`[demo] gravação não confere com o SHA-256 esperado (esperado ${expectedSha256}, obtido ${actual}).`);
  }
}

export interface EnsureRecordingOptions {
  url?: string;
  expectedSha256?: string;
}

// O download vai para <destino>.part na mesma pasta e só substitui o destino
// depois de conferido: um download que falha (rede, HTTP, hash) nunca deixa
// um arquivo parcial nem estraga um arquivo que já existia.
export async function ensureRecording(
  destPath: string,
  fetchFn: typeof fetch,
  options: EnsureRecordingOptions = {}
): Promise<"present" | "downloaded"> {
  const url = options.url ?? PUBLISHED_RECORDING_URL;
  const expectedSha256 = options.expectedSha256 ?? PUBLISHED_RECORDING_SHA256;

  let staleHash: string | undefined;
  if (fs.existsSync(destPath)) {
    const existingHash = sha256Hex(fs.readFileSync(destPath));
    if (existingHash === expectedSha256) return "present";
    staleHash = existingHash;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;
  try {
    const response = await fetchFn(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`[demo] download da gravação falhou: HTTP ${response.status} em ${url}`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    verifyRecording(body, expectedSha256);
    fs.writeFileSync(partPath, body);
    fs.renameSync(partPath, destPath);
  } catch (err) {
    fs.rmSync(partPath, { force: true });
    throw err;
  }

  if (staleHash !== undefined) {
    console.log(
      `[demo] a gravação existente em ${destPath} tinha SHA-256 errado (${staleHash}); substituída pelo download conferido.`
    );
  }
  return "downloaded";
}
