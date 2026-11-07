// Line charts with a line per player: their colors, and the names in a
// gutter at the right that say which line is whose
import { max, type Selection } from "d3"
import { color, type } from "./theme"

// Okabe-Ito, which is colorblind-safe, without its vermilion (too close to
// the annotation voice) and yellow (gone on newsprint). Past six lines the
// colors repeat on dashed lines
export const palette = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#141414",
]

// the i'th line's color, and whether it's dashed
export const lineStyle = (i: number) => ({
  color: palette[i % palette.length],
  dashed: i >= palette.length,
})

export interface LineEnd {
  name: string
  // under the name, muted: the line's last value, say
  sub: string
  color: string
  dashed: boolean
  // where the line ends, in plot coordinates
  x: number
  y: number
}

// the gutter's width for these names, given a way to measure text
export function gutterWidth(
  ends: Pick<LineEnd, "name" | "sub">[],
  width: (t: string, fontSize: number, weight: number) => number,
) {
  return (
    (max(ends, e =>
      Math.max(
        width(e.name, type.label.size, type.label.weight),
        width(e.sub, type.sub.size, type.sub.weight),
      ),
    ) ?? 0) + 33
  )
}

// Names in the gutter right of a plotW × plotH plot, spread apart so they
// don't overlap, each joined to the end of its line
export function lineLabels(
  plot: Selection<SVGGElement, unknown, null, undefined>,
  ends: LineEnd[],
  plotW: number,
  plotH: number,
) {
  const lineH = type.label.size + type.sub.size + 2
  // from a name's baseline up to its middle, where its swatch is
  const mid = type.label.size * 0.35
  // each name starts with its swatch level with its line's end
  const labels = ends
    .map(e => ({ e, ly: e.y + mid }))
    .sort((a, b) => a.ly - b.ly)
  const minY = type.label.size * 0.8
  const maxY = plotH - type.sub.size - 4
  for (let i = 0; i < labels.length; i++)
    labels[i].ly = Math.max(labels[i].ly, i ? labels[i - 1].ly + lineH : minY)
  for (let i = labels.length - 1; i >= 0; i--)
    labels[i].ly = Math.min(
      labels[i].ly,
      i < labels.length - 1 ? labels[i + 1].ly - lineH : maxY,
    )
  // each name starts with a swatch of its line, as in a legend, so the
  // leader to it can be a thin gray rule that doesn't read as data
  const sx = plotW + 12
  const lx = sx + 17
  const endR = 3.5
  for (const { e, ly } of labels) {
    const my = ly - mid
    const [dx, dy] = [sx - 3 - e.x, my - e.y]
    const k = (endR + 2) / Math.hypot(dx, dy)
    // a line ending at the edge, level with its name, is joined to it
    // by the swatch beside it; a leader there would be a stub
    const level = e.x > plotW - 1 && Math.abs(dy) < type.label.size / 2
    if (!level)
      plot
        .append("line")
        .attr("x1", e.x + dx * k)
        .attr("y1", e.y + dy * k)
        .attr("x2", sx - 3)
        .attr("y2", my)
        .attr("stroke", color.muted)
        .attr("stroke-width", 0.75)
        .attr("stroke-dasharray", "3 3")
    // the line's end, so it's plain where the data stops
    plot
      .append("circle")
      .attr("cx", e.x)
      .attr("cy", e.y)
      .attr("r", endR)
      .attr("fill", e.color)
      .attr("stroke", color.bg)
      .attr("stroke-width", 1)
    plot
      .append("line")
      .attr("x1", sx)
      .attr("x2", sx + 12)
      .attr("y1", my)
      .attr("y2", my)
      .attr("stroke", e.color)
      .attr("stroke-width", 2.25)
      .attr("stroke-dasharray", e.dashed ? "4 2" : null)
    plot
      .append("text")
      .attr("x", lx)
      .attr("y", ly)
      .attr("font-size", type.label.size)
      .attr("font-weight", type.label.weight)
      .text(e.name)
    plot
      .append("text")
      .attr("x", lx)
      .attr("y", ly + type.sub.size + 1)
      .attr("font-size", type.sub.size)
      .attr("font-weight", type.sub.weight)
      .attr("fill", color.muted)
      .text(e.sub)
  }
}
