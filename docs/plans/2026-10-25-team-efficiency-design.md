# Team efficiency tool: design

Offensive and defensive efficiency for every team, replacing v1's diamonds
(`docs/diamond.md`, `docs/ctg_diamond.md`) and building on its sortable
table (`docs/sortable_table.md`). Written 2026-10-25 from a design
conversation.

## Why not a diamond or a scatter

The diamond puts net rating straight up, which is right, but most readers
find it confusing. A scatter of offense against defense (Hollinger's
"efficiency landscape") reads height as better, so whichever rating is on y
looks more important: a team that's +8 on offense and −2 on defense looks
better than one that's −2 and +8, though both are +6.

So the vertical is a ranking, not a scale, and a strip beside it shows the
gaps a ranking hides.

## The chart

A table, one row per team, sorted by net, offense or defense:

- **Columns**: net, offense, defense. Each column's signed numbers run
  down its middle, and each bar grows out of its number: right if better
  than average, left if worse. All three share one scale and positive is
  always better, so offense and defense bars add up to the net bar. Bars
  are `pos`/`neg`; the sign and the bar's side carry the value.
- **No zero line**, an exception to "zero is the strongest line": the
  column of numbers is zero. Earlier versions put the number at the
  column's edge, where it read with the next column's bars (BOS's −2.1 net
  beside a +3.3 offense bar); rules between columns helped, a number on the
  empty side of zero broke its alignment, and a number centered over its
  bar with a halo cut the bar and the zero line up. The cost: zero is the
  width of a number, so +0.1 and −0.1 look further apart than they are.
- **Relative to average**: every number is points per 100 possessions
  better or worse than the average of the teams shown (for the playoffs,
  the playoff teams). The average is the plain mean of the teams' ratings,
  as CTG publishes no possessions; with it, offense + defense = net
  exactly. The legend strip gives the average ("average team 114.8"), so a
  reader can get back to a raw rating: +6.4 on offense is 121.2, +8.2 on
  defense is 106.6. Relative numbers read well; raw ones aren't coming
  back.
- **The strip**: a column on the right with each team's logo at its value
  in the sorted column, on a true scale, nudged sideways where logos
  collide. It shows tiers: OKC alone at the top, BOS and DEN side by side.
  The average is its zero line.
- The sorted column's header gets a ▼, so an exported image says how it's
  sorted. Clicking a header sorts by it: `render` gets a `set` for params,
  and elements that use it get the class `frame-control`.

## Controls

Five, the most allowed:

- **Season**
- **Source**: NBA.com, Cleaning the Glass, yarapm's RAPM or dunksandthrees' EPM (see below).
  They're the same chart over a different definition (CTG removes garbage
  time), so one tool; switching between them shows which teams garbage
  time flatters.
- **Playoffs**: a toggle. Playoffs include the play-in, as CTG's do.
- **Games**: each source's own windows, reset to its default (the whole
  season) when the source changes:
  - NBA: a slider in steps of 5 games (each team's last 5, 10, 15, …),
    up to the most games any team has played, with the whole season at
    the right end. NBA ratings are summed over the window: 100 × points ÷
    possessions, with points allowed as `pts − plus_minus`.
  - CTG: the season or the last two weeks; just the season in the
    playoffs.
  - Stored as `?last=10` or `?last=2wk`; empty is the season.
- **Sort**: net, offense or defense.

## Data

- NBA: `stats/team_game_logs` with `stats/games` for the game type and
  `stats/team_seasons` for abbreviations, 2010 on.
- CTG: `ctg/ctg_team_summary`, 2010 on.

## RAPM (2026-11-07)

Two more sources, from yarapm's `team_ratings_daily`: **RAPM, full
strength** and **RAPM, expected lineup**. Each team's offense, defense and
net from its players' ratings weighted by their minutes, everyone
available or counting who's likely out, against the average team. Against
NBA.com's numbers, they show which teams' results run ahead of or behind
their players. They're the latest day's: as of yarapm's last build for this
season, the day after the Finals for a past one, from 2011–12 on.

- The title says **Team strength**, not efficiency, and the deck says
  whose ratings they are, since they're not the team's results.
- No Playoffs toggle and no Games control: a rating is a rating as of a
  day, not a sum over games.
- The records are the NBA's regular season's, as for NBA.com.
- The average is yarapm's league average, which the plain mean of the
  teams' ratings comes back to, as theirs are against the average team.

## EPM (2026-11-12)

A fifth source, **EPM, Dunks & Threes**, from dunksandthrees' `team_epm`
(`nba/dunksandthrees/`): each team's offense, defense and net from its
players' EPM weighted by the minutes they're expected to play over the
rest of the season, counting known injuries (the site's "Typical
Rotation"). It's a rating as of a day like RAPM, so it's titled **Team
strength**, with no Playoffs toggle or Games control, and the NBA's
regular-season records.

- Only the latest day's ratings are free, so it starts with 2026–27 and
  has no past seasons.
- The ratings are against a season average with no league rating, so
  they're put on the NBA.com scale: the average is the plain mean of the
  teams' NBA.com regular-season ratings. The ratings needn't average 0 on
  a day, so the chart's zero (the mean of the teams shown) can sit a
  little off theirs.

## Not done

- 16:9 was too short for 30 rows. It was dropped from the site on
  2026-10-26.
