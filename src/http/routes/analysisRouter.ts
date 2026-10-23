import { Router } from "express";
import { getSessionById } from "../../persistence/sessionRepository";
import { getLapForSession } from "../../persistence/lapRepository";
import { listCarTelemetrySamplesForLap } from "../../persistence/carTelemetrySampleRepository";
import { listMotionSamplesForLap } from "../../persistence/motionSampleRepository";
import { getCachedAnalysis, saveAnalysis } from "../../persistence/analysisRepository";
import { buildInsights } from "../../analysis/buildInsights";
import { createAnalysisResolver } from "../../coaching/analysisResolver";
import { COACH_MODEL } from "../../coaching/coachModel";
import { toComparedLap } from "../../coaching/coachReading";
import { PROMPT_VERSION } from "../../coaching/promptVersion";
import {
  generateCoaching,
  isCoachingConfigured,
  CoachingUnavailableError,
  CoachingRateLimitedError,
  CoachingApiError,
} from "../../coaching/coachService";

export const analysisRouter = Router();

const resolver = createAnalysisResolver({
  getCached: getCachedAnalysis,
  isConfigured: isCoachingConfigured,
  buildInputs: (sessionId, lapA, lapB) => {
    const primaryTelemetry = listCarTelemetrySamplesForLap(sessionId, lapA);
    const comparisonTelemetry = listCarTelemetrySamplesForLap(sessionId, lapB);
    if (primaryTelemetry.length === 0 || comparisonTelemetry.length === 0) return null;

    const primaryMotion = listMotionSamplesForLap(sessionId, lapA);
    const comparisonMotion = listMotionSamplesForLap(sessionId, lapB);
    return {
      insights: buildInsights({ primaryTelemetry, comparisonTelemetry, primaryMotion, comparisonMotion }),
      primary: toComparedLap(lapA, getLapForSession(sessionId, lapA)),
      comparison: toComparedLap(lapB, getLapForSession(sessionId, lapB)),
    };
  },
  generate: generateCoaching,
  save: saveAnalysis,
  currentModel: COACH_MODEL,
  currentPromptVersion: PROMPT_VERSION,
});

// POST, não GET: dispara um efeito colateral caro (chamada paga à API da
// Anthropic) na primeira vez que um par de voltas é analisado - mesmo
// sendo idempotente depois disso graças ao cache em lap_analyses.
analysisRouter.post("/sessions/:id/analysis", async (req, res) => {
  const sessionId = Number(req.params.id);
  const lapA = Number(req.body?.lapA);
  const lapB = Number(req.body?.lapB);

  if (!Number.isInteger(sessionId) || !Number.isInteger(lapA) || !Number.isInteger(lapB)) {
    res.status(400).json({ error: "sessionId, lapA e lapB devem ser inteiros" });
    return;
  }

  if (lapA === lapB) {
    res.status(400).json({ error: "lapA e lapB devem ser voltas diferentes" });
    return;
  }

  const session = getSessionById(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  try {
    const outcome = await resolver.resolve(sessionId, lapA, lapB);

    if (outcome.kind === "unavailable") {
      res.status(503).json({ error: "coaching indisponível: configure ANTHROPIC_API_KEY" });
      return;
    }
    if (outcome.kind === "no-samples") {
      res.status(400).json({ error: "uma das voltas não tem amostras de telemetria" });
      return;
    }
    res.json({ analysis: outcome.analysis, insights: outcome.insights, cached: outcome.kind === "cached" });
  } catch (err) {
    if (err instanceof CoachingUnavailableError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof CoachingRateLimitedError) {
      res.status(429).json({ error: err.message });
      return;
    }
    if (err instanceof CoachingApiError) {
      res.status(502).json({ error: err.message });
      return;
    }
    console.error("[analysisRouter] erro inesperado ao gerar coaching:", err);
    res.status(500).json({ error: "erro inesperado ao gerar análise" });
  }
});
