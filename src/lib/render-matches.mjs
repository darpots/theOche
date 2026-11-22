// Renders the Matches page body from a normalised tournament. Used at build
// time (Astro) and again in the browser when live data arrives, so both
// always produce identical markup.
import { flag, tvBadge, surnameOf, formatLabel } from './pdc.mjs';
import { avatarSrc } from './images.mjs';
import { checkout } from './checkout.mjs';
import { avatarColours, initials, longDate, shortDate, ukClock, ukZone, money } from './format.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function avatar(p, _unused, size = 44) {
  const pic = p && avatarSrc(p.name);
  const [c1, c2] = avatarColours(p?.name || '?');
  return `<span class="avatar" style="--size:${size}px;--c1:${c1};--c2:${c2}">${pic ? `<img src="${pic}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">` : esc(initials(p?.name || '?'))}</span>`;
}

const fmt = (n, d = 2) => (n == null || Number.isNaN(n) ? '–' : Number(n).toFixed(d));

function side(p, score, won, decided, portraits, align, st, best) {
  if (!p) return `<div class="pl ${align} tbc"><span class="avatar" style="--size:44px">?</span><span class="nm"><b>To be decided</b></span></div>`;
  const avg = st ? `<span class="avg${best ? ' best' : ''}" title="Three-dart average"><i>avg</i>${fmt(st.avg)}</span>` : '';
  return `<div class="pl ${align}${won ? ' won' : decided ? ' lost' : ''}">
    ${avatar(p, portraits)}
    <span class="nm"><b>${esc(p.name)}</b><small>${flag(p.country)}${p.ranking ? ` #${p.ranking}` : ''}</small></span>
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
  // A live match gets a taller card: under the score, a strip for the leg in play with each
  // player's score left on their own side, who's throwing, their last visit and the finish.
  const legStrip = (() => {
    const l = f.status === 'live' && f.legNow;
    if (!l) return '';
    const v = (l.visits || []).slice().sort((a, b) => a.order - b.order);
    const side = k => {
      const mine = v.filter(x => x.isParticipant1 === (k === 0));
      const last = mine[mine.length - 1];
      const route = checkout(l.left[k]);
      return `<div class="ls ${k ? 'r' : 'l'}${l.throwing === k ? ' on' : ''}">
        <b class="ls-n">${l.throwing === k ? '<i class="ls-dot" aria-label="throwing"></i>' : ''}${l.left[k]}</b>
        <span class="ls-meta">${last ? `<i class="ls-last${last.isBust ? ' bust' : last.score >= 140 ? ' big' : ''}">${last.isBust ? 'Bust' : last.score}</i>` : ''}${route ? `<i class="ls-co">${route.join(' ')}</i>` : ''}</span>
      </div>`;
    };
    return `<div class="legstrip" title="Score left in the leg being played; the dot marks who is throwing">${side(0)}<span class="ls-mid">${f.fmt?.sets || f.sets ? `Set ${l.set} · ` : ''}Leg ${l.leg}</span>${side(1)}</div>`;
  })();
  const state = f.status === 'live' ? '<span class="live-dot">Live</span>' : `<span class="ft">${group}${f.status === 'result' ? 'Result' : f.time ? ukZone(f.date) : 'Time TBC'}</span>`;
  const st = f.stats || null;
  const best = st && st[0] && st[1] ? (st[0].avg > st[1].avg ? 1 : st[1].avg > st[0].avg ? 2 : 0) : 0;
  return `<li class="fx ${f.status}${legStrip ? ' big' : ''}${st ? ' has-stats' : ''}" data-players="${esc([f.p1?.id, f.p2?.id].filter(Boolean).join(' '))}" data-id="${esc(f.id)}" data-sig="${esc(`${f.s1}-${f.s2}-${f.status}-${st ? st[0]?.avg + '/' + st[1]?.avg : ''}`)}">
    ${side(f.p1, f.s1, w1, decided, portraits, 'l', st?.[0], best === 1)}
    <div class="mid">${mid}<div class="st">${state}</div></div>
    ${side(f.p2, f.s2, w2, decided, portraits, 'r', st?.[1], best === 2)}
    ${legStrip}
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

/** Afternoon or evening session, from a UK start time. */
const sessionOf = time => (time && time < '17:00' ? 'Afternoon session' : 'Evening session');

export function renderDay(t, day, portraits) {
  // Chronological order of play, in sessions (afternoon / evening, with who's showing it);
  // consecutive matches from the same round share a heading.
  const all = t.stages.flatMap(s => s.fixtures.filter(f => f.date === day).map(f => ({ ...f, stage: s.name, sets: s.sets, fmt: s })))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.id.localeCompare(b.id));
  if (!all.length) return `<div class="empty"><h3>No matches on this day</h3><p>Pick another day above.</p></div>`;
  const blocks = [];
  for (const f of all) {
    const last = blocks[blocks.length - 1];
    const label = /^group/i.test(f.stage) ? 'Group stage' : f.stage;
    const session = f.time ? sessionOf(f.time) : '';
    if (last && last.label === label && last.session === session) last.fixtures.push(f);
    else blocks.push({ label, session, fmt: formatLabel(f.fmt), fixtures: [f] });
  }
  const tv = t.broadcaster ? tvBadge(t.broadcaster) : '';
  let shownSession = '';
  return blocks.map((b, i) => {
    const head = b.session && b.session !== shownSession
      ? `<p class="session"><b>${b.session}</b>${b.fixtures[0].time ? `<span>from ${esc(ukClock(b.fixtures[0].time))} ${ukZone(day)}</span>` : ''}${tv ? `<span class="s-tv">${tv}</span>` : ''}</p>`
      : '';
    shownSession = b.session || shownSession;
    return `${head}
    <section class="stage" style="--d:${i * 70}ms">
      <h3><span>${esc(b.label)}</span><small>${b.fixtures.length} match${b.fixtures.length === 1 ? '' : 'es'}${b.fmt ? ` · ${esc(b.fmt)}` : ''}</small></h3>
      <ol class="fixtures">${b.fixtures.map(f => fixtureRow(f, portraits)).join('')}</ol>
    </section>`;
  }).join('');
}

/** Knockout draw: one column per round, each round ordered so a match sits beside the two it came from. */
export function renderDraw(t) {
  const ko = t.stages.filter(s => !/^group/i.test(s.name) && s.fixtures.length).sort((a, b) => b.fixtures.length - a.fixtures.length || (b.round ?? 0) - (a.round ?? 0));
  if (ko.length < 2) return '';
  const cols = [ko[0].fixtures.slice()];
  for (let i = 1; i < ko.length; i++) {
    const prev = cols[i - 1];
    const at = id => prev.findIndex(f => f.p1?.id === id || f.p2?.id === id);
    const pos = f => Math.min(...[f.p1?.id, f.p2?.id].filter(Boolean).map(at).filter(x => x >= 0), 999);
    cols.push(ko[i].fixtures.slice().sort((a, b) => pos(a) - pos(b)));
  }
  const side = (p, s, won, done) => `<div class="dr-p${won ? ' w' : done ? ' l' : ''}"><span>${p ? `${flag(p.country)} ${esc(surnameOf(p))}` : '<em>TBC</em>'}</span><b>${s ?? ''}</b></div>`;
  const cell = f => {
    const done = f.status === 'result';
    const w = done ? f.winner : null;
    return `<a class="dr-m ${f.status}" ${f.p1 && f.p2 ? `href="/match?id=${esc(f.id)}"` : ''}>${side(f.p1, f.status === 'upcoming' && !(f.s1 + f.s2) ? '' : f.s1, w && w === f.p1?.id, done)}${side(f.p2, f.status === 'upcoming' && !(f.s1 + f.s2) ? '' : f.s2, w && w === f.p2?.id, done)}</a>`;
  };
  return `<div class="draw" style="--cols:${cols.length}">${cols.map((c, i) => `<div class="dr-col"><h3>${esc(ko[i].name)}</h3><div class="dr-list">${c.map(cell).join('')}</div></div>`).join('')}</div>`;
}

/** Prize money for losing in each round (the PDC feed doesn't give the winner's prize). */
export function renderPrize(t) {
  const rows = [];
  const seen = new Set();
  for (const s of t.stages.slice().sort((a, b) => (b.prize || 0) - (a.prize || 0))) {
    const label = /^group/i.test(s.name) ? 'Group stage' : s.name;
    if (!s.prize || seen.has(label)) continue;
    seen.add(label);
    const who = label === 'Final' ? 'Runner-up' : label === 'Group stage' ? 'Out in the group stage' : `Out in the ${label.toLowerCase()}`;
    rows.push(`<tr><td>${esc(who)}</td><td class="n">${money(s.prize)}</td></tr>`);
  }
  return rows.length ? `<table class="prize"><thead><tr><th>Finish</th><th class="n">Prize money</th></tr></thead><tbody>${rows.join('')}</tbody></table><p class="muted prize-note">From the PDC's tournament data. Prize money counts towards the PDC Order of Merit.</p>` : '';
}

export function renderTabs(days, active) {
  return days.map(d => `<button class="day${d === active ? ' on' : ''}" data-day="${d}" aria-pressed="${d === active}"><span>${esc(longDate(d).split(' ')[0])}</span><b>${esc(shortDate(d))}</b></button>`).join('');
}

export function progress(t) {
  const all = t.stages.flatMap(s => s.fixtures);
  const done = all.filter(f => f.status === 'result').length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}
