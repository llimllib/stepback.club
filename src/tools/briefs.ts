// The front page's live headlines: one finding from today's data per tool,
// and the view of the tool that shows it. Each reads little: efficiency's
// team game logs (which also give rotations its game) and one season of one
// player_box column
import { lookups, metadata, read } from "../kit/data"
import { cumulative } from "./cumulative"
import { efficiency } from "./efficiency"
import { ordered, results } from "./standings"
import { byTeam, teamGames, type TeamGame } from "./team-ratings"

export interface Brief {
  headline: string
  // the query string of the view that shows it, or "" for the defaults
  query: string
}

const signed = (v: number, digits = 1) =>
  `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(digits)}`

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })

// the best offense or defense, whichever is further from the average
export async function efficiencyBrief(): Promise<Brief | undefined> {
  const d = await efficiency.load(efficiency.defaults)
  const best = (k: "off" | "def") =>
    d.teams.reduce<(typeof d.teams)[number] | undefined>(
      (a, t) => (!a || t[k] > a[k] ? t : a),
      undefined,
    )
  const off = best("off")
  const def = best("def")
  if (!off || !def) return
  const [k, t] =
    off.off >= def.def ? (["off", off] as const) : (["def", def] as const)
  const side = k === "off" ? "offense" : "defense"
  return {
    headline: `Best ${side}: the ${t.name}, ${signed(t[k])} per 100 possessions`,
    query: `sort=${k}`,
  }
}

const margin = (g: TeamGame) => g.pts - g.allowed

// the team furthest from the wins its points predict, as on the team
// charts' luck pair: the Pythagorean formula with bbref's exponent, over
// the regular season's games with possessions
export async function teamsBrief(): Promise<Brief | undefined> {
  const meta = await metadata()
  const season = meta.team_game_logs.last_season
  const [games, names] = await Promise.all([
    teamGames(season),
    read("stats", "team_seasons", season, [
      "team_id",
      "nba_abbrev",
      "full_name",
    ]),
  ])
  const teams = byTeam(
    games.filter(g => g.game_type === "regular_season" && g.poss > 0),
  )
  let top: { id: string; luck: number } | undefined
  for (const [id, list] of teams) {
    const pts = list.reduce((n, g) => n + g.pts, 0)
    const allowed = list.reduce((n, g) => n + g.allowed, 0)
    const wins = list.filter(g => g.pts > g.allowed).length
    const luck = wins - list.length / (1 + (allowed / pts) ** 14)
    if (!top || Math.abs(luck) > Math.abs(top.luck)) top = { id, luck }
  }
  const name = names.find(t => t.team_id === top?.id)?.full_name
  if (!top || !name || Math.abs(top.luck) < 0.5) return
  const n = Math.abs(top.luck).toFixed(1)
  return {
    headline:
      top.luck > 0
        ? `The ${name} have won ${n} more games than their scoring predicts`
        : `The ${name} have won ${n} fewer games than their scoring predicts`,
    query: "pair=luck",
  }
}

// the closest game on the latest day with games
export async function rotationsBrief(): Promise<Brief | undefined> {
  const meta = await metadata()
  const season = meta.team_game_logs.last_season
  // efficiency's and standings' read, so the front page reads it once
  const [games, lk] = await Promise.all([teamGames(season), lookups(season)])
  const played = games.filter(g => g.game_type !== "preseason")
  const latest = Math.max(...played.map(g => +g.game_date))
  const day = played.filter(g => +g.game_date === latest && margin(g) > 0)
  const close = day.sort((a, b) => margin(a) - margin(b) || b.pts - a.pts)[0]
  if (!close) return
  const abbrev = (id: string) => lk.teams.get(id)?.nba_abbrev ?? ""
  const loser = played.find(
    r => r.game_id === close.game_id && r.team_id !== close.team_id,
  )
  if (!loser) return
  const w = abbrev(close.team_id)
  return {
    headline: `Closest game, ${fmtDate(close.game_date)}: ${w} ${close.pts}, ${abbrev(loser.team_id)} ${loser.pts}`,
    query: `season=${season}&team=${w}&game=${close.game_id}`,
  }
}

// the leader in net points this season
export async function cumulativeBrief(): Promise<Brief | undefined> {
  const d = await cumulative.load(cumulative.defaults)
  let top: { id: string; v: number; n: number } | undefined
  for (const [id, gs] of d.games) {
    const own = gs.filter(g => !g.playoff)
    const v = own.reduce((s, g) => s + g.v, 0)
    if (!top || v > top.v) top = { id, v, n: own.length }
  }
  if (!top) return
  const name = d.names.get(top.id) ?? top.id
  const games = top.n === 1 ? "1 game" : `${top.n} games`
  return {
    headline: `${name} leads the league in net points: ${signed(top.v)} in ${games}`,
    query: "",
  }
}

// the top of each conference's standings, for the front page's board: the
// six in the playoffs, or the eight before the play-in
export async function standingsBoard() {
  const meta = await metadata()
  const season = meta.team_game_logs.last_season
  const { teams, through } = await results(season)
  const top = season >= 2021 ? 6 : 8
  const conf = (c: string) =>
    ordered(teams.filter(t => t.conf === c)).slice(0, top)
  return { through, east: conf("East"), west: conf("West") }
}
