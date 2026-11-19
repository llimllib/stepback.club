// A player's page: his career a season to a row, his yarapm over his
// career, and a season's games; also every player's seasons since 2010,
// which the career table and the comparables (comps.ts) both read. No DOM
// here; see render.ts and chart.ts. Design:
// docs/plans/2026-11-18-player-page-design.md
import { metadata, read, readWhere, type Row } from "../kit/data"

// a dataset a season may not have
const none = () => [] as Row[]

export const iso = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)

// --- every player's regular seasons

// player_season_stats' columns the table and the comparables use
const statCols = [
  "player_id",
  "season_type",
  "team_id",
  "team_count",
  "age",
  "gp",
  "min",
  "pts",
  "fgm",
  "fga",
  "fg3m",
  "fg3a",
  "ftm",
  "fta",
  "oreb",
  "dreb",
  "reb",
  "ast",
  "tov",
  "stl",
  "blk",
  "poss",
  "usg_pct",
  "ast_pct",
  "oreb_pct",
  "dreb_pct",
  "tm_tov_pct",
  "off_rating",
  "def_rating",
  "player_height",
  "player_height_inches",
  "player_weight",
  "draft_year",
  "draft_number",
  "college",
  "country",
]

export interface StatSeason {
  season: number
  player_id: string
  // his last team that season: id and abbreviation
  teamId: string
  team: string
  teams: number
  // the NBA's age that season; see ages
  nbaAge: number
  gp: number
  min: number
  pts: number
  fgm: number
  fga: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  tov: number
  stl: number
  blk: number
  // possessions on the floor
  poss: number
  // fractions, as the NBA has them, except tovPct, a percentage
  usg: number
  astPct: number
  orebPct: number
  drebPct: number
  tovPct: number
  // on-court points per 100 possessions scored and allowed
  ortg: number
  drtg: number
  height: string
  inches: number
  weight: number
  draftYear: number
  draftNumber: number
  college: string
  country: string
  // OpenRAPM, points per 100 possessions, NaN without one
  openO: number
  openD: number
  open: number
  // ESPN's net points per 100 of his team's possessions, 2019 on; NaN
  // under NET_PTS_MIN_POSS
  netPts: number
}

// as on the team page: ESPN's net points are noise under this
const NET_PTS_MIN_POSS = 200

export interface League {
  first: number
  last: number
  // every regular season of every player, by player, oldest first
  byPlayer: Map<string, StatSeason[]>
  // each player's name as of his latest season
  names: Map<string, string>
  // each season's teams: id to abbreviation and full name
  teams: Map<number, Map<string, { abbrev: string; name: string }>>
  // each player's age offset: his age in a season is season − offset
  offsets: Map<string, number>
}

const num = (v: unknown) => (v == null ? NaN : Number(v))

let league: Promise<League> | undefined

// Every regular season since 2010 (about 2MB). Cached for the page
export function loadLeague() {
  league ??= buildLeague()
  league.catch(() => (league = undefined))
  return league
}

