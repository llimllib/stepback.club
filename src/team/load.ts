// A team's page: how good it is and why, and what's going on with it now.
// Its results and ratings against the league's, its season's net rating
// against yarapm's, its four factors, its roster and its games. No DOM
// here; see render.ts. Design: https://github.com/llimllib/stepback.club/issues/40
import { metadata, read, readWhere, type Row } from "../kit/data"
import { seasonFactors, type Factors } from "../scores/factors"
import { iso, kindOf, yarapmHas } from "../scores/load"
import { NET_PTS_MIN_POSS } from "../scores/matchup"
import { ordered, results, type Team as Standing } from "../tools/standings"
import { epmRatings, rapmRatings } from "../tools/team-ratings"

// A value and its rank among the teams, 1 the best. NaN for a source that
// doesn't rate the team
export interface Ranked {
  value: number
  rank: number
}

// offense, defense and net, each points per 100 possessions better than
// the average team, positive good at both ends
export interface Sides {
  off: Ranked
  def: Ranked
  net: Ranked
}

export interface Opponent {
  team_id: string
  abbrev: string
  name: string
}

export interface TeamGame {
  game_id: string
  date: string
  // "", "Cup final", "Round 1 G3", "Play-in"
  kind: string
  game_type: string
  opp: Opponent
  // null at a neutral site
  home: boolean | null
  pts: number
  allowed: number
  poss: number
  // points scored and allowed per 100 of the team's possessions, and the
  // difference
  ortg: number
  drtg: number
  net: number
  win: boolean
  // yarapm's chance this team would win, its last before tip-off: NaN for a
  // game it didn't log
  pre: number
}

export interface NextGame {
  game_id: string
  start: Date
  opp: Opponent
  home: boolean | null
  // yarapm's chance this team wins; NaN if it doesn't predict the game
  win: number
  kind: string
}

export interface RosterPlayer {
  player_id: string
  name: string
  // games, minutes and points a game for this team, this regular season
  gp: number
  mpg: number
  ppg: number
  // usage and true shooting, NaN without a shot
  usg: number
  ts: number
  yarapm: number
  epm: number
  netPts: number
  twoWay: boolean
  // ESPN's injury list: "out", "day_to_day", "suspension"; undefined if
  // he isn't on it
  injury?: { status: string; text: string; returns?: Date }
}

export interface HistoryDay {
  date: Date
  // yarapm's net rating at full strength, and with the day's lineup
  full: number
  today: number
}

export interface TeamPage {
  season: number
  team: Standing & { seed: number; gb: number; division?: string }
  // the conference's teams, best first, for the band's place
  league: {
    // points per 100 possessions, from the league's totals
    rating: number
  }
  results: Sides
  yarapm?: Sides & { day?: Date }
  epm?: Sides & { day?: Date }
  // chronological: the games played, regular season and after
  games: TeamGame[]
  next?: NextGame
  history: HistoryDay[]
  factors?: Factors
  roster: RosterPlayer[]
  // the days the roster's sources are from
  rosterDay?: string
  epmDay?: string
  injuryDay?: Date
}

// a value's rank among every team's, 1 the best
function rankIn(values: number[], v: number, higher = true) {
  if (!Number.isFinite(v)) return NaN
  return (
    1 +
    values.filter(x => Number.isFinite(x) && (higher ? x > v : x < v)).length
  )
}

// Each team's offense, defense and net from a map of off/def ratings
// relative to average, ranked
function sides(
  all: Map<string, { off: number; def: number }>,
  id: string,
): Sides | undefined {
  const t = all.get(id)
  if (!t) return undefined
  const offs = [...all.values()].map(x => x.off)
  const defs = [...all.values()].map(x => x.def)
  const nets = [...all.values()].map(x => x.off + x.def)
  return {
    off: { value: t.off, rank: rankIn(offs, t.off) },
    def: { value: t.def, rank: rankIn(defs, t.def) },
    net: { value: t.off + t.def, rank: rankIn(nets, t.off + t.def) },
  }
}

