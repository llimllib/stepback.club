// A scatter plot's scaffolding, for tools that plot one stat against
// another: scales, grid, axes and their titles, the reference lines a pair
// asks for, and its corners' names. The tool draws its own marks into
// `plot`, in plot coordinates, and returns `body(marks)` from render
import {
  extent,
  scaleLinear,
  select,
  type ScaleLinear,
  type Selection,
} from "d3"
import { agate } from "./frame"
import type { Box } from "./labels"
import { color, type } from "./theme"
import type { Body, Mark } from "./tool"

export interface Axis {
  title: string
  // ticks are percentages
  pct?: boolean
  // ticks carry a sign, and zero is the strongest line
  signed?: boolean
  // lower is better: the axis runs backwards, so up and right are better,
  // and its title says so
  reverse?: boolean
}

// "lower is better" would be read as a position on a reversed axis, so a
// reversed axis's title names the direction that's better instead
const titleOf = (a: Axis, better: "up" | "right") =>
  a.reverse ? `${a.title} (reversed: ${better} is better)` : a.title

// The reference lines:
// - average: dashed lines at the league's x and y
// - ratios: lines of constant y:x through zero, and the league's ratio,
//   dashed. The axes start at zero, where the lines meet, unless `zero` is
//   false, for values far from it
// - sum: lines of constant x + y, for offense against defense in numbers
//   where zero is average
// - diff: the average lines, and lines of constant x − y, for a side of the
//   ball against its opposite: the net
// - identity: the line y = x, for two stats in the same units where y
//   should be x: the axes share a domain, so it runs corner to corner
export type Guide =
  | { kind: "average" }
  | { kind: "identity" }
  | { kind: "ratios"; ratios: number[]; zero?: boolean }
  | { kind: "sum" }
  | { kind: "diff"; name: (c: number) => string }

export interface Scatter {
  plot: Selection<SVGGElement, unknown, null, undefined>
  x: ScaleLinear<number, number>
  y: ScaleLinear<number, number>
  plotW: number
  plotH: number
  left: number
  top: number
  height: number
  // the lines labels keep off
  avoid: Box[]
  // the frame's body, with notes placed by the plot's two stats
  body(marks: Mark[]): Body
}

const pct = (v: number) => `${Math.round(v * 100)}%`
export const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "")
// a ratio as y:x, in whole numbers: 2 is 2:1 and 0.25 is 1:4
const fmtRatio = (k: number) =>
  k >= 1 ? `${+k.toFixed(1)}:1` : `1:${+(1 / k).toFixed(1)}`
// whether a pixel position is on a plot's edge
const atEdge = (u: number, edge: number) => Math.abs(u - edge) < 0.5

