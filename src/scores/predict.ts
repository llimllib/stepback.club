// yarapm's predictions for the scores page: each game not played yet, with
// both teams' expected points, chance to win, ratings and who they're likely
// without; and, for games played, what it predicted before tip-off. No DOM
// here; see render.ts. Data: ~/code/nba-rapm/docs/DATA.md. Design:
// docs/plans/2026-11-07-predictions-design.md
import { read } from "../kit/data"
import {
  gameInfo,
  iso,
  kindOf,
  record,
  seasonOf,
  teamLogs,
  teamNames,
  yarapmHas,
  type Game,
} from "./load"

// A player whose expected minutes are this far under his minutes at full
// strength is missing, or likely to be: about one to four a team
const MISSING_MIN = 8

export interface Missing {
  name: string
  // his chance of playing
  play: number
}

export interface PredictedTeam {
  team_id: string
  abbrev: string
  name: string
  // expected points
  pts: number
  // chance to win
  win: number
  // the record going in, in games of the kind
  wins: number
  losses: number
  // points per 100 possessions better than an average team: with the
  // expected lineup, and at full strength
  net: number
  full: number
  missing: Missing[]
}

export interface Prediction {
  game_id: string
  start: Date
  kind: string
  neutral: boolean
  // away, then home, as the box scores have them
  teams: [PredictedTeam, PredictedTeam]
  // the build's day: the prediction used the games before it
  asOf: string
}

const predictions = (season: number) =>
  read("yarapm", "predictions", season, [
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
  ])

// The predictions for a day's games, leaving out the ones played. Empty for
// a day yarapm doesn't predict: before its latest build, or another season
export async function predictionsOn(
  date: string,
  played: Set<string>,
): Promise<Prediction[]> {
  const season = seasonOf(date)
  if (!(await yarapmHas("predictions", season))) return []
  const rows = (await predictions(season)).filter(
    r => iso(r.game_date) === date && !played.has(r.game_id),
  )
  if (rows.length === 0) return []
  const asOf = iso(rows[0].as_of_date)

  const [ratings, lineups, players, teams, logs, info] = await Promise.all([
    read("yarapm", "team_ratings_daily", season, [
      "as_of_date",
      "team_id",
      "net",
      "full_net",
    ]),
    read("yarapm", "team_players_daily", season, [
      "as_of_date",
      "team_id",
      "player_id",
      "full_min",
      "min",
      "play_prob",
    ]),
    read("stats", "player_seasons", season, ["player_id", "name"]),
    teamNames(season),
    teamLogs(season),
    gameInfo(season),
  ])
  // the build's day's ratings and lineups, which every game ahead uses
  const rating = new Map(
    ratings.filter(r => iso(r.as_of_date) === asOf).map(r => [r.team_id, r]),
  )
  const names = new Map(players.map(p => [p.player_id, p.name as string]))
  const missing = new Map<
    string,
    { id: string; gone: number; play: number }[]
  >()
  for (const r of lineups) {
    if (iso(r.as_of_date) !== asOf || r.full_min - r.min < MISSING_MIN) continue
    if (!missing.has(r.team_id)) missing.set(r.team_id, [])
    missing.get(r.team_id)!.push({
      id: r.player_id,
      gone: r.full_min - r.min,
      play: r.play_prob,
    })
  }
  const team = new Map(teams.map(t => [t.team_id, t]))
  const byId = new Map(info.map(g => [g.game_id, g]))

  const side = (r: Record<string, any>, home: boolean): PredictedTeam => {
    const id = home ? r.home_team_id : r.away_team_id
    const t = team.get(id)
    const out = (missing.get(id) ?? []).sort((a, b) => b.gone - a.gone)
    return {
      team_id: id,
      abbrev: t?.nba_abbrev ?? "",
      name: t?.full_name ?? "",
      pts: home ? r.home_pts : r.away_pts,
      win: home ? r.home_win_prob : 1 - r.home_win_prob,
      ...record(logs, byId, id, r.game_type, date),
      net: rating.get(id)?.net ?? NaN,
      full: rating.get(id)?.full_net ?? NaN,
      missing: shortNames(out.map(m => names.get(m.id) ?? "")).map(
        (name, i) => ({ name, play: out[i].play }),
      ),
    }
  }

  return rows
    .map(r => ({
      game_id: r.game_id,
      start: r.start_time,
      kind: kindOf(r),
      neutral: Boolean(r.neutral_site),
      teams: [side(r, false), side(r, true)] as [PredictedTeam, PredictedTeam],
      asOf,
    }))
    .sort((a, b) => a.game_id.localeCompare(b.game_id))
}

// Last names, or full names where two share one: OKC's Jalen and Jaylin
// Williams, whose initials are the same too. Suffixes aren't last names:
// "Kelly Oubre Jr." is Oubre
function shortNames(full: string[]) {
  const last = full.map(n => {
    const parts = n.split(" ").filter(p => !/^(jr|sr|ii|iii|iv)\.?$/i.test(p))
    return parts.at(-1) ?? n
  })
  return full.map((n, i) =>
    last.filter(l => l === last[i]).length > 1 ? n : last[i],
  )
}

export interface Logged {
  // the team it picked, by how much, and its chance to win
  abbrev: string
  margin: number
  win: number
  // whether the pick won
  right: boolean
}

// What yarapm predicted for played games: its last prediction before each
// one started. A game it didn't log (before it started logging, in November
// 2026) isn't in it
export async function loggedFor(games: Game[]) {
  const out = new Map<string, Logged>()
  if (games.length === 0) return out
  const season = games[0].season
  if (!(await yarapmHas("prediction_log", season))) return out
  const rows = await read("yarapm", "prediction_log", season, [
    "model",
    "game_id",
    "created",
    "start_time",
    "home_team_id",
    "home_pts",
    "away_pts",
    "home_win_prob",
  ])
  const want = new Map(games.map(g => [g.game_id, g]))
  const last = new Map<string, Record<string, any>>()
  for (const r of rows) {
    if (r.model !== "rapm" || !want.has(r.game_id)) continue
    if (+r.created >= +r.start_time) continue
    const prev = last.get(r.game_id)
    if (!prev || +r.created > +prev.created) last.set(r.game_id, r)
  }
  for (const [id, r] of last) {
    const g = want.get(id)!
    const homeWins = r.home_win_prob >= 0.5
    const pick = g.teams.find(t => (t.team_id === r.home_team_id) === homeWins)!
    out.set(id, {
      abbrev: pick.abbrev,
      margin: Math.abs(r.home_pts - r.away_pts),
      win: homeWins ? r.home_win_prob : 1 - r.home_win_prob,
      right: g.teams[g.winner] === pick,
    })
  }
  return out
}
