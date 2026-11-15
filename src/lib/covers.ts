// Chooses the cover photo for a news story. Everything is a licensed
// Wikimedia Commons photo (credits on /credits):
//  - the story's `image` field wins: a key from news-library.json, or 'player'
//  - otherwise a player's photo when the headline is about that player
//    (two photos side by side when it names both players in a match)
//  - otherwise a topical darts photo picked from the event or story
import library from '../data/news-library.json';
import portraits from '../data/portraits.json';
import faces from '../data/photo-faces.json';
import { keyName } from './pdc.mjs';

type Lib = Record<string, { alt: string; focus: string }>;
const LIB = library as Lib;
const FACES = faces as Record<string, { x: number; y: number; h: number }>;
const PORTRAITS = portraits as Record<string, { name: string }>;

export interface CoverImage { src: string; alt: string; focus: string }

const photoFor = (name: string): CoverImage | null => {
  const k = keyName(name);
  const f = FACES[k];
  if (!PORTRAITS[k] || !f) return null;
  // object-position at the face centre keeps the face in frame at any crop.
  return { src: `/photos/${k}.jpg`, alt: name, focus: `${(f.x * 100).toFixed(1)}% ${Math.max(0, f.y * 100 - 4).toFixed(1)}%` };
};
const libImage = (key: string): CoverImage => ({ src: `/news-img/${key}.jpg`, alt: LIB[key].alt, focus: LIB[key].focus });

const GENERIC = ['darts-in-board', 'treble-twenty', 'board-close', 'walk-on', 'crowd-signs', 'dartboard'];
function topical(seed: string, tags: string[]): CoverImage {
  const t = tags.join(' ');
  if (/premier league/i.test(t)) return libImage('premier-league-trophy');
  if (/world championship/i.test(t)) return libImage('ally-pally-crowd');
  if (/matchplay/i.test(t)) return libImage('winter-gardens');
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return libImage(GENERIC[h % GENERIC.length]);
}

export function chooseCover(story: { slug: string; headline: string; tags: string[]; players: string[]; image?: string; kind?: string }): CoverImage[] {
  if (story.image && LIB[story.image]) return [libImage(story.image)];
  const lead = story.players.slice(0, 2);
  const inHeadline = (n: string) => new RegExp(`\\b${n.split(' ').slice(-1)[0]}\\b`, 'i').test(story.headline);
  const named = lead.filter(inHeadline).map(photoFor).filter(Boolean) as CoverImage[];
  const forcePlayer = story.image === 'player' || story.kind === 'recap';
  if (named.length === 2) return named;
  if (named.length === 1) return named;
  if (forcePlayer) { const p = lead.map(photoFor).find(Boolean); if (p) return [p]; }
  return [topical(story.slug, story.tags)];
}
