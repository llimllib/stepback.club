// A one-off: nine players whose game changed from 2025–26 to the start of
// 2026–27, one stat each. Each panel is a strip of every qualifier's value
// this season, with the player's arrow from last season's value (hollow) to
// this season's (filled, in his team's color), and a whisker of two
// standard errors either side of this season's, from resampling his games,
// so ten games' luck has a size. The note src/notes/2026-11-11-changes.md
// embeds it
import { extent, scaleLinear, select } from "d3"
import { agate, bandColors } from "../kit/frame"
import { halo } from "../kit/halo"
import { color, font, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"
import frozen from "../notes/2026-11-11-changes.json"

const defaults = {}
type P = typeof defaults

// each panel's stat, shorter than the freeze's labels, to fit a third of
// the frame
const short: Record<string, string> = {
  ast100: "Assists per 100 poss.",
  fg3share: "Threes, share of shots",
  fg3a100: "Threes per 100 poss.",
  fta100: "Free throws per 100 poss.",
  ftr: "Free throws per 100 shots",
  usg: "Usage",
  rim100: `Shots ≤${frozen.rimFeet} ft per 100 poss.`,
  dreb100: "Def. rebounds per 100 poss.",
  fga100: "Shots per 100 poss.",
}

interface Panel {
  key: string
  name: string
  teams: string[]
  stat: string
  label: string
  pct: boolean
  before: number
  now: number
  se: number
  league: number[]
}

interface D {
  panels: Panel[]
  qualifiers: number
  through: Date
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })

