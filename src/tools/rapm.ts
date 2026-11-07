// RAPM over time: what yarapm's model thought of a few players on each game
// day, from the games before it. See docs/plans/2026-11-07-rapm-design.md
import {
  bisectLeft,
  format,
  line,
  max,
  precisionFixed,
  scaleLinear,
  scaleUtc,
  select,
  utcMonth,
} from "d3"
import { metadata, read } from "../kit/data"
import { agate } from "../kit/frame"
import { gutterWidth, lineLabels, lineStyle } from "../kit/lines"
import { color, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"

// 0 is the latest season the data has; load resolves them. Empty players
// means the five highest rated on the span's last day
const defaults = {
  from: 0,
  to: 0,
  rating: "rating",
  players: "",
}
type P = typeof defaults

// columns of ratings_daily, in points per 100 possessions. `phrase` is the
// name inside a sentence
const ratings: Record<string, { label: string; name: string; phrase: string }> =
  {
    rating: { label: "Total", name: "RAPM", phrase: "RAPM" },
    o_rating: {
      label: "Offense",
      name: "Offensive RAPM",
      phrase: "offensive RAPM",
    },
    d_rating: {
      label: "Defense",
      name: "Defensive RAPM",
      phrase: "defensive RAPM",
    },
  }

const MAX_PLAYERS = 12
const LEADERS = 5
// a player missing more of a season's game days than this breaks his line:
// an injury, off every roster
const GAP_DAYS = 10

interface Day {
  season: number
  date: Date
  // which of the span's game days it is
  n: number
  v: number
  // offensive possessions this season before the day
  poss: number
}

interface D {
  from: number
  to: number
  seasons: number[]
  rating: string
  names: Map<string, string>
  // each player's days in the span, in date order
  days: Map<string, Day[]>
  // the span's game days, in order: every day with ratings, which is
  // every day the league played, plus the latest build's
  league: LeagueDay[]
  // the span's last day
  last: Date
}

interface LeagueDay {
  season: number
  date: Date
}

const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date, year = false) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  })
const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// An x scale over the span's game days, a step each, whatever the calendar
// did between them: the offseasons, the All-Star break and 2020's suspension
// take no room. Seasons are `pad` apart
function dayScale(league: LeagueDay[], width: number, pad: number) {
  const breaks = league.filter(
    (l, i) => i && l.season !== league[i - 1].season,
  ).length
  const k = (width - pad * breaks) / Math.max(1, league.length - 1)
  const pos: number[] = []
  league.forEach((l, i) =>
    pos.push(
      i ? pos[i - 1] + k + (l.season === league[i - 1].season ? 0 : pad) : 0,
    ),
  )
  const times = league.map(l => +l.date)
  // a date's place is its game day's, or the next one's
  const x = (d: Date) =>
    pos[Math.min(pos.length - 1, bisectLeft(times, +d))] ?? 0
  // the n'th game day's place
  x.at = (n: number) => pos[n]
  x.invert = (px: number) =>
    league[Math.min(league.length - 1, bisectLeft(pos, px))]?.date
  // each season's game days, from the first's place to the last's
  x.bands = () =>
    league.flatMap((l, i) =>
      i && l.season === league[i - 1].season
        ? []
        : [
            {
              season: l.season,
              a: pos[i],
              b: pos[league.findLastIndex(m => m.season === l.season)],
            },
          ],
    )
  return x
}

// a rating, always signed; ticks pass their own precision
function signed(digits = 1) {
  const f = format(`.${digits}f`)
  return (v: number) => {
    const t = f(Math.abs(v))
    if (t === f(0)) return t
    return v > 0 ? `+${t}` : `−${t}`
  }
}
const fmt = signed()

