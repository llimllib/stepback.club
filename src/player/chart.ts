// A player's yarapm over his career, by age, against the players he's
// compared with: RAPM over time's lines (rapm.ts), with age on x so a
// player's season at 23 sits over another's at 23, whenever each was. SVG
// in the kit's frame, so it exports. Design: "RAPM chart" in
// docs/plans/2026-11-18-player-page-design.md
import { format, line, max, precisionFixed, scaleLinear, select } from "d3"
import { agate, buildFrame } from "../kit/frame"
import { gutterWidth, lineLabels, lineStyle } from "../kit/lines"
import { color, SITE, type } from "../kit/theme"
import type { Body, Description } from "../kit/tool"
import { pinEnd, smooth } from "../tools/rapm"
import type { RatingDay } from "./load"

export interface Line {
  id: string
  name: string
  // his age in a season is season − offset
  offset: number
  days: RatingDay[]
}

// each season's span, for placing a day within its age's band: opening
// night to the last game, in ms
export type Spans = Map<number, { start: number; end: number }>

// a player missing more days of a season than this breaks his line: an
// injury, off every roster. The All-Star break is about a week
const GAP_MS = 21 * 86_400_000
// the room between two ages' bands
const PAD = 6

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

function signedFmt(digits = 1) {
  const f = format(`.${digits}f`)
  return (v: number) => {
    const t = f(Math.abs(v))
    if (t === f(0)) return t
    return v > 0 ? `+${t}` : `−${t}`
  }
}
const fmt = signedFmt()

interface Pt {
  day: RatingDay
  age: number
  // the day's place within its season, 0 to 1
  frac: number
  trend: number
}

function series(lines: Line[], given: Spans) {
  const seasons = new Set(lines.flatMap(l => l.days.map(d => d.season)))
  // a season whose schedule couldn't be read spans the days rated in it,
  // rather than piling them all at its band's left edge
  const spans: Spans = new Map(given)
  for (const season of seasons)
    if (!spans.has(season)) {
      const t = lines.flatMap(l =>
        l.days.filter(d => d.season === season).map(d => +d.date),
      )
      spans.set(season, { start: Math.min(...t), end: Math.max(...t) })
    }
  // about a week a season wide, up to six weeks over a career, as in
  // RAPM over time
  const sigma = Math.min(20, Math.max(2, (seasons.size * 170) / 50))
  return lines.map((l, i) => {
    const trend = pinEnd(l.days, smooth(l.days, sigma), sigma * 2)
    const runs: Pt[][] = []
    l.days.forEach((day, j) => {
      const span = spans.get(day.season)
      const frac =
        span && span.end > span.start
          ? Math.min(
              1,
              Math.max(0, (+day.date - span.start) / (span.end - span.start)),
            )
          : 0
      const prev = l.days[j - 1]
      if (
        !prev ||
        (prev.season === day.season && +day.date - +prev.date > GAP_MS) ||
        day.season - prev.season > 1
      )
        runs.push([])
      runs
        .at(-1)!
        .push({ day, age: day.season - l.offset, frac, trend: trend[j] })
    })
    return { ...l, ...lineStyle(i), runs, points: runs.flat() }
  })
}

export function describe(lines: Line[], team: string): Description {
  const [me, ...others] = lines
  const one = !others.length
  const against = others.length
    ? `, against ${others.map(o => o.name).join(", ")}`
    : ""
  const color0 = lineStyle(0).color
  return {
    title: `${me.name}'s RAPM`,
    context: `yarapm's estimate of ${one ? "him" : "each"} on every game day, from the games before it, ${one ? "and its trend" : "as a trend"}, by age at the season's end${against}. Points per 100 possessions above average`,
    legend: one
      ? [
          { symbol: "dot", color: color0, text: "Each day" },
          { symbol: "line", color: color0, text: "Trend" },
        ]
      : undefined,
    counts: one ? undefined : `${lines.length} players`,
    source: "Data: yarapm, NBA.com",
    team: team || undefined,
  }
}

export function chartFrame(
  container: HTMLElement,
  lines: Line[],
  spans: Spans,
  team: string,
) {
  const ids = lines.map(l => l.id)
  const url = `${SITE}/player?id=${ids[0]}${ids.length > 1 ? `&vs=${ids.slice(1).join(",")}` : ""}`
  return buildFrame(
    container,
    "auto",
    describe(lines, team),
    url,
    (node, size) => draw(node, size, lines, spans),
  ).svg
}

