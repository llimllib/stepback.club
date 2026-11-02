# AGENTS.md

Step Back Club (billmill.org/nba): Astro + a small D3/SVG chart kit, reading
nba_data v2 parquet directly in the browser. The design and its reasons are in
`docs/plans/2026-10-10-site-v2-design.md`; read it before adding a tool.
The look (newspaper-derived HTML brutalism) is in
`docs/plans/2026-10-25-newspaper-design.md`; read it before touching CSS
or the frame.

## Commands

- `npm run dev`: dev server. Tools read the published bucket
  (`basketball-data.billmill.org`), in dev as in production; there is no
  local data mode. See "Data" in the design doc
- Astro 7's dev server is a **background daemon** when an agent starts it.
  `pkill` doesn't stop it; use `npx astro dev stop`. If code changes don't
  show up, a stale daemon is the likely cause
- Agents: don't run `npm run dev`. Wrap the command that needs a server in
  `node scripts/with-dev.mjs <command>`. It starts a foreground server on a
  free port, passes its URL to the command as `SHOT_SERVER`, and stops it
  when the command exits. In a sandbox that can't see the daemon's pid,
  `astro dev stop`/`status` delete its lock file instead of stopping it, and
  every `npm run dev` leaves another server running
- `npm run shot -- "playoffs?team=BOS&season=2026"`: clicks Export PNG and
  saves the result to `shots/`, so you can look at what you built. `--dom`
  screenshots the page instead. It and the two scripts below expect a
  server; an agent runs them as
  `node scripts/with-dev.mjs npm run shot -- "..."`
- `node scripts/annotate-test.mjs`: drives labels, notes and arrows, reloads
  from the URL hash, and exports `shots/annotated.png`
- `node scripts/design-check.mjs`: checks every team's header band passes
  WCAG contrast, and renders an ink-band frame to `shots/ink-band.png`
- `node scripts/scores-check.mjs [date]`: checks the scores page at desktop
  and phone widths, its no-games days, and ESPN's or the NBA's data
  missing; saves `shots/scores-<width>.png`
- `npx astro check`: type check
- `mise run lint`: formatting (oxfmt), lints (oxlint) and types. Run it
  before every commit; `mise run fmt` fixes the formatting. Nothing else
  checks it
- `npm run build`: static site in `dist/`, one `<page>.html` per page
  (`build.format: "file"`), which is the layout the server expects

## Deploying

A push to `main` deploys: `.github/workflows/publish.yml` builds and syncs
`dist/` to the `nba-data` DigitalOcean Space with `--delete`, then purges
DO's CDN. billmill.org/nba is Caddy on the billmill.org droplet → the
Space's CDN, which DigitalOcean serves through Cloudflare; Caddy
(`~/code/Newsite/ops/Caddyfile`) strips `/nba` and maps `/x` to `x.html`.
There's no scheduled rebuild: data is read at run time, so a build is only
needed when the code changes.

## The old site

The Observable Framework site this replaced is tagged `v1-observable`.
Read a chart's old code with `git show v1-observable:docs/<page>.md`; its
shared code was in `docs/lib/`. Don't restore it into the tree.

## Layout

- `src/kit/`: shared by every tool
  - `tool.ts`: the tool contract (`load`, `controls`, `describe`, `render`)
  - `frame.ts`: header band (headline, deck, logo box), legend strip, body,
    footer with the URL
  - `annotate.ts`: labels on marks (data typography) and notes/arrows
    (hand-drawn, voice color)
  - `mount.ts`: wires a tool to the page, URL state and export
  - `controls.ts`: the question controls, including a two-handle `span`
    slider and a `players` search with chips
  - `data.ts`: hyparquet reads of `nba/<source>/<dataset>/season=<n>/data.parquet`
  - `theme.ts`: colors, type scale, fonts
- `src/tools/`: one module per tool
- `src/scores/`: the scores page, which is plain HTML, not a tool
- `src/pages/`: one page per tool, plus Now / Tools / Notes
- `docs/plans/`: design docs, dated; the newest decision wins
- `transcripts/`: AI coding session transcripts from the old site

## Rules

- Question controls only (season, team, metric): five at most. No rendering
  knobs; fix the kit instead
- Rules, not boxes: no `border-radius`, shadows or cards
- Color: team colors for identity (the header band; marks only in charts
  with no value colors), `pos`/`neg` for value, `voice` only for
  annotations
- Accessibility: about 1 in 12 men is colorblind, and charts get posted as
  images, often viewed small. Never let color be the only way to read a
  value: pair it with a sign (`+4`/`−4`), position (which side of zero),
  shape, or a direct label, so the chart still reads in grayscale. New
  colors come from a published colorblind-safe palette (ColorBrewer,
  Okabe-Ito, Paul Tol), not picked by hand
- Zero is the strongest line on a signed axis
- Data comes only from the published bucket, read at run time through
  `kit/data.ts`: no data loaders, no build-time pulls, no local copies
- Data reference: `~/code/nba_data/docs/DATA_DICTIONARY.md`

## Known issues

- `cdn.nba.com` headshots send no CORS headers, so exports drop them. ESPN
  logos (`a.espncdn.com`) allow CORS. Fix: mirror headshots in nba_data's
  bucket