async function buildLeague(): Promise<League> {
  const m = (await metadata()).player_season_stats
  const seasons: number[] = []
  for (let s = m.first_season; s <= m.last_season; s++) seasons.push(s)
  const per = await Promise.all(
    seasons.map(s =>
      Promise.all([
        read("stats", "player_season_stats", s, statCols),
        read("stats", "player_seasons", s, ["player_id", "name"]),
        read("stats", "team_seasons", s, [
          "team_id",
          "nba_abbrev",
          "full_name",
        ]),
        read("openrapm", "openrapm", s, [
          "player_id",
          "o_rating",
          "d_rating",
          "rating",
        ]).catch(none),
        s >= 2019
          ? read("espn", "net_pts_season", s, [
              "player_id",
              "season_type",
              "o_net_pts",
              "d_net_pts",
              "o_team_poss",
              "d_team_poss",
            ]).catch(none)
          : Promise.resolve([] as Row[]),
      ]),
    ),
  )

  const byPlayer = new Map<string, StatSeason[]>()
  const names = new Map<string, string>()
  const teams = new Map<number, Map<string, { abbrev: string; name: string }>>()
  per.forEach(([stats, players, teamRows, open, net], i) => {
    const season = seasons[i]
    for (const p of players) if (p.name) names.set(p.player_id, p.name)
    const t = new Map(
      teamRows.map(r => [
        r.team_id as string,
        { abbrev: r.nba_abbrev as string, name: r.full_name as string },
      ]),
    )
    teams.set(season, t)
    const openBy = new Map(open.map(r => [r.player_id as string, r]))
    const netBy = new Map(
      net
        .filter(r => r.season_type === "regular_season")
        .map(r => [r.player_id as string, r]),
    )
    for (const r of stats) {
      if (r.season_type !== "regular_season") continue
      const o = openBy.get(r.player_id)
      const n = netBy.get(r.player_id)
      const s: StatSeason = {
        season,
        player_id: r.player_id,
        teamId: r.team_id ?? "",
        team: t.get(r.team_id)?.abbrev ?? "",
        teams: num(r.team_count) || 1,
        nbaAge: num(r.age),
        gp: num(r.gp),
        min: num(r.min),
        pts: num(r.pts),
        fgm: num(r.fgm),
        fga: num(r.fga),
        fg3m: num(r.fg3m),
        fg3a: num(r.fg3a),
        ftm: num(r.ftm),
        fta: num(r.fta),
        oreb: num(r.oreb),
        dreb: num(r.dreb),
        reb: num(r.reb),
        ast: num(r.ast),
        tov: num(r.tov),
        stl: num(r.stl),
        blk: num(r.blk),
        poss: num(r.poss),
        usg: num(r.usg_pct),
        astPct: num(r.ast_pct),
        orebPct: num(r.oreb_pct),
        drebPct: num(r.dreb_pct),
        tovPct: num(r.tm_tov_pct),
        ortg: num(r.off_rating),
        drtg: num(r.def_rating),
        height: r.player_height ?? "",
        inches: num(r.player_height_inches),
        weight: num(r.player_weight),
        draftYear: num(r.draft_year),
        draftNumber: num(r.draft_number),
        college: r.college ?? "",
        country: r.country ?? "",
        openO: num(o?.o_rating),
        openD: num(o?.d_rating),
        open: num(o?.rating),
        netPts:
          n && n.o_team_poss + n.d_team_poss >= NET_PTS_MIN_POSS
            ? (n.o_net_pts / n.o_team_poss + n.d_net_pts / n.d_team_poss) * 100
            : NaN,
      }
      let list = byPlayer.get(s.player_id)
      if (!list) byPlayer.set(s.player_id, (list = []))
      list.push(s)
    }
  })

  return {
    first: seasons[0],
    last: seasons.at(-1)!,
    byPlayer,
    names,
    teams,
    offsets: ages(byPlayer, seasons.at(-1)!),
  }
}

// The NBA gives a finished season's age at its end, but the current
// season's as of today, so a player can be 28 in both. A player's age in a
// season is season − offset, his offset the most common season − age over
// his finished seasons (all of them, if he has none), so the ages step one
// a season, and a season's age is his age at its end
export function ages(byPlayer: Map<string, StatSeason[]>, current: number) {
  const out = new Map<string, number>()
  for (const [id, list] of byPlayer) {
    const done = list.filter(s => s.season < current)
    const count = new Map<number, number>()
    for (const s of done.length ? done : list)
      if (Number.isFinite(s.nbaAge)) {
        const o = s.season - s.nbaAge
        count.set(o, (count.get(o) ?? 0) + 1)
      }
    let best: [number, number] | undefined
    for (const [o, n] of count) if (!best || n > best[1]) best = [o, n]
    if (best) out.set(id, best[0])
  }
  return out
}

