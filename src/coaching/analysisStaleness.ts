export function isCachedAnalysisCurrent(
  row: { model: string; promptVersion: string | null },
  current: { model: string; promptVersion: string }
): boolean {
  return row.promptVersion !== null && row.promptVersion === current.promptVersion && row.model === current.model;
}
