# RAPM over time: design

A player's RAPM estimate at each point in time: not a running total, as in
the cumulative tool, but what the model thought of him on each day. Written
2026-11-07 from a design conversation.

## Data

yarapm's `ratings_daily` (`~/code/nba-rapm/docs/DATA.md`): each player's
offensive, defensive and total rating on each game day, fit only on the
games before it, back to 2012. It's in its own catalog, at the bucket's
`yarapm/` prefix, so `kit/data.ts` treats `yarapm` as a source whose files
sit at `yarapm/<dataset>/...` rather than `nba/<source>/<dataset>/...`, and
`metadata("yarapm")` reads `yarapm/metadata.json`.

A season of `player_id`, `as_of_date`, `possessions` and one rating is
about 300KB, so the tool reads whole seasons, as cumulative does, rather
than filtering row groups by player. Names come from `player_seasons`.

## Controls

- **Seasons**: the span slider, defaulting to the last five seasons: a
  rating moves slowly, so one season is mostly straight lines.
- **Rating**: total, offense or defense; one line per player.
- **Players**: search with chips, at most 12. Empty means the five highest
  rated on the last day in the span: today's best for the current season,
  the final ratings for a finished one.

The box-score prior is left out for now.

## Drawing

- x steps through the league's game days, one step each, whatever the
  calendar did between them: offseasons, the All-Star break and 2020's
  suspension take no room, since no one's rating moves without games,
  while an injury still shows, as the league played on without the
  player. It's monotonic and the same for every player, which is all it
  needs to be. A rule between seasons; month and date ticks for one
  season (at the first game day on or after them), season names under
  their bands for a span.
- y is points per 100 possessions, signed, with zero the strongest line.
- After Dunks & Threes' EPM chart: one player's days are faint dots under
  a trend line; two or more players get only their trends, as five dot
  clouds would be mush. The trend is a Gaussian-weighted average of a
  player's days in the same season (each season starts from a new prior,
  so it doesn't average across them), about a week wide for one season
  and six weeks for a career. It uses later days, so it's hindsight,
  unlike the days; the value beside a name is the last day's, not the
  trend's.
- The trend runs on across the rule between seasons, and breaks where a
  player misses more than 10 of a season's game days (an injury, off a
  roster); a run
  of one day is a dot.
- Lines, colors, and names in the gutter as in cumulative.
- Every day is a mark (`<player>:<date>`), at its dot or on the trend, labeled "Jan 5, 2026 · +6.2 ·
  1,840 poss", so the reader sees how much the estimate rests on. Notes
  sit at `{t, v}`: a time in ms and a value.
