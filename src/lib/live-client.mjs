// Browser-side live scores, shared by the live bar and the page underneath.
//
// Two ways in:
//  - push: once a match is in play, the page subscribes to PDC's live-scoring
//    database (Firestore) and gets every change as it happens; the Firebase
//    client is only downloaded at that point.
//  - poll: a batch fetch every few seconds, used until push is running and as a
//    fallback if it ever drops (blocked network, old browser).
// Pages keep their own timers; while push is running they only need a slow
// safety check, and watchLive() calls them back the moment a score changes.
import { record, at as delayed, onDelayTick } from './tv-delay.mjs';
import { liveMatches, slimLiveData, legFromTurns, legSummary, legResult, liveCurrentLeg, LIVE_KEY, LIVE_PROJECT } from './pdc.mjs';

/** How often the live score is polled when push isn't running (ms). */
export const LIVE_TICK = 8_000;
/** Safety check while push is running (ms). */
export const PUSH_TICK = 30_000;

let memo = { key: '', at: 0, p: null };
const pushed = new Map(); // fixture id -> slim live match, kept current by the listeners
const pushedLeg = new Map(); // fixture id -> { set, leg, data: legFromTurns(...), prevFirst }
const watching = new Map(); // `${tid}:${id}` -> unsubscribe
const callbacks = new Set();
let dbPromise = null, pushOk = false, notifyTimer = 0;

/** True while push updates are flowing. */
export const isPushing = () => pushOk && watching.size > 0;

/** Live documents for these fixtures; served from push data when every one is watched, else one shared request per tick. */
export function liveFor(tournamentId, ids) {
  // Every live document goes through the TV delay (tv-delay.mjs): pages see each
  // match as it was `delay` ago; the latest raw one is kept for the leg lookups.
  return liveForRaw(tournamentId, ids).then(m => {
    const out = new Map();
    for (const [id, x] of m) { rawLive.set(String(id), x); out.set(id, record(`m:${id}`, x)); }
    return out;
  });
}
const rawLive = new Map(); // fixture id -> latest live document (undelayed)

function liveForRaw(tournamentId, ids) {
  const list = [...new Set(ids.map(String))];
  const isWatched = id => watching.has(`${tournamentId}:${id}`) && pushed.has(id);
  // While push is running, watched matches come from it; the rest (finished or not
  // started) change rarely, so they're fetched at most every PUSH_TICK.
  const rest = isPushing() ? list.filter(id => !isWatched(id)) : list;
  const key = `${tournamentId}:${rest.slice().sort().join(',')}`;
  const fresh = isPushing() ? PUSH_TICK : LIVE_TICK - 1_000;
  if (!(memo.p && memo.key === key && Date.now() - memo.at < fresh)) {
    memo = { key, at: Date.now(), p: rest.length ? liveMatches(tournamentId, rest).catch(() => new Map()) : Promise.resolve(new Map()) };
  }
  if (rest.length === list.length) return memo.p;
  return memo.p.then(m => { const out = new Map(m); for (const id of list) if (isWatched(id)) out.set(id, pushed.get(id)); return out; });
}

function db() {
  dbPromise ||= Promise.all([import('firebase/app'), import('firebase/firestore')]).then(([app, fs]) => {
    const a = app.getApps().find(x => x.name === 'oche-live') || app.initializeApp({ apiKey: LIVE_KEY, projectId: LIVE_PROJECT }, 'oche-live');
    return { fs, db: fs.getFirestore(a) };
  });
  return dbPromise;
}

/** Start downloading the push client now (on a page that will need it), so it's ready when the first match is found in play. */
export function warmPush() { db().catch(() => { dbPromise = null; }); }

const notify = () => {
  clearTimeout(notifyTimer);
  // Batch bursts (score, stats and leg all change together) into one redraw.
  notifyTimer = setTimeout(() => callbacks.forEach(cb => { try { cb(); } catch { /* page gone */ } }), 120);
};

/**
 * Subscribe to these fixtures (call it on every refresh; it only adds what's
 * new) and register `onChange`, called after each pushed change. Also follows
 * the leg in play, so every visit arrives as it's thrown.
 */
