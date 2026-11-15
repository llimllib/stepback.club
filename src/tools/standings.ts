// Standings: the East and the West, each team's record and games back, its
// offensive, defensive and net rating from its results, and its strength
// from its players' ratings, yarapm's and EPM's, beside them. See
// https://github.com/llimllib/stepback.club/issues/37
import { max, mean, scaleLinear, select } from "d3"
import { metadata, read } from "../kit/data"
import { agate, logoUrl } from "../kit/frame"
import { color, font, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"
import {
  byTeam,
  epmRatings,
  rapmRatings,
  summed,
  teamGames,
  type PlayerRatings,
} from "./team-ratings"

// season 0 is the latest season; load resolves it. sort "" is the
// standings' order, by record; otherwise a column's key
const defaults = { season: 0, sort: "" }
type P = typeof defaults

type Conf = "East" | "West"
const confs: Conf[] = ["East", "West"]

export interface Team {
  id: string
  abbrev: string
  name: string
  conf: Conf
  wins: number
  losses: number
  // points scored and allowed per 100 possessions; NaN before a game
  ortg: number
  drtg: number
  net: number
  // its players' ratings: points per 100 possessions better than average.
  // NaN for a season the source doesn't rate
  rapm: number
  epm: number
}

interface D {
  season: number
  seasons: number[]
  latest: number
  teams: Team[]
  // the average team's rating, the plain mean of the teams', so a reader
  // can place a rating
  avg: number
  through?: Date
  // the day each rating source's numbers are from
  rapmDate?: Date
  epmDate?: Date
}

const teamBase = import.meta.env.BASE_URL.replace(/\/?$/, "/")
const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
const dash = "—"
function signed(v: number) {
  if (!Number.isFinite(v)) return dash
  const t = Math.abs(v).toFixed(1)
  if (t === "0.0") return t
  return v > 0 ? `+${t}` : `−${t}`
}
const fixed = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : dash)
// games back, as newspapers print it: 2½
function gamesBack(gb: number) {
  if (gb <= 0) return dash
  const whole = Math.floor(gb)
  const half = gb - whole >= 0.5 ? "½" : ""
  return whole ? `${whole}${half}` : half
}

// best first: win percentage, then net rating. A team that hasn't played
// counts as .500, so before opening night the order is by the ratings
function pct(t: Team) {
  const g = t.wins + t.losses
  return g ? t.wins / g : 0.5
}
const orZero = (v: number) => (Number.isFinite(v) ? v : 0)
export function ordered(ts: Team[]) {
  return [...ts].sort(
    (a, b) =>
      pct(b) - pct(a) ||
      orZero(b.net) - orZero(a.net) ||
      orZero(b.rapm) - orZero(a.rapm) ||
      a.abbrev.localeCompare(b.abbrev),
  )
}

type Col = {
  key: string
  label: string
  title: string
  // sorting by it: best first, which for points allowed is fewest. The
  // record's columns sort by record
  sort?: "desc" | "asc"
  // a signed rating, drawn with a bar from zero
  bar?: boolean
  text: (t: Team, gb: number) => string
}
const cols: Col[] = [
  { key: "w", label: "W", title: "Wins", text: t => String(t.wins) },
  { key: "l", label: "L", title: "Losses", text: t => String(t.losses) },
  {
    key: "gb",
    label: "GB",
    title: "Games behind the conference leader",
    text: (_, gb) => gamesBack(gb),
  },
  {
    key: "ortg",
    label: "Off",
    title: "Points scored per 100 possessions",
    sort: "desc",
    text: t => fixed(t.ortg),
  },
  {
    key: "drtg",
    label: "Def",
    title: "Points allowed per 100 possessions",
    sort: "asc",
    text: t => fixed(t.drtg),
  },
  {
    key: "net",
    label: "Net",
    title: "Points per 100 possessions scored minus allowed",
    bar: true,
    sort: "desc",
    text: t => signed(t.net),
  },
  {
    key: "rapm",
    label: "yarapm",
    title: "yarapm's team rating, with its expected lineup",
    bar: true,
    sort: "desc",
    text: t => signed(t.rapm),
  },
  {
    key: "epm",
    label: "EPM",
    title: "Dunks & Threes' team EPM",
    bar: true,
    sort: "desc",
    text: t => signed(t.epm),
  },
]
// the record's columns are narrow; the ratings', wider
const numW = (k: string) => (k === "ortg" || k === "drtg" ? 48 : 34)
// the columns a season has: the ratings' only when they rate it
function shown(d: D) {
  return cols.filter(
    c => (c.key !== "rapm" || d.rapmDate) && (c.key !== "epm" || d.epmDate),
  )
}

