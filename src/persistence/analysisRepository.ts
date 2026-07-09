import { db } from "./db";

export interface CachedAnalysis {
  insightsJson: string;
  analysisText: string;
  model: string;
  createdAt: string;
}

const getCachedStmt = db.prepare<{ sessionId: number; lapA: number; lapB: number }>(`
  SELECT insights_json, analysis_text, model, created_at
  FROM lap_analyses
  WHERE session_id = @sessionId AND lap_a = @lapA AND lap_b = @lapB
`);

export function getCachedAnalysis(sessionId: number, lapA: number, lapB: number): CachedAnalysis | undefined {
  const row = getCachedStmt.get({ sessionId, lapA, lapB }) as
    | { insights_json: string; analysis_text: string; model: string; created_at: string }
    | undefined;
  if (!row) return undefined;

  return {
    insightsJson: row.insights_json,
    analysisText: row.analysis_text,
    model: row.model,
    createdAt: row.created_at,
  };
}

const insertStmt = db.prepare<{
  sessionId: number;
  lapA: number;
  lapB: number;
  insightsJson: string;
  analysisText: string;
  model: string;
}>(`
  INSERT INTO lap_analyses (session_id, lap_a, lap_b, insights_json, analysis_text, model)
  VALUES (@sessionId, @lapA, @lapB, @insightsJson, @analysisText, @model)
`);

export function insertAnalysis(
  sessionId: number,
  lapA: number,
  lapB: number,
  insightsJson: string,
  analysisText: string,
  model: string
): void {
  insertStmt.run({ sessionId, lapA, lapB, insightsJson, analysisText, model });
}
