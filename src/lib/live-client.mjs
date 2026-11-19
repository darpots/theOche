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
import { liveMatches, slimLiveData, LIVE_KEY, LIVE_PROJECT } from './pdc.mjs';

/** How often the live score is polled when push isn't running (ms). */
export const LIVE_TICK = 8_000;
/** Safety check while push is running (ms). */
export const PUSH_TICK = 30_000;

let memo = { key: '', at: 0, p: null };
const pushed = new Map(); // fixture id -> slim live match, kept current by the listeners
const watching = new Map(); // `${tid}:${id}` -> unsubscribe
const callbacks = new Set();
let dbPromise = null, pushOk = false, notifyTimer = 0;

/** True while push updates are flowing. */
export const isPushing = () => pushOk && watching.size > 0;

/** Live documents for these fixtures; served from push data when every one is watched, else one shared request per tick. */
export function liveFor(tournamentId, ids) {
  const list = [...new Set(ids.map(String))];
  if (isPushing() && list.length && list.every(id => watching.has(`${tournamentId}:${id}`) && pushed.has(id))) {
    return Promise.resolve(new Map(list.map(id => [id, pushed.get(id)])));
  }
  const key = `${tournamentId}:${list.sort().join(',')}`;
  if (memo.p && memo.key === key && Date.now() - memo.at < LIVE_TICK - 1_000) return memo.p;
  memo = { key, at: Date.now(), p: list.length ? liveMatches(tournamentId, list).catch(() => new Map()) : Promise.resolve(new Map()) };
  return memo.p;
}

function db() {
  dbPromise ||= Promise.all([import('firebase/app'), import('firebase/firestore')]).then(([app, fs]) => {
    const a = app.getApps().find(x => x.name === 'oche-live') || app.initializeApp({ apiKey: LIVE_KEY, projectId: LIVE_PROJECT }, 'oche-live');
    return { fs, db: fs.getFirestore(a) };
  });
  return dbPromise;
}

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
          if (lk) legOff = fs.onSnapshot(fs.collection(store, `tournaments/${tournamentId}/matches/${id}/sets/${m.set || 1}/legs/${m.leg}/turns`), () => notify(), () => {});
        }
        notify();
      }, () => { pushOk = false; watching.delete(key); });
      watching.set(key, () => { off(); legOff?.(); });
    }
  } catch { pushOk = false; }
  return isPushing();
}

/** Remove a page's callback (on navigation). */
export function unwatch(onChange) { callbacks.delete(onChange); }