export async function watchLive(tournamentId, ids, onChange) {
  if (onChange) callbacks.add(onChange);
  const want = [...new Set(ids.map(String))].filter(id => !watching.has(`${tournamentId}:${id}`));
  if (!want.length) return isPushing();
  try {
    const { fs, db: store } = await db();
    for (const id of want) {
      const key = `${tournamentId}:${id}`;
      if (watching.has(key)) continue;
      let legOff = null, legKey = '';
      const off = fs.onSnapshot(fs.doc(store, `tournaments/${tournamentId}/matches/${id}`), snap => {
        pushOk = true;
        const m = slimLiveData(id, snap.data());
        if (m) pushed.set(id, m);
        // Follow the current leg's visits too (each one changes the score left).
        const lk = m && m.status === 'live' && m.leg ? `${m.set || 1}/${m.leg}` : '';
        if (lk !== legKey) {
          legOff?.(); legOff = null; legKey = lk;
          // Who threw first in the leg just finished: they don't throw first in the next one.
          const before = pushedLeg.get(id);
          const prevFirst = before?.data.visits[0] ? (before.data.visits[0].isParticipant1 ? 0 : 1) : before?.prevFirst ?? null;
          const prevLastAt = before?.data.lastAt ?? before?.prevLastAt ?? null;
          const prevResult = before ? legResult(before.data) : null;
          if (lk) {
            const set = m.set || 1, leg = m.leg;
            const follows = before && before.leg === leg - 1;
            pushedLeg.set(id, { set, leg, data: legFromTurns([], set, leg), prevFirst: follows ? prevFirst : null, prevLastAt: follows ? prevLastAt : null, prevResult: follows ? prevResult : null, ready: false });
            legOff = fs.onSnapshot(fs.collection(store, `tournaments/${tournamentId}/matches/${id}/sets/${set}/legs/${leg}/turns`), q => {
              const cur = pushedLeg.get(id);
              const data = legFromTurns(q.docs.map(d => d.data()), set, leg);
              pushedLeg.set(id, { ...cur, data, ready: true });
              record(`pl:${id}`, { set, leg, data });
              notify();
            }, () => {});
          }
        }
        notify();
      }, () => { pushOk = false; watching.delete(key); });
      watching.set(key, () => { off(); legOff?.(); });
    }
  } catch { pushOk = false; }
  return isPushing();
}

/**
 * The leg in play for a live match: from pushed data when it's flowing (no
 * extra request, and every dart shows), else one fetch.
 */
export async function currentLeg(tournamentId, shown) {
  if (!shown) return null;
  // Work out the leg from the latest data, then hand back what the TV delay says is due.
  const raw = rawLive.get(String(shown.id)) || shown;
  const now = await currentLegRaw(tournamentId, raw).catch(() => null);
  const v = record(`leg:${shown.id}`, now ?? null);
  return shown.status === 'live' ? v : null;
}
const legMemo = new Map(); // fixture id -> { at, key, p } (one fetch every few seconds when push isn't running)

async function currentLegRaw(tournamentId, m) {
  if (!m || m.status !== 'live' || !m.leg) return null;
  const p = pushedLeg.get(String(m.id));
  if (isPushing() && p?.ready && p.leg === m.leg && p.set === (m.set || 1)) {
    // A new leg with no darts yet and no memory of the last one: ask once.
    if (!p.data.visits.length && (p.prevFirst == null || p.prevLastAt == null) && m.leg > 1) return liveCurrentLeg(tournamentId, m);
    return legSummary(p.data, m, p.prevFirst, p.prevLastAt, p.prevResult);
  }
  const key = `${m.set}/${m.leg}`, c = legMemo.get(String(m.id));
  if (c && c.key === key && Date.now() - c.at < 3_000) return c.p;
  const p2 = liveCurrentLeg(tournamentId, m);
  legMemo.set(String(m.id), { at: Date.now(), key, p: p2 });
  return p2;
}

/** The pushed leg in play (as legFromTurns returns it), if push has it for this set and leg. */
export function pushedLegFor(id, set, leg) {
  const p = delayed(`pl:${id}`); // as it was `delay` ago (tv-delay.mjs)
  return isPushing() && p && p.set === set && p.leg === leg ? p.data : null;
}

// While a TV delay is on, delayed values come due without any new data: redraw every second.
onDelayTick(() => notify());

/** Remove a page's callback (on navigation). */
export function unwatch(onChange) { callbacks.delete(onChange); }
