// A day's games for the scores page: each team's four factors from the NBA's
// box scores, and ESPN's net points by factor, which say how the winner won.
// No DOM here; see render.ts. Design: docs/plans/2026-10-29-scores-design.md
import { metadata, read } from "../kit/data"

// Dates are "YYYY-MM-DD" strings throughout: the NBA's game dates, which are
// US Eastern, with no time or zone to shift them

export interface TeamLine {
  team_id: string
  abbrev: string
  name: string
  pts: number
  // the team's record after this game, in games of its kind: the regular
  // season's in the regular season, the playoffs' in the playoffs
  wins: number
  losses: number
  efg: number
  tov: number
  oreb: number
  ftr: number
}

export interface Factors {
  shooting: number
  turnovers: number
  rebounding: number
  freethrows: number
}

export interface Game {
  game_id: string
  season: number
  // "Final", "Final/OT", "Final/2OT"
  status: string
  // "Preseason", "Round 1 G3", ... empty for the regular season
  kind: string
  // away, then home, as American box scores list them. A neutral-site game
  // has no home team, and lists the winner first
  teams: [TeamLine, TeamLine]
  // which of the two won
  winner: 0 | 1
}

// Seasons are named for the year they end, and start in October; August on
// counts as the next season, so the offseason belongs to the one coming
export function seasonOf(date: string) {
  const [y, m] = date.split("-").map(Number)
  return m >= 8 ? y + 1 : y
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Today in US Eastern time, where the NBA dates its games
export function today() {
  // en-CA formats dates as YYYY-MM-DD
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  })
}

// The seasons the bucket has box scores for
export async function seasonRange() {
  const m = await metadata()
  const d = m.team_game_logs
  return { first: d.first_season, last: d.last_season }
}

export const iso = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)

// Whether yarapm has a dataset for a season. It only predicts the current
// one, and started logging its predictions in 2026–27
export async function yarapmHas(dataset: string, season: number) {
  const d = (await metadata("yarapm"))[dataset]
  return Boolean(d) && season >= d.first_season && season <= d.last_season
}

// The games yarapm predicts in a season, the ones not played yet, from the
// day of its latest build on. None if it can't be read: the played games
// don't wait on it
async function predictedGames(season: number) {
  try {
    if (!(await yarapmHas("predictions", season))) return []
    return await read("yarapm", "predictions", season, ["game_id", "game_date"])
  } catch (e) {
    console.error(e)
    return []
  }
}

const seasons = new Map<number, Promise<Map<string, string[]>>>()

// A season's game ids by date: the games played, and the ones yarapm
// predicts. A season the bucket doesn't have has none
function gamesBySeason(season: number) {
  let p = seasons.get(season)
  if (!p) {
    p = (async () => {
      const { first, last } = await seasonRange()
      const days = new Map<string, Set<string>>()
      if (season < first || season > last) return new Map()
      const [played, predicted] = await Promise.all([
        read("stats", "games", season, ["game_id", "game_date"]),
        predictedGames(season),
      ])
      for (const r of [...played, ...predicted]) {
        const day = iso(r.game_date)
        if (!days.has(day)) days.set(day, new Set())
        days.get(day)!.add(r.game_id)
      }
      return new Map([...days].map(([day, ids]) => [day, [...ids]]))
    })()
    p.catch(() => seasons.delete(season))
    seasons.set(season, p)
  }
  return p
}

// The nearest day with games before (dir -1) or after (dir 1) a date, looking
// across offseasons, and in from a date outside the bucket's seasons;
// undefined if there's none
export async function nearestGameDay(date: string, dir: -1 | 1) {
  const { first, last } = await seasonRange()
  const season = Math.min(last, Math.max(first, seasonOf(date)))
  for (let s = season; s >= first && s <= last; s += dir) {
    const days = [...(await gamesBySeason(s)).keys()].sort()
    const day =
      dir < 0 ? days.filter(d => d < date).at(-1) : days.find(d => d > date)
    if (day) return day
  }
  return undefined
}

// The last day with games, played or predicted: how far ahead the date
// picker goes
export async function lastGameDay() {
  const { last } = await seasonRange()
  return [...(await gamesBySeason(last)).keys()].sort().at(-1)
}

// The night a page shows by default: yesterday, or, when it has no games
// (not in yet, or an off day), the latest day before it that does
export async function latestNight() {
  const yesterday = addDays(today(), -1)
  const games = await gamesOn(yesterday)
  if (games.length > 0) return { yesterday, date: yesterday, games }
  const latest = await nearestGameDay(yesterday, -1)
  if (!latest) return { yesterday, date: yesterday, games }
  return { yesterday, date: latest, games: await gamesOn(latest) }
}

const rounds = ["", "Round 1", "Round 2", "Conf. finals", "Finals"]

// what kind of game it is, for its status line. Predictions have only the
// type, not the round
export function kindOf(g: Record<string, any>) {
  switch (g.game_type) {
    case "playoffs":
      return g.playoff_round
        ? `${rounds[g.playoff_round]} G${g.series_game}`
        : "Playoffs"
    case "play_in":
      return "Play-in"
    case "preseason":
      return "Preseason"
    case "cup_final":
      return "Cup final"
    case "all_star":
      return "All-Star"
    default:
      return ""
  }
}

// A season's team box scores, games and teams, read with the same columns
// wherever they're needed, so each file is read once
export const teamLogs = (season: number) =>
  read("stats", "team_game_logs", season, [
    "game_id",
    "team_id",
    "min",
    "pts",
    "fgm",
    "fga",
    "fg3m",
    "ftm",
    "oreb",
    "dreb",
    "tov",
    "poss",
    "home",
    "plus_minus",
  ])