function draw(
  node: SVGGElement,
  size: { width: number; height?: number },
  lines: Line[],
  spans: Spans,
): Body {
  const ss = series(lines, spans)
  const g = select(node)
  const top = 22
  const bottom = 44
  const dots = ss.length === 1

  const values = ss.flatMap(s =>
    s.points.map(pt => (dots ? pt.day.v : pt.trend)),
  )
  const y = scaleLinear()
    .domain([Math.min(0, ...values), Math.max(0, ...values)])
    .nice(6)
  const allAges = ss.flatMap(s => s.points.map(p => p.age))
  const [lo, hi] = allAges.length
    ? [Math.min(...allAges), Math.max(...allAges)]
    : [0, 0]

  const measure = g.append("text")
  const width = (t: string, fontSize: number, weight: number) =>
    measure
      .attr("font-size", fontSize)
      .attr("font-weight", weight)
      .text(t)
      .node()!
      .getComputedTextLength()
  const ticksY = y.ticks(6)
  const tick = signedFmt(
    precisionFixed(ticksY.length > 1 ? ticksY[1] - ticksY[0] : 1),
  )
  const left =
    (max(ticksY, t => width(tick(t), type.tick.size, type.tick.weight)) ?? 20) +
    10
  const ends = ss.map(s => {
    const end = s.points.at(-1)
    return end && { end, sub: `${fmt(end.day.v)} at ${end.age}` }
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
  const height = size.height ?? Math.round(plotW * 0.6) + top + bottom
  const plotH = height - top - bottom
  // a band an age, PAD apart
  const bands = hi - lo + 1
  const bandW = (plotW - PAD * (bands - 1)) / bands
  const x = (age: number, frac: number) =>
    (age - lo) * (bandW + PAD) + frac * bandW
  y.range([plotH, 0])
  const plot = g.append("g").attr("transform", `translate(${left},${top})`)

  const grid = plot.append("g").attr("stroke", color.grid)
  const axis = plot
    .append("g")
    .attr("font-size", type.tick.size)
    .attr("font-weight", type.tick.weight)
    .attr("fill", color.muted)
  // a rule between ages, each age under its band; every other one when
  // they're narrow
  const every = bandW < 16 ? 2 : 1
  for (let a = lo; a <= hi; a++) {
    const x0 = x(a, 0)
    if (a > lo)
      grid
        .append("line")
        .attr("x1", x0 - PAD / 2)
        .attr("x2", x0 - PAD / 2)
        .attr("y2", plotH)
    if ((a - lo) % every === 0)
      axis
        .append("text")
        .attr("x", x0 + bandW / 2)
        .attr("y", plotH + 18)
        .attr("text-anchor", "middle")
        .text(String(a))
  }
  plot
    .append("text")
    .attr("x", plotW)
    .attr("y", plotH + 36)
    .attr("text-anchor", "end")
    .call(agate)
    .text("Age at the season's end →")
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
    .text("↑ RAPM, points per 100 possessions")

  if (dots)
    for (const pt of ss[0].points)
      plot
        .append("circle")
        .attr("cx", x(pt.age, pt.frac))
        .attr("cy", y(pt.day.v))
        .attr("r", 1.75)
        .attr("fill", ss[0].color)
        .attr("fill-opacity", 0.45)

  // the trends, the player himself on top. A run of one day is a dot
  const path = line<Pt>()
    .x(pt => x(pt.age, pt.frac))
    .y(pt => y(pt.trend))
  for (const s of ss.toReversed())
    for (const run of s.runs)
      if (run.length > 1)
        plot
          .append("path")
          .attr("d", path(run))
          .attr("fill", "none")
          .attr("stroke", s.color)
          .attr("stroke-width", s === ss[0] ? 3 : 2)
          .attr("stroke-linejoin", "round")
          .attr("stroke-dasharray", s.dashed ? "7 4" : null)
      else
        plot
          .append("circle")
          .attr("cx", x(run[0].age, run[0].frac))
          .attr("cy", y(run[0].trend))
          .attr("r", 2.5)
          .attr("fill", s.color)

  lineLabels(
    plot,
    ss.flatMap((s, i) => {
      const e = ends[i]
      if (!e) return []
      return [
        {
          ...s,
          sub: e.sub,
          x: x(e.end.age, e.end.frac),
          y: y(e.end.trend),
        },
      ]
    }),
    plotW,
    plotH,
  )

  // every day is a mark, for hovering: its estimate and what it rests on
  const poss = format(",")
  for (const s of ss)
    for (const pt of s.points)
      if (dots || s === ss[0])
        plot
          .append("circle")
          .attr("cx", x(pt.age, pt.frac))
          .attr("cy", y(dots ? pt.day.v : pt.trend))
          .attr("r", 3)
          .attr("fill", "transparent")
          .append("title")
          .text(
            `${s.name}, ${fmtDate(pt.day.date)} · age ${pt.age} · ${fmt(pt.day.v)} · ${poss(pt.day.poss)} poss`,
          )

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
    marks: [],
    invert: () => undefined,
    project: () => undefined,
  }
}
