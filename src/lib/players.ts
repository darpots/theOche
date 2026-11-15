// Build-time access to the generated player profiles (public/data/players).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import rankings from '../data/rankings.json';

export type Profile = any;
// Resolved from the project root: import.meta.url points into the build output.
const DIR = join(process.cwd(), 'public/data/players');

export function loadProfile(id: string): Profile | null {
  const f = join(DIR, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

/** Top-128 players that have a profile, in ranking order. */
export function rankedProfiles() {
  return rankings.players.filter(p => p.pos <= 128).map(r => ({ rank: r, profile: loadProfile(r.id) })).filter(x => x.profile);
}

export const playerHref = (slug: string) => `/players/${slug}`;
