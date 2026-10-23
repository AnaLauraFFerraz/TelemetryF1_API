import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeCoachSeedFile, type CoachSeedFile } from "./coachSeed";

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function seed(entries: number): CoachSeedFile {
  return {
    formatVersion: 1,
    recordingSha256: "a".repeat(64),
    sessionUid: "42",
    entries: Array.from({ length: entries }, (_, i) => ({
      lapA: 1,
      lapB: i + 2,
      model: "modelo-falso",
      analysisText: `texto ${i}`,
      insights: { totalDeltaS: i, corners: [], tyreWindowExcursions: [] },
    })),
  };
}

test("grava o cache como JSON legível, criando a pasta, sem deixar o temporário", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-seedfile-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "demo", "coach-seed.json");

  writeCoachSeedFile(filePath, seed(1));

  assert.ok(fs.existsSync(filePath), "o arquivo não foi gravado");
  const text = fs.readFileSync(filePath, "utf8");
  assert.deepEqual(JSON.parse(text), seed(1));
  assert.ok(text.endsWith("\n"), "sem quebra de linha no fim");
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)), ["coach-seed.json"], "sobrou um temporário na pasta");
});

test("substitui por inteiro um arquivo que já existe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-seedfile-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "coach-seed.json");
  const old = "conteúdo antigo, maior que o novo, para pegar sobra de bytes ".repeat(50);
  fs.writeFileSync(filePath, old);

  writeCoachSeedFile(filePath, seed(2));

  const text = fs.readFileSync(filePath, "utf8");
  assert.notEqual(text, old, "o arquivo antigo não foi substituído");
  assert.deepEqual(JSON.parse(text), seed(2));
  assert.deepEqual(fs.readdirSync(dir), ["coach-seed.json"]);
});
