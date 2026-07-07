import { Router } from "express";
import { listSessions, getSessionById } from "../../persistence/sessionRepository";
import { listLapsForSession } from "../../persistence/lapRepository";
import { listCarTelemetrySamplesForLap } from "../../persistence/carTelemetrySampleRepository";
import { listMotionSamplesForLap } from "../../persistence/motionSampleRepository";

export const sessionsRouter = Router();

sessionsRouter.get("/sessions", (_req, res) => {
  res.json(listSessions());
});

sessionsRouter.get("/sessions/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid session id" });
    return;
  }

  const session = getSessionById(id);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  res.json({ ...session, laps: listLapsForSession(id) });
});

sessionsRouter.get("/sessions/:id/laps/:lapNumber/telemetry", (req, res) => {
  const id = Number(req.params.id);
  const lapNumber = Number(req.params.lapNumber);
  if (!Number.isInteger(id) || !Number.isInteger(lapNumber)) {
    res.status(400).json({ error: "invalid session id or lap number" });
    return;
  }

  // Sessão precisa existir pra 404 fazer sentido; a volta em si pode
  // existir sem samples ainda (decimação não gravou nada) - nesse caso
  // devolvemos arrays vazios, não 404.
  const session = getSessionById(id);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  res.json({
    carTelemetry: listCarTelemetrySamplesForLap(id, lapNumber),
    motion: listMotionSamplesForLap(id, lapNumber),
  });
});
