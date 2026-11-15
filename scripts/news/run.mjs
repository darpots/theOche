// Autonomous news desk.
//  1. Discover recent darts stories from free RSS feeds.
//  2. Group feed items that cover the same story, and drop stories already
//     published (same source URL, or same players + event within a few days).
//  3. Ask a free-tier LLM to write an ORIGINAL report from the
//     source material (and to flag anything that duplicates a recent report).
//  4. Save to src/content/news/*.json and delete old reports (31 days; tournament
//     round-ups are kept for 200 days so tournament pages can show them).
//
// Runs in GitHub Actions using the NEWS_API_KEY repository secret (free
// Google Gemini key by default). Without a key it only prints what it would write.
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { get, log, sleep } from '../lib.mjs';
import { keyName } from '../../src/lib/pdc.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIR = `${ROOT}src/content/news/`;
const MAX_AGE_DAYS = 31;
const RECAP_MAX_AGE_DAYS = 200;
const LOOKBACK_HOURS = Number(process.env.NEWS_LOOKBACK_HOURS || 48);
const MAX_NEW = Number(process.env.NEWS_MAX_NEW || 6);
// Any OpenAI-compatible chat API works. Defaults to Google Gemini's free tier.
const API_URL = process.env.NEWS_API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = process.env.NEWS_MODEL || 'gemini-2.5-flash';
const TOKEN = process.env.NEWS_API_KEY;
const DRY = process.argv.includes('--dry') || !TOKEN;
if (!TOKEN && !process.argv.includes('--dry')) console.warn('NEWS_API_KEY not set: running in dry mode (old reports are still pruned).');
const DUMP = process.argv.find(a => a.startsWith('--dump='))?.slice(7);
const dumped = [];

