# Step Back Club v2: visual design

The look of the site and of every exported chart. Written 2026-10-25 from a
design conversation; it replaces the "Visual design" section of
`2026-10-10-site-v2-design.md`. Update it when a decision changes.

## Direction

HTML brutalism by way of an early-90s newspaper: a sports page you read,
built from plain HTML and a little CSS, in a medium that scrolls and
reflows. We tried five looks side by side (`?theme=` on a scratch build);
this is the condensed type of the "boxscore" look plus the team-color
header of the "poster" look.

## Principles

- **Rules, not boxes.** Structure comes from horizontal and vertical lines
  (`border`), never cards, rounded corners, shadows or background fills.
  If two things need separating, put a rule between them.
- **HTML's defaults are the style.** Underlined links, native `<select>`
  and `<button>` with square corners, real `<h1>`, `<p>`, `<table>`. The
  CSS is type, spacing and rules; aim for about 150 lines.
- **One measure, one grid.** A centered column about 1080px wide, divided
  with CSS grid only where a page has columns.
- **Newspaper, not costume.** No "Vol. XII" or "Late City Edition". Each
  newspaper device has to carry information.

## Type: three voices

| Voice    | Face                                 | Used for                                           |
| -------- | ------------------------------------ | -------------------------------------------------- |
| Headline | Barlow Condensed 700, caps, tight    | page and chart titles, the wordmark, tool names    |
| Agate    | JetBrains Mono, caps, small, tracked | datelines, nav, labels, controls, legends, sources |
| Reading  | Source Serif 4                       | ledes, chart decks, Notes, tool blurbs             |

Barlow Condensed 500/600 also sets data text inside charts (names, ticks),
where condensed width buys plot area. Caveat stays for annotations.
Inter is dropped.

Bundle the Latin Extended subsets (or whole fonts) of every face: player
names need them (Şengün, Jokić, Valančiūnas), and a fallback glyph in an
exported PNG depends on what's installed on the exporting machine.

## Color

- Newsprint `#f2efe6`, ink `#141414`.
- Color has three jobs only:
  - _identity_: team colors, in the chart's header band, and on marks in
    charts that use no value colors (the shooting scatter's dots: primary
    fill, secondary outline). Never in a plot that also uses blue/red for
    value
  - _value_: blue/red for positive/negative, the ends of ColorBrewer's
    colorblind-safe RdBu scale (`#2166ac`, `#b2182b`). Not green/red,
    which red-green colorblind readers (about 1 in 12 men) see as one
    olive. Not Okabe-Ito's blue/vermilion: the vermilion is too close to
    the voice color
  - _voice_: one red-orange, used only by annotations
- **Data layer is crisp; annotation layer is a sketch.** They never mix, so
  the take is always distinguishable from the data.
- Zero is the strongest line on any signed axis. Gridlines are faint.

## The masthead

