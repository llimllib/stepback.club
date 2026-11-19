# Players: design

A table of every player yarapm rates, after Dunks & Threes' EPM table in
spirit, in our look. Written 2026-11-18 from a design conversation; the
first build was done while Bill was away, so the decisions marked
_(mine)_ are open.

## What it's for

A lookup page, not an image: ~450 players (580 in a finished season),
sortable and searchable, in plain HTML like `/scores` and `/team`. It
doesn't export. A postable top-25 would be a tool preset, not this page.

## Data

- yarapm's `ratings_daily`, a whole season (0.15MB now, 1MB for a
  finished one), so the day can change without another read: `o_rating`,
  `d_rating`, `rating` and `o_prior + d_prior` on each day.
- The role columns from nba_data's `player_game_logs` and
  `team_game_logs`: the regular season's games before the day, counted as
  the team page's roster counts them (usage is the player's plays over his
  team's while he's on the floor).
- Names from `player_seasons` (and last season's), age from
  `player_season_stats`, position from `rosters_daily` (2027 on only).
- A player's team is `ratings_daily`'s as of the day, or his last game's
  before it: a finished season's last day leaves 128 players without a
  team in yarapm.

## Controls

Five, in a row between rules above the table: season, day (a native date
input, limited to the season; a day it doesn't rate shows the last one
before it), change since (a week ago, a month ago, opening night),
team, and a name search that ignores case, accents and punctuation.
Headers sort, best first, and reverse on a second click. State is in the
URL: `season`, `date`, `since`, `team`, `sort`, `order`, `q`, each left
out at its default.

The day was a slider across the row at first (2026-11-18), but an exact
day is a narrow question; what a day is good for is a comparison. So the
slider shrank to a date input, and its room went to Change since, which
asks who the model has changed its mind about: sorted by the change since
opening night, the season's risers and fallers.

## The table

`#` (rank by total among everyone rated that day, whatever the filter),
player (with position and age in agate), team, then three groups, each
opened by a rule:

- **yarapm**: Off, Def, Total with a bar from zero, and the total's
  change since the baseline day, whose head names it ("Since Nov 11"):
  the last day rated a week or a month before, or opening night's
  ratings. A week or a month reaching back before the season measures
  from its first day; on that day there's nothing to measure from, and
  the head says "Change".
- **Total = box + beyond**: Box score (yarapm's prior, `o_prior +
  d_prior`) and Beyond box (total − box score): how much of a rating the
  box score explains and how much the lineup data adds, which D&T can't
  show. Sorting by Beyond box lists the players whose impact the box
  score misses. Possessions were dropped (2026-11-18): they're this
  season's, but the fit carries earlier seasons, so they didn't say what
  a rating rests on (Kawhi Leonard was +7.1 against a +4.0 prior on
  opening day, with none). GP and Min show this season's playing time
- **Role**: GP, Min, Pts, Usg%, TS%.

Signed values print their sign and are colored `pos`/`neg`. The bars share
one scale, from the day's lowest total to its highest, so a team's view
shows its players against the league. Zero sits where that range puts
it, about a third of the way in, not in the middle, so the best players'
bars start close to their numbers. Total's head spans the number and
the bar, and a gap after the bar sets the change apart. The name links to RAPM over time for that season. On a
phone the name column sticks while the numbers scroll, and drops position
and age.

## Decisions to review

- yarapm before Role _(mine)_. D&T puts role first; I put the ratings
  first because the page is about them, and on a phone the role columns
  pushed the total off screen.
- Role counts the regular season only _(mine)_, as the team page does,
  so a playoff day shows the regular season's box score beside ratings
  that include the playoffs.
- No percentiles under each value _(mine)_. D&T's two-line cells double
  the row height. The rank column covers the total; per-column ranks
  could come back as a tooltip.
- Every player rated is listed, with no minutes floor _(mine)_. A small
  sample is pulled toward its prior and earlier seasons, so it isn't
  noise the way a small-sample box score is.
- "Beyond box" is a working name; "Off the box", "Unseen" and "On/off"
  were the others considered.
- A column's head sorts best first; clicked again, lowest first (▲,
  `order=asc` in the URL), and again, back. Players without a value stay
  last either way, and the qualified stay above the rule.
- Qualifying minimums for the box-score rates (Min, Pts, Usg%, TS%), as
  Basketball Reference has them: sorted by one, the players with 15
  minutes a game in a quarter of the games the most-played team has
  played come first, then a rule, then the rest, so a 2-minute player
  isn't the usage leader. Fixed, not a control. The ratings sort without
  them: a small sample is already pulled toward the box score and earlier
  seasons. Anything more (minimums you set, position, ranges on columns)
  is #43, a slide-in filter panel.
- No swarm beside the table _(mine)_, unlike D&T's.
- The page is `/players` and is in the nav, between Teams and Tools
  _(mine)_.
