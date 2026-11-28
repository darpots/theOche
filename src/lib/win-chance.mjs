// Win chance from Elo ratings (src/data/elo.json): the share of matches a player
// at this rating gap would be expected to win.
//
// The ratings use the standard Elo curve (a 400-point gap is 10 to 1). Replayed
// over the last 12 months (4,928 matches between players with 20+ matches) that
// curve ran a little hot at the top end, so the chance uses a slightly flatter
// one: a 450-point gap is 10 to 1. Favourites given 70% won about 70%.
//
// Match length: the ratings come mostly from first-to-6 matches (floor events),
// so that chance is read as a first-to-6 chance, turned into the chance of
// winning a single leg, and built back up for the match's real format: a longer
// match gives the better player more room, so the favourite's chance grows.
// Checked on the 470 matches of other lengths in the same 12 months (first to
// 4–18 legs, 2–7 sets): this fitted their results better than the plain chance.
export const WIN_SCALE = 450;
/** The format the Elo chance is read as: first to 6 legs. */
export const REF_LEGS = 6;

/** Chance (0–1) that a player rated `a` beats one rated `b`, over the reference format. */
export const winChance = (a, b, scale = WIN_SCALE) => 1 / (1 + 10 ** ((b - a) / scale));

/** Chance of being first to `n` when each point (leg or set) is won with chance `q`. */
export function race(q, n) {
  let p = 0, c = 1; // c: ways to win n with k lost first, C(n-1+k, k)
  for (let k = 0; k < n; k++) {
    p += c * q ** n * (1 - q) ** k;
    c = (c * (n + k)) / (k + 1);
  }
  return p;
}

/** The single-leg chance that makes a first-to-`n` chance of `p`. */
export function legChance(p, n = REF_LEGS) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (race(mid, n) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * The chance over a match's format. fmt: { sets, bestOf, legsPerSet } as the
 * normalised stage gives them (bestOf counts sets in set play, else legs).
 * Unknown formats keep the reference chance.
 */
export function formatChance(p, fmt) {
  if (!fmt?.bestOf) return p;
  const q = legChance(p);
  if (fmt.sets) return race(race(q, Math.floor((fmt.legsPerSet || 5) / 2) + 1), Math.floor(fmt.bestOf / 2) + 1);
  return race(q, Math.floor(fmt.bestOf / 2) + 1);
}

/** Whole-number percentages for both players that add up to 100 (fmt optional, see formatChance). */
export function winPercents(a, b, fmt = null, scale = WIN_SCALE) {
  const p = Math.round(formatChance(winChance(a, b, scale), fmt) * 100);
  return [p, 100 - p];
}
