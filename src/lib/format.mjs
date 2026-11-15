const d = s => new Date(s + 'T12:00:00Z');
const fmt = (s, o) => d(s).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });

export const dayNum = s => fmt(s, { day: 'numeric' });
export const monthShort = s => fmt(s, { month: 'short' });
export const monthLong = s => fmt(s, { month: 'long', year: 'numeric' });
export const weekday = s => fmt(s, { weekday: 'short' });
export const longDate = s => fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDate = s => fmt(s, { day: 'numeric', month: 'short' });

export function dateRange(start, end) {
  if (!end || start === end) return fmt(start, { day: 'numeric', month: 'short', year: 'numeric' });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (sameMonth) return `${dayNum(start)}–${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${fmt(start, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export const money = n => '£' + Math.round(n).toLocaleString('en-GB');

export function relativeDays(iso, now = new Date()) {
  const days = Math.round((Date.parse(iso) - now.getTime()) / 864e5);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days > -7 && days < 0) return `${-days} days ago`;
  return null;
}

export function newsDate(iso) {
  const rel = relativeDays(iso.slice(0, 10) + 'T12:00:00Z');
  return rel || new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Stable pastel gradient for initials avatars. */
export function avatarColours(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return [`hsl(${h} 45% 38%)`, `hsl(${(h + 40) % 360} 55% 55%)`];
}
export const initials = name => name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
