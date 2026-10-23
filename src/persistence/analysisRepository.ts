import { db } from "./db";

export interface CachedAnalysis {
  insightsJson: string;
  analysisText: string;
  model: string;
  promptVersion: string | null;
  createdAt: string;
}

const getCachedStmt = db.prepare<{ sessionId: number; lapA: number; lapB: number }>(`
  SELECT insights_json, analysis_text, model, prompt_version, created_at
  FROM lap_analyses
  WHERE session_id = @sessionId AND lap_a = @lapA AND lap_b = @lapB
`);

export function getCachedAnalysis(sessionId: number, lapA: number, lapB: number): CachedAnalysis | undefined {
  const row = getCachedStmt.get({ sessionId, lapA, lapB }) as
    | { insights_json: string; analysis_text: string; model: string; prompt_version: string | null; created_at: string }
    | undefined;
  if (!row) return undefined;

  return {
    insightsJson: row.insights_json,
    analysisText: row.analysis_text,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
  };
}

// Upsert: um par com texto de prompt velho é substituído no lugar (mesma id),
// em vez de bater na UNIQUE (session_id, lap_a, lap_b).
const saveStmt = db.prepare<{
  sessionId: number;
  lapA: number;
  lapB: number;
  insightsJson: string;
  analysisText: string;
  model: string;
  promptVersion: string;
}>(`
  INSERT INTO lap_analyses (session_id, lap_a, lap_b, insights_json, analysis_text, model, prompt_version)
  VALUES (@sessionId, @lapA, @lapB, @insightsJson, @analysisText, @model, @promptVersion)
  ON CONFLICT(session_id, lap_a, lap_b) DO UPDATE SET
    insights_json = excluded.insights_json,
    analysis_text = excluded.analysis_text,
    model = excluded.model,
    prompt_version = excluded.prompt_version,
    created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
`);

export function saveAnalysis(
  sessionId: number,
  lapA: number,
  lapB: number,
  insightsJson: string,
  analysisText: string,
  model: string,
  promptVersion: string
): void {
  saveStmt.run({ sessionId, lapA, lapB, insightsJson, analysisText, model, promptVersion });
}
