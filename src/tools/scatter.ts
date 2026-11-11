// Player charts: one stat against another, one dot per player, for a
// curated list of pairs. A pair is data, not code: two stats, the volume stat
// that ranks players for "Top %", and its reference lines and quadrant names.
// A chart that needs a new kind of mark is a new tool. See issue #29 and the
// "Player scatter" milestone
import { format, max, min, quantile, sum } from "d3"
import { lookups, metadata, read, type Row } from "../kit/data"
import { placeLabels } from "../kit/labels"
import { scatterPlot } from "../kit/scatter"
import { teams } from "../kit/teams"
import { color, type } from "../kit/theme"
import type { Body, LegendItem, Mark, Tool } from "../kit/tool"

// seasons 0 are the latest season the data has; load resolves them
const defaults = {
  pair: "ast-tov",
  from: 0,
  to: 0,
  kind: "regular_season",
  team: "",
  top: 25,
}
type P = typeof defaults

// The datasets a stat can come from, whether they split the regular season
// from the playoffs, and who to credit. Every pair also reads
// player_season_stats, for teams, games and the volume behind Top %.
// `catalog` is where the dataset is, nba_data's or yarapm's; a `daily` one
// has a row per player per day, and a player's season is their last day's
interface Source {
  source: string
  dataset: string
  kinds: boolean
  credit: string
  catalog?: "yarapm"
  daily?: boolean
}
const sources = {
  stats: {
    source: "stats",
    dataset: "player_season_stats",
    kinds: true,
    credit: "NBA.com",
  },
  net: {
    source: "espn",
    dataset: "net_pts_season",
    kinds: true,
    credit: "ESPN",
  },
  // fitted on the regular season and playoffs together
  openrapm: {
    source: "openrapm",
    dataset: "openrapm",
    kinds: false,
    credit: "OpenRAPM",
  },
  // each day's ratings from the games before it, older games weighted
  // less, over the regular season and playoffs together
  yarapm: {
    source: "yarapm",
    dataset: "ratings_daily",
    kinds: false,
    credit: "yarapm",
    catalog: "yarapm",
    daily: true,
  },
  epm: {
    source: "dunksandthrees",
    dataset: "epm",
    kinds: true,
    credit: "dunksandthrees.com",
  },
} satisfies Record<string, Source>
type Src = keyof typeof sources

