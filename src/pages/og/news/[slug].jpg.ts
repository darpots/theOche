// Share image for each news story: its cover photo, or its player panel.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { chooseCover } from '../../../lib/covers';
import { ogPhoto, ogCutouts, jpeg } from '../../../lib/og';

export async function getStaticPaths() {
  return (await getCollection('news')).map(n => ({ params: { slug: n.data.slug }, props: { story: n.data } }));
}

export const GET: APIRoute = async ({ props }) => {
  const shots = chooseCover(props.story);
  if (shots[0]?.cut) return jpeg(await ogCutouts(shots.map(s => s.src.replace('-400.', '-800.').slice(1)), shots[0].tone));
  return jpeg(await ogPhoto(shots[0].src.slice(1), shots[0].focus));
};
