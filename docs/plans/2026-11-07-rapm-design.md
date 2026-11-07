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

- **Seasons**: the span slider, defaulting to the latest season.
- **Rating**: total, offense or defense; one line per player.
- **Players**: search with chips, at most 12. Empty means the five highest
  rated on the last day in the span: today's best for the current season,
  the final ratings for a finished one.

The box-score prior is left out for now.

## Drawing

- x is the date: month ticks for one season, season ticks for a span.
  Offseasons are empty space.
- y is points per 100 possessions, signed, with zero the strongest line.
- A line breaks where a player's days are more than 10 apart (offseason,
  injury, off a roster); a run of one day is a dot.
- Lines, colors, and names in the gutter as in cumulative.
- Every day is a mark (`<player>:<date>`), labeled "Jan 5, 2026 · +6.2 ·
  1,840 poss", so the reader sees how much the estimate rests on. Notes
  sit at `{t, v}`: a time in ms and a value.
