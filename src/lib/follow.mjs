// Following players: kept in this browser only (see /privacy). Followed
// players' matches are highlighted, starred in the live bar, and, while the
// site is open, the browser shows a notification when one of their matches
// starts (if the visitor allows notifications).
const KEY = 'oche:follow';

/** [{ id, name }] */
export function followed() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ } };
export const isFollowed = id => followed().some(p => p.id === String(id));

export function toggleFollow(id, name) {
  const list = followed();
  const on = !list.some(p => p.id === String(id));
  save(on ? [...list, { id: String(id), name }] : list.filter(p => p.id !== String(id)));
  return on;
}

/** Wire every [data-follow] button on the page, and highlight followed players' matches. */
export function initFollow() {
  document.querySelectorAll('[data-follow]').forEach(b => {
    b.setAttribute('aria-pressed', String(isFollowed(b.dataset.follow)));
    if (b.dataset.wired) return;
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      const on = toggleFollow(b.dataset.follow, b.dataset.name);
      b.setAttribute('aria-pressed', String(on));
      // Ask once, on the click itself, so the browser shows the prompt.
      if (on && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    });
  });
  markFollowed();
}

/** Add .fav to anything carrying data-players="id1 id2" with a followed player in it. */
export function markFollowed(root = document) {
  const ids = new Set(followed().map(p => p.id));
  root.querySelectorAll('[data-players]').forEach(el => el.classList.toggle('fav', el.dataset.players.split(' ').some(id => ids.has(id))));
}

/** Notify (once per match per browser session) when a followed player's match is live. fixtures: [{ id, p1: {id,name}, p2: {id,name}, label }] */
export function notifyLive(fixtures) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const ids = new Set(followed().map(p => p.id));
  for (const f of fixtures) {
    const who = [f.p1, f.p2].find(p => p && ids.has(String(p.id)));
    if (!who) continue;
    const k = `oche:told:${f.id}`;
    try { if (sessionStorage.getItem(k)) continue; sessionStorage.setItem(k, '1'); } catch { continue; }
    try { new Notification(`${who.name} is on now`, { body: f.label, icon: '/icon-192.png', tag: `match-${f.id}` }).onclick = () => { window.focus(); location.href = `/match?id=${f.id}`; }; } catch { /* some mobiles need a service worker */ }
  }
}