// The data is frozen for the note (scripts/freeze-changes.mjs), so the
// chart shows what the note's numbers describe
export const changes: Tool<P, D> = {
  id: "notes/2026-11-11-changes",
  name: "What changed",
  defaults,

  async load() {
    const league = frozen.league as Record<string, number[]>
    return {
      qualifiers: frozen.qualifiers,
      through: new Date(frozen.through),
      panels: frozen.panels.map(p => {
        const s = (p.stats as Record<string, any>)[p.stat]
        return {
          key: p.id,
          name: p.name,
          teams: p.teams,
          stat: p.stat,
          label: short[p.stat] ?? p.stat,
          pct: (frozen.stats as Record<string, any>)[p.stat].unit === "%",
          before: s.before,
          now: s.now,
          se: s.se,
          league: league[p.stat],
        }
      }),
    }
  },

  controls() {
    return []
  },

  describe(d) {
    return {
      title: "Ch-ch-ch-changes",
      context: `Nine players with big statistical changes so far this season`,
      legend: [
        { symbol: "dot", color: color.ink, hollow: true, text: "2025–26" },
        { symbol: "dot", color: color.ink, text: "2026–27" },
        // { symbol: "dash", color: color.ink, text: "± 2 std. errors" },
        { symbol: "tick", color: color.faint, text: "qualifiers" },
      ],
      counts: `${frozen.qualify.before}+ min last season, ${frozen.qualify.now}+ this`,
      source: `Data: NBA.com, as of ${fmtDate(d.through)}`,
    }
  },

  render(node, d, _p, size): Body {
    const g = select(node)
    const W = size.width
    const cols = 3
    const gap = 24
    const panelW = (W - gap * (cols - 1)) / cols
    const rows = Math.ceil(d.panels.length / cols)
    const rowGap = 14
    const naturalH = 132
    const height =
      size.height ?? Math.round(rows * naturalH + (rows - 1) * rowGap)
    const panelH = (height - (rows - 1) * rowGap) / rows
    const marks: Mark[] = []

    d.panels.forEach((p, i) => {
      const px = (i % cols) * (panelW + gap)
      const py = Math.floor(i / cols) * (panelH + rowGap)
      const panel = g.append("g").attr("transform", `translate(${px},${py})`)
      const fmt = (v: number) => `${v.toFixed(1)}${p.pct ? "%" : ""}`

      // rules, not boxes: a rule over each panel
      panel
        .append("line")
        .attr("x2", panelW)
        .attr("stroke", color.ink)
        .attr("stroke-width", 1)

      // who, and the stat
      const head = panel
        .append("text")
        .attr("y", 22)
        .attr("font-family", font.head)
        .attr("font-size", 19)
        .attr("font-weight", 700)
        .attr("fill", color.ink)
      head.append("tspan").text(p.name)
      head
        .append("tspan")
        .attr("dx", 6)
        .attr("font-weight", 500)
        .attr("font-size", 15)
        .attr("fill", color.muted)
        .text(p.teams[0] === p.teams[1] ? p.teams[1] : p.teams.join("→"))
      panel
        .append("text")
        .attr("y", 40)
        .call(agate)
        .attr("fill", color.muted)
        .text(p.label)

      // the strip
      const lo = p.now - 2 * p.se
      const hi = p.now + 2 * p.se
      const [x0, x1] = extent([...p.league, p.before, lo, hi]) as [
        number,
        number,
      ]
      const x = scaleLinear()
        .domain([Math.max(0, x0), x1])
        .nice(4)
        .range([6, panelW - 6])
      const lineY = panelH - 44
      const axisY = panelH - 22

      // every qualifier, as a tick
      panel
        .append("g")
        .attr("stroke", color.faint)
        .attr("stroke-opacity", 0.55)
        .selectAll("line")
        .data(p.league)
        .join("line")
        .attr("x1", v => x(v))
        .attr("x2", v => x(v))
        .attr("y1", lineY - 9)
        .attr("y2", lineY + 9)

      // the axis
      panel
        .append("line")
        .attr("x1", x.range()[0])
        .attr("x2", x.range()[1])
        .attr("y1", axisY)
        .attr("y2", axisY)
        .attr("stroke", color.grid)
      for (const t of x.ticks(4)) {
        panel
          .append("line")
          .attr("x1", x(t))
          .attr("x2", x(t))
          .attr("y1", axisY)
          .attr("y2", axisY + 4)
          .attr("stroke", color.faint)
        panel
          .append("text")
          .attr("x", x(t))
          .attr("y", axisY + 16)
          .attr("text-anchor", "middle")
          .attr("font-family", font.head)
          .attr("font-size", type.tick.size - 2)
          .attr("fill", color.muted)
          .text(`${t}${p.pct ? "%" : ""}`)
      }

      //  // the noise: two standard errors either side of this season
      //  const wy = lineY + 15;
      //  const whisker = panel
      //    .append("g")
      //    .attr("stroke", color.ink)
      //    .attr("stroke-width", 1.25);
      //  whisker
      //    .append("line")
      //    .attr("x1", x(lo))
      //    .attr("x2", x(hi))
      //    .attr("y1", wy)
      //    .attr("y2", wy);
      //  for (const v of [lo, hi])
      //    whisker
      //      .append("line")
      //      .attr("x1", x(v))
      //      .attr("x2", x(v))
      //      .attr("y1", wy - 3)
      //      .attr("y2", wy + 3);

      // the arrow, from last season to this, stopping short of both dots
      const a = x(p.before)
      const b = x(p.now)
      const dir = Math.sign(b - a)
      const r0 = 5
      const r1 = 7
      const tip = b - dir * (r1 + 2)
      panel
        .append("line")
        .attr("x1", a + dir * (r0 + 1))
        .attr("x2", tip)
        .attr("y1", lineY)
        .attr("y2", lineY)
        .attr("stroke", color.ink)
        .attr("stroke-width", 2)
      panel
        .append("path")
        .attr("d", `M${tip},${lineY}l${-dir * 7},-4.5v9z`)
        .attr("fill", color.ink)

      panel
        .append("circle")
        .attr("cx", a)
        .attr("cy", lineY)
        .attr("r", r0)
        .attr("fill", color.bg)
        .attr("stroke", color.ink)
        .attr("stroke-width", 1.75)
      panel
        .append("circle")
        .attr("cx", b)
        .attr("cy", lineY)
        .attr("r", r1)
        .attr("fill", bandColors(p.teams[1]).band)
        .attr("stroke", color.ink)
        .attr("stroke-width", 1.75)
        .append("title")
        .text(
          `${p.name}: ${fmt(p.before)} → ${fmt(p.now)} (± ${(2 * p.se).toFixed(1)})`,
        )

      // both values over their dots, pushed apart if they'd touch
      const valueY = lineY - 14
      const values = [
        { v: p.before, at: a, now: false },
        { v: p.now, at: b, now: true },
      ].map(o => {
        const t = panel
          .append("text")
          .attr("y", valueY)
          .attr("text-anchor", "middle")
          .attr("font-family", font.head)
          .attr("font-size", o.now ? 17 : 15)
          .attr("font-weight", o.now ? 700 : 500)
          .attr("fill", o.now ? color.ink : color.muted)
          .text(fmt(o.v))
        return { ...o, t, w: t.node()!.getComputedTextLength() }
      })
      const [l, r] = dir >= 0 ? values : values.toReversed()
      const need = (l.w + r.w) / 2 + 8
      const mid = (l.at + r.at) / 2
      let lx = l.at
      let rx = r.at
      if (rx - lx < need) {
        lx = mid - need / 2
        rx = mid + need / 2
      }
      // keep both inside the panel
      const shift =
        Math.max(0, l.w / 2 - lx) - Math.max(0, rx + r.w / 2 - panelW)
      l.t.attr("x", lx + shift)
      r.t.attr("x", rx + shift)
      for (const v of values) halo(v.t.node()!, 3)

      marks.push({
        key: p.key,
        x: px + b,
        y: py + lineY,
        r: r1,
        label: `${p.name} ${fmt(p.before)} → ${fmt(p.now)}`,
      })
    })

    return {
      height,
      marks,
      // a note's position: where it is in the body, as fractions, so it
      // keeps its place at every export size
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
