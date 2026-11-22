// "Leg · Aspinall": a two-second flash when a live leg (or set) is won, in the
// style of the 180 sticker. Driven by the score: each page passes the live
// tallies on every refresh, and a flash shows when one side's count goes up.
// The first sighting of a match never flashes, so opening a page mid-match is quiet.

const seen = new Map(); // fixture id -> { legs: [a, b], sets: [a, b] }

/** Show the flash now. kind: 'Leg' | 'Set'. */
export function flashWin(name, kind = 'Leg') {
  if (typeof document === 'undefined') return;
  document.querySelector('.leg-flash')?.remove();
  const el = document.createElement('div');
  el.className = 'leg-flash';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${kind}</span><b></b>`;
  el.querySelector('b').textContent = name;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 1700);
  setTimeout(() => el.remove(), 2100);
}

/**
 * Call on every refresh with the live tallies. legs: legs in the current set
 * (or the match score in legs play); sets: [a, b] or null. names: [p1, p2].
 */
export function watchWins(id, legs, sets, names) {
  const key = String(id), prev = seen.get(key);
  seen.set(key, { legs: [...legs], sets: sets ? [...sets] : null });
  if (!prev) return;
  // A set won: the set score goes up (and the legs go back to 0-0).
  if (sets && prev.sets) for (const k of [0, 1]) if (sets[k] === prev.sets[k] + 1 && sets[1 - k] === prev.sets[1 - k]) return flashWin(names[k], 'Set');
  for (const k of [0, 1]) if (legs[k] === prev.legs[k] + 1 && legs[1 - k] === prev.legs[1 - k]) return flashWin(names[k], 'Leg');
}
