// TV sync: hold live updates back by a viewer-chosen delay so scores, leg
// flashes and 180s land when they happen on the viewer's TV (PDC's live data
// usually runs ahead of the broadcast: a few seconds on satellite, much more on
// streaming apps).
//
// Every live value the site reads goes through here: record(key, value) keeps a
// short history, at(key) returns the value as it was `delay` ago. With no
// history that old yet (page just opened), the oldest known value is used.
// The delay is per device (localStorage), off by default.

const KEY = 'oche-tv-delay';
const hist = new Map(); // key -> [{ t, v, s }] oldest first (s = JSON, to skip repeats)
const listeners = new Set();
let delayMs = 0, ticker = 0, lastLegAt = 0;

try { delayMs = Math.max(0, Math.min(180_000, Number(localStorage.getItem(KEY)) || 0)); } catch { /* private mode */ }

/** Current delay in ms (0 = off). */
export const getDelay = () => delayMs;

/** Set the delay (ms; 0 turns it off), remember it on this device, and tell the pages. */
export function setDelay(ms) {
  delayMs = Math.max(0, Math.min(180_000, Math.round(ms / 1000) * 1000));
  try { delayMs ? localStorage.setItem(KEY, String(delayMs)) : localStorage.removeItem(KEY); } catch { /* fine */ }
  tick();
  listeners.forEach(cb => { try { cb(delayMs); } catch { /* page gone */ } });
}

/** Called when the delay changes, and every second while it's on (so delayed values come due). */
export function onDelayTick(cb) { listeners.add(cb); tick(); return () => listeners.delete(cb); }

function tick() {
  clearInterval(ticker);
  if (delayMs && typeof window !== 'undefined') ticker = window.setInterval(() => listeners.forEach(cb => { try { cb(delayMs); } catch { /* fine */ } }), 1000);
}

/** Keep a live value (only when it changed). Returns the value as it should be shown now. */
export function record(key, v) {
  if (v === undefined) return at(key);
  const now = Date.now();
  const list = hist.get(key) || [];
  const s = JSON.stringify(v);
  if (!list.length || list[list.length - 1].s !== s) {
    // A leg (or set) won in a live match: remembered for 'Sync to my TV'.
    const prev = list[list.length - 1]?.v;
    if (key.startsWith('m:') && prev && v && (String(prev.legs) !== String(v.legs) || String(prev.sets) !== String(v.sets))) lastLegAt = now;
    list.push({ t: now, v, s });
  }
  // Keep what the delay still needs, plus one older entry to fall back on.
  const keep = now - Math.max(delayMs, 120_000) - 15_000; // two minutes always, so a delay can be raised straight away
  while (list.length > 2 && list[1].t < keep) list.shift();
  hist.set(key, list);
  return at(key);
}

/** The value as it was `delay` ago (the oldest known if the page is younger than that). */
export function at(key) {
  const list = hist.get(key);
  if (!list?.length) return undefined;
  if (!delayMs) return list[list.length - 1].v;
  const due = Date.now() - delayMs;
  let pick = list[0];
  for (const e of list) { if (e.t <= due) pick = e; else break; }
  return pick.v;
}

/** "Now" as the viewer sees it (for time-based checks such as breaks). */
export const shownNow = () => Date.now() - delayMs;

/**
 * Sync to the viewer's TV: they tap the moment a leg is won on screen; the delay
 * becomes the time since that leg's result reached us. (Legs are a minute or
 * more apart, so the match-up is clear even on a stream a minute behind.)
 * Returns the new delay in ms, or null if no leg has been won since the page opened.
 */
export function syncToTv() {
  if (!lastLegAt || Date.now() - lastLegAt > 180_000) return null;
  setDelay(Date.now() - lastLegAt);
  return delayMs;
}

/** Whether a leg has been won recently enough to sync against. */
export const canSync = () => !!lastLegAt && Date.now() - lastLegAt <= 180_000;
