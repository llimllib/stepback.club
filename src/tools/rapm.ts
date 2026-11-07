// RAPM over time: what yarapm's model thought of a few players on each game
// day, from the games before it. See docs/plans/2026-11-07-rapm-design.md
import {
  format,
  line,
  max,
  min,
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
// days further apart than this break a line: an offseason, an injury, a
// player off every roster. The All-Star break is about a week
const GAP_DAYS = 10
const DAY = 86_400_000

interface Day {
  date: Date
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
  // the span's first and last days
  first: Date
  last: Date
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

// each shown player's days, split into runs at the gaps
function series(d: D, p: P) {
  return shown(d, p).map((id, i) => {
    const days = d.days.get(id) ?? []
    const runs: Day[][] = []
    days.forEach((day, j) => {
      if (!j || +day.date - +days[j - 1].date > GAP_DAYS * DAY) runs.push([])
      runs.at(-1)!.push(day)
    })
    return { id, name: d.names.get(id) ?? id, ...lineStyle(i), days, runs }
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

    const span = []
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
    for (const [rows, players] of seasons) {
      for (const pl of players) names.set(pl.player_id, pl.name)
      for (const r of rows) {
        let list = days.get(r.player_id)
        if (!list) days.set(r.player_id, (list = []))
        list.push({
          date: r.as_of_date,
          v: Number(r[rating]),
          poss: Number(r.possessions ?? 0),
        })
      }
    }
    for (const list of days.values()) list.sort((a, b) => +a.date - +b.date)

    const all = []
    for (let s = first_season; s <= last_season; s++) all.push(s)
    const lists = [...days.values()]
    return {
      from: lo,
      to: hi,
      seasons: all,
      rating,
      names,
      days,
      first: min(lists, l => l[0].date) ?? new Date(),
      last: max(lists, l => l.at(-1)!.date) ?? new Date(),
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
    const span =
      d.from === d.to
        ? `in the ${fmtSeason(d.to)} season`
        : `from ${fmtSeason(d.from)} to ${fmtSeason(d.to)}`
    return {
      title: ratings[d.rating].name,
      who: who(d, p),
      context: `The model's estimate on each game day, from the games before it, ${span}. Points per 100 possessions above average`,
      counts: `${series(d, p).length} players`,
      source: "Data: yarapm",
    }
  },

  render(node, d, p, size): Body {
    const ss = series(d, p)
    const g = select(node)
    const top = 22
    const bottom = 48
    const oneSeason = d.from === d.to

    const values = ss.flatMap(s => s.days.map(day => day.v))
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
    // a line that stops before the span's last day says when
    const ends = ss.map(s => {
      const end = s.days.at(-1)
      if (!end) return undefined
      const early = +end.date < +d.last
      return {
        day: end,
        sub: early
          ? `${fmt(end.v)} · ${fmtDate(end.date, !oneSeason)}`
          : fmt(end.v),
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
    const x = scaleUtc().domain([d.first, d.last]).range([0, plotW])
    y.range([plotH, 0])
    const plot = g.append("g").attr("transform", `translate(${left},${top})`)

    // x ticks: dates in one season, each month's start by its name; in a
    // span, a rule between seasons and each season's name under the middle
    // of its part of the chart
    const grid = plot.append("g").attr("stroke", color.grid)
    const axis = plot
      .append("g")
      .attr("font-size", type.tick.size)
      .attr("font-weight", type.tick.weight)
      .attr("fill", color.muted)
    if (oneSeason) {
      for (const t of x.ticks(8)) {
        grid.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y2", plotH)
        axis
          .append("text")
          .attr("x", x(t))
          .attr("y", plotH + 18)
          .attr("text-anchor", "middle")
          .text(
            +utcMonth.floor(t) === +t
              ? t.toLocaleDateString("en-US", {
                  month: "short",
                  timeZone: "UTC",
                })
              : fmtDate(t),
          )
      }
    } else {
      const n = d.to - d.from + 1
      // "2022–23" if it fits, "’23" if not
      const short = plotW / n < 64
      for (let s = d.from; s <= d.to; s++) {
        // seasons run from October to June: August is between them
        const start = new Date(Date.UTC(s - 1, 7, 1))
        const end = new Date(Date.UTC(s, 7, 1))
        if (s > d.from)
          grid
            .append("line")
            .attr("x1", x(start))
            .attr("x2", x(start))
            .attr("y2", plotH)
        const [a, b] = [Math.max(0, x(start)), Math.min(plotW, x(end))]
        if (a >= b) continue
        axis
          .append("text")
          .attr("x", (a + b) / 2)
          .attr("y", plotH + 18)
          .attr("text-anchor", "middle")
          .text(short ? `’${String(s).slice(2)}` : fmtSeason(s))
      }
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

    // the lines, the last-picked underneath. A run of one day is a dot
    const path = line<Day>()
      .x(day => x(day.date))
      .y(day => y(day.v))
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
            .attr("cx", x(run[0].date))
            .attr("cy", y(run[0].v))
            .attr("r", 2.5)
            .attr("fill", s.color)

    lineLabels(
      plot,
      ss.flatMap((s, i) => {
        const e = ends[i]
        if (!e) return []
        return [{ ...s, sub: e.sub, x: x(e.day.date), y: y(e.day.v) }]
      }),
      plotW,
      plotH,
    )

    // every day is a mark, so it can be labeled or pointed at
    const poss = format(",")
    const marks: Mark[] = []
    for (const s of ss)
      for (const day of s.days)
        marks.push({
          key: `${s.id}:${isoDate(day.date)}`,
          x: x(day.date) + left,
          y: y(day.v) + top,
          r: 3,
          label: `${fmtDate(day.date, true)} · ${fmt(day.v)} · ${poss(day.poss)} poss`,
        })

    if (!ss.some(s => s.days.length))
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
        return { d: isoDate(x.invert(u)), v: +y.invert(v).toFixed(3) }
      },
      project(pos) {
        const { d: day, v } = pos as { d: string; v: number }
        return [x(new Date(day)) + left, y(v) + top]
      },
    }
  },
}
