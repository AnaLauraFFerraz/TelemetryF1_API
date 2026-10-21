import { insertAnalysis } from "../persistence/analysisRepository";
import type { CoachSeedFile } from "./coachSeed";

// Separado de coachSeed.ts de propósito: o repositório abre o banco no
// import (persistence/db), e coachSeed.ts precisa continuar puro.
export function applyCoachSeed(sessionId: number, seed: CoachSeedFile): void {
  for (const entry of seed.entries) {
    insertAnalysis(sessionId, entry.lapA, entry.lapB, JSON.stringify(entry.insights), entry.analysisText, entry.model);
  }
}
