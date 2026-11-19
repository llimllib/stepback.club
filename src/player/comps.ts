// Players like this one at his age: each player's three seasons up to an
// age, as a profile of size, role, style and impact, and the players whose
// profile at the same age is nearest. Pure, so it can be tested apart from
// the page. Design: "Comparables" in
// docs/plans/2026-11-18-player-page-design.md
import type { StatSeason } from "./load"

export interface Comp {
  player_id: string
  // the age he's matched at, and the season he was that age
  age: number
  season: number
  // the distance between the profiles: smaller is closer
  distance: number
}

// seasons in a profile, ending at the age matched
const WINDOW = 3
// the fewest minutes a candidate's profile rests on
const MIN_MINUTES = 1000

interface Feature {
  key: string
  weight: number
  value: (w: StatSeason[]) => number
}

const sum = (w: StatSeason[], f: (s: StatSeason) => number) =>
  w.reduce((t, s) => t + (Number.isFinite(f(s)) ? f(s) : 0), 0)
const per100 = (w: StatSeason[], f: (s: StatSeason) => number) => {
  const poss = sum(w, s => s.poss)
  return poss ? (100 * sum(w, f)) / poss : NaN
}
// an average weighted by w, over the seasons that have the value
const weighted = (
  w: StatSeason[],
  f: (s: StatSeason) => number,
  by: (s: StatSeason) => number,
) => {
  let [t, n] = [0, 0]
  for (const s of w)
    if (Number.isFinite(f(s)) && by(s) > 0) {
      t += f(s) * by(s)
      n += by(s)
    }
  return n ? t / n : NaN
}

// height and impact (OpenRAPM's offense and defense) count double: a
// player's size and his level in the league
export const features: Feature[] = [
  { key: "height", weight: 2, value: w => w.at(-1)!.inches },
  {
    key: "mpg",
    weight: 1,
    value: w =>
      sum(w, s => s.min) /
      Math.max(
        1,
        sum(w, s => s.gp),
      ),
  },
  { key: "pts", weight: 1, value: w => per100(w, s => s.pts) },
  { key: "ast", weight: 1, value: w => per100(w, s => s.ast) },
  { key: "oreb", weight: 1, value: w => per100(w, s => s.oreb) },
  { key: "dreb", weight: 1, value: w => per100(w, s => s.dreb) },
  { key: "stl", weight: 1, value: w => per100(w, s => s.stl) },
  { key: "blk", weight: 1, value: w => per100(w, s => s.blk) },
  {
    key: "3par",
    weight: 1,
    value: w => sum(w, s => s.fg3a) / sum(w, s => s.fga),
  },
  {
    key: "ftr",
    weight: 1,
    value: w => sum(w, s => s.fta) / sum(w, s => s.fga),
  },
  {
    key: "usg",
    weight: 1,
    value: w =>
      weighted(
        w,
        s => s.usg,
        s => s.min,
      ),
  },
  {
    key: "ts",
    weight: 1,
    value: w => {
      const shots = 2 * (sum(w, s => s.fga) + 0.44 * sum(w, s => s.fta))
      return shots ? sum(w, s => s.pts) / shots : NaN
    },
  },
  {
    key: "openO",
    weight: 2,
    value: w =>
      weighted(
        w,
        s => s.openO,
        s => s.poss,
      ),
  },
  {
    key: "openD",
    weight: 2,
    value: w =>
      weighted(
        w,
        s => s.openD,
        s => s.poss,
      ),
  },
]

// a player's seasons from age − WINDOW + 1 to age, given his age offset
export function window(list: StatSeason[], offset: number, age: number) {
  return list.filter(s => {
    const a = s.season - offset
    return a > age - WINDOW && a <= age
  })
}

export function profile(w: StatSeason[]) {
  return features.map(f => f.value(w))
}

// The n players nearest `id` at his age in `season`: every other player's
// profile at the same age, from seasons with at least MIN_MINUTES, and
// careers that reach `drawnFrom` (the first season the chart has), so a
// comparable has a line to draw. Each feature is a z-score over the
// candidates; a missing one counts as average
export function comparables(
  byPlayer: Map<string, StatSeason[]>,
  offsets: Map<string, number>,
  id: string,
  season: number,
  { n = 8, drawnFrom = 0 } = {},
): Comp[] {
  const offset = offsets.get(id)
  const mine = byPlayer.get(id)
  if (offset === undefined || !mine) return []
  const age = season - offset
  const target = window(mine, offset, age)
  if (!target.length || !sum(target, s => s.min)) return []

  const candidates: { id: string; season: number; v: number[] }[] = []
  for (const [other, list] of byPlayer) {
    if (other === id) continue
    const o = offsets.get(other)
    if (o === undefined || list.at(-1)!.season < drawnFrom) continue
    const w = window(list, o, age)
    // his season at that age has to be in the data, or the window's
    // a shorter one ending earlier
    if (!w.length || w.at(-1)!.season - o !== age) continue
    if (sum(w, s => s.min) < MIN_MINUTES) continue
    candidates.push({ id: other, season: w.at(-1)!.season, v: profile(w) })
  }
  if (!candidates.length) return []

  const stats = features.map((_, i) => {
    const vs = candidates.map(c => c.v[i]).filter(Number.isFinite)
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length
    const sd = Math.sqrt(
      vs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vs.length),
    )
    return { mean, sd: sd || 1 }
  })
  const z = (v: number[]) =>
    v.map((x, i) =>
      Number.isFinite(x) ? (x - stats[i].mean) / stats[i].sd : 0,
    )
  const me = z(profile(target))
  return candidates
    .map(c => {
      const zc = z(c.v)
      const d = Math.sqrt(
        features.reduce((t, f, i) => t + f.weight * (zc[i] - me[i]) ** 2, 0),
      )
      return { player_id: c.id, age, season: c.season, distance: d }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n)
}
