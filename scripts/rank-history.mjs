// Rank history for the sparklines covers the last 12 months: every snapshot
// from the last year, plus the latest one before that so the line starts
// about a year back. Repeated identical snapshots are dropped.
export function trimHistory(history, today) {
  const cut = String(Number(today.slice(0, 4)) - 1) + today.slice(4);
  const dedup = history.filter((h, i) => i === 0 || JSON.stringify(h.pos) !== JSON.stringify(history[i - 1].pos));
  const firstIn = dedup.findIndex(h => h.d && h.d >= cut);
  if (firstIn === -1) return dedup.slice(-1);
  return dedup.slice(Math.max(0, firstIn - 1));
}
