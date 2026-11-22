// Story checker: run before publishing (the newsdesk brief requires it).
// Checks new or changed stories (default), named files, or --all:
//   - headline at most 65 characters, standfirst at most 200, body length by kind
//   - no banned stock phrases, and no leg-by-leg chronology
//   - every number in a data-led story appears in its facts file
//     (data/news-facts/<facts>.json, written by match-report / day-facts / stats-facts)
//   - not a near-duplicate of a story from the last 7 days
//   - equipment ('gear') stories kept to a small share of the news
//   - no outlet names or "according to…" (stories read as our own reporting)
//   - no machine tells (stock AI phrasing, em dashes) and no run of stories that all end on the next fixture
//   - previews list their matches and give the Oche Verdict
// Exits 1 with the problems listed when anything fails.
// Usage: npm run news:check [-- file.json …] [--all] [--warn]
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIR = `${ROOT}src/content/news/`;
const args = process.argv.slice(2);
const warnOnly = args.includes('--warn');
const all = (await readdir(DIR)).filter(f => f.endsWith('.json'));
const stories = new Map();
for (const f of all) stories.set(f, JSON.parse(await readFile(DIR + f, 'utf8')));

let targets = args.filter(a => a.endsWith('.json')).map(a => a.split('/').pop());
if (args.includes('--all')) targets = all;
if (!targets.length) {
  // New or changed against main (committed or not).
  const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }); } catch { return ''; } };
  const changed = new Set([...git('diff', '--name-only', 'origin/main', '--', 'src/content/news').split('\n'), ...git('ls-files', '--others', '--exclude-standard', 'src/content/news').split('\n')].filter(Boolean).map(f => f.split('/').pop()));
  targets = [...changed].filter(f => stories.has(f));
}

