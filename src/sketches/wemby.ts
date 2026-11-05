// A one-off: Wembanyama's 52-point, 8-block game against Dallas on
// 2026-11-04, against every player-game ESPN has net points for. Offense on
// x, defense on y; the league is a gray density of bins, too many games for
// a dot each, and a few named games are drawn over it. The note
// src/notes/2026-11-05-wembanyama.md embeds it
import { max } from "d3"
import { agate } from "../kit/frame"
import { halo } from "../kit/halo"
import { placeLabels } from "../kit/labels"
import { scatterPlot, sign } from "../kit/scatter"
import { teams } from "../kit/teams"
import { color, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"
import frozen from "../notes/2026-11-05-wembanyama.json"

const defaults = {}
type P = typeof defaults

interface Game {
  key: string
  name: string
  date: Date
  opp: string
  pts: number
  o: number
  d: number
}

interface D {
  games: number
  // [o, d, count]: a bin's low corner, in net points, and its games
  cloud: [number, number, number][]
  bin: { o: number; d: number }
  star: Game
  // the games named on the chart
  named: Game[]
  // games at or beyond the star's offense and defense both, the star's own
  // included
  both: number
}

const signed = (v: number, digits = 1) =>
  `${sign(v)}${Math.abs(v).toFixed(digits)}`
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
const short = (name: string) => name.split(" ").slice(1).join(" ") || name
const yr = (d: Date) => `’${String(d.getUTCFullYear()).slice(2)}`

const game = (g: (typeof frozen.named)[0]): Game => ({
  ...g,
  date: new Date(g.date),
})

// The data is frozen for the note (scripts/freeze-wemby.mjs), so the chart
// shows what the note's numbers describe, whatever ESPN revises later
export const wemby: Tool<P, D> = {
  id: "notes/2026-11-05-wembanyama",
  name: "Wembanyama vs. Dallas",
  defaults,

  async load() {
    const { bin } = frozen
    return {
      games: frozen.games,
      cloud: frozen.cloud.map(([o, d, n]) => [o * bin.o, d * bin.d, n]),
      bin,
      star: game(frozen.star),
      named: frozen.named.map(game),
      both: frozen.ranks.both,
    }
  },

  controls() {
    return []
  },

  describe(d) {
    const s = d.star
    return {
      title: "Both ends at once",
      context: `Victor Wembanyama's ${s.pts} points, 24 rebounds and 8 blocks against Dallas on ${fmtDate(s.date)}, in ESPN's net points, against every game since 2018–19`,
      legend: [
        { symbol: "bar", color: color.faint, text: "games, darker where more" },
        { symbol: "dot", color: color.ink, text: "Wembanyama" },
        { symbol: "dot", color: color.ink, hollow: true, text: "other games" },
      ],
      counts: `${d.games.toLocaleString("en-US")} player-games`,
      source: "Data: ESPN Analytics",
      team: "SAS",
    }
  },

  render(node, d, _p, size): Body {
    const r = 5
    const { plot, x, y, plotW, plotH, left, top, avoid, body } = scatterPlot(
      node,
      {
        size,
        x: { title: "Offensive net points in one game", signed: true },
        y: { title: "Defensive net points in one game", signed: true },
        xs: d.cloud.flatMap(([o]) => [o, o + d.bin.o]),
        ys: d.cloud.flatMap(([, dd]) => [dd, dd + d.bin.d]),
        league: { x: 0, y: 0 },
        guide: { kind: "sum" },
        inset: 4,
      },
    )

    // the league: bins of a quarter point of offense by a tenth of defense,
    // about square on the chart, shaded by the log of their count, so the
    // lone games at the edges show as well as the crowd at zero
    const most = Math.log(max(d.cloud, c => c[2]) ?? 1) + 1
    const bins = plot
      .append("g")
      .attr("fill", color.ink)
      .attr("shape-rendering", "crispEdges")
    for (const [o, dd, n] of d.cloud)
      bins
        .append("rect")
        .attr("x", x(o))
        .attr("y", y(dd + d.bin.d))
        .attr("width", x(o + d.bin.o) - x(o))
        .attr("height", y(dd) - y(dd + d.bin.d))
        .attr("fill-opacity", 0.12 + (0.6 * (Math.log(n) + 1)) / most)

    // the corner beyond the star at both ends, which no other game reaches
    const sx = x(d.star.o)
    const sy = y(d.star.d)
    plot
      .append("path")
      .attr("d", `M${plotW},${sy}H${sx}V0`)
      .attr("fill", "none")
      .attr("stroke", color.ink)
      .attr("stroke-width", 1.25)
      .attr("stroke-dasharray", "5 4")
    const others = d.both - 1
    const corner = plot
      .append("text")
      .attr("x", plotW - 6)
      .attr("y", 14)
      .attr("text-anchor", "end")
      .call(agate)
      .attr("fill", color.ink)
      .text(
        `${others ? others : "No"} other game${others === 1 ? "" : "s"} up here`,
      )
    halo(corner.node()!, 4)

    // the named games
    const spurs = teams.get("SAS")!.colors
    const all = [...d.named, d.star]
    for (const g of d.named)
      plot
        .append("circle")
        .attr("cx", x(g.o))
        .attr("cy", y(g.d))
        .attr("r", r)
        .attr("fill", color.bg)
        .attr("stroke", color.ink)
        .attr("stroke-width", 1.5)
        .append("title")
        .text(
          `${g.name} vs ${g.opp}, ${fmtDate(g.date)}: ${g.pts} pts\nO ${signed(g.o, 2)} · D ${signed(g.d, 2)} · net ${signed(g.o + g.d, 2)}`,
        )
    plot
      .append("circle")
      .attr("cx", sx)
      .attr("cy", sy)
      .attr("r", 8)
      .attr("fill", spurs[0])
      .attr("stroke", spurs[1])
      .attr("stroke-width", 2.5)

    const label = (g: Game) =>
      g === d.star
        ? `Wembanyama · ${g.pts} pts · ${signed(g.o)} off, ${signed(g.d)} def`
        : `${short(g.name)} ${yr(g.date)} · ${g.pts} pts`
    const labeled = placeLabels(
      plot.append("g").attr("font-weight", type.label.weight).node()!,
      all.map(g => ({
        x: x(g.o),
        y: y(g.d),
        r: g === d.star ? 8 : r,
        text: label(g),
        priority: g === d.star ? 1e9 : g.o + g.d,
        always: true,
        key: g.key,
      })),
      { width: plotW, height: plotH },
      { size: type.label.size, avoid },
    )

    const marks: Mark[] = all.map(g => ({
      key: g.key,
      x: x(g.o) + left,
      y: y(g.d) + top,
      r: g === d.star ? 8 : r,
      label: label(g),
      labeled: labeled.has(g.key),
      labelSize: type.label.size,
    }))
    return body(marks)
  },
}
