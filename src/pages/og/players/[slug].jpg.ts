// Share image for each player page: their cut-out on an ink panel.
import type { APIRoute } from 'astro';
import { rankedProfiles } from '../../../lib/players';
import { cutout } from '../../../lib/images.mjs';
import { ogCutouts, jpeg } from '../../../lib/og';

export function getStaticPaths() {
  return rankedProfiles().filter(({ profile }) => cutout(profile.name)).map(({ profile }) => ({ params: { slug: profile.slug }, props: { name: profile.name } }));
}

export const GET: APIRoute = async ({ props }) => jpeg(await ogCutouts([cutout(props.name)!.src.replace('-400.', '-800.').slice(1)], 'ink'));
