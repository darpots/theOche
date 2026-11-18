// Browser-side live polling, shared by the live bar and the page underneath
// so both draw from one request per tick.
import { liveMatches } from './pdc.mjs';

/** How often the live score is checked while a match is on (ms). */
export const LIVE_TICK = 8_000;

let memo = { key: '', at: 0, p: null };

/** Live documents for these fixtures; repeated calls within a tick share one request. */
export function liveFor(tournamentId, ids) {
  const key = `${tournamentId}:${[...new Set(ids.map(String))].sort().join(',')}`;
  if (memo.p && memo.key === key && Date.now() - memo.at < LIVE_TICK - 1_000) return memo.p;
  memo = { key, at: Date.now(), p: ids.length ? liveMatches(tournamentId, ids).catch(() => new Map()) : Promise.resolve(new Map()) };
  return memo.p;
}
