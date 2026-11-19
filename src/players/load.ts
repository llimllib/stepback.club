// The players page: every player yarapm rates on a day, with his offense,
// defense and total, how they've moved in a week, and how much of the
// total is his box score and how much the lineup data, beside his role
// (games, minutes, points, usage, true shooting) up to that day. No DOM
// here; see render.ts. Design: docs/plans/2026-11-18-players-design.md
import { metadata, read, type Row } from "../kit/data"

export interface Player {
  player_id: string
  name: string
  // the team he's on as of the day: yarapm's, or his last game's before
  // it. Empty for neither
  team: string
  position: string
  age: number
  // this regular season, in the games before the day
  gp: number
  mpg: number
  ppg: number
  // usage and true shooting as percentages, NaN without a shot
  usg: number
  ts: number
  // yarapm: points per 100 possessions better than average
  off: number
  def: number
  net: number
  // net's change since the view's baseline day (see baseline), NaN for a
  // player it didn't rate or a view with no baseline
  delta: number
  // the box-score prior, o_prior + d_prior, on the same scale
  prior: number
  // his rank by net among every player rated that day, 1 the best
  rank: number
  // whether he's played enough to rank by a box-score rate (minutes,
  // points, usage, true shooting): see QUALIFY
  qualified: boolean
}

// Qualifying minimums for the box-score rates, as Basketball Reference
// has them: a quarter of the games the most-played team has played by the
// day, at 15 minutes a game. Without them, sorting by usage puts a player
// with a few minutes on top
export const QUALIFY = { share: 0.25, mpg: 15 }

export interface Season {
  season: number
  // the game days yarapm rates, oldest first, as YYYY-MM-DD
  days: string[]
  teams: { abbrev: string; name: string }[]
  // every player rated on a day, with his change since the baseline day,
  // built on demand
  on(day: string, since: Since): { players: Player[]; from?: string }
}

// what the change is measured from: the last day rated a week or a month
// before, or the season's first day (opening night's ratings, before a
// game). A week or a month that reaches back before the season starts at
// its first day
export type Since = "week" | "month" | "start"
export const sinceKeys: Since[] = ["week", "month", "start"]

export function baseline(days: string[], day: string, since: Since) {
  const d = new Date(`${day}T00:00:00Z`)
  if (since === "week") d.setUTCDate(d.getUTCDate() - 7)
  if (since === "month") d.setUTCMonth(d.getUTCMonth() - 1)
  const cutoff = since === "start" ? days[0] : iso(d)
  const from = days.filter(x => x <= cutoff).at(-1) ?? days[0]
  // the day itself, opening night: nothing to measure from
  return from && from < day ? from : undefined
}

export const iso = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)

// The seasons yarapm rates, newest first
export async function seasons() {
  const m = (await metadata("yarapm")).ratings_daily
  const out = []
  for (let s = m.last_season; s >= m.first_season; s--) out.push(s)
  return out
}

// what a player or a team uses up of its possessions: shots, free throws
// that end one, and turnovers, as the team page counts them for usage
const plays = (r: Row) => r.fga + 0.44 * r.fta + r.tov

// a dataset a season may not have
const none = () => [] as Row[]

