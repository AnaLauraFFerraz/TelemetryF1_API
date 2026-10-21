export type InsightsMatch = { match: true } | { match: false; path: string; stored: unknown; computed: unknown };

// O cache é gerado no Windows da mantenedora e conferido no Linux da
// hospedagem, possivelmente com outro V8: a comparação não pode ser texto
// com todas as casas. 0,01 absorve uma virada de fronteira do round2 (o
// coach recebe os valores calculados já arredondados a 2 casas) e 1e-9
// absorve a representação binária desse passo (0,36 - 0,35 =
// 0,010000000000000009). research.md, ponto 7.
const TOLERANCE = 0.01 + 1e-9;

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function compare(stored: unknown, computed: unknown, path: string): InsightsMatch {
  const mismatch: InsightsMatch = { match: false, path, stored, computed };

  if (typeof stored === "number" && typeof computed === "number") {
    return Math.abs(stored - computed) <= TOLERANCE ? { match: true } : mismatch;
  }

  if (Array.isArray(stored) || Array.isArray(computed)) {
    if (!Array.isArray(stored) || !Array.isArray(computed) || stored.length !== computed.length) return mismatch;
    for (let i = 0; i < stored.length; i += 1) {
      const result = compare(stored[i], computed[i], `${path}[${i}]`);
      if (!result.match) return result;
    }
    return { match: true };
  }

  if (stored !== null && computed !== null && typeof stored === "object" && typeof computed === "object") {
    const a = stored as Record<string, unknown>;
    const b = computed as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      if (!(key in a) || !(key in b)) return { match: false, path: join(path, key), stored: a[key], computed: b[key] };
    }
    for (const key of keys) {
      const result = compare(a[key], b[key], join(path, key));
      if (!result.match) return result;
    }
    return { match: true };
  }

  return stored === computed ? { match: true } : mismatch;
}

export function insightsMatch(stored: unknown, computed: unknown): InsightsMatch {
  return compare(stored, computed, "");
}
