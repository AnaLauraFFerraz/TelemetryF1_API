import express from "express";
import cors from "cors";
import { sessionsRouter } from "./routes/sessionsRouter";
import { analysisRouter } from "./routes/analysisRouter";

export interface CreateAppOptions {
  demo?: { allowedOrigin: string };
}

const READ_ROUTES = ["/sessions", "/sessions/:id", "/sessions/:id/benchmark", "/sessions/:id/laps/:lapNumber/telemetry"];

function cacheControl(value: string): express.RequestHandler {
  return (_req, res, next) => {
    res.setHeader("Cache-Control", value);
    next();
  };
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  if (options.demo) {
    // Lista, não string: com uma string o cors manda sempre a origem
    // configurada, para qualquer Origin; com a lista, só quando ela bate.
    app.use(cors({ origin: [options.demo.allowedOrigin] }));
    // no-cache + o ETag padrão do Express: o navegador sempre revalida e
    // recebe 304 enquanto os dados não mudam, e um deploy novo muda o ETag.
    app.get(READ_ROUTES, cacheControl("no-cache"));
    app.post("/sessions/:id/analysis", cacheControl("no-store"));
  } else {
    app.use(cors({ origin: true }));
  }
  app.use(express.json());
  app.use(sessionsRouter);
  app.use(analysisRouter);

  return app;
}

export function startHttpServer(port: number): void {
  createApp().listen(port, () => {
    console.log(`[httpServer] servidor REST em http://localhost:${port}`);
  });
}
