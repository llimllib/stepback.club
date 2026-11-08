# Scores: a day's games at a glance

Written 2026-10-29 from a design conversation. Update it when a decision
changes.

## What

A page, `/scores`, with a small box score for every game on one day:
yesterday by default, any day by a date picker. It's for reading on the
site and taking the night in at a glance, not for posting, so it's a plain
HTML page, not a tool: no frame, no export, no annotations. Details live
elsewhere: each game links to its rotations, and later to a full box score.

## Decisions

- **Plain HTML, not a tool.** Exporting a whole night as one image was
  considered and rejected: it isn't something to post, and a 12-game night
  doesn't fit a 4:5 frame.
- **Name and place.** "Scores", a fourth nav item: `NOW · SCORES · TOOLS ·
  NOTES`. Not in the Tools catalog. The headline is the date in condensed
  caps ("TUESDAY, OCT 28"), like a sports section's agate page.
- **One game is about five lines of agate**, under 44 characters wide so it
  fits a 390px phone:

  ```
  MIA 129  ATL 117                  ROTATIONS →
         EFG%   TOV%  OREB%   FTR
  MIA    58.9   15.0   31.6   .17
  ATL    56.3   14.3   19.6   .09
  MIA: SHOOT +3 · TOV 0 · REB +7 · FT +2
  ```

  The away team comes first, the American order (home first at a neutral
  site would be arbitrary, so there the winner does); the winner is bold. `ROTATIONS →` opens the game in the
  rotations tool. Each abbreviation in the headline has the team's ESPN
  logo before it (`logoUrl` in `kit/frame.ts`), as decoration with no alt
  text; a team ESPN has no logo for goes without. Not in the table too:
  two logos per team read as doubling.

- **Four factors from the NBA's `team_game_logs`**: eFG%, TOV% (turnovers
  per possession), OREB% (against the opponent's defensive rebounds) and
  FT rate (FTM/FGA, as Oliver and ESPN have it). The better value in each
  column is bold, so it reads without color.
- **Why the winner won, from ESPN's `team_box`.** Each team's factor net
  points (`shooting_net_pts`, `turnover_net_pts`, `rebound_net_pts`,
  `freethrow_net_pts`) mean little alone (turnover net points are always
  negative), but the winner's minus the loser's, factor by factor, nearly
  sums to the final margin: MIA 129, ATL 117 is shooting +2.7, turnovers 0,
  rebounding +7.0, free throws +2.4. Not exactly: in 2025–26, 92% of games
  are within half a point and the worst is off by 3.1; early 2026–27 days,
  which ESPN may still revise, are looser (up to 4.6). The values are
  rounded to integers that keep ESPN's rounded total, so rounding doesn't
  add to the gap, and the page says they add up to "about" the margin. The
  line is signed from the winner's side, and starts with its abbreviation,
  since the winner isn't always listed first; the biggest factor is
  underlined. It said "by 12" too, until that made it wrap.
- **On the front page**, under About in the lead caption's column, which
  had a block's worth of space: last night's scores in two columns of
  agate, away team first, winner bold, scores padded so the columns align, with
  overtime marked. Kicker "Scores · Last night" (or the date, when it falls
  back), a one-line blurb and `BOX SCORES →`. If the games can't load, only
  the blurb and link show. It shares the default night with the page
  (`latestNight` in `load.ts`).
- **A newspaper grid**: one column on phones, two or three on desktop, rules
  between games.

## Dates

- `?date=2026-10-28`. Without it, the page shows yesterday in US Eastern
  time, the NBA's game dates. The default isn't written into the URL, so a
  bookmark keeps meaning "yesterday".
- Controls: `← PREV · [date input] · NEXT →`. Prev and next jump to the
  nearest day with games. Changing the date updates `?date=` without a
  reload.
- The season comes from the date: August on is the next season. The date
  input's range comes from `metadata.json`, and goes ahead to the last day
  yarapm predicts. Today and the days ahead show predictions; see
  `2026-11-07-predictions-design.md`.

## Missing data

`games` lists only games that have been played and loaded; there's no
schedule. So the page can't tell an off day from a night not loaded yet,
and its messages say only what it knows.

| Case                              | The page shows                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| The default date has no games yet | The latest day with games: "No games in for Wed, Oct 29 yet; showing Tue, Oct 28." |
| A picked date has no games        | "No games on Thu, Oct 30," with links to the nearest game days before and after    |
| A season the bucket doesn't have  | The same "no games", not an error                                                  |
| NBA logs, but no ESPN yet         | The games, with the last line `NET POINTS NOT IN YET`                              |
| A read fails                      | "Couldn't load games for Oct 28," with a retry link; the date controls still work  |
| Loading                           | The date heading, and "Loading…" under it                                          |

ESPN is read apart from the NBA logs, so a slow or missing ESPN file never
holds up the scores. Each season's files are one row group, so a day's rows
can't be read alone; the page reads the season's few columns and filters.

## Code

- `src/pages/scores.astro`: the shell (headline, controls, an empty grid)
  and its script.
- `src/scores/load.ts`: data, no DOM. A day's games, each team's four
  factors, ESPN's factor differences (or `null`), the nearest game days,
  played or predicted.
- `src/scores/predict.ts`: yarapm's predictions for the games not played,
  and what it predicted for the ones played.
- `src/pages/matchup.astro` and `src/scores/matchup.ts`: a prediction's
  lineups.
- `src/scores/render.ts`: plain DOM, a `<table>` per game.
- `global.css`: the grid and the agate tables. Rules, no boxes.

## Testing

`node scripts/with-dev.mjs node scripts/scores-check.mjs [date]` checks a
night at 1100px and 390px (no sideways scroll; shots in `shots/`), the
default date and prev, the offseason, a season the bucket doesn't have,
ESPN's file blocked and the NBA's logs blocked; and today or the next day
with games, predicted, at both widths, next into the days ahead, and
yarapm blocked. It reports games whose
factors don't sum to the margin, without failing.