export async function loadSeason(season: number): Promise<Season> {
  const [ratings, names, lastNames, teams, logs, teamLogs, games, bio, roster] =
    await Promise.all([
      read("yarapm", "ratings_daily", season, [
        "as_of_date",
        "player_id",
        "team_id",
        "o_rating",
        "d_rating",
        "rating",
        "o_prior",
        "d_prior",
      ]),
      read("stats", "player_seasons", season, ["player_id", "name"]),
      read("stats", "player_seasons", season - 1, ["player_id", "name"]).catch(
        none,
      ),
      read("stats", "team_seasons", season, [
        "team_id",
        "nba_abbrev",
        "full_name",
        "is_nba",
      ]),
      read("stats", "player_game_logs", season, [
        "game_id",
        "player_id",
        "team_id",
        "game_date",
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
      read("stats", "player_season_stats", season, [
        "player_id",
        "season_type",
        "age",
      ]).catch(none),
      // positions: only the current season has daily rosters
      read("stats", "rosters_daily", season, [
        "as_of_date",
        "player_id",
        "position",
      ]).catch(none),
    ])

  const name = new Map(
    [...lastNames, ...names].map(p => [p.player_id, p.name as string]),
  )
  const abbrev = new Map(teams.map(t => [t.team_id, t.nba_abbrev as string]))
  const age = new Map(
    bio
      .filter(r => r.season_type === "regular_season")
      .map(r => [r.player_id, r.age as number]),
  )
  const regular = new Set(
    games.filter(g => g.game_type === "regular_season").map(g => g.game_id),
  )
  const teamGame = new Map(teamLogs.map(r => [`${r.game_id}|${r.team_id}`, r]))
  // the regular season's player games, in date order, so a day's box
  // score is a prefix of them
  const played = logs
    .filter(r => regular.has(r.game_id))
    .map((r): Row => ({ ...r, date: iso(r.game_date) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const rosterDays = roster
    .map((r): Row => ({ ...r, date: iso(r.as_of_date) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const byDay = new Map<string, Row[]>()
  for (const r of ratings) {
    const d = iso(r.as_of_date)
    let rows = byDay.get(d)
    if (!rows) byDay.set(d, (rows = []))
    rows.push(r)
  }
  const days = [...byDay.keys()].sort()

  // each day's players, without their change, which depends on the view
  const built = new Map<string, Player[]>()
  function onDay(day: string): Player[] {
    const done = built.get(day)
    if (done) return done
    const rows = byDay.get(day) ?? []

    // the box score through the day before
    const box = new Map<
      string,
      {
        gp: number
        min: number
        pts: number
        fga: number
        fta: number
        plays: number
        teamPlays: number
        team: string
      }
    >()
    // each team's games: the ones any of its players played in
    const teamGames = new Map<string, Set<string>>()
    for (const r of played) {
      if (r.date >= day) break
      let g = teamGames.get(r.team_id)
      if (!g) teamGames.set(r.team_id, (g = new Set()))
      g.add(r.game_id)
      let s = box.get(r.player_id)
      if (!s)
        box.set(
          r.player_id,
          (s = {
            gp: 0,
            min: 0,
            pts: 0,
            fga: 0,
            fta: 0,
            plays: 0,
            teamPlays: 0,
            team: "",
          }),
        )
      s.gp++
      s.min += r.min
      s.pts += r.pts
      s.fga += r.fga
      s.fta += r.fta
      s.plays += plays(r)
      s.team = r.team_id
      // the team's plays while he was on the floor: its plays times his
      // share of the game's minutes
      const t = teamGame.get(`${r.game_id}|${r.team_id}`)
      if (t && t.min > 0) s.teamPlays += (plays(t) * r.min) / t.min
    }

    // each player's position on the latest roster up to the day
    const position = new Map<string, string>()
    for (const r of rosterDays) {
      if (r.date > day) break
      if (r.position) position.set(r.player_id, r.position)
    }

    const most = Math.max(0, ...[...teamGames.values()].map(g => g.size))
    const minGames = Math.max(1, Math.ceil(QUALIFY.share * most))

    const nets = rows.map(r => r.rating as number)
    const players = rows.map(r => {
      const s = box.get(r.player_id)
      const shots = s ? 2 * (s.fga + 0.44 * s.fta) : 0
      return {
        player_id: r.player_id,
        name: name.get(r.player_id) ?? r.player_id,
        team: abbrev.get(r.team_id ?? s?.team) ?? "",
        position: position.get(r.player_id) ?? "",
        age: age.get(r.player_id) ?? NaN,
        gp: s?.gp ?? 0,
        mpg: s?.gp ? s.min / s.gp : NaN,
        ppg: s?.gp ? s.pts / s.gp : NaN,
        usg: s?.teamPlays ? (100 * s.plays) / s.teamPlays : NaN,
        ts: shots ? (100 * s!.pts) / shots : NaN,
        off: r.o_rating,
        def: r.d_rating,
        net: r.rating,
        delta: NaN,
        prior: r.o_prior + r.d_prior,
        rank: 1 + nets.filter(n => n > r.rating).length,
        qualified: !!s && s.gp >= minGames && s.min / s.gp >= QUALIFY.mpg,
      }
    })
    built.set(day, players)
    return players
  }

  function on(day: string, since: Since) {
    const from = baseline(days, day, since)
    const then = new Map(
      (from ? byDay.get(from)! : []).map(r => [r.player_id, r.rating]),
    )
    const players = onDay(day).map(p => {
      const prev = then.get(p.player_id)
      return { ...p, delta: prev === undefined ? NaN : p.net - prev }
    })
    return { players, from }
  }

  return {
    season,
    days,
    teams: teams
      .filter(t => t.is_nba)
      .map(t => ({ abbrev: t.nba_abbrev, name: t.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    on,
  }
}