const FEEDS = [
  { id: 'bbc', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/darts/rss.xml' },
  { id: 'dartsnews', name: 'Dartsnews', url: 'https://dartsnews.com/sitemap/news.xml' },
  { id: 'dartsworld', name: 'Darts World', url: 'https://www.dartsworld.com/feed/' },
  { id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/sport/darts/rss' },
];

// Non-PDC circuits to leave out.
const EXCLUDE = /\b(wdf|bdo|lakeside|winmau world masters|modus|mardle|women'?s world matchplay qualifier)\b/i;
const STOP = new Set('the a an and or of to in on at for with from by as is are was were be been his her their its after before over into than this that it he she they we you vs v darts dart pdc says say said will can could has have had not but out up new first win wins won beat beats into how why what who when where just more'.split(' '));

const strip = s => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#039;|&rsquo;|&lsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => new Set(keyName(s).length ? s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)) : []);
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
export const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

// ---- load published ------------------------------------------------------
await mkdir(DIR, { recursive: true });
const published = [];
const now = Date.now();
for (const f of await readdir(DIR)) {
  if (!f.endsWith('.json')) continue;
  const a = JSON.parse(await readFile(DIR + f, 'utf8'));
  if ((now - Date.parse(a.date)) / 864e5 > (a.kind === 'recap' ? RECAP_MAX_AGE_DAYS : MAX_AGE_DAYS)) { await unlink(DIR + f); log(`pruned ${f}`); continue; }
  published.push({ file: f, ...a });
}
const usedUrls = new Set(published.flatMap(a => a.sources.map(s => s.url)));

// Player surnames from the rankings help spot "same story" across outlets.
const rankings = JSON.parse(await readFile(`${ROOT}src/data/rankings.json`, 'utf8'));
const names = rankings.players.slice(0, 200).map(p => ({ full: p.name, last: p.name.split(' ').slice(-1)[0] }));
const entities = text => names.filter(n => new RegExp(`\\b${n.last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)).map(n => n.full);

// ---- 1. discover -----------------------------------------------------------
const xml = new XMLParser({ ignoreAttributes: true, cdataPropName: false });
const items = [];
for (const feed of FEEDS) {
  try {
    const doc = xml.parse(await get(feed.url, { as: 'text' }));
    const list = [].concat(doc?.rss?.channel?.item ?? []);
    for (const it of list) {
      const date = Date.parse(it.pubDate || it['dc:date'] || '');
      const title = strip(it.title);
      const summary = strip(it.description).slice(0, 600);
      const url = String(it.link || '').trim();
      if (!url || !title || !Number.isFinite(date)) continue;
      if ((now - date) / 36e5 > LOOKBACK_HOURS) continue;
      if (EXCLUDE.test(`${title} ${summary}`)) continue;
      const ents = entities(`${title} ${summary}`);
      if (feed.id === 'guardian' && !/darts|pdc/i.test(`${title} ${summary} ${url}`)) continue;
      items.push({ source: feed.name, url, title, summary, date: new Date(date).toISOString(), ents, tok: tokens(title) });
    }
    log(`${feed.name}: ${list.length} items`);
  } catch (e) { console.warn(`feed ${feed.name} failed: ${e.message}`); }
}

// ---- 2. cluster + dedupe --------------------------------------------------
const clusters = [];
for (const it of items.sort((a, b) => a.date.localeCompare(b.date))) {
  const sharedEnts = c => c.ents.filter(e => it.ents.includes(e)).length;
  const match = clusters.find(c => jaccard(c.tok, it.tok) >= 0.34 || (it.ents.length && sharedEnts(c) >= Math.min(2, it.ents.length) && jaccard(c.tok, it.tok) >= 0.2));
  if (match) { match.items.push(it); it.tok.forEach(t => match.tok.add(t)); match.ents = [...new Set([...match.ents, ...it.ents])]; }
  else clusters.push({ items: [it], tok: new Set(it.tok), ents: [...it.ents] });
}
const recent = published.filter(a => (now - Date.parse(a.date)) / 864e5 <= 5);
const fresh = clusters.filter(c => {
  if (c.items.some(i => usedUrls.has(i.url))) return false;
  return !recent.some(a => jaccard(tokens(a.headline + ' ' + (a.originalTitles || []).join(' ')), c.tok) >= 0.4);
});
// Most-covered stories first.
fresh.sort((a, b) => b.items.length - a.items.length || b.items[0].date.localeCompare(a.items[0].date));
log(`${items.length} items -> ${clusters.length} stories -> ${fresh.length} new`);

// ---- 3. write ----------------------------------------------------------------
async function sourceText(url) {
  try {
    let html = await get(url, { as: 'text', tries: 1 });
    html = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html;
    const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => strip(m[1])).filter(p => p.length > 60);
    return paras.join('\n').slice(0, 5000);
  } catch { return ''; }
}

async function llm(messages) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.5, response_format: { type: 'json_object' } }),
    });
    if (res.status === 429) { await sleep(20_000 * (attempt + 1)); continue; }
    const raw = await res.text();
    if (!res.ok) throw new Error(`News model API ${res.status}: ${raw.slice(0, 300)}`);
    let body;
    try { body = JSON.parse(raw); } catch { throw new Error(`News model API returned non-JSON: ${raw.slice(0, 120)}`); }
    const content = body.choices?.[0]?.message?.content || '';
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  }
  throw new Error('News model API rate limit');
}

const SYSTEM = `You are a sports journalist for "The Oche", an independent PDC darts news site.
Write ORIGINAL reports in British English. Use the supplied source material only as research:
never copy sentences or distinctive phrasing, do not invent facts, quotes, scores or statistics,
and attribute any quote to the person and outlet it came from ("told Sky Sports"). Keep quotes short (under 20 words) and use at most two.
Only cover the Professional Darts Corporation (PDC) tour and its players.
If the research is a preview of a match that has already been played, set duplicateOf to "stale-preview".
If sources disagree on a fact (e.g. a name or score), leave that detail out.
Reply with JSON only.`;

let written = 0;
let llmFailed = false;
for (const c of fresh) {
  if (written >= MAX_NEW) break;
  const lead = c.items[0];
  const research = [];
  if (DRY) {
    log(`[dry] would write: ${lead.title} (${c.items.length} sources)`);
    if (DUMP) { for (const it of c.items.slice(0, 3)) research.push({ outlet: it.source, url: it.url, title: it.title, published: it.date, summary: it.summary, text: await sourceText(it.url) }); dumped.push(research); }
    written++; continue;
  }
  for (const it of c.items.slice(0, 3)) research.push({ outlet: it.source, title: it.title, published: it.date, summary: it.summary, text: await sourceText(it.url) });
  const recentHeadlines = published.filter(a => (now - Date.parse(a.date)) / 864e5 <= 7).map(a => `${a.slug}: ${a.headline}`);
  let out;
  try {
    out = await llm([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Recently published reports (slug: headline):\n${recentHeadlines.join('\n') || '(none)'}

Research for a possible new report:
${JSON.stringify(research, null, 1)}

Return JSON:
{
 "isPdc": boolean,            // false if not about the PDC tour/players
 "duplicateOf": string|null,  // slug of a recent report covering the same development, else null
 "headline": string,          // max 90 chars, no clickbait
 "standfirst": string,        // one-sentence summary, max 200 chars
 "body": string[],            // 4-7 paragraphs, 280-450 words total
 "tags": string[],            // 1-4, e.g. tournament name, "Rankings", "Interview"
 "players": string[]          // full names of PDC players featured
}` },
    ]);
  } catch (e) { console.warn(`LLM failed for "${lead.title}": ${e.message}`); llmFailed = true; break; }
  if (!out.isPdc || out.duplicateOf || !out.headline || !Array.isArray(out.body) || out.body.length < 3) {
    log(`skipped "${lead.title}" (${!out.isPdc ? 'not PDC' : out.duplicateOf ? 'duplicate of ' + out.duplicateOf : 'bad output'})`);
    continue;
  }
  const date = c.items.map(i => i.date).sort()[0];
  const slug = `${slugify(out.headline)}`;
  if (published.some(a => a.slug === slug)) continue;
  const article = {
    slug,
    date,
    headline: out.headline.trim(),
    standfirst: out.standfirst.trim(),
    body: out.body.map(p => String(p).trim()).filter(Boolean),
    tags: (out.tags || []).slice(0, 4),
    players: (out.players || []).slice(0, 6),
    sources: c.items.map(i => ({ name: i.source, url: i.url, title: i.title })),
    originalTitles: c.items.map(i => i.title),
    writtenBy: `The Oche newsdesk (AI-assisted, ${MODEL})`,
  };
  await writeFile(`${DIR}${date.slice(0, 10)}-${slug}.json`, JSON.stringify(article, null, 1) + '\n');
  published.push(article);
  written++;
  log(`wrote ${slug}`);
  await sleep(4000); // stay well inside the free per-minute limit
}
// Surface a broken model connection as a failed run (opens an issue).
if (llmFailed && written === 0) process.exitCode = 1;
if (DUMP) await writeFile(DUMP, JSON.stringify(dumped, null, 1));
log(`done: ${written} ${DRY ? 'candidate(s) (dry run)' : 'new report(s)'}`);
