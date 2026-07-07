import { db } from "./db";
import { PacketHeader } from "../telemetry/header/types";

const findSessionStmt = db.prepare<{ sessionUid: string }>(
  `SELECT id FROM sessions WHERE session_uid = @sessionUid`
);

const insertSessionStmt = db.prepare<{
  sessionUid: string;
  gameYear: number;
  gameMajorVersion: number;
  gameMinorVersion: number;
}>(
  `INSERT INTO sessions (session_uid, game_year, game_major_version, game_minor_version)
   VALUES (@sessionUid, @gameYear, @gameMajorVersion, @gameMinorVersion)`
);

const touchSessionStmt = db.prepare<{ id: number }>(
  `UPDATE sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`
);

// header.sessionUID é BigInt (uint64) - nunca fazemos bind dele direto numa
// coluna INTEGER (ver nota em schema.ts). Convertido pra string decimal antes
// do bind, sem perda de precisão.
export function getOrCreateSession(header: PacketHeader): number {
  const sessionUid = header.sessionUID.toString();

  const existing = findSessionStmt.get({ sessionUid }) as { id: number } | undefined;
  if (existing) {
    touchSessionStmt.run({ id: existing.id });
    return existing.id;
  }

  const result = insertSessionStmt.run({
    sessionUid,
    gameYear: header.gameYear,
    gameMajorVersion: header.gameMajorVersion,
    gameMinorVersion: header.gameMinorVersion,
  });
  return Number(result.lastInsertRowid);
}

export interface SessionSummary {
  id: number;
  sessionUid: string;
  startedAt: string;
  lastSeenAt: string;
  lapCount: number;
  bestLapTimeMs: number | null;
}

const listSessionsStmt = db.prepare(`
  SELECT s.id, s.session_uid, s.started_at, s.last_seen_at,
         COUNT(l.id) AS lap_count,
         MIN(CASE WHEN l.is_valid = 1 THEN l.lap_time_ms END) AS best_lap_time_ms
  FROM sessions s
  LEFT JOIN laps l ON l.session_id = s.id
  GROUP BY s.id
  ORDER BY s.started_at DESC
`);

export function listSessions(): SessionSummary[] {
  const rows = listSessionsStmt.all() as Array<{
    id: number;
    session_uid: string;
    started_at: string;
    last_seen_at: string;
    lap_count: number;
    best_lap_time_ms: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    sessionUid: row.session_uid,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    lapCount: row.lap_count,
    bestLapTimeMs: row.best_lap_time_ms,
  }));
}

export interface SessionDetail {
  id: number;
  sessionUid: string;
  startedAt: string;
  lastSeenAt: string;
}

const getSessionByIdStmt = db.prepare<{ id: number }>(
  `SELECT id, session_uid, started_at, last_seen_at FROM sessions WHERE id = @id`
);

export function getSessionById(id: number): SessionDetail | undefined {
  const row = getSessionByIdStmt.get({ id }) as
    | { id: number; session_uid: string; started_at: string; last_seen_at: string }
    | undefined;
  if (!row) return undefined;

  return {
    id: row.id,
    sessionUid: row.session_uid,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
  };
}
