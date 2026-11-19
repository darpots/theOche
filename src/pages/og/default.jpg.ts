// The site's default share image: the world's top three on an ink panel.
import type { APIRoute } from 'astro';
import rankings from '../../data/rankings.json';
import { cutout } from '../../lib/images.mjs';
import { ogCutouts, jpeg } from '../../lib/og';

export const GET: APIRoute = async () => {
  const files = rankings.players.map(p => cutout(p.name)).filter(Boolean).slice(0, 3).map(c => c!.src.replace('-400.', '-800.').slice(1));
  return jpeg(await ogCutouts(files, 'ink'));
};