export const ageIn = (l: League, id: string, season: number) => {
  const o = l.offsets.get(id)
  return o === undefined ? NaN : season - o
}

// --- yarapm over a career

export interface RatingDay {
  season: number
  date: Date
  off: number
  def: number
  v: number
  prior: number
  poss: number
  team: string
}

// The seasons yarapm rates
export async function yarapmSeasons() {
  const m = (await metadata("yarapm")).ratings_daily
  return { first: m.first_season, last: m.last_season }
}

// A player's yarapm on every day it rated him, in the seasons given. Each
// season's file is sorted by player, so this reads a row group or two of
// each. `full` adds offense, defense, the prior and the team, which the
// table wants; the chart needs only the total
export async function yarapmCareer(
  id: string,
  seasons: number[],
  full = true,
): Promise<RatingDay[]> {
  const cols = full
    ? [
        "as_of_date",
        "player_id",
        "team_id",
        "o_rating",
        "d_rating",
        "rating",
        "o_prior",
        "d_prior",
        "possessions",
      ]
    : ["as_of_date", "player_id", "rating", "possessions"]
  const per = await Promise.all(
    seasons.map(s =>
      readWhere("yarapm", "ratings_daily", s, cols, {
        player_id: { $eq: id },
      }).catch(none),
    ),
  )
  return per
    .flatMap((rows, i) =>
      rows.map(r => ({
        season: seasons[i],
        date: r.as_of_date as Date,
        off: num(r.o_rating),
        def: num(r.d_rating),
        v: num(r.rating),
        prior: num(r.o_prior) + num(r.d_prior),
        poss: num(r.possessions) || 0,
        team: r.team_id ?? "",
      })),
    )
    .sort((a, b) => +a.date - +b.date)
}

// Each season's span, from opening night to its last game, for placing a
// day within its season. The season under way runs to where a typical
// season's end would be, so its days take the room they will at its end
export async function seasonSpans(seasons: number[], current: number) {
  const per = await Promise.all(
    seasons.map(s =>
      read("stats", "games", s, ["game_date", "game_type"]).catch(none),
    ),
  )
  const spans = new Map<number, { start: number; end: number }>()
  per.forEach((games, i) => {
    const played = games.filter(
      g => g.game_type !== "preseason" && g.game_type !== "all_star",
    )
    if (!played.length) return
    const days = played.map(g => +new Date(`${iso(g.game_date)}T00:00:00Z`))
    spans.set(seasons[i], { start: Math.min(...days), end: Math.max(...days) })
  })
  const lengths = [...spans]
    .filter(([s]) => s !== current)
    .map(([, x]) => x.end - x.start)
    .sort((a, b) => a - b)
  const typical = lengths[Math.floor(lengths.length / 2)] ?? 240 * 86_400_000
  const now = spans.get(current)
  if (now) now.end = Math.max(now.end, now.start + typical)
  return spans
}

// --- the player's bio

export interface Bio {
  id: string
  name: string
  // his current team's abbreviation, or his last one's
  team: string
  teamName: string
  // whether he's on a team in the latest season
  current: boolean
  position: string
  height: string
  weight: number
  draftYear: number
  draftNumber: number
  college: string
  country: string
  age: number
}

