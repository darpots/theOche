// "Leg · Aspinall": a three-second flash when a live leg (or set) is won, in the
// style of the 180 sticker. Driven by the score: each page passes the live
// tallies on every refresh, and a flash shows when one side's count goes up.
// The first sighting of a match never flashes, so opening a page mid-match is quiet.

const seen = new Map(); // fixture id -> { legs: [a, b], sets: [a, b] }

/** Show the flash now, centred over `anchor` (a CSS selector for the score) when it's on screen. kind: 'Leg' | 'Set'. */
export function flashWin(name, kind = 'Leg', anchor = '') {
  show(kind, name, anchor);
}

/** A 180: '180!' big with the player's name over it, the same zoom and wobble, over their score. */
export function flash180(name, anchor = '') {
  show(name, '180!', anchor, ' t180', 'top');
}

function show(small, big, anchor, variant = '', at = 'centre') {
  if (typeof document === 'undefined') return;
  document.querySelector('.leg-flash')?.remove();
  const el = document.createElement('div');
  el.className = `leg-flash${variant}`;
  el.setAttribute('role', 'status');
  el.innerHTML = '<span></span><b></b>';
  el.querySelector('span').textContent = small;
  el.querySelector('b').textContent = big;
  // Centre it over the anchor (the legs score, or a player's score) as laid out after
  // the page's redraw: the flash fires just before it, so measure on the next frame.
  el.style.visibility = 'hidden';
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const a = anchor && document.querySelector(anchor);
    const r = a?.getBoundingClientRect();
    if (r && r.bottom > 0 && r.top < innerHeight) {
      // Keep the whole sticker on screen (a player's score can sit near the edge on a phone).
      const w = el.offsetWidth / 2 + 10, h = el.offsetHeight / 2 + 10;
      el.style.left = `${Math.min(Math.max(r.left + r.width / 2, w), innerWidth - w)}px`;
      // The 180 sits on the top edge of the player's score (where the old sticker was); a leg flash covers the legs score.
      el.style.top = `${Math.min(Math.max(at === 'top' ? r.top + 4 : r.top + r.height / 2, h), innerHeight - h)}px`;
    }
    el.style.visibility = '';
    // Restart the animation now it's placed.
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }));
  // Zoom in, wobble, hold, then shrink away: three seconds for a leg, a quick 1.6 for a 180.
  setTimeout(() => el.remove(), variant.includes('t180') ? 1600 : 3000);
}

const seen180 = new Map(); // fixture id -> key of the latest visit seen

/**
 * Call on every refresh with the leg in play's visits: a new visit that's a 180
 * flashes over that player's score. anchors: [selector for player 1, player 2].
 * The first sighting of a match never flashes.
 */
export function watch180(id, set, leg, visits, names, anchors) {
  const v = (visits || []).slice().sort((a, b) => a.order - b.order);
  const last = v[v.length - 1];
  const key = String(id), now = last ? `${set}.${leg}.${last.order}` : `${set}.${leg}.-`;
  const prev = seen180.get(key);
  seen180.set(key, now);
  if (prev === undefined || prev === now || !last || last.isBust || last.score !== 180) return;
  const k = last.isParticipant1 ? 0 : 1;
  flash180(names[k], anchors[k]);
}

/**
 * Call on every refresh with the live tallies. legs: legs in the current set
 * (or the match score in legs play); sets: [a, b] or null. names: [p1, p2].
 */
export function watchWins(id, legs, sets, names, anchor = '') {
  const key = String(id), prev = seen.get(key);
  seen.set(key, { legs: [...legs], sets: sets ? [...sets] : null });
  if (!prev) return;
  // A set won: the set score goes up (and the legs go back to 0-0).
  if (sets && prev.sets) for (const k of [0, 1]) if (sets[k] === prev.sets[k] + 1 && sets[1 - k] === prev.sets[1 - k]) return flashWin(names[k], 'Set', anchor);
  for (const k of [0, 1]) if (legs[k] === prev.legs[k] + 1 && legs[1 - k] === prev.legs[1 - k]) return flashWin(names[k], 'Leg', anchor);
}
