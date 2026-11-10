// The matchup's four factors: each team's offense and defense this regular
// season, from the NBA's team game logs, with each value's rank among the
// 30 teams. Shown by possession: one team's offense against the other's
// defense. The page is src/pages/matchup.astro. Design:
// docs/plans/2026-11-10-matchup-design.md
import { read, type Row } from "../kit/data"

export type FactorKey = "rating" | "efg" | "tov" | "oreb" | "ftr"

// one side of the ball: the team's own rates on offense, its opponents' on
// defense
export type Side = Record<FactorKey, number>

export interface TeamFactors {
  games: number
  offense: Side
  defense: Side
  // 1 is best on that side of the ball
  rank: { offense: Side; defense: Side }
}

export interface Factors {
  teams: Map<string, TeamFactors>
  // from the league's totals, not the mean of 30 teams' rates; offense and
  // defense are the same league
  league: Side
}

export const factors: {
  key: FactorKey
  label: string
  title: string
  // a higher value is better on offense, and so worse on defense
  higher: boolean
  fmt: (v: number) => string
}[] = [
  {
    key: "rating",
    label: "Rating",
    title: "Points per 100 possessions",
    higher: true,
    fmt: v => v.toFixed(1),
  },
  {
    key: "efg",
    label: "eFG%",
    title: "Effective field goal percentage: threes count 1.5 field goals",
    higher: true,
    fmt: v => (v * 100).toFixed(1),
  },
  {
    key: "tov",
    label: "Turnovers",
    title: "Turnovers per 100 possessions",
    higher: false,
    fmt: v => v.toFixed(1),
  },
  {
    key: "oreb",
    label: "Off. reb.",
    title: "Offensive rebound percentage: the share of its misses it gets back",
    higher: true,
    fmt: v => (v * 100).toFixed(1),
  },
  {
    key: "ftr",
    label: "FT rate",
    title: "Free throws made per field goal attempt",
    higher: true,
    fmt: v => v.toFixed(3).replace(/^0/, ""),
  },
]

const counts = [
  "pts",
  "fgm",
  "fga",
  "fg3m",
  "ftm",
  "tov",
  "oreb",
  "dreb",
  "poss",
] as const
type Totals = Record<(typeof counts)[number], number>

const zero = (): Totals => Object.fromEntries(counts.map(c => [c, 0])) as Totals

const add = (t: Totals, r: Row) => {
  for (const c of counts) t[c] += r[c] ?? 0
}

// a side's rates from its totals and the other side's
const rates = (us: Totals, them: Totals): Side => ({
  rating: (100 * us.pts) / us.poss,
  efg: (us.fgm + 0.5 * us.fg3m) / us.fga,
  tov: (100 * us.tov) / us.poss,
  oreb: us.oreb / (us.oreb + them.dreb),
  ftr: us.ftm / us.fga,
})

// Every team's four factors over the season's regular-season games: its
// totals against its opponents' in the same games
export async function seasonFactors(season: number): Promise<Factors> {
  const [logs, games] = await Promise.all([
    read("stats", "team_game_logs", season, ["game_id", "team_id", ...counts]),
    read("stats", "games", season, ["game_id", "game_type"]),
  ])
  const regular = new Set(
    games.filter(g => g.game_type === "regular_season").map(g => g.game_id),
  )
  const byGame = new Map<string, Row[]>()
  for (const r of logs) {
    if (!regular.has(r.game_id) || !(r.poss > 0)) continue
    byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r])
  }
  const own = new Map<string, Totals>()
  const opp = new Map<string, Totals>()
  const played = new Map<string, number>()
  const league = zero()
  for (const pair of byGame.values()) {
    if (pair.length !== 2) continue
    pair.forEach((r, i) => {
      const o = pair[1 - i]
      if (!own.has(r.team_id)) {
        own.set(r.team_id, zero())
        opp.set(r.team_id, zero())
      }
      add(own.get(r.team_id)!, r)
      add(opp.get(r.team_id)!, o)
      add(league, r)
      played.set(r.team_id, (played.get(r.team_id) ?? 0) + 1)
    })
  }

  const sides = [...own.keys()].map(id => ({
    id,
    offense: rates(own.get(id)!, opp.get(id)!),
    defense: rates(opp.get(id)!, own.get(id)!),
  }))
  // rank 1 is the best: on offense the highest of a "higher" factor, on
  // defense the lowest
  const rankOf = (side: "offense" | "defense", key: FactorKey, v: number) => {
    const f = factors.find(x => x.key === key)!
    const better = side === "offense" ? f.higher : !f.higher
    return (
      1 +
      sides.filter(s => (better ? s[side][key] > v : s[side][key] < v)).length
    )
  }
  const ranks = (side: "offense" | "defense", s: Side) =>
    Object.fromEntries(
      factors.map(f => [f.key, rankOf(side, f.key, s[f.key])]),
    ) as Side

  return {
    teams: new Map(
      sides.map(s => [
        s.id,
        {
          games: played.get(s.id)!,
          offense: s.offense,
          defense: s.defense,
          rank: {
            offense: ranks("offense", s.offense),
            defense: ranks("defense", s.defense),
          },
        },
      ]),
    ),
    // the league's own offense against itself: every made shot is someone's
    // allowed, so one set of totals is both sides
    league: rates(league, league),
  }
}

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st
export function ordinal(n: number) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}
