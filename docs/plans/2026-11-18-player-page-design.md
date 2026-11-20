# Player page: design

A page for each player (#31): who they are, their career a season to a
row, their yarapm rating over their career against players like them,
and a season's games. Written 2026-11-18 from a design conversation.

## The page

`/player?id=1628369&season=2026&view=per-game`; `season` and `view` are
left out at their defaults (the latest season, Ratings). Plain HTML like
`/team` and `/players`. The page doesn't export; its chart does, in the
kit's frame. `/player` with no id is a search over every player.

Down the page:

1. **Header band**: name, team (in its colors, as `/team` does), and an
   agate line: position (2027 on), height, weight, age, draft
   ("2017 · #3"), college or country.
2. **Career table**: a row a season, with view tabs.
3. **RAPM chart**: yarapm over the career by age, with comparables.
4. **Game log** for the season chosen in the page's one control.

Links in: names on `/players`, the team page's roster and `/rapm`. (#42
asked for `/players` to link here once this existed.)

## Data

All read at run time through `kit/data.ts`:

- `player_season_stats`, every season from 2010, only the columns used:
  the career table and the comparables' input.
- OpenRAPM, every season (about 24KB each).
- The player's yarapm `ratings_daily`, every season yarapm rates: the chart,
  and the Ratings view's end-of-season yarapm. About 1MB a career; each
  file is sorted by player, so a player's rows are a few row groups.
- ESPN's `net_pts_season` (2019 on).
- One season's `player_game_logs`, `team_game_logs` and ESPN's
  `player_box`, for the game log.
- A comparable's yarapm, only when it's added (about 1MB each).

## Career table

A row per regular season, newest first, and a career row computed from
totals. Headers sort, as on `/players`. A traded player has one row (the
data has one), with "2 teams" in agate under his last team.

Every view opens with Season · Team · Age · GP · Min, then:

- **Ratings** (default): yarapm Off · Def · Total on the season's last
  day (a finished season's includes its playoffs), Box · Beyond box as on
  `/players`, OpenRAPM total, ESPN net points (2019 on). No career row.
- **Per game**: Pts · Reb · Ast · Stl · Blk · Tov · FG% · 3PM · 3PA ·
  3P% · FT%.
- **Advanced**: TS% · eFG% · Usg% · Ast% · Ast/To · OReb% · DReb% · Tov%
  · on-court Off/Def/Net rating.
- **Per 100**: counting stats per 100 possessions.

Tabs are text links between rules, the current one in ink: no boxes.
The view is in the URL (`view`). Signed values print a sign and are
`pos`/`neg`; a season a source doesn't cover is "—". On a phone Season
sticks while the rest scrolls.

Left out: playoff rows (a Playoffs tab later), per 36, percentiles.

## RAPM chart

RAPM over time's lines in the frame: the player's yarapm total from its
first season on, the trend over faint daily dots, the dots dropped once comparables
are added. "Open in RAPM over time" links to `/rapm` with the same
players.

**x is age, not date.** Comparables are matched by age, so a 2016
player's season at 23 sits over this player's at 23. Each age is a band,
labeled with the age, and a day sits across it by where it falls between
opening night and the season's last game (the season under way runs to
where a typical season would end).

Built as its own chart, `src/player/chart.ts`, sharing `rapm.ts`'s trend
(`smooth`, `pinEnd`) and the kit's line labels, rather than as an `x=age`
option on the tool: the tool reads whole seasons of every player, and the
page reads only the players on it. `/rapm` now offers age as a question
(`x=age`), drawn by this chart; see the RAPM design.

**Age** is at the season's end. NBA.com gives a finished season's age at
its end but the current season's as of today, so a player can be 28 in
both; his age in a season is season − his most common season − age over
his finished seasons.

Before yarapm's first season (2011-12 as of this writing; 2013-14 when
this was designed) there's no yarapm, so a career that starts earlier is
drawn from then; one that ended earlier has no chart. Doing better (with
OpenRAPM, or yarapm's history as it's backfilled) is future work.

## Comparables

Suggested, never drawn on their own: chips under the chart, each a name,
"at 23 · 2019" and a +. Added players are in the URL (`vs=`). A search
adds anyone.

Matching, a pure function in `src/player/comps.ts`:

1. The player's profile: his seasons from age − 2 to his age in the
   chosen season, weighted by minutes.
2. The candidates: every other player's three seasons ending at the same
   age, from 2010, with at least 1,000 minutes in them.
3. The features, each a z-score over the candidates: height, minutes a
   game (how much a coach trusts him), per 100 points, assists, offensive
   and defensive rebounds, steals and blocks, 3PA and FTA rates, usage,
   TS%, OpenRAPM offense and defense.
4. Distance is Euclidean; height and the two OpenRAPM sides count double.
   The 8 closest, one window a player.

A comparable whose career started before yarapm's first season is
matched on his earlier seasons but drawn only from it.

## Game log

The chosen season's games, newest first, playoffs after a rule; no
preseason or All-Star game. Date (to that day's `/scores`) · Opp ("@
BOS", to its team page) · Result ("W 112–104") · Min · Pts · Reb · Ast ·
Stl · Blk · Tov · FG · 3P · FT (made–attempted) · +/− · ESPN net points
Off · Def · Total (2019 on). Changing the season reloads only the game
log.

## When something's missing

Each section fails alone, with a line in its place:

- No id or an unknown one: the search.
- No yarapm (missing, or a career before its first season): "yarapm
  rates seasons from …"; Ratings still shows OpenRAPM.
- No ESPN (missing, or before 2019): "—".
- A rookie without games: the header and a table that says so; no
  comparables.
- Comparables failing: the chart without chips.

## Size

The first build downloads about 7MB for a player with ten seasons (6s
through a slow proxy): every regular season's stats since 2010 are 2.5MB,
and a yarapm career about 280KB a season, as a player's rows fill most of
a row group's column chunks. A comparable adds its yarapm career. A
career table in nba_data (a row a player and season, with yarapm's
last day) would cut both.

## Testing

`node scripts/player-check.mjs [id]`, like the team and players checks:
desktop and phone widths, each view, a comparable from the URL, a career
before yarapm, a rookie, an unknown id, yarapm and ESPN missing. Saves
`shots/player-<width>.png` and the chart's export.
