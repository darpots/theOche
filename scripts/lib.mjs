import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const UA = 'TheOcheBot/1.0 (+https://the-oche-mocha.vercel.app; fan site data refresh)';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function get(url, { tries = 3, as = 'json', headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: as === 'json' ? 'application/json' : '*/*', ...headers },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

/** Fetch every page of a JSON:API list endpoint. */
export async function getAll(base, params = {}, size = 200) {
  const out = [];
  for (let page = 1; page < 100; page++) {
    const qs = new URLSearchParams({ ...params, 'page.size': size, 'page.number': page });
    const body = await get(`${base}?${qs}`);
    const rows = Array.isArray(body.data) ? body.data : [];
    out.push(...rows);
    if (rows.length < size || out.length >= (body.meta?.totalCount ?? Infinity)) break;
  }
  return out;
}

export async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

/**
 * Write JSON only when the content actually changed, so scheduled jobs don't
 * create no-op commits (and needless Vercel deploys).
 * `stamp` is a key whose value is ignored for the comparison (e.g. updatedAt).
 */
export async function writeJsonIfChanged(path, data, { stamp } = {}) {
  const prev = await readJson(path);
  const strip = o => (o && stamp ? { ...o, [stamp]: undefined } : o);
  if (prev && JSON.stringify(strip(prev)) === JSON.stringify(strip(data))) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 1) + '\n');
  return true;
}

export async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k], k); }
  }));
  return results;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const log = (...a) => console.log('[oche]', ...a);
