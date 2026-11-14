// Team ratings for the tools that show more than one source: a team's
// results from the NBA's game logs, and its players' ratings from yarapm
// and Dunks & Threes. Team efficiency and standings read them here, so
// they compute them the same way; and since the reads are cached by their
// columns, a page with both, like the front page, reads each file once
import { max } from "d3"
import { read, type Row } from "../kit/data"

// One team's side of a game
export interface TeamGame {
  game_id: string
  team_id: string
  game_date: Date
  game_type: string
  pts: number
  // points allowed: pts − plus_minus
  allowed: number
  poss: number
}

// every team's games in a season, with each game's type
export async function teamGames(season: number): Promise<TeamGame[]> {
  const [logs, games] = await Promise.all([
    read("stats", "team_game_logs", season, [
      "game_id",
      "team_id",
      "game_date",
      "pts",
      "plus_minus",
      "poss",
    ]),
    read("stats", "games", season, ["game_id", "game_type"]),
  ])
  const gameType = new Map(games.map(g => [g.game_id, g.game_type as string]))
  return logs.map(r => ({
    game_id: r.game_id,
    team_id: r.team_id,
    game_date: r.game_date,
    game_type: gameType.get(r.game_id) ?? "",
    pts: r.pts,
    allowed: r.pts - r.plus_minus,
    poss: r.poss,
  }))
}

export interface Summed {
  // points scored and allowed per 100 possessions: NaN without possessions
  ortg: number
  drtg: number
  games: number
  wins: number
  losses: number
  // the last game's day
  through?: Date
}

// a team's games summed, the NBA's way: points over possessions, so a
// blowout counts by its possessions, not as one game in an average. A game
// without possessions counts in the record only
export function summed(games: TeamGame[]): Summed {
  let [pts, allowed, poss, wins] = [0, 0, 0, 0]
  let through: Date | undefined
  for (const g of games) {
    if (g.pts > g.allowed) wins++
    if (g.poss > 0) {
      pts += g.pts
      allowed += g.allowed
      poss += g.poss
    }
    if (!through || g.game_date > through) through = g.game_date
  }
  return {
    ortg: poss ? (100 * pts) / poss : NaN,
    drtg: poss ? (100 * allowed) / poss : NaN,
    games: games.length,
    wins,
    losses: games.length - wins,
    through,
  }
}

// games grouped by team
export function byTeam(games: TeamGame[]) {
  const teams = new Map<string, TeamGame[]>()
  for (const g of games) {
    let list = teams.get(g.team_id)
    if (!list) teams.set(g.team_id, (list = []))
    list.push(g)
  }
  return teams
}

// Players' ratings of a team, as of the source's latest day: points per
// 100 possessions better than average, on offense and defense, positive
// good at both ends
export interface PlayerRatings {
  day?: Date
  teams: Map<string, { off: number; def: number }>
  // the league average they're relative to, if the source says
  league?: number
}

function latest(rows: Row[], pick: (r: Row) => { off: number; def: number }) {
  const day = max(rows, r => r.as_of_date as Date)
  const teams = new Map(
    rows
      .filter(r => +r.as_of_date === +day!)
      .map(r => [r.team_id as string, pick(r)]),
  )
  return { day: teams.size ? day : undefined, teams }
}

// yarapm's team ratings: its last build for this season, the day after the
// Finals for a past one. At full strength, everyone available, or with the
// expected lineup, counting who's likely out. Also the league average they
// are relative to, to put them on the NBA's scale
export async function rapmRatings(
  season: number,
  full: boolean,
): Promise<PlayerRatings> {
  const rows = await read("yarapm", "team_ratings_daily", season, [
    "as_of_date",
    "team_id",
    "off",
    "def",
    "full_off",
    "full_def",
    "league_average",
  ])
  const r = latest(rows, t =>
    full ? { off: t.full_off, def: t.full_def } : { off: t.off, def: t.def },
  )
  const day = rows.find(t => +t.as_of_date === +r.day!)
  return { ...r, league: day?.league_average }
}

// Dunks & Threes' team EPM: its players' EPM weighted by their expected
// minutes over the rest of the season, counting known injuries, as of the
// site's latest day. A positive d_epm is a good defense
export async function epmRatings(season: number): Promise<PlayerRatings> {
  const rows = await read("dunksandthrees", "team_epm", season, [
    "as_of_date",
    "team_id",
    "o_epm",
    "d_epm",
  ])
  return latest(rows, t => ({ off: t.o_epm, def: t.d_epm }))
}
