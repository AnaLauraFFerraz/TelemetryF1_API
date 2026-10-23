import { Router } from "express";

export function createHealthRouter(isHealthy: () => boolean): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (isHealthy()) {
      res.json({ status: "ok" });
    } else {
      res.status(503).json({ status: "replay stopped" });
    }
  });

  return router;
}
