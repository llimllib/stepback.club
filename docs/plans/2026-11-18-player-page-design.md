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
- The player's yarapm `ratings_daily`, every season from 2014: the chart,
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

The `/rapm` tool in the frame: the player's yarapm total from 2013-14
on, the trend over faint daily dots, the dots dropped once comparables
are added. "Open in RAPM over time" links to `/rapm` with the same
players.

**x is age, not date.** Comparables are matched by age, so a 2016
player's season at 23 sits over this player's at 23. Each age is a band,
the season's game days across it as `/rapm` lays them out, labeled with
the age. `rapm.ts` gets an `x=age` option, which the player page uses;
`/rapm` could offer it as a question later. Age is
`player_season_stats.age` for each season.

Before 2013-14 there's no yarapm, so a career that starts earlier is
drawn from 2014; one that ended earlier has no chart. Doing better (with
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

A comparable before 2014 is matched on 2010–13 but drawn only from 2014.

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
- No yarapm (missing, or a career before 2014): "yarapm rates seasons
  from 2013-14"; Ratings still shows OpenRAPM.
- No ESPN (missing, or before 2019): "—".
- A rookie without games: the header and a table that says so; no
  comparables.
- Comparables failing: the chart without chips.

## Testing

`node scripts/player-check.mjs [id]`, like the team and players checks:
desktop and phone widths, each view, a comparable from the URL, a career
before 2014, a rookie, an unknown id, yarapm and ESPN missing. Saves
`shots/player-<width>.png` and the chart's export.
