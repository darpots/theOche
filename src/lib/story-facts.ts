// Extras for a news story, worked out at build time:
//  - key numbers: the story's own `keyNumbers`, or, for a report on a match in
//    the current event, the score, averages, 180s and best checkout from PDC's stats
//  - a pull quote: the story's `quote`, or a quotation from its text when exactly
//    one of its players is named in that paragraph
//  - the body as HTML with each player's first mention linked to their page
import data from '../data/tournament.json';
import rankings from '../data/rankings.json';
import { keyName, surnameOf } from './pdc.mjs';

type Story = { slug: string; date: string; tournament?: string; players: string[]; body: string[]; keyNumbers?: { value: string; label: string }[]; quote?: { text: string; by: string } };
export interface KeyNumber { value: string; label: string; hi?: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const slugs = new Map(rankings.players.filter(p => p.pos <= 128).map(p => [keyName(p.name), p.slug]));

/** The match a story is about: both lead players met in the story's event, on or before its date. */
export function storyMatch(story: Story) {
  const t = data.tournament as any;
  if (story.tournament !== t.id || story.players.length < 2) return null;
  const [a, b] = story.players.slice(0, 2).map(keyName);
  const day = story.date.slice(0, 10);
  const all = t.stages.flatMap((s: any) => s.fixtures.map((f: any) => ({ ...f, stage: s.name })));
  return all.filter((f: any) => f.p1 && f.p2 && f.status === 'result' && f.date <= day && [keyName(f.p1.name), keyName(f.p2.name)].sort().join() === [a, b].sort().join())
    .sort((x: any, y: any) => y.date.localeCompare(x.date))[0] || null;
}

export function keyNumbers(story: Story): { numbers: KeyNumber[]; matchId: string | null } {
  if (story.keyNumbers?.length) return { numbers: story.keyNumbers, matchId: null };
  const f = storyMatch(story);
  if (!f) return { numbers: [], matchId: null };
  const w = f.winner === f.p2.id ? 1 : 0, l = 1 - w;
  const p = [f.p1, f.p2], sc = [f.s1, f.s2], st = f.stats || [];
  const nums: KeyNumber[] = [{ value: `${sc[w]}–${sc[l]}`, label: `${surnameOf(p[w])} beat ${surnameOf(p[l])} · ${f.stage}`, hi: true }];
  if (st[w]?.avg) nums.push({ value: st[w].avg.toFixed(2), label: `${surnameOf(p[w])} average` });
  if (st[l]?.avg) nums.push({ value: st[l].avg.toFixed(2), label: `${surnameOf(p[l])} average` });
  if (st[0] && st[1]) nums.push({ value: `${st[w].t80 ?? 0}–${st[l].t80 ?? 0}`, label: '180s' });
  const best = [0, 1].filter(k => st[k]?.hi).sort((x, y) => st[y].hi - st[x].hi)[0];
  if (best != null) nums.push({ value: String(st[best].hi), label: `Best checkout · ${surnameOf(p[best])}` });
  return { numbers: nums, matchId: f.id };
}

export function pullQuote(story: Story): { text: string; by: string; after: number } | null {
  if (story.quote) return { ...story.quote, after: 1 };
  for (let i = 1; i < story.body.length; i++) {
    const para = story.body[i];
    const q = para.match(/[“"]([^”"]{40,220})[”"]/);
    if (!q) continue;
    const named = story.players.filter(n => new RegExp(`\\b${(n.split(' ').slice(1).join(' ') || n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(para));
    if (named.length === 1) return { text: q[1].trim().replace(/[,;]$/, '.'), by: named[0], after: Math.min(i, story.body.length - 1) };
  }
  return null;
}

/** Paragraphs as HTML, linking each ranked player's first full-name mention to their page. */
export function linkedBody(story: Story): string[] {
  const done = new Set<string>();
  return story.body.map(p => {
    let html = esc(p);
    for (const name of story.players) {
      const k = keyName(name), slug = slugs.get(k);
      if (!slug || done.has(k)) continue;
      const re = new RegExp(`\\b${esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(html)) { html = html.replace(re, m => `<a href="/players/${slug}">${m}</a>`); done.add(k); }
    }
    return html;
  });
}
