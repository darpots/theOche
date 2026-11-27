// "Leg · Aspinall": a three-second flash when a live leg (or set) is won, in the
// style of the 180 sticker. Driven by the score: each page passes the live
// tallies on every refresh, and a flash shows when one side's count goes up.
// The first sighting of a match never flashes, so opening a page mid-match is quiet.

const seen = new Map(); // fixture id -> { legs: [a, b], sets: [a, b] }

/** Show the flash now, pinned over `anchor` (a CSS selector for the score); nothing shows without one. kind: 'Leg' | 'Set'. */
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
    // The name always fits: step the big text down until the whole word shows
    // (long surnames such as 'van Gerwen' or 'Wattimena' on a phone).
    const b = el.querySelector('b');
    let fs = parseFloat(getComputedStyle(b).fontSize);
    if (b.scrollWidth > b.clientWidth) {
      // Scale straight to fit, with a little room so no '…' appears, then check.
      fs = Math.floor(fs * (b.clientWidth / b.scrollWidth) * 0.94);
      b.style.fontSize = `${fs}px`;
      while (b.scrollWidth > b.clientWidth && fs > 20) { fs -= 2; b.style.fontSize = `${fs}px`; }
    }
    // Pinned to the page over its anchor (the legs score, or a player's score), so it
    // scrolls with the page: someone scrolled down to the stats doesn't get a sticker
    // over what they're reading. No anchor on the page, no flash.
    const a = anchor && document.querySelector(anchor);
    const r = a?.getBoundingClientRect();
    if (!r || !r.width) { el.remove(); return; }
    // Keep the whole sticker inside the page width (a player's score can sit near the edge on a phone).
    const vw = document.documentElement.clientWidth;
    const w = el.offsetWidth / 2 + 10, h = el.offsetHeight / 2 + 10;
    el.style.left = `${Math.min(Math.max(r.left + scrollX + r.width / 2, w), vw - w)}px`;
    // The 180 sits on the top edge of the player's score; a leg flash covers the legs score.
    el.style.top = `${Math.max((at === 'top' ? r.top + 4 : r.top + r.height / 2) + scrollY, h)}px`;
    el.style.visibility = '';
    // Restart the animation now it's placed.
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }));
  // Zoom in, wobble, hold, then shrink away: three seconds for a leg, 2.4 for a 180.
  setTimeout(() => el.remove(), variant.includes('t180') ? FLASH_180_MS : 3000);
}

const seen180 = new Map(); // fixture id -> key of the latest visit seen

/** How long the 180 sticker stays on screen (keep in step with .leg-flash.t180 in global.css). */
export const FLASH_180_MS = 2400;
// While a 180 sticker shows, the throw stays with the player who hit it: their
// score stays neon green until the sticker has gone, then the throw moves on.
const held = new Map(); // fixture id -> { k, until }

/** The player (0 or 1) the throw is held on after a 180, with ms left; null when no hold. */
export function heldThrow(id) {
  const h = held.get(String(id));
  if (!h) return null;
  const left = h.until - Date.now();
  if (left <= 0) { held.delete(String(id)); return null; }
  return { k: h.k, left };
}

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
  held.set(key, { k, until: Date.now() + FLASH_180_MS });
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
