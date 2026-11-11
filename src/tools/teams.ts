// Team charts: one team stat against another, every team's logo at its
// values for one season, for a curated list of pairs. A pair is data, not
// code, as in Player charts. See docs/plans/2026-10-28-team-charts-design.md
import { max, sum } from "d3"
import { metadata, read, type Row } from "../kit/data"
import { logoUrl } from "../kit/frame"
import { placeLogos } from "../kit/labels"
import { scatterPlot, sign, type Guide } from "../kit/scatter"
import { teams } from "../kit/teams"
import { color } from "../kit/theme"
import type { Body, LegendItem, Mark, Tool } from "../kit/tool"

// season 0 is the latest season the data has; load resolves it. `last` is
// the window: "" for the whole season, or each team's last n games
const defaults = {
  pair: "ratings",
  season: 0,
  playoffs: false,
  last: "",
}
type P = typeof defaults

// A team's totals over the games in view, by column; `opp_` columns are its
// opponents'
type Totals = Record<string, number>

// The datasets a pair can come from. Game logs are summed over a window of
// games, regular season or playoffs; bbref has the regular season's totals;
// yarapm (its own catalog) has each team's players' ratings, as of a day
const sources: Record<
  string,
  { dataset: string; credit: string; catalog?: "yarapm" }
> = {
  logs: { dataset: "team_game_logs", credit: "NBA.com" },
  bbref: { dataset: "bbref_team_stats", credit: "basketball-reference.com" },
  yarapm: {
    dataset: "team_ratings_daily",
    catalog: "yarapm",
    credit: "yarapm",
  },
}
type Src = "logs" | "bbref" | "yarapm"