export const gameInfo = (season: number) =>
  read("stats", "games", season, [
    "game_id",
    "game_date",
    "game_type",
    "playoff_round",
    "series_game",
  ])
export const teamNames = (season: number) =>
  read("stats", "team_seasons", season, ["team_id", "nba_abbrev", "full_name"])

// A team's wins and losses in a season's games of a type, through a date
export function record(
  logs: Record<string, any>[],
  info: Map<string, Record<string, any>>,
  team_id: string,
  type: string,
  date: string,
) {
  let [wins, losses] = [0, 0]
  for (const r of logs) {
    const g = info.get(r.game_id)
    if (r.team_id !== team_id || g?.game_type !== type) continue
    if (iso(g.game_date) > date) continue
    if (r.plus_minus > 0) wins++
    else losses++
  }
  return { wins, losses }
}

// A day's games, in the NBA's order (its game ids). Empty if there were none,
// or they aren't in the bucket yet
export async function gamesOn(date: string): Promise<Game[]> {
  const season = seasonOf(date)
  const ids = (await gamesBySeason(season)).get(date)
  if (!ids) return []
  const [logs, teams, info] = await Promise.all([
    teamLogs(season),
    teamNames(season),
    gameInfo(season),
  ])
  const want = new Set(ids)
  const byGame = new Map<string, Record<string, any>[]>()
  for (const r of logs) {
    if (!want.has(r.game_id)) continue
    if (!byGame.has(r.game_id)) byGame.set(r.game_id, [])
    byGame.get(r.game_id)!.push(r)
  }
  const team = new Map(teams.map(t => [t.team_id, t]))
  const kinds = new Map(info.map(g => [g.game_id, kindOf(g)]))
  const byId = new Map(info.map(g => [g.game_id, g]))

  const out: Game[] = []
  for (const id of [...ids].sort()) {
    const rows = byGame.get(id)
    if (rows?.length !== 2) continue
    const line = (r: Record<string, any>, o: Record<string, any>) => ({
      team_id: r.team_id,
      abbrev: team.get(r.team_id)?.nba_abbrev ?? "",
      name: team.get(r.team_id)?.full_name ?? "",
      pts: r.pts,
      ...record(logs, byId, r.team_id, byId.get(id)?.game_type, date),
      efg: (r.fgm + 0.5 * r.fg3m) / r.fga,
      tov: r.tov / r.poss,
      oreb: r.oreb / (r.oreb + o.dreb),
      // Oliver's free throw factor: made, not attempted
      ftr: r.ftm / r.fga,
    })
    // home is NULL at a neutral site, so the home team is the one marked
    // true; with neither, the winner goes first
    const away =
      rows[0].home === true ||
      (rows[1].home !== true && rows[1].pts > rows[0].pts)
    const [a, b] = away ? [rows[1], rows[0]] : rows
    // 48 minutes, and 5 for each overtime
    const ot = Math.max(0, Math.round((a.min - 48) / 5))
    out.push({
      game_id: id,
      season,
      status: ot === 0 ? "Final" : ot === 1 ? "Final/OT" : `Final/${ot}OT`,
      kind: kinds.get(id) ?? "",
      teams: [line(a, b), line(b, a)],
      winner: a.pts > b.pts ? 0 : 1,
    })
  }
  return out
}

// ESPN's net points by factor for a day's games, the winner's minus the
// loser's, by game id. They nearly sum to the margin: within half a point in
// 92% of 2025–26's games, and never off by more than a few. A game ESPN
// hasn't published yet isn't in it
export async function factorsFor(gs: Game[]) {
  const out = new Map<string, Factors>()
  if (gs.length === 0) return out
  const rows = await read("espn", "team_box", gs[0].season, [
    "game_id",
    "team_id",
    "shooting_net_pts",
    "turnover_net_pts",
    "rebound_net_pts",
    "freethrow_net_pts",
  ])
  const want = new Set(gs.map(g => g.game_id))
  const byTeam = new Map<string, Record<string, any>>()
  for (const r of rows)
    if (want.has(r.game_id)) byTeam.set(`${r.game_id}:${r.team_id}`, r)
  for (const g of gs) {
    const [winner, loser] = sides(g)
    const w = byTeam.get(`${g.game_id}:${winner.team_id}`)
    const l = byTeam.get(`${g.game_id}:${loser.team_id}`)
    if (!w || !l) continue
    out.set(g.game_id, {
      shooting: w.shooting_net_pts - l.shooting_net_pts,
      turnovers: w.turnover_net_pts - l.turnover_net_pts,
      rebounding: w.rebound_net_pts - l.rebound_net_pts,
      freethrows: w.freethrow_net_pts - l.freethrow_net_pts,
    })
  }
  return out
}

// A game's winner and loser
export function sides(g: Game): [TeamLine, TeamLine] {
  const [a, b] = g.teams
  return g.winner === 0 ? [a, b] : [b, a]
}

// Round values to integers that keep their rounded sum, the largest
// remainders rounding up, so rounding doesn't throw a game's factors further
// off its margin
export function roundToSum(values: number[]) {
  const total = Math.round(values.reduce((a, b) => a + b, 0))
  const floors = values.map(Math.floor)
  let short = total - floors.reduce((a, b) => a + b, 0)
  const order = values
    .map((v, i) => [v - Math.floor(v), i])
    .sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (short <= 0) break
    floors[i]++
    short--
  }
  return floors
}
