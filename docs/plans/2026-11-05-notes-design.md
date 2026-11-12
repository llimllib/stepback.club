# Notes

How a note is built. Written 2026-11-05 with the first one, on
Wembanyama's game against Dallas. "Notes" in `2026-10-10-site-v2-design.md`
says what they're for; this is how.

## A note

- A Markdown file, `src/notes/<date>-<slug>.md`, in the `notes` content
  collection (`src/content.config.ts`). Frontmatter: `title`, `deck`,
  `date`, and `chart`, the sketch it embeds. `date` is when it was
  written, with the time and its offset (`2026-11-12T08:50:00-05:00`):
  notes sort by it, newest first, so two from one day need the time.
  Datelines show its day in Eastern time. The body is prose and tables,
  no JS.
- `src/pages/notes/[slug].astro` renders it: agate dateline, headline,
  serif deck, the chart through the kit's `embed()`, then the body in a
  column of about 65 characters. The URL is `/nba/notes/<date>-<slug>`.
- `notes.astro` lists them, newest first: date, headline, deck.

## Its chart

- A sketch in `src/sketches/`, a tool with no controls, named in
  `src/sketches/index.ts` so a note's `chart` can find it. Its id is the
  note's path, so the exported PNG prints the note's URL.
- A sketch also gets an unlisted page (`src/pages/<name>.astro`) with the
  full tool rail, to annotate and export it.
- Every note's chart has an Export PNG button under it, once it's drawn
  (`exportRow` in `kit/export.ts`), saving `<date>-<slug>.png`. It exports
  the chart as the note shows it; to annotate first, use the sketch's page.
  `npm run shot -- notes/<date>-<slug>` clicks it.

## Frozen data

A note shows what it showed when it was written: ESPN revises recent days
(nba_data #72), and the prose's numbers would drift from a live chart.

- A script, `scripts/freeze-<name>.mjs`, reads the bucket once with
  hyparquet and writes `src/notes/<date>-<slug>.json` beside the note.
  Run it with `NODE_USE_ENV_PROXY=1` in the sandbox.
- The JSON holds what the chart and the prose need, reduced: the
  Wembanyama note bins 220,676 games into 10,238 cells (114 KB), rather
  than keeping the rows.
- The sketch imports the JSON; nothing reads the bucket at run time.
- The prose's numbers are typed from the JSON. The note says when it was
  frozen.

## ESPN's net points by kind of play

`player_details` has 31 action types that overlap (`rim`, `dunk` and
`2ptShooting` are all `2pt`). These add up to `total`, to 0.0003, for
every 2025–26 player-game: `2pt`, `3pt`, `freethrow`, `foul`, `rebound`,
`turnover`, and the small `period`, `stoppage`, `timeout`, `jumpball`,
`violation`.