// The game types a team page counts: everything but exhibitions
const counted = new Set(["regular_season", "cup_final", "play_in", "playoffs"])

// The NBA's 30 teams this season, for the index of teams and to look one up
export async function teamList(season: number) {
  const rows = await read("stats", "team_seasons", season, [
    "team_id",
    "nba_abbrev",
    "full_name",
    "is_nba",
    "conference",
    "division",
  ])
  return rows.filter(t => t.is_nba)
}

export async function latestSeason() {
  return (await metadata()).team_game_logs.last_season as number
}

// Everything on a team's page, or undefined for an abbreviation that isn't
// an NBA team this season
export async function teamPage(abbrev: string): Promise<TeamPage | undefined> {
  const season = await latestSeason()
  const teams = await teamList(season)
  const me = teams.find(t => t.nba_abbrev === abbrev.toUpperCase())
  if (!me) return undefined
  const id = me.team_id as string
  const names = new Map(teams.map(t => [t.team_id as string, t]))
  const opponent = (tid: string): Opponent => ({
    team_id: tid,
    abbrev: names.get(tid)?.nba_abbrev ?? "",
    name: names.get(tid)?.full_name ?? "",
  })

  // yarapm is its own catalog: without it, its parts of the page are out
  const rapmMeta = await metadata("yarapm").catch(
    () => ({}) as Awaited<ReturnType<typeof metadata>>,
  )
  const has = (d: string) =>
    !!rapmMeta[d] &&
    season >= rapmMeta[d].first_season &&
    season <= rapmMeta[d].last_season

  // the other sources are extras: one that can't be read leaves its part
  // of the page out rather than failing it
  const [standings, rapm, epm, factors, games, history, next, roster] =
    await Promise.all([
      results(season),
      has("team_ratings_daily")
        ? rapmRatings(season, true).catch(() => undefined)
        : undefined,
      epmRatings(season).catch(() => undefined),
      seasonFactors(season).catch(() => undefined),
      gameLog(season, id, opponent),
      has("team_ratings_daily")
        ? ratingHistory(season, id).catch(() => [])
        : [],
      nextGame(season, id, opponent).catch(() => undefined),
      rosterOf(season, id).catch(e => {
        console.error(e)
        return { players: [] as RosterPlayer[] }
      }),
    ])

  // the band's team: its record, its seed and games back in its conference
  const conf = ordered(standings.teams.filter(t => t.conf === me.conference))
  const i = conf.findIndex(t => t.id === id)
  const team = conf[i]
  const leader = conf[0]
  const gb = (leader.wins - team.wins + (team.losses - leader.losses)) / 2

  // results relative to the league's average, from its totals when the
  // four factors have them
  const ratings = standings.teams.filter(t => Number.isFinite(t.ortg))
  const avg =
    factors?.league.rating ??
    ratings.reduce((s, t) => s + (t.ortg + t.drtg) / 2, 0) / ratings.length
  const relative = new Map(
    standings.teams.map(t => [t.id, { off: t.ortg - avg, def: avg - t.drtg }]),
  )

  return {
    season,
    team: { ...team, seed: i + 1, gb, division: me.division },
    league: { rating: avg },
    results: sides(relative, id)!,
    yarapm: rapm && { ...sides(rapm.teams, id)!, day: rapm.day },
    epm: epm?.teams.has(id)
      ? { ...sides(epm.teams, id)!, day: epm.day }
      : undefined,
    games,
    next,
    history,
    factors,
    roster: roster.players,
    rosterDay: "day" in roster ? roster.day : undefined,
    epmDay: "epmDay" in roster ? roster.epmDay : undefined,
    injuryDay: "injuryDay" in roster ? roster.injuryDay : undefined,
  }
}

