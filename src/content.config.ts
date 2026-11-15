import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/news', generateId: ({ data }) => String(data.slug) }),
  schema: z.object({
    slug: z.string(),
    date: z.string(),
    headline: z.string(),
    standfirst: z.string(),
    body: z.array(z.string()).min(1),
    tags: z.array(z.string()).default([]),
    players: z.array(z.string()).default([]),
    sources: z.array(z.object({ name: z.string(), url: z.string().url(), title: z.string().optional() })).min(1),
    originalTitles: z.array(z.string()).optional(),
    writtenBy: z.string().optional(),
    // 'recap' = a tournament round-up; kept while the event is on the calendar.
    kind: z.enum(['report', 'recap']).default('report'),
    // PDC tournament id the story belongs to (links it to the tournament page).
    tournament: z.string().optional(),
    // Cover: a key from src/data/news-library.json, 'player' for the main player's photo, or omit to choose automatically.
    image: z.string().optional(),
  }),
});

export const collections = { news };
