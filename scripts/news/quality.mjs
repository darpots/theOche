// Weekly quality report for the newsdesk: what was published in the last 7
// days, how much of it is our own (data-led) against rewrites of other
// outlets, which stories fail the checker, the most repeated phrases, and
// headline lengths. Prints markdown (the weekly workflow posts it as a job summary).
// Usage: npm run news:quality [-- --days=7]
import { readFile, readdir, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const days = Number((process.argv.find(a => a.startsWith('--days=')) || '').split('=')[1]) || 7;
const DIR = `${ROOT}src/content/news/`;
const files = (await readdir(DIR)).filter(f => f.endsWith('.json'));
const stories = [];
for (const f of files) { const s = JSON.parse(await readFile(DIR + f, 'utf8')); if (Date.now() - Date.parse(s.date) < days * 864e5) stories.push({ f, ...s }); }
const DATA_LED = new Set(['match-report', 'session', 'numbers', 'preview', 'analysis', 'movers', 'recap']);
const own = stories.filter(s => DATA_LED.has(s.kind || 'report'));
const byKind = {};
for (const s of stories) byKind[s.kind || 'report'] = (byKind[s.kind || 'report'] || 0) + 1;
const sources = {};
for (const s of stories) for (const x of s.sources) sources[x.name] = (sources[x.name] || 0) + 1;
// Three-word phrases used in more than one story (the tell of templated writing).
const grams = new Map();
for (const s of stories) {
  const w = s.body.join(' ').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const seen = new Set();
  for (let i = 0; i + 2 < w.length; i++) { const g = w.slice(i, i + 3).join(' '); if (/^(the|a|of|in|to|and|on|at|for|with|his|he|was) /.test(g) || seen.has(g)) continue; seen.add(g); grams.set(g, (grams.get(g) || 0) + 1); }
}
const repeated = [...grams].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12);
let check = '';
try { execFileSync('node', [`${ROOT}scripts/news/check.mjs`, ...stories.map(s => s.f)], { encoding: 'utf8' }); check = 'all stories pass'; } catch (e) { check = String(e.stdout || '').trim(); }
const report = `## Newsdesk quality: last ${days} days
- **Stories:** ${stories.length} (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')})
- **Our own (data-led):** ${own.length} of ${stories.length} (${stories.length ? Math.round((own.length / stories.length) * 100) : 0}%) · target 60%+ in tournament weeks
- **Equipment stories:** ${byKind.gear || 0} (max 1 a week)
- **Sources credited:** ${Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}
- **Average headline:** ${stories.length ? Math.round(stories.reduce((s, x) => s + x.headline.length, 0) / stories.length) : 0} characters (max 65)
- **Phrases repeated across 3+ stories:** ${repeated.length ? repeated.map(([g, n]) => `"${g}" (${n})`).join(', ') : 'none'}

### Checker
${check}
`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
