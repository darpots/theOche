// "Leg · Aspinall": a three-second flash when a live leg (or set) is won, in the
// style of the 180 sticker. Driven by the score: each page passes the live
// tallies on every refresh, and a flash shows when one side's count goes up.
// The first sighting of a match never flashes, so opening a page mid-match is quiet.

const seen = new Map(); // fixture id -> { legs: [a, b], sets: [a, b] }

/** Show the flash now, centred over `anchor` (a CSS selector for the score) when it's on screen. kind: 'Leg' | 'Set'. */
export function flashWin(name, kind = 'Leg', anchor = '') {
  if (typeof document === 'undefined') return;
  document.querySelector('.leg-flash')?.remove();
  const el = document.createElement('div');
  el.className = 'leg-flash';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${kind}</span><b></b>`;
  el.querySelector('b').textContent = name;
  const a = anchor && document.querySelector(anchor);
  const r = a?.getBoundingClientRect();
  if (r && r.bottom > 0 && r.top < innerHeight) { el.style.left = `${r.left + r.width / 2}px`; el.style.top = `${r.top + r.height / 2}px`; }
  document.body.append(el);
  // Zoom in, wobble, hold, then shrink away: about three seconds in all.
  setTimeout(() => el.remove(), 3000);
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