// A stat: `get` is a player's value, from their row in the stat's dataset,
// and `league` the league's, computed from totals rather than as a mean of
// the players' rates. `pct` ticks are percentages, `signed` ones carry a
// sign, and others take the scale's format; `tip` writes the value in a
// tooltip and the legend
interface Stat {
  src?: Src
  label: string
  short: string
  cols: string[]
  get(r: Row): number | null
  league(rows: Row[]): number
  pct?: boolean
  signed?: boolean
  tip(v: number): string
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
const num = format(",")
const num1 = (v: number) => v.toFixed(1)
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "")
const signed1 = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1)}`
const minutes = (rows: Row[]) => sum(rows, r => r.min)

// a season total, as counted
const total = (col: string, label: string, short: string): Stat => ({
  label,
  short,
  cols: [col],
  get: r => r[col],
  league: rows => sum(rows, r => r[col]),
  tip: num,
})

// a total per 36 minutes
const per36 = (col: string, label: string, short: string): Stat => ({
  label: `${label} per 36 minutes`,
  short: `${short}/36`,
  cols: [col],
  get: r => (r.min > 0 ? (r[col] / r.min) * 36 : null),
  league: rows => (sum(rows, r => r[col]) / minutes(rows)) * 36,
  tip: num1,
})

// a share of the plays while the player is on the court, like rebound
// percentage: the league's is the mean over minutes played
const rate = (col: string, label: string, short: string): Stat => ({
  label,
  short,
  cols: [col],
  get: r => r[col],
  league: rows =>
    sum(rows, r => (r[col] == null ? 0 : r[col] * r.min)) /
    sum(rows, r => (r[col] == null ? 0 : r.min)),
  pct: true,
  tip: pct1,
})

// a shooting percentage: the league's is its makes over its attempts
const shooting = (
  col: string,
  made: string,
  att: string,
  label: string,
  short: string,
): Stat => ({
  label,
  short,
  cols: [col, made, att],
  get: r => (r[att] > 0 ? r[col] : null),
  league: rows => sum(rows, r => r[made]) / sum(rows, r => r[att]),
  pct: true,
  tip: pct1,
})

// a rating in points per 100 possessions, where zero is average
const rating = (src: Src, col: string, label: string, short: string): Stat => ({
  src,
  label,
  short,
  cols: [col],
  get: r => r[col],
  league: () => 0,
  signed: true,
  tip: signed1,
})

// ESPN's net points per 100 of the team's possessions on one side of the
// ball, as ESPN computes it
const netPer100 = (side: "o" | "d", label: string, short: string): Stat => ({
  src: "net",
  label,
  short,
  cols: [`${side}_net_pts`, `${side}_team_poss`],
  get: r =>
    r[`${side}_team_poss`] > 0
      ? (r[`${side}_net_pts`] / r[`${side}_team_poss`]) * 100
      : null,
  league: rows =>
    (sum(rows, r => r[`${side}_net_pts`]) /
      sum(rows, r => r[`${side}_team_poss`])) *
    100,
  signed: true,
  tip: signed1,
})

const stats: Record<string, Stat> = {
  ast: total("ast", "Assists", "AST"),
  tov: total("tov", "Turnovers", "TOV"),
  fga: total("fga", "Field goal attempts", "FGA"),
  fta: total("fta", "Free throw attempts", "FTA"),
  fga36: per36("fga", "Shot attempts", "FGA"),
  oreb_pct: rate("oreb_pct", "Offensive rebound %", "OREB%"),
  dreb_pct: rate("dreb_pct", "Defensive rebound %", "DREB%"),
  stl36: per36("stl", "Steals", "STL"),
  blk36: per36("blk", "Blocks", "BLK"),
  fg3a36: per36("fg3a", "3-point attempts", "3PA"),
  fg3_pct: shooting("fg3_pct", "fg3m", "fg3a", "3-point %", "3P%"),
  fg2a36: per36("fg2a", "2-point attempts", "2PA"),
  fg2_pct: shooting("fg2_pct", "fg2m", "fg2a", "2-point %", "2P%"),
  // a player on the floor uses a fifth of his team's possessions
  usg_pct: { ...rate("usg_pct", "Usage rate", "USG"), league: () => 0.2 },
  ts_pct: {
    label: "True shooting",
    short: "TS",
    cols: ["ts_pct", "pts", "fga", "fta"],
    get: r => r.ts_pct,
    league: rows =>
      sum(rows, r => r.pts) /
      (2 * (sum(rows, r => r.fga) + 0.44 * sum(rows, r => r.fta))),
    pct: true,
    tip: pct1,
  },
  // a three counts one and a half makes
  efg_pct: {
    label: "Effective field goal %",
    short: "eFG%",
    cols: ["efg_pct", "fgm", "fg3m", "fga"],
    get: r => (r.fga > 0 ? r.efg_pct : null),
    league: rows =>
      (sum(rows, r => r.fgm) + 0.5 * sum(rows, r => r.fg3m)) /
      sum(rows, r => r.fga),
    pct: true,
    tip: pct1,
  },
  o_net: netPer100("o", "Offensive net points per 100", "O-NET"),
  d_net: netPer100("d", "Defensive net points per 100", "D-NET"),
  o_openrapm: rating("openrapm", "o_rating", "Offensive RAPM", "O-RAPM"),
  d_openrapm: rating("openrapm", "d_rating", "Defensive RAPM", "D-RAPM"),
  o_yarapm: rating("yarapm", "o_rating", "Offensive yarapm", "O-YARAPM"),
  d_yarapm: rating("yarapm", "d_rating", "Defensive yarapm", "D-YARAPM"),
  o_epm: rating("epm", "o_epm", "Offensive EPM", "O-EPM"),
  d_epm: rating("epm", "d_epm", "Defensive EPM", "D-EPM"),
}
const srcOf = (s: Stat): Src => s.src ?? "stats"

// Corners name the quadrants the league averages make: top left, top right,
// bottom left, bottom right. A pair with `ratios` instead draws lines of
// constant y:x through zero, and the league's ratio, dashed. A `total` pair,
// offense against defense, quarters at zero (the league's average) and
// draws lines of constant x + y
interface Pair {
  name: string
  group: string
  x: string
  y: string
  // the column that ranks players for Top %, and its name in the deck
  volume: string
  volumeName: string
  // the deck's phrase for what's plotted
  deck: string
  corners?: [string, string, string, string]
  ratios?: number[]
  // the league's ratio, in words, for the legend
  ratioText?: (k: number) => string
  total?: boolean
}

const ends: [string, string, string, string] = [
  "Defense only",
  "Both ends",
  "Neither end",
  "Offense only",
]

const pairs: Record<string, Pair> = {
  "usg-ts": {
    name: "Shooting by usage",
    group: "Shooting",
    x: "usg_pct",
    y: "ts_pct",
    volume: "fga",
    volumeName: "shot attempts",
    deck: "True shooting by usage rate",
    corners: [
      "Low usage · efficient",
      "High usage · efficient",
      "Low usage · inefficient",
      "High usage · inefficient",
    ],
  },
  shots: {
    name: "Shot volume and shotmaking",
    group: "Shooting",
    x: "fga36",
    y: "efg_pct",
    volume: "fga",
    volumeName: "shot attempts",
    deck: "Effective field goal % by shot attempts per 36 minutes",
    corners: [
      "Few shots · makes them",
      "Many shots · makes them",
      "Few shots · misses",
      "Many shots · misses",
    ],
  },
  threes: {
    name: "Three-point shooting",
    group: "Shooting",
    x: "fg3a36",
    y: "fg3_pct",
    volume: "fg3a",
    volumeName: "3-point attempts",
    deck: "3-point percentage by 3-point attempts per 36 minutes",
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
    x: "fg2a36",
    y: "fg2_pct",
    volume: "fg2a",
    volumeName: "2-point attempts",
    deck: "2-point percentage by 2-point attempts per 36 minutes",
    corners: [
      "Few twos · accurate",
      "Many twos · accurate",
      "Few twos · inaccurate",
      "Many twos · inaccurate",
    ],
  },
  "fta-fga": {
    name: "Free throw rate",
    group: "Shooting",
    x: "fga",
    y: "fta",
    volume: "fga",
    volumeName: "shot attempts",
    deck: "Free throw attempts by field goal attempts",
    ratios: [1 / 2, 1 / 4, 1 / 8],
    ratioText: k => `league: ${k.toFixed(2)} FTA per FGA`,
  },
  "ast-tov": {
    name: "Assists to turnovers",
    group: "Playmaking",
    x: "tov",
    y: "ast",
    volume: "min",
    volumeName: "minutes",
    deck: "Assists by turnovers",
    ratios: [1, 2, 3, 4],
    ratioText: k => `league: ${k.toFixed(1)} assists per turnover`,
  },
  rebounding: {
    name: "Rebounding",
    group: "Rebounding",
    x: "dreb_pct",
    y: "oreb_pct",
    volume: "min",
    volumeName: "minutes",
    deck: "Offensive by defensive rebound percentage",
    corners: [
      "Offensive glass",
      "Both glasses",
      "Neither glass",
      "Defensive glass",
    ],
  },
  "stl-blk": {
    name: "Steals and blocks",
    group: "Defense",
    x: "stl36",
    y: "blk36",
    volume: "min",
    volumeName: "minutes",
    deck: "Blocks by steals per 36 minutes",
    corners: ["Blocks", "Steals and blocks", "Neither", "Steals"],
  },
  net: {
    name: "Net points",
    group: "Offense and defense",
    x: "o_net",
    y: "d_net",
    volume: "min",
    volumeName: "minutes",
    deck: "Defensive by offensive net points per 100 possessions",
    corners: ends,
    total: true,
  },
  openrapm: {
    name: "OpenRAPM",
    group: "Offense and defense",
    x: "o_openrapm",
    y: "d_openrapm",
    volume: "min",
    volumeName: "regular season minutes",
    deck: "Defensive by offensive RAPM, points per 100 possessions,",
    corners: ends,
    total: true,
  },
  yarapm: {
    name: "yarapm",
    group: "Offense and defense",
    x: "o_yarapm",
    y: "d_yarapm",
    volume: "min",
    volumeName: "regular season minutes",
    deck: "Defensive by offensive yarapm, points per 100 possessions, each player's latest rating",
    corners: ends,
    total: true,
  },
  epm: {
    name: "EPM",
    group: "Offense and defense",
    x: "o_epm",
    y: "d_epm",
    volume: "min",
    volumeName: "minutes",
    deck: "Defensive by offensive EPM, points per 100 possessions,",
    corners: ends,
    total: true,
  },
}

interface Player {
  // player_id:season, so a span of seasons can hold a player more than once
  key: string
  player_id: string
  season: number
  name: string
  // their last team, whose colors they wear unless a team they played for
  // earlier is highlighted
  team: string
  // every team they played for, in order: more than one for a player
  // traded during the season. Only filled in when a team is highlighted
  teams: string[]
  gp: number
  volume: number
  x: number
  y: number
}

interface D {
  pair: string
  from: number
  to: number
  // every season the pair's data has, oldest first
  seasons: number[]
  latest: number
  kind: string
  // empty for a pair whose data doesn't split the regular season from the
  // playoffs
  kinds: string[]
  players: Player[]
  // the league's x and y, from every player's totals
  league: { x: number; y: number }
  teams: Map<string, string>
  lastDate?: Date
  // the data's sources, for the footer
  credit: string
}

const kindNames: Record<string, string> = {
  regular_season: "regular season",
  playoffs: "playoffs",
}
const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
// a team's primary and secondary colors, for a dot's fill and outline
function teamColors(abbrev: string): [string, string] {
  const c = teams.get(abbrev)?.colors ?? []
  return [c[0] ?? color.ink, c[1] ?? color.bg]
}

// pairs that were renamed, so old links still work
const renamed: Record<string, string> = { rapm: "openrapm" }
const pairId = (id: string) =>
  pairs[id] ? id : pairs[renamed[id]] ? renamed[id] : defaults.pair
const pairOf = (id: string) => pairs[pairId(id)]

// the highlighted teams, from a comma-separated param
const picked = (p: P) => p.team.split(",").filter(Boolean)

// The shooting chart's two headline facts, for the front page's caption:
// who uses the most of their team's offense, and who's most efficient among
// those who use more than average. For the usg-ts pair, where x is usage and
// y is true shooting
export function leaders(d: D, p: P) {
  const ps = shown(d, p)
  const busiest = max(ps, pl => pl.x)
  const usage = ps.find(pl => pl.x === busiest)
  const heavy = ps.filter(pl => pl.x > d.league.x)
  const best = max(heavy, pl => pl.y)
  const efficient = heavy.find(pl => pl.y === best)
  return { usage, efficient, games: max(d.players, pl => pl.gp) ?? 0 }
}

// the players with the most volume: the top `top` percent of those with any
function shown(d: D, p: P) {
  const some = d.players.filter(pl => pl.volume > 0)
  const cut = quantile(some, 1 - p.top / 100, pl => pl.volume) ?? 0
  return some.filter(pl => pl.volume >= cut)
}

export const scatter: Tool<P, D> = {
  id: "scatter",
  name: "Player charts",
  defaults,

  async load(p) {
    const id = pairId(p.pair)
    const pair = pairs[id]
    const [sx, sy] = [stats[pair.x], stats[pair.y]]
    const srcs = [...new Set<Src>(["stats", srcOf(sx), srcOf(sy)])]
    // the seasons every dataset the pair reads has, and the span nearest
    // the one asked for
    const metas = await Promise.all(
      srcs.map(s => metadata((sources[s] as Source).catalog)),
    )
    const info = srcs.map((s, i) => metas[i][sources[s].dataset])
    const first = max(info, m => m.first_season)!
    const last = min(info, m => m.last_season)!
    const clamp = (s: number) => Math.min(last, Math.max(first, s))
    const to = clamp(p.to || last)
    const from = clamp(p.from || to)
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const span: number[] = []
    for (let s = lo; s <= hi; s++) span.push(s)
    const split = srcs.every(s => sources[s].kinds)

    // each dataset's columns: its stats', and the stats dataset's own
    const cols = new Map<Src, Set<string>>(
      srcs.map(s => [
        s,
        new Set([
          "player_id",
          ...(sources[s].kinds ? ["season_type"] : []),
          ...((sources[s] as Source).daily ? ["as_of_date"] : []),
        ]),
      ]),
    )
    for (const c of ["team_id", "team_count", "gp", "min", pair.volume])
      cols.get("stats")!.add(c)
    for (const st of [sx, sy])
      for (const c of st.cols) cols.get(srcOf(st))!.add(c)
    const tables = await Promise.all(
      span.map(season =>
        Promise.all([
          lookups(season),
          ...srcs.map(s =>
            read(sources[s].source, sources[s].dataset, season, [
              ...cols.get(s)!,
            ]),
          ),
        ]),
      ),
    )
    const lkTo = tables.at(-1)![0]
    const kinds = split
      ? [
          ...new Set(
            tables.flatMap(([, own]) =>
              own.map((r: Row) => r.season_type as string),
            ),
          ),
        ].sort()
      : []
    // a pair that doesn't split them takes its teams and minutes from the
    // regular season
    const kind = kinds.includes(p.kind)
      ? p.kind
      : (kinds[0] ?? "regular_season")

    const seasons = await Promise.all(
      span.map(async (season, i) => {
        const [lk, ...ts] = tables[i]
        const data = new Map(srcs.map((s, j) => [s, ts[j]]))
        // a franchise is one team across the span, under its latest
        // abbreviation
        const abbrev = (teamId: string) =>
          lkTo.teams.get(teamId)?.nba_abbrev ??
          lk.teams.get(teamId)?.nba_abbrev ??
          ""
        // a daily dataset's last day: a finished season's final ratings
        for (const s of srcs) {
          if (!(sources[s] as Source).daily) continue
          const rows = data.get(s)!
          const day = max(rows, r => +r.as_of_date)
          data.set(
            s,
            rows.filter(r => +r.as_of_date === day),
          )
        }
        const rowsOf = (s: Src) =>
          sources[s].kinds
            ? data.get(s)!.filter(r => r.season_type === kind)
            : data.get(s)!
        const byPlayer = (s: Src) =>
          new Map(rowsOf(s).map(r => [r.player_id, r]))
        const [rx, ry] = [byPlayer(srcOf(sx)), byPlayer(srcOf(sy))]

        // with a team highlighted, every team each traded player played
        // for, so the team's highlight includes the players it traded away
        const own = rowsOf("stats")
        const teamsOf = new Map<string, string[]>()
        if (p.team && own.some(r => r.team_count > 1)) {
          const logs = await read("stats", "player_game_logs", season, [
            "player_id",
            "team_id",
            "game_id",
          ])
          const traded = new Set(
            own.filter(r => r.team_count > 1).map(r => r.player_id),
          )
          const games = logs
            .filter(
              g =>
                traded.has(g.player_id) &&
                lk.games.get(g.game_id)?.game_type === kind,
            )
            .sort(
              (a, b) =>
                +lk.games.get(a.game_id)!.game_date -
                +lk.games.get(b.game_id)!.game_date,
            )
          for (const g of games) {
            const list = teamsOf.get(g.player_id) ?? []
            if (list.at(-1) !== abbrev(g.team_id)) list.push(abbrev(g.team_id))
            teamsOf.set(g.player_id, list)
          }
        }

        const players: Player[] = []
        for (const r of own) {
          const [ox, oy] = [rx.get(r.player_id), ry.get(r.player_id)]
          const x = ox && sx.get(ox)
          const y = oy && sy.get(oy)
          if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue
          players.push({
            key: `${r.player_id}:${season}`,
            player_id: r.player_id,
            season,
            name: lk.players.get(r.player_id) ?? r.player_id,
            team: abbrev(r.team_id),
            teams: teamsOf.get(r.player_id) ?? [abbrev(r.team_id)],
            gp: r.gp,
            volume: r[pair.volume] ?? 0,
            x,
            y,
          })
        }
        return { players, xs: rowsOf(srcOf(sx)), ys: rowsOf(srcOf(sy)) }
      }),
    )

    const names = new Map(
      [...lkTo.teams.values()]
        .filter(t => t.is_nba)
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map(t => [t.nba_abbrev as string, t.full_name as string]),
    )
    const lastDate = max(
      [...lkTo.games.values()].filter(g =>
        split ? g.game_type === kind : g.game_type !== "preseason",
      ),
      g => g.game_date as Date,
    )
    const all = []
    for (let s = first; s <= last; s++) all.push(s)
    return {
      pair: id,
      from: lo,
      to: hi,
      seasons: all,
      latest: last,
      kind,
      kinds,
      players: seasons.flatMap(s => s.players),
      // the league's, over every season in the span
      league: {
        x: sx.league(seasons.flatMap(s => s.xs)),
        y: sy.league(seasons.flatMap(s => s.ys)),
      },
      teams: names,
      lastDate,
      credit: srcs.map(s => sources[s].credit).join(", "),
    }
  },

  normalize(d, p) {
    return {
      ...p,
      pair: d.pair,
      from: d.from,
      to: d.to,
      kind: d.kind,
      team: picked(p)
        .filter(t => d.teams.has(t))
        .join(","),
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
        key: "from",
        keyTo: "to",
        label: "Seasons",
        kind: "span",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      ...(d.kinds.length
        ? [
            {
              key: "kind",
              label: "Games",
              kind: "select" as const,
              options: d.kinds.map(k => ({
                value: k,
                label: kindNames[k] ?? k,
              })),
            },
          ]
        : []),
      {
        key: "team",
        label: "Teams",
        kind: "multi",
        none: "All teams",
        max: 5,
        options: [...d.teams].map(([abbrev, name]) => ({
          value: abbrev,
          label: name,
        })),
      },
      {
        key: "top",
        label: "Top %",
        kind: "range",
        min: 5,
        max: 100,
        step: 5,
      },
    ]
  },

  describe(d, p) {
    const pair = pairOf(d.pair)
    const [sx, sy] = [stats[pair.x], stats[pair.y]]
    const ps = shown(d, p)
    const sel = picked(p)
    // one team's chart is about that team, and takes its name and colors
    const team = sel.length === 1 ? d.teams.get(sel[0]) : undefined
    // a team's dots include the players it traded, and those it traded for
    const traded = (t: string) =>
      ps.some(pl => pl.teams.length > 1 && pl.teams.includes(t))
    const one = d.from === d.to
    const games = max(d.players, pl => pl.gp) ?? 0
    const through =
      d.to === d.latest && d.lastDate ? `, through ${fmtDate(d.lastDate)}` : ""
    const reference: LegendItem = pair.ratios
      ? {
          symbol: "dash",
          color: color.muted,
          text: pair.ratioText!(d.league.y / d.league.x),
        }
      : pair.total
        ? {
            symbol: "line",
            color: color.faint,
            text: `diagonals: ${sx.short} + ${sy.short}`,
          }
        : {
            symbol: "dash",
            color: color.muted,
            text: `league avg: ${sx.tip(d.league.x)} ${sx.short}, ${sy.tip(d.league.y)} ${sy.short}`,
          }
    // a pair that doesn't split the season covers all of it
    const kind = d.kinds.length
      ? (kindNames[d.kind] ?? d.kind)
      : "regular season and playoffs"
    const when = one
      ? `in the ${fmtSeason(d.to)} ${kind}`
      : `over the ${fmtSeason(d.from)} to ${fmtSeason(d.to)} ${kind.replace("season", "seasons")}`
    return {
      title: team ?? pair.name,
      context: `${pair.deck} ${when}${through}. The top ${p.top}% of ${one ? "players" : "player-seasons"} by ${pair.volumeName}`,
      legend: [
        ...(sel.length
          ? sel.map(t => ({
              symbol: "dot" as const,
              color: teamColors(t)[0],
              text: traded(t) ? `played for ${t}` : `${t} player`,
            }))
          : [
              {
                symbol: "dot" as const,
                color: color.ink,
                text: "one player, in team colors",
              },
            ]),
        ...(sel.length
          ? [
              {
                symbol: "dot" as const,
                color: color.faint,
                text: "rest of league",
              },
            ]
          : []),
        reference,
      ],
      counts: one
        ? `${games} games · ${ps.length} players`
        : `${d.to - d.from + 1} seasons · ${ps.length} player-seasons`,
      source: `Data: ${d.credit}`,
      team: team ? sel[0] : undefined,
    }
  },

  render(node, d, p, size): Body {
    const pair = pairOf(d.pair)
    const [sx, sy] = [stats[pair.x], stats[pair.y]]
    const ps = shown(d, p)
    const r = 5
    const { plot, x, y, plotW, plotH, left, top, avoid, body } = scatterPlot(
      node,
      {
        size,
        x: { title: sx.label, pct: sx.pct, signed: sx.signed },
        y: { title: sy.label, pct: sy.pct, signed: sy.signed },
        xs: ps.map(pl => pl.x),
        ys: ps.map(pl => pl.y),
        league: d.league,
        guide: pair.ratios
          ? { kind: "ratios", ratios: pair.ratios }
          : pair.total
            ? { kind: "sum" }
            : { kind: "average" },
        corners: pair.corners,
        inset: r + 2,
      },
    )

    // dots in team colors, or a team's players over a faded league. The color
    // is identity, not value: names and position carry the reading
    const sel = picked(p)
    const mine = (pl: Player) =>
      !sel.length || pl.teams.some(t => sel.includes(t))
    // a highlighted player wears the colors of the last highlighted team
    // they played for, so a dot matches its team's in the legend
    const hue = (pl: Player) =>
      teamColors(pl.teams.findLast(t => sel.includes(t)) ?? pl.team)
    // a traded player's name says so, as their numbers include their time
    // with other teams. With several teams highlighted, every name says
    // which, so a dot's team doesn't rest on its color
    // over a span of seasons, a name says which season
    const named = (pl: Player) =>
      (d.from === d.to
        ? pl.name
        : `${pl.name} ’${String(pl.season).slice(2)}`) +
      (pl.teams.length > 1
        ? ` (${pl.teams.join("→")})`
        : sel.length > 1 && mine(pl)
          ? ` (${pl.team})`
          : "")
    // behind a team, the rest of the league is smaller, so the team's dots
    // and names stand out by size as well as color
    const rOf = (pl: Player) => (mine(pl) || !sel.length ? r : 3.5)
    const order = [...ps].sort((a, b) => Number(mine(a)) - Number(mine(b)))
    for (const pl of order) {
      plot
        .append("circle")
        .attr("cx", x(pl.x))
        .attr("cy", y(pl.y))
        .attr("r", rOf(pl))
        .attr("fill", mine(pl) ? hue(pl)[0] : color.faint)
        .attr("fill-opacity", mine(pl) ? 1 : sel.length ? 0.35 : 0.45)
        .attr("stroke", mine(pl) ? hue(pl)[1] : color.bg)
        .attr("stroke-width", mine(pl) ? 1.5 : 0.75)
        .append("title")
        .text(
          `${pl.name}, ${fmtSeason(pl.season)} (${pl.teams.join("→")})\n${sx.tip(pl.x)} ${sx.short} · ${sy.tip(pl.y)} ${sy.short} · ${pl.gp} games`,
        )
    }

    // names: the players with the most volume first, and all of a
    // highlighted team's. A click on a dot toggles its name
    // a team's few names can be bigger
    const labelSize = sel.length ? 14 : 12.5
    // a team's few players are all named, overlapping if they must; a team
    // over many seasons is named where there's room
    const few = sel.length > 0 && ps.filter(mine).length <= 20
    const labeled = placeLabels(
      plot.append("g").attr("font-weight", type.label.weight).node()!,
      ps
        .map(pl => ({
          x: x(pl.x),
          y: y(pl.y),
          r,
          text: named(pl),
          priority: (mine(pl) ? 1e9 : 0) + pl.volume,
          always: few && mine(pl),
          key: pl.key,
        }))
        .filter((_, i) => !sel.length || mine(ps[i])),
      { width: plotW, height: plotH },
      {
        size: labelSize,
        minCell: 1800,
        avoid,
        dots: ps
          .filter(pl => !mine(pl))
          .map(pl => ({ x: x(pl.x), y: y(pl.y), r: rOf(pl) })),
      },
    )
    const marks: Mark[] = ps.map(pl => ({
      key: pl.key,
      x: x(pl.x) + left,
      y: y(pl.y) + top,
      r: rOf(pl),
      label: named(pl),
      labeled: labeled.has(pl.key),
      labelSize,
    }))

    if (!ps.length)
      plot
        .append("text")
        .attr("x", plotW / 2)
        .attr("y", plotH / 2)
        .attr("text-anchor", "middle")
        .attr("fill", color.muted)
        .text("No players yet")

    return body(marks)
  },
}
