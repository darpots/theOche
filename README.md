# The Oche

A fast, static PDC darts site built with [Astro](https://astro.build) and hosted on Vercel. It keeps itself up to date through GitHub Actions, and uses free data sources only.

| Page | What it shows | Where the data comes from |
|---|---|---|
| **Calendar** (`/`) | PDC events on Sky Sports, ITV (incl. World Series) and PDCTV (European Tour), plus every Premier League night | PDC tournaments feed, filtered by the broadcaster map in `src/lib/pdc.mjs` |
| **Matches** (`/matches`) | Order of play and results for the tournament in progress (or the latest one) | PDC tournaments feed, refreshed **live in the browser every 30s** during an event |
| **News** (`/news`) | Original, dated reports (max 3 months old) that link to their sources | BBC Sport, Dartsnews, Darts World and Guardian RSS feeds → written up by GitHub Models (free) |
| **Rankings** (`/rankings`) | PDC Order of Merit; click a top-128 player for age, country, darts, season record and full tournament history | PDC rankings + participants feeds; history built from ~500 tournaments since 2005 |

## How it stays up to date

All automation is in `.github/workflows/`. Each job validates the data by building the site, and only commits when something actually changed. Every commit to `main` triggers a Vercel deploy.

| Workflow | Schedule | Does |
|---|---|---|
| `refresh-data.yml` | hourly | calendar, rankings, current tournament |
| `news.yml` | every 3 hours | finds new stories, removes duplicates, writes reports, deletes reports older than 90 days |
| `refresh-players.yml` | daily | player profiles, season records, tournament history |

If a job fails, it opens a GitHub issue (and comments on it for repeat failures). The site keeps serving the last good data. All jobs can also be run by hand from the **Actions** tab (**Run workflow**).

### Newsdesk and duplicates

`scripts/news/run.mjs` groups feed items that cover the same story (shared headline words and players), skips anything whose source URL is already used or that overlaps a report from the last few days, and asks the model to reject anything else that duplicates a recent headline or is a stale preview. The model is told to write original copy, never invent facts, and keep quotes short and attributed. It uses the repo's built-in `GITHUB_TOKEN` with `permissions: models: read`, so no API key or billing is needed. Each run writes up to 6 stories.

### Known limits

- **Three-dart averages**: the PDC's free feed has no averages, and the sites that do (DartsDatabase, DartsOrakel) block automated access. Player pop-ups show the season win–loss record, legs won % and titles instead.
- **Broadcasters**: the PDC feed says whether an event is televised, but not which channel shows it. Channels are mapped per event type in `src/lib/pdc.mjs`. If a new televised event type appears, the hourly job lists it in its run summary.
- **Player photos**: only Creative Commons photos from Wikimedia Commons are used (`public/portraits`, credits at `/credits`). Other players show their initials.

## Local development

```sh
npm install
npm run dev            # http://localhost:4321
npm run data:fast      # refresh calendar, rankings, current tournament
npm run data:players   # refresh player profiles (first run fetches ~500 tournaments)
npm run news -- --dry  # show which stories the newsdesk would write
npm test
```

To run the newsdesk locally for real, set `GITHUB_TOKEN` to a personal access token with the `models:read` scope.
