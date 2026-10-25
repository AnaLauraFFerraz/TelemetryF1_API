import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildInsights } from "./buildInsights";
import { fromRecordingCut, RecordingCutInput } from "./recordingCutFormat";
import { LapInsights } from "./types";

const CUT_PATH = path.join(__dirname, "recordingCut.json");
const SOURCE_SHA256 = "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033";
const MAX_CUT_BYTES = 660_000;

// Tolerâncias fixas (plan D6, research.md seção 14); nenhuma tarefa as alarga.
const SYMMETRY_TOLERANCE = 0.01 + 1e-9;
const OFFICIAL_TOLERANCE = 0.045;

function loadCut(): RecordingCutInput {
  assert.ok(fs.existsSync(CUT_PATH), "src/analysis/recordingCut.json não existe; gere com tools/exportRecordingCut.ts");
  return fromRecordingCut(fs.readFileSync(CUT_PATH, "utf8"));
}

interface CutPair {
  primaryLap: number;
  comparisonLap: number;
  officialDifferenceS: number;
  insights: LapInsights;
}

// Os seis pares ordenados das voltas 6, 7 e 8.
function cutPairs(): CutPair[] {
  const cut = loadCut();
  const pairs: CutPair[] = [];
  for (const primary of cut.laps) {
    for (const comparison of cut.laps) {
      if (primary === comparison) continue;
      pairs.push({
        primaryLap: primary.lapNumber,
        comparisonLap: comparison.lapNumber,
        officialDifferenceS: (primary.lapTimeMs - comparison.lapTimeMs) / 1000,
        insights: buildInsights({
          primaryTelemetry: primary.telemetry,
          comparisonTelemetry: comparison.telemetry,
          primaryMotion: primary.motion,
          comparisonMotion: comparison.motion,
        }),
      });
    }
  }
  return pairs;
}

function reversePair(pairs: CutPair[], pair: CutPair): CutPair {
  const reverse = pairs.find((p) => p.primaryLap === pair.comparisonLap && p.comparisonLap === pair.primaryLap);
  assert.ok(reverse, `par (${pair.comparisonLap},${pair.primaryLap}) não encontrado`);
  return reverse;
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

test("totalDeltaS fica a 0,045 s da diferença oficial nos seis pares (SC-005)", () => {
  for (const pair of cutPairs()) {
    const error = Math.abs(pair.insights.totalDeltaS - pair.officialDifferenceS);
    assert.ok(
      error <= OFFICIAL_TOLERANCE,
      `(${pair.primaryLap},${pair.comparisonLap}): totalDeltaS ${pair.insights.totalDeltaS} contra ${pair.officialDifferenceS} oficial`
    );
  }
});

test("totalDeltaS de (A,B) mais o de (B,A) soma zero (SC-004)", () => {
  const pairs = cutPairs();
  for (const pair of pairs) {
    const sum = pair.insights.totalDeltaS + reversePair(pairs, pair).insights.totalDeltaS;
    assert.ok(Math.abs(sum) <= SYMMETRY_TOLERANCE, `(${pair.primaryLap},${pair.comparisonLap}): soma ${sum}`);
  }
});
