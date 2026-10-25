import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fromRecordingCut, RecordingCutInput } from "./recordingCutFormat";

const CUT_PATH = path.join(__dirname, "recordingCut.json");
const SOURCE_SHA256 = "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033";
const MAX_CUT_BYTES = 660_000;

function loadCut(): RecordingCutInput {
  assert.ok(fs.existsSync(CUT_PATH), "src/analysis/recordingCut.json não existe; gere com tools/exportRecordingCut.ts");
  return fromRecordingCut(fs.readFileSync(CUT_PATH, "utf8"));
}

test("o recorte é o da gravação publicada: hash, voltas 6 a 8, tempos oficiais e validade", () => {
  const cut = loadCut();
  assert.equal(cut.sourceSha256, SOURCE_SHA256);
  assert.deepEqual(
    cut.laps.map((lap) => [lap.lapNumber, lap.lapTimeMs, lap.isValid]),
    [
      [6, 74306, false],
      [7, 74144, true],
      [8, 73372, true],
    ]
  );
  assert.deepEqual(
    cut.laps.map((lap) => [lap.telemetry.length, lap.motion.length]),
    [
      [797, 797],
      [801, 801],
      [793, 793],
    ]
  );
});

test("o recorte não passa do teto de 660.000 bytes", () => {
  loadCut();
  assert.ok(fs.statSync(CUT_PATH).size <= MAX_CUT_BYTES, `recordingCut.json tem mais de ${MAX_CUT_BYTES} bytes`);
});
