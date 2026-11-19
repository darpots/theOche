// Renders the Matches page body from a normalised tournament. Used at build
// time (Astro) and again in the browser when live data arrives, so both
// always produce identical markup.
import { flag, keyName } from './pdc.mjs';
import { avatarColours, initials, longDate, shortDate, ukClock, ukZone } from './format.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function avatar(p, portraits, size = 44) {
  const pic = p && portraits[keyName(p.name)];
  const [c1, c2] = avatarColours(p?.name || '?');
  return `<span class="avatar" style="--size:${size}px;--c1:${c1};--c2:${c2}">${pic ? `<img src="${pic}" alt="" loading="lazy" decoding="async">` : esc(initials(p?.name || '?'))}</span>`;
}

const fmt = (n, d = 2) => (n == null || Number.isNaN(n) ? '–' : Number(n).toFixed(d));

function side(p, score, won, decided, portraits, align, st, best) {
  if (!p) return `<div class="pl ${align} tbc"><span class="avatar" style="--size:44px">?</span><span class="nm"><b>To be decided</b></span></div>`;
  const avg = st ? `<span class="avg${best ? ' best' : ''}" title="Three-dart average"><i>avg</i>${fmt(st.avg)}</span>` : '';
  return `<div class="pl ${align}${won ? ' won' : decided ? ' lost' : ''}">
    ${avatar(p, portraits)}
    <span class="nm"><b>${esc(p.name)}</b><small>${flag(p.country)}${p.ranking ? ` #${p.ranking}` : ''}${won ? ' <em class="wbadge">Winner</em>' : ''}</small></span>
    ${avg}
  </div>`;
}


export function fixtureRow(f, portraits) {
  const decided = f.status === 'result' && !!f.winner;
  const w1 = decided && f.p1 && f.winner === f.p1.id;
  const w2 = decided && f.p2 && f.winner === f.p2.id;
  const scored = f.s1 !== null && f.s2 !== null && (f.status !== 'upcoming' || f.s1 + f.s2 > 0);
  const mid = scored
    ? `<span class="sc${w1 ? ' w' : ''}">${f.s1}</span><span class="dash">–</span><span class="sc${w2 ? ' w' : ''}">${f.s2}</span>`
    : `<span class="vs">${f.time ? esc(ukClock(f.time)) : 'vs'}</span>`;
  const group = /^group/i.test(f.stage || '') ? `${esc(f.stage)} · ` : '';
  const leg = f.status === 'live' && f.legNow ? `<span class="lg" title="Score left in the leg being played; the dot marks who is throwing"><b class="${f.legNow.throwing === 0 ? 'on' : ''}">${f.legNow.left[0]}</b><i>Leg ${f.legNow.leg}</i><b class="${f.legNow.throwing === 1 ? 'on' : ''}">${f.legNow.left[1]}</b></span>` : '';
  const state = f.status === 'live' ? '<span class="live-dot">Live</span>' : `<span class="ft">${group}${f.status === 'result' ? 'Result' : f.time ? ukZone(f.date) : 'Time TBC'}</span>`;
  const st = f.stats || null;
  const best = st && st[0] && st[1] ? (st[0].avg > st[1].avg ? 1 : st[1].avg > st[0].avg ? 2 : 0) : 0;
  return `<li class="fx ${f.status}${st ? ' has-stats' : ''}" data-id="${esc(f.id)}" data-sig="${esc(`${f.s1}-${f.s2}-${f.status}-${st ? st[0]?.avg + '/' + st[1]?.avg : ''}`)}">
    ${side(f.p1, f.s1, w1, decided, portraits, 'l', st?.[0], best === 1)}
    <div class="mid">${leg}${mid}<div class="st">${state}</div></div>
    ${side(f.p2, f.s2, w2, decided, portraits, 'r', st?.[1], best === 2)}
    ${f.p1 && f.p2 ? `<a class="fx-link" href="/match?id=${esc(f.id)}" aria-label="${esc(`${f.p1.name} v ${f.p2.name}: match centre`)}"></a>` : ''}
  </li>`;
}

/** Days with fixtures, in order, plus the best default day for "now". */
export function matchDays(t, today) {
  const days = [...new Set(t.stages.flatMap(s => s.fixtures.map(f => f.date)).filter(Boolean))].sort();
  let def = days.includes(today) ? today : null;
  if (!def) {
    const played = days.filter(d => d <= today);
    def = played.length ? played[played.length - 1] : days[0];
  }
  return { days, def };
}

export function renderDay(t, day, portraits) {
  // Chronological order of play; consecutive matches from the same round share a heading.
  const all = t.stages.flatMap(s => s.fixtures.filter(f => f.date === day).map(f => ({ ...f, stage: s.name, sets: s.sets })))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.id.localeCompare(b.id));
  if (!all.length) return `<div class="empty"><h3>No matches on this day</h3><p>Pick another day above.</p></div>`;
  const blocks = [];
  for (const f of all) {
    const last = blocks[blocks.length - 1];
    const label = /^group/i.test(f.stage) ? 'Group stage' : f.stage;
    if (last && last.label === label) last.fixtures.push(f);
    else blocks.push({ label, sets: f.sets, fixtures: [f] });
  }
  return blocks.map((b, i) => `
    <section class="stage" style="--d:${i * 70}ms">
      <h3><span>${esc(b.label)}</span><small>${b.fixtures.length} match${b.fixtures.length === 1 ? '' : 'es'}${b.sets ? ' · sets' : ''}</small></h3>
      <ol class="fixtures">${b.fixtures.map(f => fixtureRow(f, portraits)).join('')}</ol>
    </section>`).join('');
}

export function renderTabs(days, active) {
  return days.map(d => `<button class="day${d === active ? ' on' : ''}" data-day="${d}" aria-pressed="${d === active}"><span>${esc(longDate(d).split(' ')[0])}</span><b>${esc(shortDate(d))}</b></button>`).join('');
}

export function progress(t) {
  const all = t.stages.flatMap(s => s.fixtures);
  const done = all.filter(f => f.status === 'result').length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}
