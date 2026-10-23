import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";

const handle = setupIsolatedTestDb();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("./db") as { db: import("better-sqlite3").Database };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { saveAnalysis, getCachedAnalysis } = require("./analysisRepository") as typeof import("./analysisRepository");

after(() => teardownIsolatedTestDb(handle));

function createSession(): number {
  const result = db
    .prepare(`INSERT INTO sessions (session_uid, game_year, game_major_version, game_minor_version) VALUES (?, 24, 1, 0)`)
    .run(String(Date.now()) + Math.random());
  return Number(result.lastInsertRowid);
}

test("saveAnalysis duas vezes pro mesmo par deixa uma linha, a mesma id e o segundo texto, modelo e versão", () => {
  const sessionId = createSession();
  saveAnalysis(sessionId, 8, 7, '{"a":1}', "primeiro texto", "modelo-a", "versaoaaaaaaaaaaa");
  const first = getCachedAnalysis(sessionId, 8, 7);
  const firstRow = db.prepare("SELECT id FROM lap_analyses WHERE session_id = ?").get(sessionId) as { id: number } | undefined;
  assert.ok(first && firstRow, "a primeira gravação deveria criar a linha");
  const firstId = firstRow.id;

  saveAnalysis(sessionId, 8, 7, '{"a":2}', "segundo texto", "modelo-b", "versaobbbbbbbbbbb");

  const rows = db.prepare("SELECT id FROM lap_analyses WHERE session_id = ?").all(sessionId) as { id: number }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, firstId);

  const second = getCachedAnalysis(sessionId, 8, 7);
  assert.ok(first && second);
  assert.equal(second.analysisText, "segundo texto");
  assert.equal(second.insightsJson, '{"a":2}');
  assert.equal(second.model, "modelo-b");
  assert.equal(second.promptVersion, "versaobbbbbbbbbbb");
  assert.ok(second.createdAt >= first.createdAt);
});

test("getCachedAnalysis devolve a versão do prompt gravada", () => {
  const sessionId = createSession();
  saveAnalysis(sessionId, 3, 2, "{}", "texto", "modelo", "0123456789abcdef");

  assert.equal(getCachedAnalysis(sessionId, 3, 2)?.promptVersion, "0123456789abcdef");
});

test("uma linha gravada sem prompt_version lê como promptVersion null", () => {
  const sessionId = createSession();
  db.prepare(
    "INSERT INTO lap_analyses (session_id, lap_a, lap_b, insights_json, analysis_text, model) VALUES (?, 5, 4, '{}', 'texto antigo', 'claude-opus-4-8')"
  ).run(sessionId);

  const row = getCachedAnalysis(sessionId, 5, 4);
  assert.ok(row);
  assert.equal(row.promptVersion, null);
  assert.equal(row.analysisText, "texto antigo");
});

test("sem linha pro par, getCachedAnalysis devolve undefined", () => {
  assert.equal(getCachedAnalysis(createSession(), 1, 2), undefined);
});