// the play-in began in 2020–21: before it, the top eight made the
// playoffs. The lines go under these places
const lines = (season: number) =>
  season >= 2021
    ? [
        { after: 6, dashed: false },
        { after: 10, dashed: true },
      ]
    : [{ after: 8, dashed: false }]

const value = (t: Team, k: string) =>
  t[k as "ortg" | "drtg" | "net" | "rapm" | "epm"]

// the Sort control's names for the columns
const sortNames: Record<string, string> = {
  ortg: "Offense",
  drtg: "Defense",
  net: "Net",
}

// the sort a view can have: a sortable column it shows, or the record
function sortKey(d: D, p: P) {
  return shown(d).some(col => col.sort && col.key === p.sort) ? p.sort : ""
}

// a conference's teams in the view's order: its standings, or best first
// by a column, with a team that has no value last
function sortBy(ts: Team[], key: string) {
  const c = cols.find(col => col.key === key)
  if (!c?.sort) return ts
  const dir = c.sort === "asc" ? 1 : -1
  return [...ts].sort((a, b) => {
    const [va, vb] = [value(a, key), value(b, key)]
    if (!Number.isFinite(va) || !Number.isFinite(vb))
      return +!Number.isFinite(va) - +!Number.isFinite(vb)
    return dir * (va - vb)
  })
}

// a team's net rating by its players, NaN if the source doesn't rate it
function net(r: PlayerRatings | undefined, id: string) {
  const t = r?.teams.get(id)
  return t ? t.off + t.def : NaN
}

// A season's NBA teams with their records and results in the regular
// season: the Cup's group and knockout games count, its final doesn't. No
// players' ratings yet: NaN
export async function results(season: number) {
  const [names, games] = await Promise.all([
    read("stats", "team_seasons", season, [
      "team_id",
      "nba_abbrev",
      "full_name",
      "is_nba",
      "conference",
    ]),
    teamGames(season),
  ])
  const teams = byTeam(games.filter(g => g.game_type === "regular_season"))
  let through: Date | undefined
  const rows: Team[] = names
    .filter(
      t => t.is_nba && (t.conference === "East" || t.conference === "West"),
    )
    .map(t => {
      const s = summed(teams.get(t.team_id) ?? [])
      if (s.through && (!through || s.through > through)) through = s.through
      return {
        id: t.team_id,
        abbrev: t.nba_abbrev,
        name: t.full_name,
        conf: t.conference,
        wins: s.wins,
        losses: s.losses,
        ortg: s.ortg,
        drtg: s.drtg,
        net: s.ortg - s.drtg,
        rapm: NaN,
        epm: NaN,
      }
    })
  return { teams: rows, through }
}