// A stat: `get` is its value from a team's totals, and the league's from
// the league's. `pct` ticks are percentages, `signed` ones carry a sign;
// `lower` is better, so its axis runs backwards. `tip` writes the value in
// a tooltip and the legend
interface Stat {
  label: string
  short: string
  get(t: Totals): number
  pct?: boolean
  signed?: boolean
  lower?: boolean
  tip(v: number): string
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
const num1 = (v: number) => v.toFixed(1)
const num2 = (v: number) => v.toFixed(2)
const signed1 = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1)}`

// a count per 100 of the team's possessions, or its opponents'
const per100 = (col: string, label: string, short: string): Stat => ({
  label: `${label} per 100 possessions`,
  short: `${short}/100`,
  get: t => (100 * t[col]) / (col.startsWith("opp_") ? t.opp_poss : t.poss),
  tip: num1,
})

// makes over attempts
const shooting = (
  made: string,
  att: string,
  label: string,
  short: string,
  lower = false,
): Stat => ({
  label,
  short,
  get: t => t[made] / t[att],
  pct: true,
  lower,
  tip: pct1,
})

const ortg: Stat = {
  label: "Offensive rating",
  short: "ORtg",
  get: t => (100 * t.pts) / t.poss,
  tip: num1,
}
const drtg: Stat = {
  label: "Defensive rating",
  short: "DRtg",
  get: t => (100 * t.opp_pts) / t.opp_poss,
  lower: true,
  tip: num1,
}
const net: Stat = {
  label: "Net rating",
  short: "Net",
  get: t => ortg.get(t) - drtg.get(t),
  signed: true,
  tip: signed1,
}
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

// yarapm's offense and defense, both signed so positive is good
function yarapm(lineup: "" | "full_", label: string): Record<string, Stat> {
  const side = (col: string, name: string, short: string): Stat => ({
    label: `${name}${label}`,
    short,
    get: t => t[`${lineup}${col}`],
    signed: true,
    tip: signed1,
  })
  return {
    [`yarapm_${lineup}off`]: side("off", "yarapm offense", "O"),
    [`yarapm_${lineup}def`]: side("def", "yarapm defense", "D"),
  }
}

const stats: Record<string, Stat> = {
  ortg,
  drtg,
  net,
  // possessions per 48 minutes, the two teams' averaged, as the NBA counts
  // them
  pace: {
    label: "Pace",
    short: "Pace",
    get: t => (48 * (t.poss + t.opp_poss)) / 2 / t.min,
    tip: num1,
  },
  // wins over those the point differential predicts, by the Pythagorean
  // formula with bbref's exponent
  luck: {
    label: "Wins over expected",
    short: "Wins over exp.",
    get: t => t.wins - t.games / (1 + (t.opp_pts / t.pts) ** 14),
    signed: true,
    tip: signed1,
  },
  sos: {
    label: "Strength of schedule",
    short: "SOS",
    get: t => t.sos_g / t.games,
    signed: true,
    tip: signed1,
  },
  fg3a100: per100("fg3a", "3-point attempts", "3PA"),
  fg3_pct: shooting("fg3m", "fg3a", "3-point %", "3P%"),
  fg2a100: per100("fg2a", "2-point attempts", "2PA"),
  fg2_pct: shooting("fg2m", "fg2a", "2-point %", "2P%"),
  opp_fg3a100: per100("opp_fg3a", "Opponents' 3-point attempts", "Opp 3PA"),
  opp_fg3_pct: shooting(
    "opp_fg3m",
    "opp_fg3a",
    "Opponents' 3-point %",
    "Opp 3P%",
    true,
  ),
  opp_fg2a100: per100("opp_fg2a", "Opponents' 2-point attempts", "Opp 2PA"),
  opp_fg2_pct: shooting(
    "opp_fg2m",
    "opp_fg2a",
    "Opponents' 2-point %",
    "Opp 2P%",
    true,
  ),
  efg: efg(""),
  opp_efg: efg("opp_"),
  ft_rate: ftRate(""),
  opp_ft_rate: ftRate("opp_"),
  fga100: per100("fga", "Shot attempts", "FGA"),
  // a shot from the field or a trip to the line. By the formula, a
  // possession is FGA + 0.44 FTA + TOV − OREB, so this is about 100 plus
  // offensive rebounds less turnovers per 100, counting team offensive
  // rebounds, which the NBA's play-by-play possessions do. Its axes name
  // the stats; "for" and "against" fit the legend
  chances100: { ...per100("chances", "Shot chances", ""), short: "for" },
  opp_chances100: {
    ...per100("opp_chances", "Opponents' shot chances", ""),
    short: "against",
    lower: true,
  },
  pts_per_fga: {
    label: "Points per shot attempt",
    short: "Pts/FGA",
    get: t => t.pts / t.fga,
    tip: num2,
  },
  fg3a_share: {
    label: "Share of shots from three",
    short: "3PA rate",
    get: t => t.fg3a / t.fga,
    pct: true,
    tip: pct1,
  },
  rim_share: {
    label: "Share of shots at the rim (0–3 ft)",
    short: "rim rate",
    get: t => t.rim_fga / t.fga,
    pct: true,
    tip: pct1,
  },
  ast100: per100("ast", "Assists", "AST"),
  tov100: per100("tov", "Turnovers", "TOV"),
  tov100_low: {
    ...per100("tov", "Turnovers", "TOV"),
    lower: true,
  },
  // a team rebound after its own miss keeps the possession as a player's
  // does, but the box score's oreb leaves it out
  oreb100: {
    ...per100("all_oreb", "Offensive rebounds", "OREB"),
    label: "Offensive rebounds, with team rebounds, per 100 possessions",
  },
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
  forced_tov: {
    label: "Opponents' turnovers per 100 possessions",
    short: "Opp TOV/100",
    get: t => (100 * t.opp_tov) / t.opp_poss,
    tip: num1,
  },
  // turnovers both ends, with shorts that fit the legend, as for chances
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
  blk100: {
    label: "Blocks per 100 opponent possessions",
    short: "BLK/100",
    get: t => (100 * t.blk) / t.opp_poss,
    tip: num1,
  },
  // a team's players' ratings, points per 100 possessions better than the
  // average team: at full strength, or with the day's expected lineup
  ...yarapm("full_", ", full strength"),
  ...yarapm("", ", expected lineup"),
  opp_rim_pct: shooting(
    "opp_rim_fgm",
    "opp_rim_fga",
    "Opponents' FG% at the rim",
    "Opp rim FG%",
    true,
  ),
}

// Corners name the quadrants the guides make, as they look: top left, top
// right, bottom left, bottom right
interface Pair {
  name: string
  group: string
  src: Src
  x: string
  y: string
  // the deck's phrase for what's plotted
  deck: string
  corners?: [string, string, string, string]
  // lines of constant y:x, for a pair whose ratio means something
  ratios?: number[]
  // lines of constant x − y, named for that difference, for a side of the
  // ball against its opposite
  diff?: (c: number) => string
  // lines of constant x + y, for offense and defense that add to net
  sum?: boolean
  // ratings as of a day, rather than over the season's games
  asOf?: boolean
  // the first season with the pair's data, if later than its dataset's
  first?: number
}

const ends: [string, string, string, string] = [
  "Defense only",
  "Both ends",
  "Neither end",
  "Offense only",
]

const pairs: Record<string, Pair> = {
  ratings: {
    name: "Offense and defense",
    group: "Offense and defense",
    src: "logs",
    x: "ortg",
    y: "drtg",
    deck: "Points allowed by points scored per 100 possessions",
    corners: ends,
    diff: c => `${sign(c)}${Math.abs(c)}`,
  },
  // a team's players' ratings, not its results. Full strength counts
  // everyone available; the expected lineup, who's likely out
  yarapm: {
    name: "yarapm, full strength",
    group: "Offense and defense",
    src: "yarapm",
    x: "yarapm_full_off",
    y: "yarapm_full_def",
    deck: "Defense by offense from each team's players' yarapm at full strength, points per 100 possessions better than the average team,",
    corners: ends,
    sum: true,
    asOf: true,
  },
  "yarapm-today": {
    name: "yarapm, expected lineup",
    group: "Offense and defense",
    src: "yarapm",
    x: "yarapm_off",
    y: "yarapm_def",
    deck: "Defense by offense from each team's players' yarapm with its expected lineup, counting who's likely out, points per 100 possessions better than the average team,",
    corners: ends,
    sum: true,
    asOf: true,
  },
  pace: {
    name: "Pace and efficiency",
    group: "Offense and defense",
    src: "logs",
    x: "pace",
    y: "ortg",
    deck: "Offensive rating by possessions per 48 minutes",
    corners: [
      "Slow · efficient",
      "Fast · efficient",
      "Slow · inefficient",
      "Fast · inefficient",
    ],
  },
  luck: {
    name: "Luck",
    group: "Offense and defense",
    src: "logs",
    x: "net",
    y: "luck",
    deck: "Wins over those the point differential predicts, by net rating,",
    corners: ["Bad · lucky", "Good · lucky", "Bad · unlucky", "Good · unlucky"],
  },
  schedule: {
    name: "Strength of schedule",
    group: "Offense and defense",
    src: "bbref",
    x: "sos",
    y: "net",
    deck: "Net rating by strength of schedule, points per game,",
    corners: [
      "Easy schedule · good",
      "Hard schedule · good",
      "Easy schedule · bad",
      "Hard schedule · bad",
    ],
  },
  chances: {
    name: "Shot chances, both ends",
    group: "Offense and defense",
    src: "logs",
    x: "chances100",
    y: "opp_chances100",
    deck: "Opponents' shots and trips to the line per 100 possessions by the team's",
    corners: ["Limits theirs", "Both", "Neither", "Gets its own"],
    diff: c => `${sign(c)}${Math.abs(c)}`,
  },
  // where a team's own shot chances come from: OREB − TOV is its chances
  // per 100 less 100, give or take a point. Team offensive rebounds start
  // in 2023
  "oreb-tov": {
    name: "Offensive rebounds and turnovers",
    group: "Offense and defense",
    src: "logs",
    x: "oreb100",
    y: "tov100_low",
    deck: "Turnovers by offensive rebounds per 100 possessions",
    first: 2023,
    corners: ["Protects the ball", "Both", "Neither", "Crashes the glass"],
    diff: c => `${sign(c)}${Math.abs(c)}`,
  },
  // Dean Oliver's four factors, each a side of the ball against its
  // opposite, so the diagonals are the team's margin in it
  efg: {
    name: "Effective FG%, both ends",
    group: "Four factors",
    src: "logs",
    x: "efg",
    y: "opp_efg",
    deck: "Opponents' effective field goal percentage by the team's",
    corners: ends,
    diff: c => `${sign(c)}${+Math.abs(c * 100).toFixed(1)}`,
  },
  // turnovers are the one factor where lower is better on offense, so
  // forced turnovers go on x to keep x − y the margin
  "tov-both": {
    name: "Turnovers, both ends",
    group: "Four factors",
    src: "logs",
    x: "tov_forced",
    y: "tov_committed",
    deck: "Turnovers by opponents' turnovers per 100 possessions",
    corners: ["Protects the ball", "Both", "Neither", "Forces them"],
    diff: c => `${sign(c)}${Math.abs(c)}`,
  },
  rebounding: {
    name: "Offensive rebounding, both ends",
    group: "Four factors",
    src: "logs",
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
    group: "Four factors",
    src: "logs",
    x: "ft_rate",
    y: "opp_ft_rate",
    deck: "Opponents' free throws made per shot attempt by the team's",
    corners: ["Doesn't foul", "Both", "Neither", "Gets to the line"],
    diff: c => `${sign(c)}${+Math.abs(c).toFixed(2)}`,
  },
  threes: {
    name: "Three-point shooting",
    group: "Shooting",
    src: "logs",
    x: "fg3a100",
    y: "fg3_pct",
    deck: "3-point percentage by 3-point attempts per 100 possessions",
    corners: [
      "Few threes · accurate",
      "Many threes · accurate",
      "Few threes · inaccurate",
      "Many threes · inaccurate",
    ],
  },
  twos: {
    name: "Two-point shooting",
    group: "Shooting",
    src: "logs",
    x: "fg2a100",
    y: "fg2_pct",
    deck: "2-point percentage by 2-point attempts per 100 possessions",
    corners: [
      "Few twos · accurate",
      "Many twos · accurate",
      "Few twos · inaccurate",
      "Many twos · inaccurate",
    ],
  },
  "opp-threes": {
    name: "Three-point defense",
    group: "Shooting",
    src: "logs",
    x: "opp_fg3a100",
    y: "opp_fg3_pct",
    deck: "Opponents' 3-point percentage by their 3-point attempts per 100 possessions",
    corners: [
      "Few allowed · missed",
      "Many allowed · missed",
      "Few allowed · made",
      "Many allowed · made",
    ],
  },
  "opp-twos": {
    name: "Two-point defense",
    group: "Shooting",
    src: "logs",
    x: "opp_fg2a100",
    y: "opp_fg2_pct",
    deck: "Opponents' 2-point percentage by their 2-point attempts per 100 possessions",
    corners: [
      "Few allowed · missed",
      "Many allowed · missed",
      "Few allowed · made",
      "Many allowed · made",
    ],
  },
  shots: {
    name: "Shot volume and shotmaking",
    group: "Shooting",
    src: "logs",
    x: "fga100",
    y: "pts_per_fga",
    deck: "Points per shot attempt by shot attempts per 100 possessions",
    corners: [
      "Few shots · makes them",
      "Many shots · makes them",
      "Few shots · misses",
      "Many shots · misses",
    ],
  },
  profile: {
    name: "Shot profile",
    group: "Shooting",
    src: "bbref",
    x: "fg3a_share",
    y: "rim_share",
    deck: "Share of shots at the rim by share from three",
    corners: ["The rim", "Threes and the rim", "Midrange", "Threes"],
  },
  "ast-tov": {
    name: "Assists to turnovers",
    group: "Playmaking",
    src: "logs",
    x: "tov100",
    y: "ast100",
    deck: "Assists by turnovers per 100 possessions",
    ratios: [1.5, 2, 2.5],
  },
  turnovers: {
    name: "Forcing turnovers",
    group: "Defense",
    src: "logs",
    x: "forced_tov",
    y: "drtg",
    deck: "Defensive rating by opponents' turnovers per 100 possessions",
    corners: [
      "Good defense · few turnovers",
      "Good defense · turnovers",
      "Bad defense · few turnovers",
      "Bad defense · turnovers",
    ],
  },
  rim: {
    name: "Rim protection",
    group: "Defense",
    src: "bbref",
    x: "blk100",
    y: "opp_rim_pct",
    deck: "Opponents' field goal percentage at the rim by blocks per 100 possessions",
    corners: [
      "Few blocks · rim held",
      "Blocks · rim held",
      "Few blocks · rim open",
      "Blocks · rim open",
    ],
  },
}

interface Team {
  abbrev: string
  name: string
  games: number
  x: number
  y: number
}

interface D {
  pair: string
  season: number
  seasons: number[]
  latest: number
  playoffs: boolean
  // whether the season has playoff games yet; without them, no toggle
  hasPlayoffs: boolean
  last: string
  // the windows the season has, in slider order: none for bbref's pairs
  windows: { value: string; label: string }[]
  teams: Team[]
  league: { x: number; y: number }
  through?: Date
}

const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })

const pairOf = (id: string) => pairs[id] ?? pairs[defaults.pair]

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

// each team's totals over its games in the window, joined to its
// opponents' in the same games
async function loadLogs(season: number, p: P) {
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

// bbref's season totals, its shares turned back into counts, so the league's
// rates come from its totals too
async function loadBbref(season: number) {
  const rows = await read("bbref", "bbref_team_stats", season, [
    "team_id",
    "g",
    "min",
    "pace",
    "pts",
    "opp_pts",
    "fga",
    "fg3a",
    "blk",
    "sos",
    "pct_fga_00_03",
    "opp_fga",
    "opp_pct_fga_00_03",
    "opp_fg_pct_00_03",
  ])
  const totals = new Map<string, Totals>()
  for (const r of rows) {
    // bbref's possessions, as its per-100 table counts them
    const poss = (r.pace * r.min) / 240
    const oppRim = r.opp_pct_fga_00_03 * r.opp_fga
    totals.set(r.team_id, {
      games: r.g,
      pts: r.pts,
      opp_pts: r.opp_pts,
      poss,
      opp_poss: poss,
      fga: r.fga,
      fg3a: r.fg3a,
      blk: r.blk,
      sos_g: r.sos * r.g,
      rim_fga: r.pct_fga_00_03 * r.fga,
      opp_rim_fga: oppRim,
      opp_rim_fgm: r.opp_fg_pct_00_03 * oppRim,
    })
  }
  return {
    totals,
    windows: [],
    last: "",
    through: undefined,
    playoffs: false,
    hasPlayoffs: false,
  }
}

// A team-season's ratings from yarapm's latest day: its last build for this
// season, the day after the Finals for a past one. Already against the
// average team; the games are the NBA's regular season's
async function loadYarapm(season: number, p: P) {
  const [ratings, logs] = await Promise.all([
    read("yarapm", "team_ratings_daily", season, [
      "as_of_date",
      "team_id",
      "off",
      "def",
      "full_off",
      "full_def",
    ]),
    loadLogs(season, { ...p, playoffs: false, last: "" }),
  ])
  const through = max(ratings, r => r.as_of_date as Date)
  const totals = new Map<string, Totals>()
  for (const r of ratings) {
    if (+r.as_of_date !== +through!) continue
    totals.set(r.team_id, {
      games: logs.totals.get(r.team_id)?.games ?? 0,
      off: r.off,
      def: r.def,
      full_off: r.full_off,
      full_def: r.full_def,
    })
  }
  return {
    totals,
    windows: [],
    last: "",
    through,
    playoffs: false,
    hasPlayoffs: false,
  }
}

export const teamCharts: Tool<P, D> = {
  id: "teams",
  name: "Team charts",
  defaults,

  async load(p) {
    const id = pairs[p.pair] ? p.pair : defaults.pair
    const pair = pairs[id]
    const [sx, sy] = [stats[pair.x], stats[pair.y]]
    const meta = await metadata(sources[pair.src].catalog)
    const { last_season } = meta[sources[pair.src].dataset]
    const first_season = Math.max(
      meta[sources[pair.src].dataset].first_season,
      pair.first ?? 0,
    )
    const season = Math.min(
      last_season,
      Math.max(first_season, p.season || last_season),
    )
    const [loaded, names] = await Promise.all([
      pair.src === "bbref"
        ? loadBbref(season)
        : pair.src === "yarapm"
          ? loadYarapm(season, p)
          : loadLogs(season, p),
      read("stats", "team_seasons", season, [
        "team_id",
        "nba_abbrev",
        "full_name",
      ]),
    ])
    const byId = new Map(names.map(t => [t.team_id, t]))
    const shown: Team[] = []
    for (const [team_id, t] of loaded.totals) {
      const info = byId.get(team_id)
      const [x, y] = [sx.get(t), sy.get(t)]
      if (!info || !isFinite(x) || !isFinite(y)) continue
      shown.push({
        abbrev: info.nba_abbrev,
        name: info.full_name,
        games: t.games,
        x,
        y,
      })
    }
    // the league's totals, for its averages
    const all = [...loaded.totals.values()]
    const league: Totals = {}
    for (const k of Object.keys(all[0] ?? {})) league[k] = sum(all, t => t[k])

    const seasons = []
    for (let s = last_season; s >= first_season; s--) seasons.push(s)
    return {
      pair: id,
      season,
      seasons,
      latest: last_season,
      playoffs: loaded.playoffs,
      hasPlayoffs: loaded.hasPlayoffs,
      last: loaded.last,
      windows: loaded.windows,
      teams: shown,
      league: all.length
        ? { x: sx.get(league), y: sy.get(league) }
        : { x: 0, y: 0 },
      through: loaded.through,
    }
  },

  normalize(d, p) {
    return {
      ...p,
      pair: d.pair,
      season: d.season,
      playoffs: d.playoffs,
      last: d.last,
    }
  },

  controls(d) {
    return [
      {
        key: "pair",
        label: "Stats",
        kind: "select",
        options: Object.entries(pairs).map(([id, pr]) => ({
          value: id,
          label: pr.name,
          group: pr.group,
        })),
      },
      {
        key: "season",
        label: "Season",
        kind: "select",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      ...(d.hasPlayoffs
        ? [{ key: "playoffs", label: "Playoffs", kind: "toggle" as const }]
        : []),
      ...(d.windows.length > 1
        ? [
            {
              key: "last",
              label: "Games",
              kind: "steps" as const,
              options: d.windows,
            },
          ]
        : []),
    ]
  },

  describe(d) {
    const pair = pairOf(d.pair)
    const [sx, sy] = [stats[pair.x], stats[pair.y]]
    const kind = d.playoffs ? "playoffs" : "regular season"
    const current = d.season === d.latest && d.through
    // ratings as of a day: a past season's are its final ones
    const span = pair.asOf
      ? current
        ? `as of ${fmtDate(d.through!)}`
        : `at the end of the ${fmtSeason(d.season)} season`
      : !d.last
        ? `in the ${fmtSeason(d.season)} ${kind}`
        : `over each team's last ${d.last} games of the ${fmtSeason(d.season)} ${kind}`
    // a past season's last date is the end of the season, which says nothing
    const through =
      current && !pair.asOf ? `, through ${fmtDate(d.through!)}` : ""
    // with both axes signed, the averages are the zero lines
    const reference: LegendItem[] = pair.ratios
      ? [
          {
            symbol: "dash",
            color: color.muted,
            text: `league: ${(d.league.y / d.league.x).toFixed(2)} ${sy.short} per ${sx.short}`,
          },
        ]
      : sx.signed && sy.signed
        ? []
        : [
            {
              symbol: "dash",
              color: color.muted,
              text: `avg ${sx.tip(d.league.x)} ${sx.short}, ${sy.tip(d.league.y)} ${sy.short}`,
            },
          ]
    const most = max(d.teams, t => t.games) ?? 0
    return {
      title: pair.name,
      context: `${pair.deck} ${span}${through}`,
      legend: [
        ...reference,
        ...(pair.diff
          ? [
              {
                symbol: "line" as const,
                color: color.faint,
                text: `diagonals: ${sx.short} − ${sy.short}`,
              },
            ]
          : []),
        ...(pair.sum
          ? [
              {
                symbol: "line" as const,
                color: color.faint,
                text: `diagonals: net, ${sx.short} + ${sy.short}`,
              },
            ]
          : []),
      ],
      counts: `${most} games`,
      source: `Data: ${sources[pair.src].credit}`,
    }
  },

  render(node, d, _p, size): Body {
    const pair = pairOf(d.pair)
    const [sx, sy] = [stats[pair.x], stats[pair.y]]
    const logo = Math.round(Math.max(22, Math.min(32, size.width / 26)))
    const r = 3.5
    const guide: Guide = pair.ratios
      ? { kind: "ratios", ratios: pair.ratios, zero: false }
      : pair.diff
        ? { kind: "diff", name: pair.diff }
        : pair.sum
          ? { kind: "sum" }
          : { kind: "average" }
    const { plot, x, y, plotW, plotH, left, top, body } = scatterPlot(node, {
      size,
      x: { title: sx.label, pct: sx.pct, signed: sx.signed, reverse: sx.lower },
      y: { title: sy.label, pct: sy.pct, signed: sy.signed, reverse: sy.lower },
      xs: d.teams.map(t => t.x),
      ys: d.teams.map(t => t.y),
      league: d.league,
      guide,
      corners: pair.corners,
      inset: logo / 2,
    })

    const dots = d.teams.map(t => ({
      key: t.abbrev,
      x: x(t.x),
      y: y(t.y),
      r,
    }))
    const at = placeLogos(dots, { width: plotW, height: plotH }, logo)

    // leaders from a moved logo back to its dot, ending at the logo's edge
    const leaders = plot
      .append("g")
      .attr("stroke", color.muted)
      .attr("stroke-width", 1)
    const marks: Mark[] = []
    const logos = plot.append("g")
    for (const [i, t] of d.teams.entries()) {
      const dot = dots[i]
      const [cx, cy] = at.get(t.abbrev)!
      const [dx, dy] = [dot.x - cx, dot.y - cy]
      // a logo on its value marks it; a moved one leaves a dot there, and a
      // line to it
      if (Math.hypot(dx, dy) > logo / 2) {
        const k = Math.min(
          1,
          ((logo / 2) * 0.8) / Math.abs(dx || 1e-9),
          ((logo / 2) * 0.8) / Math.abs(dy || 1e-9),
        )
        leaders
          .append("line")
          .attr("x1", dot.x)
          .attr("y1", dot.y)
          .attr("x2", cx + dx * k)
          .attr("y2", cy + dy * k)
        const [fill, stroke] = teams.get(t.abbrev)?.colors ?? []
        plot
          .insert("circle", () => logos.node())
          .attr("cx", dot.x)
          .attr("cy", dot.y)
          .attr("r", r)
          .attr("fill", fill ?? color.ink)
          .attr("stroke", stroke ?? color.bg)
          .attr("stroke-width", 1)
      }
      logos
        .append("image")
        .attr("href", logoUrl(t.abbrev))
        .attr("x", cx - logo / 2)
        .attr("y", cy - logo / 2)
        .attr("width", logo)
        .attr("height", logo)
        .append("title")
        .text(
          `${t.name}\n${sx.tip(t.x)} ${sx.short} · ${sy.tip(t.y)} ${sy.short} · ${t.games} games`,
        )
      marks.push({
        key: t.abbrev,
        x: cx + left,
        y: cy + top,
        r: logo / 2,
        label: t.abbrev,
        labelSize: 12.5,
      })
    }

    if (!d.teams.length)
      plot
        .append("text")
        .attr("x", plotW / 2)
        .attr("y", plotH / 2)
        .attr("text-anchor", "middle")
        .attr("fill", color.muted)
        .text("No games yet")

    return body(marks)
  },
}