// the five highest rated on the span's last day, for a view with no players
// picked
function leaders(d: D) {
  const last = +d.last
  return [...d.days]
    .flatMap(([id, days]) => {
      const day = days.at(-1)!
      return +day.date === last ? [[id, day.v] as const] : []
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, LEADERS)
    .map(([id]) => id)
}

function picked(p: P) {
  return p.players.split(",").filter(Boolean)
}

// the players on the chart: the picked ones, or the leaders
function shown(d: D, p: P) {
  const ids = picked(p)
  return ids.length ? ids : leaders(d)
}

// A day's value on the trend line: a Gaussian-weighted average of the
// player's days around it in the same season, `sigma` of his days wide.
// Each season starts from a new prior, so the trend doesn't average across
// them. It uses later days, so unlike the days themselves it's hindsight
function smooth(days: Day[], sigma: number) {
  const reach = Math.ceil(sigma * 3)
  return days.map((day, i) => {
    let [sum, total] = [0, 0]
    for (
      let j = Math.max(0, i - reach);
      j <= Math.min(days.length - 1, i + reach);
      j++
    ) {
      if (days[j].season !== day.season) continue
      const w = Math.exp(-((j - i) ** 2) / (2 * sigma * sigma))
      sum += w * days[j].v
      total += w
    }
    return sum / total
  })
}

// how wide the trend's smoothing is, in a player's days: a week or so in a
// season, about six weeks over a career
function smoothing(d: D) {
  return Math.min(20, Math.max(2, d.league.length / 50))
}

interface Point {
  day: Day
  trend: number
}

// each shown player's days with their trend, split into runs where he
// missed part of a season. The offseasons take no room on the chart, so a
// run goes on into the next season
function series(d: D, p: P) {
  return shown(d, p).map((id, i) => {
    const days = d.days.get(id) ?? []
    const trend = smooth(days, smoothing(d))
    const runs: Point[][] = []
    days.forEach((day, j) => {
      const prev = days[j - 1]
      if (!prev || (prev.season === day.season && day.n - prev.n > GAP_DAYS))
        runs.push([])
      runs.at(-1)!.push({ day, trend: trend[j] })
    })
    return {
      id,
      name: d.names.get(id) ?? id,
      ...lineStyle(i),
      points: runs.flat(),
      runs,
    }
  })
}

// "the top five by RAPM on Nov 7, 2026", or nothing when the players were
// picked, as their names are on the chart
function who(d: D, p: P) {
  if (picked(p).length) return ""
  const n = leaders(d).length
  if (!n) return ""
  const on = `by ${ratings[d.rating].phrase} on ${fmtDate(d.last, true)}`
  if (n === 1) return `The top player ${on}`
  return `The top ${["two", "three", "four", "five"][n - 2]} ${on}`
}

export const rapm: Tool<P, D> = {
  id: "rapm",
  name: "RAPM over time",
  defaults,

  async load(p) {
    const meta = await metadata("yarapm")
    const { first_season, last_season } = meta.ratings_daily
    const clamp = (s: number) =>
      Math.min(last_season, Math.max(first_season, s))
    const to = clamp(p.to || last_season)
    const from = clamp(p.from || to)
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const rating = p.rating in ratings ? p.rating : defaults.rating

    const span: number[] = []
    for (let s = lo; s <= hi; s++) span.push(s)
    const seasons = await Promise.all(
      span.map(s =>
        Promise.all([
          read("yarapm", "ratings_daily", s, [
            "player_id",
            "as_of_date",
            "possessions",
            rating,
          ]),
          read("stats", "player_seasons", s, ["player_id", "name"]),
        ]),
      ),
    )

    const names = new Map<string, string>()
    const days = new Map<string, Day[]>()
    const league: LeagueDay[] = []
    seasons.forEach(([rows, players], i) => {
      for (const pl of players) names.set(pl.player_id, pl.name)
      const dates = new Map(
        rows.map(r => [+r.as_of_date, r.as_of_date as Date]),
      )
      for (const date of [...dates.values()].sort((a, b) => +a - +b))
        league.push({ season: span[i], date })
      for (const r of rows) {
        let list = days.get(r.player_id)
        if (!list) days.set(r.player_id, (list = []))
        list.push({
          season: span[i],
          date: r.as_of_date,
          n: 0,
          v: Number(r[rating]),
          poss: Number(r.possessions ?? 0),
        })
      }
    })
    const n = new Map(league.map((l, i) => [+l.date, i]))
    for (const list of days.values()) {
      for (const day of list) day.n = n.get(+day.date)!
      list.sort((a, b) => a.n - b.n)
    }

    const all = []
    for (let s = first_season; s <= last_season; s++) all.push(s)
    return {
      from: lo,
      to: hi,
      seasons: all,
      rating,
      names,
      days,
      league,
      last: league.at(-1)?.date ?? new Date(),
    }
  },

  normalize(d, p) {
    const p2 = { ...p, from: d.from, to: d.to, rating: d.rating }
    // players with no days in the span drop out. None left means the
    // leaders, which aren't written down, so they follow the rating and span
    const ids = picked(p)
      .filter(id => d.days.has(id))
      .slice(0, MAX_PLAYERS)
    return { ...p2, players: ids.join(",") }
  },

  controls(d) {
    return [
      {
        key: "from",
        keyTo: "to",
        label: "Seasons",
        kind: "span",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      {
        key: "rating",
        label: "Rating",
        kind: "select",
        options: Object.entries(ratings).map(([k, r]) => ({
          value: k,
          label: r.label,
        })),
      },
      {
        key: "players",
        label: "Players",
        kind: "players",
        max: MAX_PLAYERS,
        fallback: {
          label: `Top ${LEADERS} by ${ratings[d.rating].phrase}`,
          values: leaders(d),
        },
        options: [...d.days.keys()]
          .map(id => ({ value: id, label: d.names.get(id) ?? id }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ]
  },

  describe(d, p) {
    const ss = series(d, p)
    const span =
      d.from === d.to
        ? `in the ${fmtSeason(d.to)} season`
        : `from ${fmtSeason(d.from)} to ${fmtSeason(d.to)}`
    // one player gets his days as dots under the trend; more get the trend
    const one = ss.length === 1
    const what = one
      ? "The model's estimate on each game day, from the games before it, and its trend"
      : "The trend of the model's estimate on each game day, from the games before it"
    return {
      title: ratings[d.rating].name,
      who: who(d, p),
      context: `${what}, ${span}. Points per 100 possessions above average`,
      legend: one
        ? [
            { symbol: "dot", color: ss[0].color, text: "Each day" },
            { symbol: "line", color: ss[0].color, text: "Trend" },
          ]
        : undefined,
      counts: one ? undefined : `${ss.length} players`,
      source: "Data: yarapm",
    }
  },

  render(node, d, p, size): Body {
    const ss = series(d, p)
    const g = select(node)
    const top = 22
    const bottom = 48
    const oneSeason = d.from === d.to
    // one player's days are dots under his trend
    const dots = ss.length === 1

    const values = ss.flatMap(s =>
      s.points.map(pt => (dots ? pt.day.v : pt.trend)),
    )
    const y = scaleLinear()
      .domain([Math.min(0, ...values), Math.max(0, ...values)])
      .nice(6)

    // measure the tick labels and the names, for the margins
    const measure = g.append("text")
    const width = (t: string, fontSize: number, weight: number) =>
      measure
        .attr("font-size", fontSize)
        .attr("font-weight", weight)
        .text(t)
        .node()!
        .getComputedTextLength()
    const ticksY = y.ticks(6)
    const tick = signed(
      precisionFixed(ticksY.length > 1 ? ticksY[1] - ticksY[0] : 1),
    )
    const left =
      (max(ticksY, t => width(tick(t), type.tick.size, type.tick.weight)) ??
        20) + 10
    // the name's value is the last day's, not the trend's. A line that
    // stops before the span's last day says when
    const ends = ss.map(s => {
      const end = s.points.at(-1)
      if (!end) return undefined
      const { date, v } = end.day
      const early = +date < +d.last
      return {
        end,
        sub: early ? `${fmt(v)} · ${fmtDate(date, !oneSeason)}` : fmt(v),
      }
    })
    const gutter = gutterWidth(
      ss.flatMap((s, i) => {
        const e = ends[i]
        return e ? [{ name: s.name, sub: e.sub }] : []
      }),
      width,
    )
    measure.remove()

    const plotW = size.width - left - gutter
    const height = size.height ?? Math.round(plotW * 0.62) + top + bottom
    const plotH = height - top - bottom
    const x = dayScale(d.league, plotW, oneSeason ? 0 : 8)
    y.range([plotH, 0])
    const plot = g.append("g").attr("transform", `translate(${left},${top})`)

    // x ticks: dates in one season, each month's start by its name; in a
    // span, a rule between seasons and each season's name under its band
    const grid = plot.append("g").attr("stroke", color.grid)
    const axis = plot
      .append("g")
      .attr("font-size", type.tick.size)
      .attr("font-weight", type.tick.weight)
      .attr("fill", color.muted)
    if (oneSeason) {
      // the calendar's ticks, each at its game day or the next one; a month
      // is named at its first game day. A tick with no game day near it
      // (2020's suspension) or too near the last one is left out
      const [first, last] = [d.league[0]?.date, d.last]
      const dates = first ? scaleUtc().domain([first, last]).ticks(8) : []
      let prev = -Infinity
      for (const t of dates) {
        const at = x(t)
        const day = x.invert(at)
        if (!day || +day - +t > 3 * 86_400_000 || at - prev < 48) continue
        prev = at
        grid.append("line").attr("x1", at).attr("x2", at).attr("y2", plotH)
        axis
          .append("text")
          .attr("x", at)
          .attr("y", plotH + 18)
          .attr("text-anchor", "middle")
          .text(
            +utcMonth.floor(t) === +t
              ? t.toLocaleDateString("en-US", {
                  month: "short",
                  timeZone: "UTC",
                })
              : fmtDate(day),
          )
      }
    } else {
      // "2022–23" if every band fits it, "’23" if not
      const bands = x.bands()
      const short = bands.some(({ a, b }) => b - a < 64)
      bands.forEach(({ season, a, b }, i) => {
        if (i)
          grid
            .append("line")
            .attr("x1", a - 4)
            .attr("x2", a - 4)
            .attr("y2", plotH)
        axis
          .append("text")
          .attr("x", (a + b) / 2)
          .attr("y", plotH + 18)
          .attr("text-anchor", "middle")
          .text(short ? `’${String(season).slice(2)}` : fmtSeason(season))
      })
    }
    // y grid, then zero, the strongest line
    for (const t of ticksY)
      if (t !== 0)
        grid.append("line").attr("y1", y(t)).attr("y2", y(t)).attr("x2", plotW)
    plot
      .append("line")
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("x2", plotW)
      .attr("stroke", color.zero)
      .attr("stroke-width", 1.5)
    for (const t of ticksY)
      axis
        .append("text")
        .attr("x", -8)
        .attr("y", y(t) + 4.5)
        .attr("text-anchor", "end")
        .text(tick(t))
    plot
      .append("text")
      .attr("x", -left)
      .attr("y", -10)
      .call(agate)
      .text(`↑ ${ratings[d.rating].name}, points per 100 possessions`)

    if (dots)
      for (const pt of ss[0].points)
        plot
          .append("circle")
          .attr("cx", x.at(pt.day.n))
          .attr("cy", y(pt.day.v))
          .attr("r", 1.75)
          .attr("fill", ss[0].color)
          .attr("fill-opacity", 0.45)

    // the trends, the last-picked underneath. A run of one day is a dot
    const path = line<Point>()
      .x(pt => x.at(pt.day.n))
      .y(pt => y(pt.trend))
    for (const s of ss.toReversed())
      for (const run of s.runs)
        if (run.length > 1)
          plot
            .append("path")
            .attr("d", path(run))
            .attr("fill", "none")
            .attr("stroke", s.color)
            .attr("stroke-width", 2.25)
            .attr("stroke-linejoin", "round")
            .attr("stroke-dasharray", s.dashed ? "7 4" : null)
        else
          plot
            .append("circle")
            .attr("cx", x.at(run[0].day.n))
            .attr("cy", y(run[0].trend))
            .attr("r", 2.5)
            .attr("fill", s.color)

    lineLabels(
      plot,
      ss.flatMap((s, i) => {
        const e = ends[i]
        if (!e) return []
        return [{ ...s, sub: e.sub, x: x.at(e.end.day.n), y: y(e.end.trend) }]
      }),
      plotW,
      plotH,
    )

    // every day is a mark, so it can be labeled or pointed at: its dot, or
    // its place on the trend. Either way the label is the day's estimate
    const poss = format(",")
    const marks: Mark[] = []
    for (const s of ss)
      for (const { day, trend } of s.points)
        marks.push({
          key: `${s.id}:${isoDate(day.date)}`,
          x: x.at(day.n) + left,
          y: y(dots ? day.v : trend) + top,
          r: 3,
          label: `${fmtDate(day.date, true)} · ${fmt(day.v)} · ${poss(day.poss)} poss`,
        })

    if (!ss.some(s => s.points.length))
      plot
        .append("text")
        .attr("x", plotW / 2)
        .attr("y", plotH / 2)
        .attr("text-anchor", "middle")
        .attr("fill", color.muted)
        .text("No ratings yet")

    return {
      height,
      marks,
      // a note's position: a day and a rating
      invert(px, py) {
        const [u, v] = [px - left, py - top]
        if (u < 0 || u > plotW || v < 0 || v > plotH) return undefined
        const day = x.invert(u)
        if (!day) return undefined
        return { d: isoDate(day), v: +y.invert(v).toFixed(3) }
      },
      project(pos) {
        const { d: day, v } = pos as { d: string; v: number }
        return [x(new Date(day)) + left, y(v) + top]
      },
    }
  },
}
