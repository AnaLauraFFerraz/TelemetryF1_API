import express from "express";
import cors from "cors";
import { sessionsRouter } from "./routes/sessionsRouter";
import { analysisRouter } from "./routes/analysisRouter";

export function startHttpServer(port: number): void {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json());
  app.use(sessionsRouter);
  app.use(analysisRouter);

  app.listen(port, () => {
    console.log(`[httpServer] servidor REST em http://localhost:${port}`);
  });
}
