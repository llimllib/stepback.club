// A one-off: every team's net, offense and defense by the five measures the
// efficiency tool has, as a grid of its "to scale" strips. A row for each
// rating, a column for each source; every strip has the same points to the
// inch, so the rows and columns compare. The note
// src/notes/2026-11-12-five-ways.md embeds it
import { max, min, scaleLinear, select } from "d3"
import { agate, logoUrl } from "../kit/frame"
import { nudge } from "../kit/strip"
import { color, font, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"
import frozen from "../notes/2026-11-12-five-ways.json"

const defaults = {}
type P = typeof defaults

type Key = "net" | "off" | "def"
const rows: { key: Key; label: string }[] = [
  { key: "net", label: "Net" },
  { key: "off", label: "Offense" },
  { key: "def", label: "Defense" },
]

// each column's header, in two lines to fit a fifth of the frame
const heads: Record<string, [string, string]> = {
  nba: ["NBA.com", "results"],
  ctg: ["Cleaning the Glass", "no garbage time"],
  rapm: ["yarapm", "full strength"],
  rapm_today: ["yarapm", "expected lineup"],
  epm: ["EPM", "Dunks & Threes"],
}

interface Source {
  id: string
  label: string
  teams: { team: string; net: number; off: number; def: number }[]
}

interface D {
  sources: Source[]
  through: Date
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
function signed(v: number) {
  const t = Math.abs(v).toFixed(1)
  if (t === "0.0") return t
  return v > 0 ? `+${t}` : `−${t}`
}

// The data is frozen for the note (scripts/freeze-fiveways.mjs)
export const fiveways: Tool<P, D> = {
  id: "notes/2026-11-12-five-ways",
  name: "Five team ratings",
  defaults,

  async load() {
    return {
      sources: frozen.sources,
      through: new Date(frozen.frozen),
    }
  },

  controls() {
    return []
  },

  describe(d) {
    return {
      title: "Five team ratings",
      context: `Points per 100 possessions better or worse than the average team in 2026–27, as of ${fmtDate(d.through)}`,
      source: "Data: NBA.com, CTG, yarapm, Dunks & Threes",
    }
  },

  render(node, d, _p, size): Body {
    const g = select(node)
    const W = size.width
    const n = d.sources.length
    const gutter = 34
    const gap = 14
    const colW = (W - gutter - gap * (n - 1)) / n
    const colX = (j: number) => gutter + j * (colW + gap)
    const top = 48
    // over each row: a rule and its name
    const rowHead = 30
    const logo = 16

    // each row's domain, over every source, and its share of the height:
    // the same points per pixel in every row
    const domains = rows.map(r => {
      const vs = d.sources.flatMap(s => s.teams.map(t => t[r.key]))
      return scaleLinear()
        .domain([Math.min(0, min(vs)!), Math.max(0, max(vs)!)])
        .nice()
        .domain()
    })
    const span = domains.reduce((s, [lo, hi]) => s + hi - lo, 0)
    const fixed = top + rows.length * (rowHead + logo)
    const height = size.height ?? Math.round(fixed + span * 13)
    const perPoint = (height - fixed) / span

    const marks: Mark[] = []

    // the sources, once, over the columns: the measure, and whose or which
    d.sources.forEach((s, j) => {
      const [name, which] = heads[s.id]
      const head = g
        .append("text")
        .attr("x", colX(j) + colW / 2)
        .attr("y", top - 28)
        .attr("text-anchor", "middle")
        .call(agate)
        .attr("fill", color.ink)
      head.append("tspan").attr("font-weight", 700).text(name)
      head
        .append("tspan")
        .attr("x", colX(j) + colW / 2)
        .attr("dy", 15)
        .attr("fill", color.muted)
        .text(which)
    })

    let y0 = top
    rows.forEach((r, i) => {
      const [lo, hi] = domains[i]
      const h = (hi - lo) * perPoint
      const bodyTop = y0 + rowHead + logo / 2
      const sy = scaleLinear()
        .domain([lo, hi])
        .range([bodyTop + h, bodyTop])
      const row = g.append("g")

      // rules, not boxes: a rule over the row, and its name
      row
        .append("line")
        .attr("x2", W)
        .attr("y1", y0)
        .attr("y2", y0)
        .attr("stroke", color.ink)
      row
        .append("text")
        .attr("y", y0 + 20)
        .attr("font-family", font.head)
        .attr("font-size", 19)
        .attr("font-weight", 700)
        .attr("fill", color.ink)
        .text(r.label)

      // the grid runs through every column; zero, the average, strongest
      for (const v of sy.ticks(Math.max(2, Math.round(h / 60)))) {
        row
          .append("line")
          .attr("x1", gutter)
          .attr("x2", W)
          .attr("y1", sy(v))
          .attr("y2", sy(v))
          .attr("stroke", v === 0 ? color.zero : color.grid)
          .attr("stroke-width", v === 0 ? 1.5 : 1)
        row
          .append("text")
          .attr("x", gutter - 6)
          .attr("y", sy(v) + 4)
          .attr("text-anchor", "end")
          .attr("font-size", type.tick.size - 2)
          .attr("fill", color.muted)
          .text(v === 0 ? "avg" : signed(v).replace(".0", ""))
      }

      d.sources.forEach((s, j) => {
        const ts = [...s.teams].sort((a, b) => b[r.key] - a[r.key])
        const ys = ts.map(t => sy(t[r.key]))
        const xs = nudge(ys, colX(j) + colW / 2, logo, colW / 2)
        ts.forEach((t, k) => {
          row
            .append("image")
            .attr("href", logoUrl(t.team))
            .attr("x", xs[k] - logo / 2)
            .attr("y", ys[k] - logo / 2)
            .attr("width", logo)
            .attr("height", logo)
            .append("title")
            .text(
              `${t.team} ${signed(t[r.key])} ${r.label.toLowerCase()}, ${s.label}`,
            )
          marks.push({
            key: `${s.id}:${r.key}:${t.team}`,
            x: xs[k],
            y: ys[k],
            r: logo / 2,
            label: `${t.team} ${signed(t[r.key])}`,
          })
        })
      })
      y0 = bodyTop + h + logo / 2
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
