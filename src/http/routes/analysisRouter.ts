import { Router } from "express";
import { getSessionById } from "../../persistence/sessionRepository";
import { getTrackBenchmark } from "../../persistence/lapRepository";
import { listCarTelemetrySamplesForLap } from "../../persistence/carTelemetrySampleRepository";
import { listMotionSamplesForLap } from "../../persistence/motionSampleRepository";
import { getCachedAnalysis, insertAnalysis } from "../../persistence/analysisRepository";
import { buildInsights } from "../../analysis/buildInsights";
import { LapInsights } from "../../analysis/types";
import {
  generateCoaching,
  isCoachingConfigured,
  CoachingUnavailableError,
  CoachingRateLimitedError,
  CoachingApiError,
} from "../../coaching/coachService";

export const analysisRouter = Router();

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

  const cached = getCachedAnalysis(sessionId, lapA, lapB);
  if (cached) {
    res.json({
      analysis: cached.analysisText,
      insights: JSON.parse(cached.insightsJson) as LapInsights,
      cached: true,
    });
    return;
  }

  // Checa a key ANTES de gastar tempo montando os insights - não faz
  // sentido processar telemetria só pra descobrir depois que não dá pra
  // chamar a IA.
  if (!isCoachingConfigured()) {
    res.status(503).json({ error: "coaching indisponível: configure ANTHROPIC_API_KEY" });
    return;
  }

  const primaryTelemetry = listCarTelemetrySamplesForLap(sessionId, lapA);
  const comparisonTelemetry = listCarTelemetrySamplesForLap(sessionId, lapB);
  if (primaryTelemetry.length === 0 || comparisonTelemetry.length === 0) {
    res.status(400).json({ error: "uma das voltas não tem amostras de telemetria" });
    return;
  }

  const primaryMotion = listMotionSamplesForLap(sessionId, lapA);
  const comparisonMotion = listMotionSamplesForLap(sessionId, lapB);
  const insights = buildInsights({ primaryTelemetry, comparisonTelemetry, primaryMotion, comparisonMotion });

  const benchmark = session.trackId !== null ? getTrackBenchmark(session.trackId) : null;

  try {
    const { text, model } = await generateCoaching(insights, benchmark);
    insertAnalysis(sessionId, lapA, lapB, JSON.stringify(insights), text, model);
    res.json({ analysis: text, insights, cached: false });
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