export const standings: Tool<P, D> = {
  id: "standings",
  name: "Standings",
  defaults,
  // a table's height is its rows'; squeezed into a square, they're too
  // small to read
  sizes: ["auto"],

  async load(p) {
    const [meta, rapmMeta] = await Promise.all([metadata(), metadata("yarapm")])
    const { first_season, last_season } = meta.team_game_logs
    const season = Math.min(
      last_season,
      Math.max(first_season, p.season || last_season),
    )
    const has = (
      m: Record<string, { first_season: number; last_season: number }>,
      k: string,
    ) => !!m[k] && season >= m[k].first_season && season <= m[k].last_season

    const [res, rapm, epm] = await Promise.all([
      results(season),
      has(rapmMeta, "team_ratings_daily")
        ? rapmRatings(season, false).catch(() => undefined)
        : undefined,
      has(meta, "team_epm")
        ? epmRatings(season).catch(() => undefined)
        : undefined,
    ])
    const teams = res.teams.map(t => ({
      ...t,
      rapm: net(rapm, t.id),
      epm: net(epm, t.id),
    }))
    const rated = teams.filter(t => Number.isFinite(t.ortg))
    const avg = mean(rated, t => (t.ortg + t.drtg) / 2) ?? NaN

    const seasons = []
    for (let s = last_season; s >= first_season; s--) seasons.push(s)
    return {
      season,
      seasons,
      latest: last_season,
      teams,
      avg,
      through: res.through,
      rapmDate: rapm?.day,
      epmDate: epm?.day,
    }
  },

  normalize(d, p) {
    return { ...p, season: d.season, sort: sortKey(d, p) }
  },

  controls(d) {
    return [
      {
        key: "season",
        label: "Season",
        kind: "select",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      {
        key: "sort",
        label: "Sort by",
        kind: "select",
        options: [
          { value: "", label: "Record" },
          ...shown(d)
            .filter(c => c.sort)
            .map(c => ({ value: c.key, label: sortNames[c.key] ?? c.label })),
        ],
      },
    ]
  },

  describe(d) {
    const current = d.season === d.latest
    const through =
      current && d.through ? `, through ${fmtDate(d.through)}` : ""
    // the ratings' day, when it isn't the results'
    const raters = [d.rapmDate && "yarapm", d.epmDate && "EPM"].filter(
      Boolean,
    ) as string[]
    const day = d.rapmDate ?? d.epmDate
    const ratings = !raters.length
      ? ""
      : `. ${raters.join(" and ")} ${raters.length > 1 ? "rate" : "rates"} each team from its players${current && day ? `, as of ${fmtDate(day)}` : ""}`
    const playIn = d.season >= 2021
    return {
      title: "Standings",
      context: `The ${fmtSeason(d.season)} regular season${through}. Offense, defense and net are points per 100 possessions${ratings}`,
      legend: [
        { symbol: "rule", color: color.ink, text: "playoffs" },
        ...(playIn
          ? [{ symbol: "dash" as const, color: color.muted, text: "play-in" }]
          : []),
        { symbol: "bar", color: color.pos, label: "+", text: "better" },
        { symbol: "bar", color: color.neg, label: "−", text: "worse" },
      ],
      counts: Number.isFinite(d.avg) ? `average ${d.avg.toFixed(1)}` : "",
      source: `Data: ${["NBA.com", d.rapmDate && "yarapm", d.epmDate && "Dunks & Threes"].filter(Boolean).join(", ")}`,
    }
  },

  render(node, d, p, size, set): Body {
    const g = select(node)
    const key = sortKey(d, p)
    const W = size.width
    const byConf = confs.map(c => ordered(d.teams.filter(t => t.conf === c)))
    const rows = byConf.reduce((n, ts) => n + ts.length, 0)
    // each conference: its name, then its column heads, then its rows
    const confHead = 30
    const colHead = 20
    const between = 16
    const fixedH = confs.length * (confHead + colHead) + between + 6
    const rowH = size.height
      ? Math.max(10, (size.height - fixedH) / Math.max(rows, 1))
      : 22
    const height = size.height ?? Math.round(fixedH + rowH * rows)
    const fs = Math.min(14, rowH * 0.68)
    const logo = Math.min(rowH - 3, 20)

    // columns: rank, logo and team, then the numbers, then the bars. The
    // numbers are right-aligned at their column's right edge
    const teamW = 30 + logo + 48
    const plain = shown(d).filter(c => !c.bar)
    const bars = shown(d).filter(c => c.bar)
    const plainW = plain.reduce((n, c) => n + numW(c.key), 0)
    const barW = (W - teamW - plainW - 12) / bars.length
    const x0: Record<string, number> = {}
    let x = teamW
    for (const c of plain) {
      x0[c.key] = x
      x += numW(c.key)
    }
    x += 12
    for (const c of bars) {
      x0[c.key] = x
      x += barW
    }
    // a bar column: its number, then a zero line with bars either side.
    // One scale for all three, so a team's results and ratings compare
    // a bar column: its number, then its bars either side of zero, then a
    // gap before the next column
    const barNum = 42
    const barSpan = barW - barNum - 10 - 14
    const zeroX = (k: string) => x0[k] + barNum + 10 + barSpan / 2
    const maxAbs = Math.max(
      1,
      max(d.teams, t => max(bars, c => Math.abs(orZero(value(t, c.key))))) ?? 1,
    )
    const len = scaleLinear()
      .domain([0, maxAbs])
      .range([0, barSpan / 2])
    const bh = Math.max(3, Math.min(rowH * 0.5, 11))

    const marks: Mark[] = []
    let y = 0
    byConf.forEach((ts, ci) => {
      const conf = confs[ci]
      if (ci) y += between
      g.append("text")
        .attr("x", 0)
        .attr("y", y + confHead - 8)
        .attr("font-family", font.head)
        .attr("font-weight", 700)
        .attr("font-size", 22)
        .attr("fill", color.ink)
        .text(conf === "East" ? "Eastern Conference" : "Western Conference")
      y += confHead
      for (const c of [...plain, ...bars]) {
        const t = g
          .append("text")
          .attr("y", y + colHead - 6)
          .call(agate)
          .attr(
            "x",
            c.bar ? x0[c.key] + (barW - 14) / 2 : x0[c.key] + numW(c.key),
          )
          .attr("text-anchor", c.bar ? "middle" : "end")
          .attr("class", "frame-control")
          .text(c.key === key ? `${c.label} ▼` : c.label)
        // the sorted column's head says so in ink, so an export says how
        // it's sorted; the record's order needs no mark
        if (c.key === key) t.attr("fill", color.ink).attr("font-weight", 700)
        // the ▼ goes after the label, so a right-aligned head keeps its
        // label over its numbers
        if (c.key === key && !c.bar) t.attr("dx", "1.4em")
        t.on("click", () => set({ sort: c.sort ? c.key : "" }))
        t.append("title").text(
          c.sort
            ? `${c.title}. Click to sort by it`
            : `${c.title}. Click to sort by record`,
        )
      }
      y += colHead
      const top = y
      // a rule under each bar column's head, so its number and bars read
      // as one column
      for (const c of bars)
        g.append("line")
          .attr("x1", x0[c.key])
          .attr("x2", x0[c.key] + barW - 14)
          .attr("y1", top - 2)
          .attr("y2", top - 2)
          .attr("stroke", color.faint)
      // the zero lines, the strongest line in each bar column
      for (const c of bars)
        g.append("line")
          .attr("x1", zeroX(c.key))
          .attr("x2", zeroX(c.key))
          .attr("y1", top)
          .attr("y2", top + ts.length * rowH)
          .attr("stroke", color.zero)
          .attr("stroke-width", 1.5)

      // the seed and games back are the standings', in any order
      const leader = ts[0]
      const seed = new Map(ts.map((t, i) => [t, i + 1]))
      sortBy(ts, key).forEach((t, i) => {
        const cy = y + rowH / 2
        const base = cy + fs * 0.35
        const gb = leader
          ? (leader.wins - t.wins + (t.losses - leader.losses)) / 2
          : 0
        const row = g.append("g")
        row
          .append("text")
          .attr("x", 18)
          .attr("y", base)
          .attr("text-anchor", "end")
          .attr("font-size", fs * 0.85)
          .attr("fill", color.muted)
          .text(seed.get(t)!)
        // the logo and abbreviation link to the team's page
        const link = row
          .append("a")
          .attr("href", `${teamBase}team?team=${t.abbrev}`)
        link
          .append("image")
          .attr("href", logoUrl(t.abbrev))
          .attr("x", 26)
          .attr("y", cy - logo / 2)
          .attr("width", logo)
          .attr("height", logo)
        link
          .append("text")
          .attr("x", 30 + logo)
          .attr("y", base)
          .attr("font-size", fs)
          .attr("font-weight", type.label.weight)
          .text(t.abbrev)
          .append("title")
          .text(t.name)
        for (const c of plain)
          row
            .append("text")
            .attr("x", x0[c.key] + numW(c.key))
            .attr("y", base)
            .attr("text-anchor", "end")
            .attr("font-size", fs)
            .attr("font-weight", c.key === key ? 600 : 500)
            .attr(
              "fill",
              c.key === "w" || c.key === "l" || c.key === key
                ? color.ink
                : color.muted,
            )
            .style("font-variant-numeric", "tabular-nums")
            .text(c.text(t, gb))
        for (const c of bars) {
          const v = value(t, c.key)
          row
            .append("text")
            .attr("x", x0[c.key] + barNum)
            .attr("y", base)
            .attr("text-anchor", "end")
            .attr("font-size", fs)
            .attr("font-weight", c.key === (key || "net") ? 600 : 500)
            .attr("fill", c.key === (key || "net") ? color.ink : color.muted)
            .style("font-variant-numeric", "tabular-nums")
            .text(c.text(t, gb))
          if (!Number.isFinite(v)) continue
          const l = len(Math.abs(v))
          row
            .append("rect")
            .attr("x", v >= 0 ? zeroX(c.key) : zeroX(c.key) - l)
            .attr("y", cy - bh / 2)
            .attr("width", Math.max(l, 0.5))
            .attr("height", bh)
            .attr("fill", v >= 0 ? color.pos : color.neg)
        }
        marks.push({
          key: `row:${t.abbrev}`,
          x: 30 + logo + 40,
          y: cy,
          r: rowH / 2,
          label: `${t.name} ${t.wins}-${t.losses}, ${signed(t.net)} net`,
        })
        y += rowH
        // the playoff line, and the play-in's
        const line = lines(d.season).find(l => l.after === i + 1)
        if (line && !key && i < ts.length - 1)
          g.append("line")
            .attr("x1", 0)
            .attr("x2", W)
            .attr("y1", y)
            .attr("y2", y)
            .attr("stroke", line.dashed ? color.muted : color.ink)
            .attr("stroke-dasharray", line.dashed ? "4 3" : null)
      })
    })

    return {
      height,
      marks,
      invert(px, py) {
        if (px < 0 || px > W || py < 0 || py > height) return undefined
        return { fx: +(px / W).toFixed(4), fy: +(py / height).toFixed(4) }
      },
      project(pos) {
        const { fx, fy } = pos as { fx: number; fy: number }
        return [fx * W, fy * height]
      },
    }
  },
}
