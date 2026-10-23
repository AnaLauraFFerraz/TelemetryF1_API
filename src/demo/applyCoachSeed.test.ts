import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "../persistence/testDb";
import { buildSyntheticRecording } from "../replay/testFixtures";
import type { CoachSeedFile } from "./coachSeed";
import type { DemoPacket } from "./recording";

const handle = setupIsolatedTestDb();
/* eslint-disable @typescript-eslint/no-var-requires */
const { buildDemoSession } = require("./buildDemoSession") as typeof import("./buildDemoSession");
const { applyCoachSeed } = require("./applyCoachSeed") as typeof import("./applyCoachSeed");
const { getCachedAnalysis } = require("../persistence/analysisRepository") as typeof import("../persistence/analysisRepository");
/* eslint-enable @typescript-eslint/no-var-requires */

after(() => teardownIsolatedTestDb(handle));

test("cada entrada do cache vira uma análise em cache para o seu par", () => {
  const { packets } = buildSyntheticRecording();
  const build = buildDemoSession(packets.map((p): DemoPacket => ({ ...p, receivedAt: 1792168223797 })));
  const insights = { totalDeltaS: 0.12, corners: [], tyreWindowExcursions: [] };
  const seed: CoachSeedFile = {
    formatVersion: 1,
    recordingSha256: "a".repeat(64),
    sessionUid: build.sessionUid,
    entries: [
      { lapA: 1, lapB: 2, model: "modelo-falso", analysisText: "análise 1-2", insights },
      { lapA: 2, lapB: 1, model: "modelo-falso", analysisText: "análise 2-1", insights },
    ],
  };

  applyCoachSeed(build.sessionId, seed);

  for (const entry of seed.entries) {
    const cached = getCachedAnalysis(build.sessionId, entry.lapA, entry.lapB);
    assert.ok(cached, `par (${entry.lapA}, ${entry.lapB}) não está em cache`);
    assert.equal(cached.analysisText, entry.analysisText);
    assert.equal(cached.model, entry.model);
    assert.deepEqual(JSON.parse(cached.insightsJson), entry.insights);
  }
});
