// Teams' totals from the NBA's game logs over a window of games, and Dean
// Oliver's four factors from them: shared by Team charts and Four factors.
// See docs/plans/2026-11-17-four-factors-design.md
import { max } from "d3"
import { read, type Row } from "../kit/data"
import { sign } from "../kit/scatter"

// A team's totals over the games in view, by column; `opp_` columns are its
// opponents'
export type Totals = Record<string, number>

// A stat: `get` is its value from a team's totals, and the league's from
// the league's. `pct` ticks are percentages, `signed` ones carry a sign;
// `lower` is better, so its axis runs backwards. `tip` writes the value in
// a tooltip and the legend
export interface Stat {
  label: string
  short: string
  get(t: Totals): number
  pct?: boolean
  signed?: boolean
  lower?: boolean
  tip(v: number): string
}

export const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
export const num1 = (v: number) => v.toFixed(1)
export const num2 = (v: number) => v.toFixed(2)
export const signed1 = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1)}`

// a count per 100 of the team's possessions, or its opponents'
export const per100 = (col: string, label: string, short: string): Stat => ({
  label: `${label} per 100 possessions`,
  short: `${short}/100`,
  get: t => (100 * t[col]) / (col.startsWith("opp_") ? t.opp_poss : t.poss),
  tip: num1,
})

const efg = (side: "" | "opp_"): Stat => ({
  label: side ? "Opponents' effective FG%" : "Effective FG%",
  short: side ? "Opp eFG%" : "eFG%",
  get: t => (t[`${side}fgm`] + 0.5 * t[`${side}fg3m`]) / t[`${side}fga`],
  pct: true,
  lower: Boolean(side),
  tip: pct1,
})
// Oliver's free throw factor: made, not attempted, as on the scores page
const ftRate = (side: "" | "opp_"): Stat => ({
  label: side
    ? "Opponents' free throws made per shot attempt"
    : "Free throws made per shot attempt",
  short: side ? "Opp FTr" : "FTr",
  get: t => t[`${side}ftm`] / t[`${side}fga`],
  lower: Boolean(side),
  tip: num2,
})

// the four factors' stats, each side of the ball
export const factorStats: Record<string, Stat> = {
  efg: efg(""),
  opp_efg: efg("opp_"),
  ft_rate: ftRate(""),
  opp_ft_rate: ftRate("opp_"),
  oreb_pct: {
    label: "Offensive rebound %",
    short: "OREB%",
    get: t => t.oreb / (t.oreb + t.opp_dreb),
    pct: true,
    tip: pct1,
  },
  opp_oreb_pct: {
    label: "Opponents' offensive rebound %",
    short: "Opp OREB%",
    get: t => t.opp_oreb / (t.opp_oreb + t.dreb),
    pct: true,
    lower: true,
    tip: pct1,
  },
  // turnovers both ends, with shorts that fit the legend
  tov_forced: {
    label: "Opponents' turnovers per 100 possessions",
    short: "forced",
    get: t => (100 * t.opp_tov) / t.opp_poss,
    tip: num1,
  },
  tov_committed: {
    ...per100("tov", "Turnovers", ""),
    short: "committed",
    lower: true,
  },
}

// One factor as a scatter: x is the team's offense, y its defense, so up
// and right are better and the diagonals are the team's margin in it: x − y,
// or y − x if `flip`, for the factor where lower is better on offense.
// Corners name the quadrants: top left, top right, bottom left, bottom right
export interface Factor {
  name: string
  x: string
  y: string
  // the deck's phrase for what's plotted
  deck: string
  corners: [string, string, string, string]
  // a diagonal's name, for its value of x − y
  diff: (c: number) => string
  // the margin is y − x
  flip?: boolean
}

// a team's margin in a factor, from its x and y; higher is better
export const margin = (f: Factor, x: number, y: number) =>
  f.flip ? y - x : x - y

export const ends: [string, string, string, string] = [
  "Defense only",
  "Both ends",
  "Neither end",
  "Offense only",
]

// Oliver's four, in his order
export const factors: Record<string, Factor> = {
  efg: {
    name: "Effective FG%, both ends",
    x: "efg",
    y: "opp_efg",
    deck: "Opponents' effective field goal percentage by the team's",
    corners: ends,
    diff: c => `${sign(c)}${+Math.abs(c * 100).toFixed(1)}`,
  },
  // turnovers are the one factor where lower is better on offense: x runs
  // backwards, and the margin is forced less committed, y − x
  "tov-both": {
    name: "Turnovers, both ends",
    x: "tov_committed",
    y: "tov_forced",
    deck: "Opponents' turnovers by turnovers per 100 possessions",
    corners: ["Forces them", "Both", "Neither", "Protects the ball"],
    diff: c => `${sign(-c)}${Math.abs(c)}`,
    flip: true,
  },
  rebounding: {
    name: "Offensive rebounding, both ends",
    x: "oreb_pct",
    y: "opp_oreb_pct",
    deck: "Opponents' offensive rebound percentage by the team's",
    corners: [
      "Defensive glass",
      "Both glasses",
      "Neither glass",
      "Offensive glass",
    ],
    diff: c => `${sign(c)}${+Math.abs(c * 100).toFixed(1)}`,
  },
  "ft-rate": {
    name: "Free throw rate, both ends",
    x: "ft_rate",
    y: "opp_ft_rate",
    deck: "Opponents' free throws made per shot attempt by the team's",
    corners: ["Doesn't foul", "Both", "Neither", "Gets to the line"],
    diff: c => `${sign(c)}${+Math.abs(c).toFixed(2)}`,
  },
}

// the columns summed from game logs; each also has an opp_ twin
const counts = [
  "pts",
  "fgm",
  "fga",
  "fg3m",
  "fg3a",
  "ftm",
  "fta",
  "oreb",
  "dreb",
  "ast",
  "tov",
  "blk",
  "poss",
  // null for a game without play-by-play, which sums as 0
  "team_oreb",
]

// Each team's totals over its games in the window, joined to its
// opponents' in the same games: the regular season, or the playoffs (with
// the play-in) if asked for and there are any. `last` is "" for every game,
// or each team's last n; it's dropped if the season has no such window
export async function loadLogs(
  season: number,
  p: { playoffs: boolean; last: string },
) {
  const [logs, games] = await Promise.all([
    read("stats", "team_game_logs", season, [
      "game_id",
      "team_id",
      "game_date",
      "win",
      "min",
      ...counts,
    ]),
    read("stats", "games", season, ["game_id", "game_type"]),
  ])
  const type = new Map(games.map(g => [g.game_id, g.game_type as string]))
  // the play-in goes with the playoffs, as in the efficiency tool
  const post = ["playoffs", "play_in"]
  const hasPlayoffs = logs.some(r => post.includes(type.get(r.game_id)!))
  const playoffs = p.playoffs && hasPlayoffs
  const kinds = playoffs ? post : ["regular_season"]
  const byGame = new Map<string, Row[]>()
  for (const r of logs) {
    if (!kinds.includes(type.get(r.game_id)!) || !(r.poss > 0)) continue
    const list = byGame.get(r.game_id) ?? []
    list.push(r)
    byGame.set(r.game_id, list)
  }
  const byTeam = new Map<string, [Row, Row][]>()
  for (const [a, b] of byGame.values()) {
    if (!b) continue
    for (const [r, o] of [
      [a, b],
      [b, a],
    ]) {
      const list = byTeam.get(r.team_id) ?? []
      list.push([r, o])
      byTeam.set(r.team_id, list)
    }
  }

  const most = max([...byTeam.values()], l => l.length) ?? 0
  // every fifth game short of the most played, then the whole season
  const windows = []
  for (let n = 5; n < most; n += 5)
    windows.push({ value: String(n), label: `Last ${n}` })
  windows.push({ value: "", label: "Season" })
  const last = windows.some(w => w.value === p.last) ? p.last : ""

  let through: Date | undefined
  const totals = new Map<string, Totals>()
  for (const [team_id, list] of byTeam) {
    list.sort((a, b) => +b[0].game_date - +a[0].game_date)
    const used = last ? list.slice(0, Number(last)) : list
    const t: Totals = { games: used.length, wins: 0, min: 0 }
    for (const c of counts) t[c] = t[`opp_${c}`] = 0
    for (const [r, o] of used) {
      t.wins += r.win ? 1 : 0
      t.min += r.min
      for (const c of counts) {
        t[c] += r[c]
        t[`opp_${c}`] += o[c]
      }
      if (!through || r.game_date > through) through = r.game_date
    }
    for (const s of ["", "opp_"]) {
      t[`${s}fg2m`] = t[`${s}fgm`] - t[`${s}fg3m`]
      t[`${s}fg2a`] = t[`${s}fga`] - t[`${s}fg3a`]
      t[`${s}chances`] = t[`${s}fga`] + 0.44 * t[`${s}fta`]
      t[`${s}all_oreb`] = t[`${s}oreb`] + t[`${s}team_oreb`]
    }
    totals.set(team_id, t)
  }
  return { totals, windows, last, through, playoffs, hasPlayoffs }
}
