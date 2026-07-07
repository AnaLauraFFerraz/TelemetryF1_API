import express from "express";
import cors from "cors";
import { sessionsRouter } from "./routes/sessionsRouter";

export function startHttpServer(port: number): void {
  const app = express();

  // origin: true reflete a origem da requisição - o frontend Vite roda numa
  // porta diferente (ex: 5173). Aceitável aqui por ser um projeto local sem
  // dados sensíveis/autenticação.
  app.use(cors({ origin: true }));
  app.use(sessionsRouter);

  app.listen(port, () => {
    console.log(`[httpServer] servidor REST em http://localhost:${port}`);
  });
}
