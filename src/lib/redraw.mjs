// Knockout rounds and whether an event is redrawn after each round (as the
// UK Open is) rather than played as a fixed bracket.
// Pure functions on a normalised tournament, shared by the draw and schedule views.

/** Knockout rounds, first round first (the most fixtures). */
export const koRounds = t => t.stages
  .filter(s => !/^group/i.test(s.name) && s.fixtures.length)
  .sort((a, b) => b.fixtures.length - a.fixtures.length || (b.round ?? 0) - (a.round ?? 0));

// The PDC numbers a round's matches in bracket order; the feed lists them in order of play.
const byId = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

/**
 * Each round ordered so a match sits beside the two it came from (a fixed bracket).
 * The first round is put in bracket order by match number (checked against finished
 * events: the World Championship, floor events, majors and the Players Championship Finals).
 */
export function bracketColumns(ko) {
  const cols = ko.length ? [ko[0].fixtures.slice().sort(byId)] : [];
  for (let i = 1; i < ko.length; i++) {
    const prev = cols[i - 1];
    const at = id => prev.findIndex(f => f.p1?.id === id || f.p2?.id === id);
    const pos = f => Math.min(...[f.p1?.id, f.p2?.id].filter(Boolean).map(at).filter(x => x >= 0), 999);
    // Placed by where its players came from; while a round is only partly filled in,
    // by match number (bracket order) so known and unknown slots stay in place.
    const placed = ko[i].fixtures.every(f => pos(f) < 999);
    cols.push(ko[i].fixtures.slice().sort(placed ? (a, b) => pos(a) - pos(b) : byId));
  }
  return cols;
}

/**
 * True when a later-round match brings together players who didn't come from
 * neighbouring matches in the round before: the event is redrawn each round.
 * Players who enter in a later round (seeds with a bye) are ignored.
 */
export function isRedrawn(t) {
  const ko = koRounds(t);
  const cols = bracketColumns(ko);
  for (let i = 1; i < cols.length; i++) {
    const prev = cols[i - 1];
    const at = id => prev.findIndex(f => f.p1?.id === id || f.p2?.id === id);
    for (const f of ko[i].fixtures) {
      if (!f.p1 || !f.p2) continue;
      const a = at(f.p1.id), b = at(f.p2.id);
      if (a >= 0 && b >= 0 && Math.floor(a / 2) !== Math.floor(b / 2)) return true;
    }
  }
  return false;
}

const plural = name => ({ 'quarter-final': 'quarter-finals', 'semi-final': 'semi-finals' })[name.toLowerCase()] || name;

/**
 * For a redrawn event, a note for each round still to be drawn, keyed by round
 * name: "Drawn after the Last 32" while the round before is being played,
 * "Draw to come" once it's finished, "Semi-final winners" for the final.
 * Empty for fixed brackets.
 */
export function drawNotes(t) {
  const out = new Map();
  if (!isRedrawn(t)) return out;
  const ko = koRounds(t);
  ko.forEach((s, i) => {
    if (!i) return;
    const prev = ko[i - 1];
    if (s.fixtures.length === 1) out.set(s.name, `${prev.fixtures.length === 2 ? 'Semi-final' : prev.name} winners`);
    else out.set(s.name, prev.fixtures.every(f => f.status === 'result') ? 'Draw to come' : `Drawn after the ${plural(prev.name)}`);
  });
  return out;
}

/**
 * Fixed brackets: who will fill each empty slot, worked out from the two matches
 * feeding it (match k of a round is fed by matches 2k and 2k+1 of the round before,
 * by match number). Keyed by fixture id: [side1, side2], each null (already known
 * from the feed, or not worked out yet), { player } once the feeding match is won,
 * or { either: [a, b], round } while it's still to be played. Empty for redrawn events
 * and rounds with byes (players joining later).
 */
export function projectSlots(t) {
  const out = new Map();
  if (isRedrawn(t)) return out;
  const ko = koRounds(t).map(s => s.fixtures.slice().sort(byId));
  const from = (f, round) => {
    if (!f) return null;
    if (f.status === 'result' && f.winner) { const p = [f.p1, f.p2].find(p => p?.id === f.winner); return p ? { player: p } : null; }
    return f.p1 && f.p2 ? { either: [f.p1, f.p2], round } : null;
  };
  const has = (f, id) => f && (f.p1?.id === id || f.p2?.id === id);
  for (let i = 1; i < ko.length; i++) {
    const prev = ko[i - 1];
    if (prev.length !== ko[i].length * 2) continue;
    ko[i].forEach((f, k) => {
      if (f.p1 && f.p2) return;
      const feed = [prev[2 * k], prev[2 * k + 1]];
      // A player already placed by the PDC came from one feeder; the empty side is the other.
      const known = f.p1 || f.p2;
      const other = known ? feed.find(x => !has(x, known.id)) : null;
      const round = koRounds(t)[i - 1].name;
      const sides = known ? [f.p1 ? null : from(other, round), f.p2 ? null : from(other, round)] : [from(feed[0], round), from(feed[1], round)];
      if (sides[0] || sides[1]) out.set(f.id, sides);
    });
  }
  return out;
}