export async function bio(l: League, id: string): Promise<Bio | undefined> {
  const list = l.byPlayer.get(id)
  const name = l.names.get(id)
  if (!name) return undefined
  const lastRow = list?.at(-1)
  // the latest roster's position and team, this season only
  const roster = await read("stats", "rosters_daily", l.last, [
    "as_of_date",
    "player_id",
    "team_id",
    "position",
  ]).catch(none)
  const mine = roster
    .filter(r => r.player_id === id)
    .sort((a, b) => +a.as_of_date - +b.as_of_date)
    .at(-1)
  const latestDay = roster.reduce(
    (m, r) => Math.max(m, +r.as_of_date),
    -Infinity,
  )
  const onRoster = !!mine && +mine.as_of_date === latestDay
  const team = onRoster
    ? l.teams.get(l.last)?.get(mine.team_id)
    : lastRow && l.teams.get(lastRow.season)?.get(lastRow.teamId)
  return {
    id,
    name,
    team: team?.abbrev ?? "",
    teamName: team?.name ?? "",
    current: onRoster || lastRow?.season === l.last,
    position: mine?.position ?? "",
    height: lastRow?.height ?? "",
    weight: lastRow?.weight ?? NaN,
    draftYear: lastRow?.draftYear ?? NaN,
    draftNumber: lastRow?.draftNumber ?? NaN,
    college: lastRow?.college ?? "",
    country: lastRow?.country ?? "",
    age: ageIn(l, id, l.last),
  }
}

// --- a season's games

export interface Game {
  game_id: string
  date: string
  // regular_season, playoffs, play_in, cup_final
  type: string
  team: string
  opp: string
  home: boolean | null
  win: boolean
  score: number
  allowed: number
  min: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  fgm: number
  fga: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  pm: number
  // ESPN's net points in the game, NaN without them
  oNet: number
  dNet: number
  net: number
}

export async function gameLog(id: string, season: number): Promise<Game[]> {
  const [logs, teamLogs, games, teams, box] = await Promise.all([
    read("stats", "player_game_logs", season, [
      "game_id",
      "player_id",
      "team_id",
      "opp_team_id",
      "game_date",
      "home",
      "win",
      "min",
      "pts",
      "reb",
      "ast",
      "stl",
      "blk",
      "tov",
      "fgm",
      "fga",
      "fg3m",
      "fg3a",
      "ftm",
      "fta",
      "plus_minus",
    ]),
    read("stats", "team_game_logs", season, ["game_id", "team_id", "pts"]),
    read("stats", "games", season, ["game_id", "game_type"]),
    read("stats", "team_seasons", season, ["team_id", "nba_abbrev"]),
    season >= 2019
      ? read("espn", "player_box", season, [
          "game_id",
          "player_id",
          "o_net_pts",
          "d_net_pts",
          "t_net_pts",
        ]).catch(none)
      : Promise.resolve([] as Row[]),
  ])
  const type = new Map(games.map(g => [g.game_id, g.game_type as string]))
  const abbrev = new Map(teams.map(t => [t.team_id, t.nba_abbrev as string]))
  const pts = new Map(teamLogs.map(t => [`${t.game_id}|${t.team_id}`, t.pts]))
  const net = new Map(
    box.filter(b => b.player_id === id).map(b => [b.game_id, b]),
  )
  return logs
    .filter(r => r.player_id === id)
    .filter(r => {
      const t = type.get(r.game_id)
      return t && t !== "preseason" && t !== "all_star"
    })
    .map(r => {
      const n = net.get(r.game_id)
      return {
        game_id: r.game_id,
        date: iso(r.game_date),
        type: type.get(r.game_id)!,
        team: abbrev.get(r.team_id) ?? "",
        opp: abbrev.get(r.opp_team_id) ?? "",
        home: r.home ?? null,
        win: !!r.win,
        score: num(pts.get(`${r.game_id}|${r.team_id}`)),
        allowed: num(pts.get(`${r.game_id}|${r.opp_team_id}`)),
        min: num(r.min),
        pts: num(r.pts),
        reb: num(r.reb),
        ast: num(r.ast),
        stl: num(r.stl),
        blk: num(r.blk),
        tov: num(r.tov),
        fgm: num(r.fgm),
        fga: num(r.fga),
        fg3m: num(r.fg3m),
        fg3a: num(r.fg3a),
        ftm: num(r.ftm),
        fta: num(r.fta),
        pm: num(r.plus_minus),
        oNet: num(n?.o_net_pts),
        dNet: num(n?.d_net_pts),
        net: num(n?.t_net_pts),
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