// The team's games this season, chronological, each with its opponent, its
// score, its ratings and yarapm's chance before tip-off
async function gameLog(
  season: number,
  id: string,
  opponent: (id: string) => Opponent,
): Promise<TeamGame[]> {
  const [logs, info, logged] = await Promise.all([
    read("stats", "team_game_logs", season, [
      "game_id",
      "team_id",
      "opp_team_id",
      "game_date",
      "home",
      "pts",
      "plus_minus",
      "poss",
    ]),
    read("stats", "games", season, [
      "game_id",
      "game_date",
      "game_type",
      "playoff_round",
      "series_game",
    ]),
    preGame(season, id),
  ])
  const byId = new Map(info.map(g => [g.game_id as string, g]))
  return logs
    .filter(
      r => r.team_id === id && counted.has(byId.get(r.game_id)?.game_type),
    )
    .map(r => {
      const g = byId.get(r.game_id)!
      const allowed = r.pts - r.plus_minus
      const ortg = r.poss > 0 ? (100 * r.pts) / r.poss : NaN
      const drtg = r.poss > 0 ? (100 * allowed) / r.poss : NaN
      return {
        game_id: r.game_id,
        date: iso(r.game_date),
        kind: kindOf(g),
        game_type: g.game_type,
        opp: opponent(r.opp_team_id),
        home: r.home ?? null,
        pts: r.pts,
        allowed,
        poss: r.poss,
        ortg,
        drtg,
        net: ortg - drtg,
        win: r.plus_minus > 0,
        pre: logged.get(r.game_id) ?? NaN,
      }
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.game_id.localeCompare(b.game_id),
    )
}

// yarapm's chance the team would win each game it logged, its last
// prediction before tip-off. It started logging in November 2026
async function preGame(season: number, id: string) {
  const out = new Map<string, number>()
  if (!(await yarapmHas("prediction_log", season).catch(() => false)))
    return out
  const rows = await read("yarapm", "prediction_log", season, [
    "model",
    "game_id",
    "created",
    "start_time",
    "home_team_id",
    "home_pts",
    "away_pts",
    "home_win_prob",
  ]).catch(() => [] as Row[])
  const last = new Map<string, Row>()
  for (const r of rows) {
    if (r.model !== "rapm" || +r.created >= +r.start_time) continue
    const prev = last.get(r.game_id)
    if (!prev || +r.created > +prev.created) last.set(r.game_id, r)
  }
  for (const [game, r] of last) {
    // the log has both teams' games; the away team's chance is the rest
    out.set(game, r.home_team_id === id ? r.home_win_prob : 1 - r.home_win_prob)
  }
  return out
}

// yarapm's rating of the team on each day it rated it
async function ratingHistory(season: number, id: string) {
  const rows = await read("yarapm", "team_ratings_daily", season, [
    "as_of_date",
    "team_id",
    "net",
    "full_net",
  ])
  return rows
    .filter(r => r.team_id === id)
    .map(r => ({ date: r.as_of_date as Date, full: r.full_net, today: r.net }))
    .sort((a, b) => +a.date - +b.date)
}

// The team's next game on the schedule, with yarapm's chance to win it
async function nextGame(
  season: number,
  id: string,
  opponent: (id: string) => Opponent,
): Promise<NextGame | undefined> {
  const rows = await read("stats", "schedule", season, [
    "game_id",
    "start_time",
    "game_type",
    "playoff_round",
    "series_game",
    "home_team_id",
    "away_team_id",
    "neutral_site",
    "status",
  ])
  const g = rows
    .filter(
      r =>
        r.status !== "final" &&
        counted.has(r.game_type) &&
        (r.home_team_id === id || r.away_team_id === id),
    )
    .sort((a, b) => +a.start_time - +b.start_time)[0]
  if (!g) return undefined
  const home = g.home_team_id === id
  let win = NaN
  if (await yarapmHas("predictions", season).catch(() => false)) {
    // the scores page's columns, so the file is read once
    const preds = await read("yarapm", "predictions", season, [
      "game_id",
      "game_date",
      "start_time",
      "game_type",
      "home_team_id",
      "away_team_id",
      "neutral_site",
      "home_pts",
      "away_pts",
      "home_win_prob",
      "as_of_date",
    ]).catch(() => [] as Row[])
    const p = preds.find(r => r.game_id === g.game_id)
    if (p) win = home ? p.home_win_prob : 1 - p.home_win_prob
  }
  return {
    game_id: g.game_id,
    start: g.start_time,
    opp: opponent(home ? g.away_team_id : g.home_team_id),
    home: g.neutral_site ? null : home,
    win,
    kind: kindOf(g),
  }
}

// a player's or a team's plays: shots, free throws a shot, and turnovers
const plays = (r: Row) => r.fga + 0.44 * r.fta + r.tov

// The roster: who's on the team today, with what each has done for it
// this regular season (games, minutes, points, usage, true shooting) and
// how good each is by yarapm, EPM and net points
async function rosterOf(season: number, id: string) {
  const [
    rosters,
    logs,
    teamLogs,
    info,
    names,
    lastNames,
    lineup,
    epm,
    netPts,
    injuries,
  ] = await Promise.all([
    read("stats", "rosters_daily", season, [
      "as_of_date",
      "team_id",
      "player_id",
      "two_way",
    ]).catch(() => [] as Row[]),
    read("stats", "player_game_logs", season, [
      "game_id",
      "team_id",
      "player_id",
      "min",
      "pts",
      "fga",
      "fta",
      "tov",
    ]),
    read("stats", "team_game_logs", season, [
      "game_id",
      "team_id",
      "min",
      "fga",
      "fta",
      "tov",
    ]),
    read("stats", "games", season, ["game_id", "game_type"]),
    read("stats", "player_seasons", season, ["player_id", "name"]),
    read("stats", "player_seasons", season - 1, ["player_id", "name"]).catch(
      () => [] as Row[],
    ),
    readWhere(
      "yarapm",
      "team_players_daily",
      season,
      ["as_of_date", "team_id", "player_id", "o_rating", "d_rating"],
      { team_id: { $eq: id } },
    ).catch(() => [] as Row[]),
    // the matchup page's columns, so the file is read once
    read("dunksandthrees", "epm_predictive", season, [
      "player_id",
      "as_of_date",
      "epm",
    ]).catch(() => [] as Row[]),
    read("espn", "net_pts_season", season, [
      "player_id",
      "season_type",
      "o_net_pts",
      "d_net_pts",
      "o_team_poss",
      "d_team_poss",
    ]).catch(() => [] as Row[]),
    read("espn", "espn_injuries", season, [
      "fetched_at",
      "player_id",
      "status",
      "injury_type",
      "detail",
      "side",
      "return_date",
    ]).catch(() => [] as Row[]),
  ])
  const regular = new Set(
    info.filter(g => g.game_type === "regular_season").map(g => g.game_id),
  )

  // today's roster; without one (a season before they were saved), the
  // players who've played for the team
  const rosterDay = rosters.reduce<Date | undefined>(
    (d, r) => (!d || r.as_of_date > d ? r.as_of_date : d),
    undefined,
  )
  const onRoster = rosters.filter(
    r => r.team_id === id && +r.as_of_date === +rosterDay!,
  )
  const ids = onRoster.length
    ? onRoster.map(r => r.player_id as string)
    : [
        ...new Set(
          logs
            .filter(r => r.team_id === id && regular.has(r.game_id))
            .map(r => r.player_id as string),
        ),
      ]
  const twoWay = new Set(onRoster.filter(r => r.two_way).map(r => r.player_id))

  // the team's plays in each of its games, for usage: shots, free throws
  // a shot, and turnovers, over its minutes
  const team = new Map(
    teamLogs.filter(r => r.team_id === id).map(r => [r.game_id, r]),
  )
  const stats = new Map<
    string,
    {
      gp: number
      min: number
      pts: number
      fga: number
      fta: number
      plays: number
      teamPlays: number
    }
  >()
  for (const r of logs) {
    if (r.team_id !== id || !regular.has(r.game_id)) continue
    const t = team.get(r.game_id)
    let s = stats.get(r.player_id)
    if (!s)
      stats.set(
        r.player_id,
        (s = { gp: 0, min: 0, pts: 0, fga: 0, fta: 0, plays: 0, teamPlays: 0 }),
      )
    s.gp++
    s.min += r.min
    s.pts += r.pts
    s.fga += r.fga
    s.fta += r.fta
    s.plays += plays(r)
    // the team's plays while he was on the floor, as the NBA estimates
    // them: its plays times his share of the game's minutes. A team log's
    // minutes are the game's, 48 and 5 an overtime
    if (t && t.min > 0) s.teamPlays += (plays(t) * r.min) / t.min
  }

  // yarapm's latest day for the team
  const lineupDay = lineup.reduce<Date | undefined>(
    (d, r) => (!d || r.as_of_date > d ? r.as_of_date : d),
    undefined,
  )
  const yarapm = new Map(
    lineup
      .filter(r => +r.as_of_date === +lineupDay!)
      .map(r => [r.player_id, r.o_rating + r.d_rating]),
  )
  const epmOf = new Map(epm.map(r => [r.player_id, r.epm as number]))
  const netPtsOf = new Map(
    netPts
      .filter(
        r =>
          r.season_type === "regular_season" &&
          r.o_team_poss + r.d_team_poss >= NET_PTS_MIN_POSS,
      )
      .map(r => [
        r.player_id,
        (r.o_net_pts / r.o_team_poss + r.d_net_pts / r.d_team_poss) * 100,
      ]),
  )
  const name = new Map(
    [...lastNames, ...names].map(p => [p.player_id, p.name as string]),
  )

  // ESPN's latest list
  const injuryDay = injuries.reduce<Date | undefined>(
    (d, r) => (!d || r.fetched_at > d ? r.fetched_at : d),
    undefined,
  )
  const injury = new Map(
    injuries
      .filter(r => +r.fetched_at === +injuryDay!)
      .map(r => [
        r.player_id,
        {
          status: r.status as string,
          text: [r.side, r.injury_type, r.detail]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          returns: r.return_date ?? undefined,
        },
      ]),
  )

  const players: RosterPlayer[] = ids.map(pid => {
    const s = stats.get(pid)
    const shots = s ? 2 * (s.fga + 0.44 * s.fta) : 0
    return {
      player_id: pid,
      name: name.get(pid) ?? pid,
      gp: s?.gp ?? 0,
      mpg: s ? s.min / s.gp : NaN,
      ppg: s ? s.pts / s.gp : NaN,
      usg: s?.teamPlays ? (100 * s.plays) / s.teamPlays : NaN,
      ts: shots ? s!.pts / shots : NaN,
      yarapm: yarapm.get(pid) ?? NaN,
      epm: epmOf.get(pid) ?? NaN,
      netPts: netPtsOf.get(pid) ?? NaN,
      twoWay: twoWay.has(pid),
      injury: injury.get(pid),
    }
  })
  // most minutes first; those who haven't played for the team after,
  // the best rated first
  const total = (p: RosterPlayer) => (p.gp ? p.mpg * p.gp : 0)
  players.sort(
    (a, b) =>
      total(b) - total(a) ||
      (Number.isFinite(b.yarapm) ? b.yarapm : -99) -
        (Number.isFinite(a.yarapm) ? a.yarapm : -99) ||
      a.name.localeCompare(b.name),
  )
  return {
    players,
    day: rosterDay && iso(rosterDay),
    epmDay: epm.length ? iso(epm[0].as_of_date) : undefined,
    injuryDay,
  }
}
