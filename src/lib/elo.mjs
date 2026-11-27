// Elo ratings over a rolling 12 months, from PDC match results.
//
// Every match is a win or a loss (the score doesn't matter) and counts the same,
// wherever it was played. The winner takes points from the loser: more for
// beating a stronger player, fewer for beating a weaker one.
//
// The ratings shown come from the last 12 months only. The 12 months before set
// each player's starting point, so the first weeks of the window aren't judged
// as if everyone were equal; those older matches move nobody's shown record.
import { normaliseTournament } from './pdc.mjs';

/** PDC tournament types that count: the majors, Players Championships (floor and Finals), European Tour, World Series and Premier League. */
export const ELO_TYPES = {
  1: 'World Championship', 4: 'UK Open', 6: 'World Grand Prix', 7: 'European Championship', 9: 'Grand Slam',
  15: 'World Matchplay', 19: 'World Masters', 30: 'Players Championship Finals',
  29: 'Players Championship', 14: 'European Tour', 18: 'World Series', 3: 'Premier League', 54: 'Premier League',
};
export const ELO = { base: 1500, k: 24, minMatches: 20 };

const typeOf = t => String(t?.tournamentTypeID ?? t?.type?.tournamentTypeID ?? '');
/** Does this event count? (Its qualifiers, the World Cup's pairs and the other tours don't.) */
export const isEloEvent = t => typeOf(t) in ELO_TYPES && !/qualif|test/i.test(t?.name || '');

// Earlier rounds first within a day: a Last 128 before a Last 64 (group stages first of all).
const roundRank = name => {
  if (/^final$/i.test(name)) return 2;
  if (/semi/i.test(name)) return 4;
  if (/quarter/i.test(name)) return 8;
  const l = /last (\d+)/i.exec(name); if (l) return Number(l[1]);
  return 1e6; // first round, group or league stage
};

/**
 * One event's finished matches from its PDC feed payload, as
 * [date, order, winnerId, loserId] rows, plus the players' names and countries.
 * Walkovers (no legs played) are left out: nothing was won on the board.
 */
export function eventMatches(payload) {
  const t = normaliseTournament(payload);
  const rows = [], players = {};
  for (const s of t.stages) for (const f of s.fixtures) {
    if (f.status !== 'result' || !f.winner || !f.p1?.id || !f.p2?.id) continue;
    if (f.s1 == null || f.s2 == null || f.s1 + f.s2 === 0) continue;
    const w = f.winner === f.p1.id ? f.p1 : f.winner === f.p2.id ? f.p2 : null;
    if (!w) continue;
    const l = w === f.p1 ? f.p2 : f.p1;
    rows.push([f.date || t.end || t.start, `${String(1e7 - roundRank(s.name)).padStart(8, '0')}${f.time || ''}`, w.id, l.id]);
    for (const p of [f.p1, f.p2]) players[p.id] = [p.name, p.country || null];
  }
  return { rows, players };
}

const expect = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

/**
 * Ratings from events [{ id, name, rows }] (rows as eventMatches gives them).
 * Matches before `from` only set the starting ratings; from `from` on they count
 * in each player's record. Returns every player seen, with:
 *   rating, played/won/lost (since `from`), last: { id, delta } (their latest event),
 *   and `before`: everyone's rating just before the latest event began (for movement).
 */
export function computeElo(events, from, { k = ELO.k, base = ELO.base } = {}) {
  const all = [];
  for (const e of events) for (const r of e.rows) all.push({ e: e.id, d: r[0], o: r[1], w: r[2], l: r[3] });
  all.sort((x, y) => x.d.localeCompare(y.d) || x.o.localeCompare(y.o) || String(x.e).localeCompare(String(y.e)));
  const P = new Map();
  const get = id => { let p = P.get(id); if (!p) P.set(id, p = { rating: base, played: 0, won: 0, lost: 0, last: null }); return p; };
  // The event the latest match belongs to: movement is shown against the ratings before it started.
  const latest = [...all].reverse().find(m => m.d >= from)?.e ?? null;
  let before = null;
  for (const m of all) {
    if (m.e === latest && !before) before = new Map([...P].map(([id, p]) => [id, p.rating]));
    const w = get(m.w), l = get(m.l);
    const counts = m.d >= from;
    for (const [p, id] of [[w, m.w], [l, m.l]]) if (counts && p.last?.id !== m.e) p.last = { id: m.e, start: p.rating };
    const ew = expect(w.rating, l.rating), delta = k * (1 - ew);
    w.rating += delta; l.rating -= delta;
    if (counts) { w.played++; w.won++; l.played++; l.lost++; }
  }
  for (const p of P.values()) if (p.last) p.last = { id: p.last.id, delta: p.rating - p.last.start };
  return { players: P, before: before || new Map(), latest };
}

/**
 * The table: players with at least `min` matches in the window, best first, with
 * their position, and the move since the latest event began (against the same
 * players' ratings then).
 */
export function eloTable({ players, before }, min = ELO.minMatches) {
  const list = [...players].filter(([, p]) => p.played >= min).map(([id, p]) => ({ id, ...p }));
  list.sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const prevOrder = [...list].sort((a, b) => (before.get(b.id) ?? ELO.base) - (before.get(a.id) ?? ELO.base) || a.id.localeCompare(b.id));
  const prevPos = new Map(prevOrder.map((p, i) => [p.id, i + 1]));
  return list.map((p, i) => ({ ...p, pos: i + 1, move: prevPos.get(p.id) - (i + 1) }));
}