On every page:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  6px rule
STEP BACK CLUB                                  NOW  TOOLS  NOTES
────────────────────────────────────────────────────────────  1px rule
SAT · OCT 25, 2026          2026–27 SEASON          UPDATED OCT 24
════════════════════════════════════════════════════════════  3px rule
```

- Wordmark in headline type; nav in agate on the same baseline.
- The dateline carries real information: today, the current season, and
  when the data last changed: the newest `updated` in `nba/metadata.json`
  (see `2026-10-24-nba-data-metadata-json.md`), read at run time. If the
  file can't be read, that part is left blank.
- Mobile: nav drops under the wordmark, the dateline wraps, rules stay.
- Footer: one agate line, `DATA: NBA.COM · ESPN ANALYTICS · BILLMILL.ORG/NBA`.

## The chart frame

The exported PNG is the product, so this is the part that matters most.

```
┌────────────────────────────────────────────────────┬─────────┐
│ BOSTON CELTICS                                     │         │  band
│ Net points per game in the 2025–26 playoffs,       │  LOGO   │
│ through June 13                                    │         │
├────────────────────────────────────────────────────┴─────────┤
│ ● ONE GAME   ▎AVERAGE                     7 GAMES · 9 PLAYERS │  legend strip
├──────────────────────────────────────────────────────────────┤  1px ink
│ [img] Jayson Tatum        ●●         │  ● ▎ ●        ●●       │
│       +3.3 AVG · 6 G                 │                        │
│                     −8   −4    0   +4   +8                    │
│                 ← WORSE · NET POINTS IN ONE GAME · BETTER →   │
├──────────────────────────────────────────────────────────────┤  1px ink
│ DATA: ESPN ANALYTICS                   billmill.org/nba/playoffs │
└──────────────────────────────────────────────────────────────┘
```

- **Band.** The team's primary color when the view is about one team;
  ink otherwise. Text is white or ink, whichever passes WCAG contrast
  (4.5:1), computed, not guessed. A view of one game (rotations) gets a
  band per team instead, away on the left, with an ink "at" box between
  them, as on the matchup page; its headline and deck go under them on
  newsprint (2026-11-11).
- **Headline** in condensed caps; editable on the chart as now.
- **Deck**: the context line, in serif, written as a phrase rather than
  `·`-separated fragments.
- **Logo box**: a newsprint square at the band's right end behind a
  vertical rule, so every logo reads whatever the band color (Raptors red
  on red, Spurs black on black). Ink bands put the wordmark there.
- **Legend strip**: agate, under the band, never on it, so value colors
  never sit on a team color. Counts ("7 games · 9 players") go on its
  right.
- **Plot**: names and ticks in Barlow Condensed; axis titles in agate.
- **Footer**: source and the tool's URL in mono, without the query
  string, so it can be typed from a picture.
- No outer border, no rounded corners: the PNG's edge is the frame's edge.

`Description` changes to match: `context` becomes the deck, and a new
`counts` holds the right side of the legend strip.

## Tool pages

```
PLAYOFF NET POINTS
Each dot is one player's net points in one playoff game.    (serif)
───────────────────────────────────────────────────────────────
┌──────────── chart frame, 720px ───────────┐ │ SEASON
│                                           │ │ [2025–26   ▾]
│                                           │ │ ─────────────
│                                           │ │ TEAM
│                                           │ │ [Celtics   ▾]
│                                           │ │ ═════════════
│                                           │ │ SIZE · ANNOTATE
│                                           │ │ [FIT][SQ][4:5]
│                                           │ │ [✎ NOTE][↗ ARROW]
│                                           │ │ ═════════════
│                                           │ │ [  EXPORT PNG  ]
└───────────────────────────────────────────┘ │ how-to (serif, small)
```

- **Desktop: a rail** right of the chart, behind a vertical rule, stacked
  like a box score: agate label, native control, rule. Question controls
  sit above a heavy rule; framing and export below it.
- **Mobile: stacked**, in reading order: question controls, chart, then
  framing and export. CSS grid areas reflow the same markup.
- Controls: native elements, 1px ink border, square. `accent-color:
  var(--ink)` on sliders. Buttons in agate caps, inverted when active;
  Export is always inverted.

## Other pages

- **Now** is a front page on one three-column grid, so every rule lines
  up. The lead chart (a live tool at its defaults) spans two columns; a
  side caption fills the first, opening "RIGHT:" ("ABOVE:" on phones) and
  stating what the chart shows today, generated from the data. The chart
  carries its own headline, so the page doesn't add a second. Below it,
  one item per column split by vertical rules. Every item is a linked
  headline, not a card.
- **Tools** is a table of contents: a `<ul>` with a rule between rows;
  name in condensed caps, serif blurb, the controls it takes in agate
  (`SEASON · TEAM · MPG`).
- **Notes**: the list is date (agate), headline, one-line serif deck. A
  note is a serif column of about 65 characters with headline, deck and
  agate dateline; charts break out to full width, like photos.

## Building it

- `kit/theme.ts`: the values above become the defaults; the `looks` /
  `?theme=` exploration and most of `frameStyle` go away.
  `public/fonts/explore/` folds into `public/fonts/`.
- `kit/frame.ts`: always a band; contrast-picked text; logo box; legend
  strip.
- `kit/tool.ts` and both tools: deck and `counts`.
- `styles/global.css`: rewritten from scratch.
- `layouts/Base.astro`: the masthead.
- Keep the two export fixes found while exploring: a trailing slash on
  `BASE_URL` (fonts were never embedded in exports), and a short wait
  after `img.decode()` (text in a still-loading face drew as nothing).

## Testing

- A check over all 30 teams' primary colors: band text passes 4.5:1.
- Exports for hard teams in every size: BOS, NYK (blue), ATL and TOR
  (red), BKN and SAS (black/silver), and an ink-band view.
- Page screenshots at 1100px and 390px to check the rail folds.
- One export converted to grayscale: value still reads by sign and
  position, never by color alone.