// Phrases that make every story read the same.
const BANNED = ['had other ideas', 'was not done', 'were not done', 'had the answer', 'had an answer', 'rolled back the years', 'dug deep', 'showed his class', 'in style', 'sent shockwaves', 'set tongues wagging', 'the rest is history', 'a night to remember', 'the writing was on the wall', "it's game on", 'it is game on', 'when it mattered most', 'proved too strong', 'never looked back', 'stormed into', 'cruised into', 'breezed past', 'sealed the deal', 'it was not to be', 'no stranger to', 'turned on the style', 'put on a show', 'in emphatic fashion', 'clinical display', 'statement win'];
// Phrasing that gives away machine-written copy.
const TELLS = ['it is worth noting', "it's worth noting", 'notably,', 'both players', 'a testament to', 'in the world of darts', 'all in all', 'only time will tell', 'delve', 'showcase', 'showcasing', 'navigat', 'tapestry', 'in conclusion', 'a true testament', 'firmly in the', 'set the stage for', 'underscor'];
// Outlets never appear in a story: research stays in `sources`, which the site never shows.
const OUTLETS = /\b(Dartsnews|DartsNews|Darts World|BBC|Guardian|Mirror|talkSPORT|Press Association|PA Media|Sporting Life|Daily Mail|Telegraph|The Independent|Daily Express|Daily Star|Online Darts)\b|\b[Aa]ccording to\b|\breported by\b|\b(told|speaking to|said to|in an interview with) (the )?(Sky Sports|ITV|PDC|PDCTV)\b/;
// The next fixture as the last sentence: fine now and then, a habit when every story does it.
const FIXTURE_END = /\b(plays|faces|meets|takes on|will play|will face)\b[^.]*\b(on|at|in the)\b[^.]*(\d(:\d\d)?\s?(am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|final|semi-finals?|quarter-finals?)[^.]*\.?\s*$/i;
// Leg-by-leg narration: a few of these are fine, a run of them is a scoreboard, not a story.
const CHRONO = /\b(won|took|claimed) (the )?(next|following) (two|three|four|five|\w+) legs?\b|\blevell?ed at \d+-\d+\b|\bwent \d+-\d+ (up|ahead)\b|\bto lead \d+-\d+\b/gi;
// Short is fine when the facts are thin; padding is not. Minimums only catch stubs.
const LIMITS = { morning: [150, 300], 'winners-losers': [180, 400], feature: [300, 700], 'match-report': [150, 320], report: [130, 450], recap: [130, 600], 'session': [180, 450], numbers: [150, 400], 'talking-points': [200, 500], movers: [150, 400], preview: [180, 450], analysis: [300, 700], gear: [120, 300] };
const DATA_LED = new Set(['match-report', 'session', 'numbers', 'preview', 'analysis', 'movers', 'recap', 'morning', 'winners-losers']);

const words = s => s.split(/\s+/).filter(Boolean).length;
const tokens = s => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
const jaccard = (a, b) => { const A = tokens(a), B = tokens(b); const i = [...A].filter(x => B.has(x)).length; return i / Math.max(1, A.size + B.size - i); };

// Numbers a story states, as they'd appear in facts: scores both ways round, decimals, percentages, money.
function numbersIn(text) {
  const out = [];
  for (const m of text.matchAll(/£\s?\d[\d,]*(?:\.\d+)?k?|\b\d{1,2}-\d{1,2}\b|\b\d+\.\d+%?|\b\d+%|\b\d{2,3}\b/g)) out.push(m[0].replace(/,$/, ''));
  return out;
}
function inFacts(n, factsText) {
  if (/^\d{4}$/.test(n)) return true; // years
  if (/^\d{1,2}-\d{1,2}$/.test(n)) { const [a, b] = n.split('-'); return factsText.includes(`${a}-${b}`) || factsText.includes(`${b}-${a}`); }
  if (n.startsWith('£')) return factsText.includes(n.replace(/\s/g, ''));
  const v = parseFloat(n);
  if (!Number.isFinite(v)) return true;
  if (v <= 20 && !n.includes('.')) return true; // counts of legs, darts, 180s are checked loosely
  // Percentages and averages may be rounded: accept a value in the facts within 0.5.
  const nums = factsText.match(/\d+(\.\d+)?/g) || [];
  return nums.some(x => Math.abs(parseFloat(x) - v) <= (n.includes('.') ? 0.005 : 0.5));
}

const problems = [];
const now = Date.now();
for (const f of targets) {
  const s = stories.get(f); if (!s) continue;
  const p = msg => problems.push(`${f}: ${msg}`);
  const kind = s.kind || 'report';
  if (s.headline.length > 65) p(`headline is ${s.headline.length} characters (max 65): "${s.headline}"`);
  if (s.standfirst.length > 200) p(`standfirst is ${s.standfirst.length} characters (max 200)`);
  const body = s.body.join(' ');
  const [lo, hi] = LIMITS[kind] || LIMITS.report;
  const n = words(body);
  if (n < lo || n > hi) p(`body is ${n} words (${kind}: ${lo}–${hi})`);
  const text = `${s.headline} ${s.standfirst} ${body}`.toLowerCase();
  for (const b of BANNED) if (text.includes(b)) p(`stock phrase: "${b}"`);
  for (const b of TELLS) if (text.includes(b)) p(`machine-sounding phrase: "${b}"`);
  if (/—/.test(`${s.headline} ${s.standfirst} ${body}`)) p('em dash (—): use a full stop, comma or colon');
  const outlet = `${s.headline} ${s.standfirst} ${body} ${s.quote?.by || ''}`.match(OUTLETS);
  if (outlet) p(`names an outlet or source ("${outlet[0]}"): stories never name or link the outlets used for research`);
  if (s.quote && /,|\bto\b|\bon\b/.test(s.quote.by)) p(`quote credit should be the player's name only ("${s.quote.by}")`);
  // Every story ending on the next fixture reads like a template.
  if (FIXTURE_END.test(s.body[s.body.length - 1])) {
    const before = [...stories.entries()].filter(([g, o]) => g !== f && o.date < s.date).sort((a, b) => b[1].date.localeCompare(a[1].date)).slice(0, 3);
    if (before.filter(([, o]) => FIXTURE_END.test(o.body[o.body.length - 1])).length >= 2) p('ends on the next fixture, like the stories before it: end on our view instead and put the fixture earlier');
  }
  if (kind === 'preview' && s.date >= '2026-11-23') {
    if (!s.matches?.length) p('preview without "matches" (fixture ids): it can\'t drop off the site when they start');
    if (!s.verdict?.pick) p('preview without the Oche Verdict ("verdict": { "pick", "score" })');
  }
  const chrono = (body.match(CHRONO) || []).length;
  if (chrono > 3) p(`reads like leg-by-leg narration (${chrono} "took the next…/levelled at…" phrases): lead with the turning point instead`);
  if (DATA_LED.has(kind) && kind !== 'recap') {
    const file = s.facts && `${ROOT}data/news-facts/${s.facts}.json`;
    if (!file || !existsSync(file)) p(`data-led story without a facts file (set "facts" to the id the facts script saved)`);
    else {
      const factsText = await readFile(file, 'utf8');
      const bad = [...new Set(numbersIn(`${s.headline} ${s.standfirst} ${body} ${(s.keyNumbers || []).map(k => k.value).join(' ')}`))].filter(x => !inFacts(x, factsText));
      if (bad.length) p(`numbers not in the facts: ${bad.join(', ')}`);
    }
  }
  // Near-duplicates of the last week's stories.
  for (const [g, o] of stories) {
    if (g === f || Math.abs(Date.parse(o.date) - Date.parse(s.date)) > 7 * 864e5) continue;
    if (jaccard(o.headline, s.headline) > 0.6) p(`headline very close to ${g}`);
    if (kind === 'match-report' && o.kind === 'match-report' && o.facts && o.facts === s.facts) p(`second match report for the same match (${g})`);
  }
}
// Equipment news stays a small share: at most 1 in 7 days and 1 in 10 over 30 days.
const recent = [...stories.values()].filter(s => now - Date.parse(s.date) < 30 * 864e5);
const gear30 = recent.filter(s => s.kind === 'gear').length, gear7 = recent.filter(s => s.kind === 'gear' && now - Date.parse(s.date) < 7 * 864e5).length;
if (targets.some(f => stories.get(f)?.kind === 'gear') && (gear7 > 1 || gear30 > Math.max(1, recent.length / 10))) problems.push(`too many equipment stories: ${gear7} this week, ${gear30} of ${recent.length} this month (max 1 a week, 1 in 10)`);

if (!targets.length) console.log('news:check: no new or changed stories');
else if (problems.length) { console.log(`news:check: ${problems.length} problem(s) in ${targets.length} stor${targets.length === 1 ? 'y' : 'ies'}\n- ${problems.join('\n- ')}`); if (!warnOnly) process.exit(1); }
else console.log(`news:check: ${targets.length} stor${targets.length === 1 ? 'y' : 'ies'} OK`);
