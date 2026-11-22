// Shared rules for listing news.
//  - A preview goes stale the moment its first match starts (or, without match
//    ids, once its day is over): it drops off the homepage and never leads the
//    news page. `expiresAt` is also written into the page as data-expires so the
//    browser hides it between hourly builds.
import data from '../data/tournament.json';

type Story = { kind?: string; date: string; matches?: string[]; tournament?: string };

const fixtures = new Map<string, { date: string; time?: string; status?: string }>();
for (const s of (data.tournament as any).stages || []) for (const f of s.fixtures || []) fixtures.set(String(f.id), f);

/** Epoch ms of a UK wall-clock date and time ("2026-11-22", "13:15"). */
export function ukToEpoch(date: string, time = '00:00'): number {
  const guess = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  // London is UTC or UTC+1: find the offset at that moment.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).formatToParts(new Date(guess));
  const h = Number(parts.find(p => p.type === 'hour')?.value) % 24;
  const offset = ((h - new Date(guess).getUTCHours() + 24) % 24) * 36e5;
  return guess - offset;
}

/** When a preview stops being useful (ms), or null for other stories. */
export function expiresAt(story: Story): number | null {
  if (story.kind !== 'preview') return null;
  const starts = (story.matches || []).map(id => fixtures.get(String(id))).filter(Boolean)
    .map(f => ukToEpoch(f!.date, f!.time || '00:00'));
  if (starts.length) return Math.min(...starts);
  const day = new Date(story.date).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  return ukToEpoch(day, '23:59');
}

/** True when a preview's matches have started (or been played). */
export function isStale(story: Story, now = Date.now()): boolean {
  if (story.kind !== 'preview') return false;
  const played = (story.matches || []).some(id => { const st = fixtures.get(String(id))?.status; return st && st !== 'upcoming'; });
  const exp = expiresAt(story);
  return played || (exp != null && exp <= now);
}

/** Inline script: hide anything whose data-expires has passed (previews between builds). */
export const EXPIRE_SCRIPT = `(function(){function run(){var n=Date.now();document.querySelectorAll('[data-expires]').forEach(function(e){if(+e.getAttribute('data-expires')<=n)e.hidden=true})}run();document.addEventListener('astro:page-load',run);setInterval(run,60000)})();`;