export function scatterPlot(
  node: SVGGElement,
  o: {
    size: { width: number; height?: number }
    x: Axis
    y: Axis
    // the values plotted, which the axes cover
    xs: number[]
    ys: number[]
    league: { x: number; y: number }
    guide: Guide
    // the quadrants' names: top left, top right, bottom left, bottom right
    corners?: [string, string, string, string]
    // how far a mark reaches from its value, kept inside the plot
    inset: number
  },
): Scatter {
  const { guide } = o
  const g = select(node)
  const left = 46
  const bottom = 48
  const top = 20
  // lines across the plot are named in a gutter on the right
  const right = guide.kind === "average" || guide.kind === "identity" ? 0 : 30
  const plotW = o.size.width - left - right
  const height = o.size.height ?? Math.round(plotW * 0.82) + top + bottom
  const plotH = height - top - bottom

  // ratios start at zero, where their lines meet, and a sum shows zero, its
  // average; the rest show their averages
  const atZero =
    (guide.kind === "ratios" && guide.zero !== false) ||
    guide.kind === "sum" ||
    guide.kind === "identity"
  const same = guide.kind === "identity"
  const [x0, x1] = extent([
    ...o.xs,
    ...(same ? o.ys : []),
    atZero ? 0 : o.league.x,
  ])
  const [y0, y1] = extent([
    ...o.ys,
    ...(same ? o.xs : []),
    atZero ? 0 : o.league.y,
  ])
  const xr = [o.inset, plotW - o.inset]
  const yr = [plotH - o.inset, o.inset]
  const x = scaleLinear()
    .domain([x0 ?? 0, x1 ?? 1])
    .nice()
    .range(o.x.reverse ? xr.toReversed() : xr)
  const y = scaleLinear()
    .domain([y0 ?? 0, y1 ?? 1])
    .nice()
    .range(o.y.reverse ? yr.toReversed() : yr)
  const plot = g.append("g").attr("transform", `translate(${left},${top})`)

  // grid
  const grid = plot.append("g").attr("stroke", color.grid)
  for (const t of x.ticks(6))
    grid.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y2", plotH)
  for (const t of y.ticks(6))
    grid.append("line").attr("y1", y(t)).attr("y2", y(t)).attr("x2", plotW)

  const avoid: Box[] = []
  const guides = plot.append("g")
  const ref = plot
    .append("g")
    .attr("stroke", color.muted)
    .attr("stroke-width", 1.25)
    .attr("stroke-dasharray", "5 4")
  const zero = plot
    .append("g")
    .attr("stroke", color.zero)
    .attr("stroke-width", 1.5)
  // the domains, low to high, whichever way the axes run
  const [X0, X1] = x.domain()
  const [Y0, Y1] = y.domain()

  // the y axis's title, which a name above the plot keeps clear of
  const yTitle = plot
    .append("text")
    .attr("x", -left)
    .attr("y", -8)
    .call(agate)
    .text(`↑ ${titleOf(o.y, "up")}`)
  const yTitleEnd = -left + yTitle.node()!.getComputedTextLength()

  // A faint line across the plot, named outside it where it leaves by the
  // right or the top, so no mark covers its name
  const line = (a: [number, number], b: [number, number], name: string) => {
    const [pa, pb] = [a, b].map(([u, v]) => [x(u), y(v)])
    guides
      .append("line")
      .attr("x1", pa[0])
      .attr("y1", pa[1])
      .attr("x2", pb[0])
      .attr("y2", pb[1])
      .attr("stroke", color.grid)
      .attr("stroke-width", 1.5)
    const atRight = [pa, pb].find(e => atEdge(e[0], Math.max(...x.range())))
    const atTop = [pa, pb].find(e => atEdge(e[1], Math.min(...y.range())))
    const text = guides
      .append("text")
      .call(agate)
      .attr("fill", color.faint)
      .text(name)
    if (atRight) text.attr("x", plotW + 4).attr("y", atRight[1] + 4)
    else if (atTop && atTop[0] - 16 > yTitleEnd + 8)
      text.attr("x", atTop[0]).attr("y", -6).attr("text-anchor", "middle")
    else text.remove()
  }
  const averages = () => {
    ref
      .append("line")
      .attr("y1", y(o.league.y))
      .attr("y2", y(o.league.y))
      .attr("x2", plotW)
    ref
      .append("line")
      .attr("x1", x(o.league.x))
      .attr("x2", x(o.league.x))
      .attr("y2", plotH)
    avoid.push(
      { x0: x(o.league.x) - 1, x1: x(o.league.x) + 1, y0: 0, y1: plotH },
      { x0: 0, x1: plotW, y0: y(o.league.y) - 1, y1: y(o.league.y) + 1 },
    )
  }

  if (guide.kind === "ratios") {
    // the part of the line through zero with slope k inside the plot
    const clip = (k: number): [[number, number], [number, number]] | null => {
      const xa = Math.max(X0, Y0 / k)
      const xb = Math.min(X1, Y1 / k)
      return xb > xa
        ? [
            [xa, k * xa],
            [xb, k * xb],
          ]
        : null
    }
    for (const k of guide.ratios) {
      const ends = clip(k)
      if (ends) line(...ends, fmtRatio(k))
    }
    // the league's ratio is dashed, like an average
    const ends = clip(o.league.y / o.league.x)
    if (ends)
      ref
        .append("line")
        .attr("x1", x(ends[0][0]))
        .attr("y1", y(ends[0][1]))
        .attr("x2", x(ends[1][0]))
        .attr("y2", y(ends[1][1]))
  } else if (guide.kind === "sum") {
    // lines of constant x + y, a step apart
    for (const c of scaleLinear()
      .domain([X0 + Y0, X1 + Y1])
      .ticks(6)) {
      const xa = Math.max(X0, c - Y1)
      const xb = Math.min(X1, c - Y0)
      if (xb - xa < (X1 - X0) / 20) continue
      line([xa, c - xa], [xb, c - xb], `${sign(c)}${Math.abs(c)}`)
    }
  } else if (guide.kind === "diff") {
    averages()
    // lines of constant x − y, a step apart
    for (const c of scaleLinear()
      .domain([X0 - Y1, X1 - Y0])
      .ticks(6)) {
      const xa = Math.max(X0, c + Y0)
      const xb = Math.min(X1, c + Y1)
      if (xb - xa < (X1 - X0) / 20) continue
      line([xa, xa - c], [xb, xb - c], guide.name(c))
    }
  } else if (guide.kind === "identity") {
    // stronger than the grid, as it's what the chart is about; weaker than
    // zero
    const lo = Math.max(X0, Y0)
    const hi = Math.min(X1, Y1)
    guides
      .append("line")
      .attr("x1", x(lo))
      .attr("y1", y(lo))
      .attr("x2", x(hi))
      .attr("y2", y(hi))
      .attr("stroke", color.muted)
      .attr("stroke-width", 1.25)
  } else averages()

  // zero is the strongest line on a signed axis
  if (o.x.signed && X0 < 0 && X1 > 0) {
    zero.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y2", plotH)
    avoid.push({ x0: x(0) - 1, x1: x(0) + 1, y0: 0, y1: plotH })
  }
  if (o.y.signed && Y0 < 0 && Y1 > 0) {
    zero.append("line").attr("y1", y(0)).attr("y2", y(0)).attr("x2", plotW)
    avoid.push({ x0: 0, x1: plotW, y0: y(0) - 1, y1: y(0) + 1 })
  }

  // the quadrants, named in their corners. These are guideposts: drawn
  // first and faint, so marks and names write over them when they need to
  if (o.corners) {
    const [tl, tr, bl, br] = o.corners
    const corners: [string, number, number, "start" | "end"][] = [
      [tl, 6, 14, "start"],
      [tr, plotW - 6, 14, "end"],
      [bl, 6, plotH - 8, "start"],
      [br, plotW - 6, plotH - 8, "end"],
    ]
    for (const [text, cx, cy, anchor] of corners)
      plot
        .append("text")
        .attr("x", cx)
        .attr("y", cy)
        .attr("text-anchor", anchor)
        .call(agate)
        .attr("fill", color.faint)
        .text(text)
  }

  // axes: ticks, and titles beside them
  const tickFmt = (a: Axis, sc: typeof x) => {
    if (a.pct) return pct
    const f = sc.tickFormat(6, ",~f")
    return a.signed ? (v: number) => `${sign(v)}${f(Math.abs(v))}` : f
  }
  const [xFmt, yFmt] = [tickFmt(o.x, x), tickFmt(o.y, y)]
  const axis = plot
    .append("g")
    .attr("font-size", type.tick.size)
    .attr("fill", color.muted)
  for (const t of x.ticks(6))
    axis
      .append("text")
      .attr("x", x(t))
      .attr("y", plotH + 18)
      .attr("text-anchor", "middle")
      .text(xFmt(t))
  for (const t of y.ticks(6))
    axis
      .append("text")
      .attr("x", -8)
      .attr("y", y(t) + 4.5)
      .attr("text-anchor", "end")
      .text(yFmt(t))
  plot
    .append("text")
    .attr("x", plotW / 2)
    .attr("y", plotH + 40)
    .attr("text-anchor", "middle")
    .call(agate)
    .text(`${titleOf(o.x, "right")} →`)

  return {
    plot,
    x,
    y,
    plotW,
    plotH,
    left,
    top,
    height,
    avoid,
    body: marks => ({
      height,
      marks,
      // a note's position: the pair's two stats
      invert(px, py) {
        const [u, v] = [px - left, py - top]
        if (u < 0 || u > plotW || v < 0 || v > plotH) return undefined
        return {
          x: +x.invert(u).toPrecision(5),
          y: +y.invert(v).toPrecision(5),
        }
      },
      project(pos) {
        const { x: u, y: v } = pos as { x: number; y: number }
        return [x(u) + left, y(v) + top]
      },
    }),
  }
}
