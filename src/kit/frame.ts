// The frame every chart renders into, and the thing that gets exported: a
// header band (headline, deck, logo box) in the team's color or ink, a
// legend strip, the chart body, and a footer with the source and the tool's
// URL. See docs/plans/2026-10-25-newspaper-design.md
import { create, rgb, select, type Selection } from "d3"
import { teams } from "./teams"
import { color, font, type } from "./theme"
import type { Body, Description, LegendItem } from "./tool"

export const sizes = {
  auto: { width: 720, height: undefined, label: "Fit" },
  square: { width: 720, height: 720, label: "Square" },
  tall: { width: 720, height: 900, label: "4:5" },
} as const
export type Size = keyof typeof sizes

const pad = 28
const stripHeight = 34
// a wrapped legend's rows, and the counts when they drop below it
const legendRow = stripHeight - 12
const footerHeight = 40

export interface Frame {
  svg: SVGSVGElement
  body: Body
  // offset of the body within the frame
  bx: number
  by: number
  title: SVGTextElement
  context: SVGTextElement
}

// WCAG relative luminance and contrast ratio
function luminance(c: string) {
  const { r, g, b } = rgb(c)
  const [R, G, B] = [r, g, b].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The band's color and the text color that reads on it, whichever of white
// and ink contrasts more. When neither reaches WCAG's 4.5:1 (Portland's red),
// the band darkens until white does
export function bandColors(abbrev?: string) {
  const team = abbrev ? teams.get(abbrev) : undefined
  if (!team) return { band: color.ink, text: color.bg, team }
  let band = team.colors[0]
  if (contrast(band, color.ink) >= 4.5) return { band, text: color.ink, team }
  while (contrast(band, "#fff") < 4.5) band = rgb(band).darker(0.1).formatHex()
  return { band, text: "#fff", team }
}

// ESPN's logo CDN uses the NBA abbreviation, except for these two. (Not the
// abbreviations in ESPN's analytics data: that's BRK, SAN)
const logoCodes: Record<string, string> = { NOP: "no", UTA: "utah" }
export const logoUrl = (abbrev: string) =>
  `https://a.espncdn.com/i/teamlogos/nba/500/${logoCodes[abbrev] ?? abbrev.toLowerCase()}.png`

// One team in a two-team band: its name, under its city or over a subhead,
// and beside it the points it scored. The winner's points are bold, the loser's
// regular, so the result reads without its color
export interface VersusSide {
  abbrev: string
  name: string
  // set, and without a subhead, the city goes over the name, smaller
  city?: string
  sub?: string
  score?: number
  won?: boolean
}

// A game's two teams, away on the left (at a neutral site, whichever the
// caller puts first), with an ink box between them like a scoreboard's: a
// word ("at", "vs.") and lines of agate under it
export interface Versus {
  sides: [VersusSide, VersusSide]
  word: string
  lines: string[]
}

// The two bands and the box between, `width` by `height`, at the node's
// origin. Each band is its team's color, contrast-picked text, and its logo
// in a newsprint box inset at the outside edge, so the band surrounds it
export function versusBands(
  node: SVGGElement,
  width: number,
  height: number,
  v: Versus,
) {
  const g = select(node)
  const mid = width / 2
  const boxW = 92
  const seam = 3
  g.append("rect")
    .attr("x", mid - boxW / 2)
    .attr("width", boxW)
    .attr("height", height)
    .attr("fill", color.ink)
  // the word and its lines, centered as a block: the word's caps are about
  // 13px tall, and each line 11
  const wordY = Math.floor((height - (13 + v.lines.length * 11)) / 2) + 13
  g.append("text")
    .attr("x", mid)
    .attr("y", wordY)
    .attr("text-anchor", "middle")
    .attr("font-family", font.head)
    .attr("font-weight", 700)
    .attr("font-size", 18)
    .attr("fill", color.bg)
    .style("text-transform", "uppercase")
    .text(v.word)
  v.lines.forEach((t, k) =>
    g
      .append("text")
      .attr("x", mid)
      .attr("y", wordY + 13 + k * 11)
      .attr("text-anchor", "middle")
      .call(agate)
      .attr("font-size", 9.5)
      .attr("letter-spacing", "0.02em")
      .attr("fill", color.bg)
      .text(t),
  )

  const nameSize = Math.round(height * 0.46)
  const scoreSize = Math.round(height * 0.6)
  v.sides.forEach((s, i) => {
    const { band, text } = bandColors(s.abbrev)
    const x0 = i ? mid + boxW / 2 + seam : 0
    const w = mid - boxW / 2 - seam
    g.append("rect")
      .attr("x", x0)
      .attr("width", w)
      .attr("height", height)
      .attr("fill", band)
    const inset = Math.round(height / 9)
    const box = height - inset * 2
    const bx = i ? x0 + w - inset - box : x0 + inset
    g.append("rect")
      .attr("x", bx)
      .attr("y", inset)
      .attr("width", box)
      .attr("height", box)
      .attr("fill", color.bg)
    if (teams.has(s.abbrev))
      g.append("image")
        .attr("href", logoUrl(s.abbrev))
        .attr("x", bx + 4)
        .attr("y", inset + 4)
        .attr("width", box - 8)
        .attr("height", box - 8)
    // the points, at the band's inner edge, beside the box
    let scoreW = 0
    if (s.score !== undefined) {
      const score = g
        .append("text")
        .attr("x", i ? x0 + 12 : x0 + w - 12)
        .attr("y", height / 2 + scoreSize * 0.35)
        .attr("text-anchor", i ? "start" : "end")
        .attr("font-family", font.head)
        .attr("font-weight", s.won ? 700 : 500)
        .attr("font-size", scoreSize)
        .attr("fill", text)
        .text(s.score)
      scoreW = score.node()!.getComputedTextLength() + 12
    }
    const tx = i ? x0 + w - inset - box - 10 : x0 + inset + box + 10
    const anchor = i ? "end" : "start"
    const room = w - inset - box - 20 - scoreW
    const line = () =>
      g
        .append("text")
        .attr("x", tx)
        .attr("text-anchor", anchor)
        .attr("font-family", font.head)
        .attr("fill", text)
        .style("text-transform", "uppercase")
    // the city over the name, smaller, where the band has no subhead: one
    // line would shrink to fit a name as long as Philadelphia 76ers
    if (s.city && !s.sub) {
      const city = line().attr("font-weight", 600).text(s.city)
      const name = line().attr("font-weight", 700).text(s.name)
      const citySize = Math.round(height * 0.24)
      const size = Math.round(height * 0.4)
      city.attr("font-size", citySize)
      name.attr("font-size", size)
      // both shrink together, so the city stays the smaller
      const f = Math.min(
        1,
        ...[city, name].map(t => room / t.node()!.getComputedTextLength()),
      )
      city.attr("font-size", citySize * f)
      name.attr("font-size", size * f)
      // centered on the caps: about 0.7 of each size, and a gap between
      const block = (citySize * 0.7 + 4 + size * 0.7) * f
      const cityY = (height - block) / 2 + citySize * 0.7 * f
      city.attr("y", cityY)
      name.attr("y", cityY + (4 + size * 0.7) * f)
      return
    }
    const name = line()
      .attr("y", s.sub ? height * 0.48 : height / 2 + nameSize * 0.35)
      .attr("font-weight", 700)
      .attr("font-size", nameSize)
      .text(s.name)
    const sub =
      s.sub &&
      g
        .append("text")
        .attr("x", tx)
        .attr("y", height * 0.81)
        .attr("text-anchor", anchor)
        .call(agate)
        .attr("fill", text)
        .text(s.sub)
    // a long name or subhead shrinks to fit beside the logo (Minnesota
    // Timberwolves), since SVG text doesn't wrap
    for (const [t, size] of [
      [name, nameSize],
      ...(sub ? [[sub, type.agate.size] as const] : []),
    ] as const) {
      const len = t.node()!.getComputedTextLength()
      if (len > room) t.attr("font-size", (size * room) / len)
    }
  })
}

// A team's full name as its city and its name: the name is the last word,
// except the Trail Blazers'
export function cityAndName(full: string) {
  const words = full.split(" ")
  const n = /^trail ?blazers$/i.test(words.slice(-2).join(" ")) ? 2 : 1
  return {
    city: words.slice(0, -n).join(" "),
    name: words.slice(-n).join(" "),
  }
}

// Load the faces frames draw with before the first render: text is measured
// as it's laid out, and a face still loading measures as its fallback
export function fontsReady() {
  const faces = [
    ...["500", "600", "700"].map(w => `${w} 16px "Barlow Condensed"`),
    `400 16px "JetBrains Mono"`,
    `600 16px "JetBrains Mono"`,
    `400 16px "Source Serif 4"`,
  ]
  return Promise.all(faces.map(f => document.fonts.load(f)))
}

// Break text into lines no wider than `width`, measuring with `probe`
function wrap(probe: SVGTextElement, text: string, width: number) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    probe.textContent = next
    if (line && probe.getComputedTextLength() > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  probe.textContent = ""
  return lines
}

type G = Selection<SVGGElement, undefined, null, undefined>

// Agate: small mono caps, for anything that's metadata (axis titles, legend,
// source). Use with selection.call(agate)
export function agate(s: Selection<any, any, any, any>) {
  s.attr("font-family", font.agate)
    .attr("font-size", type.agate.size)
    .attr("font-weight", 400)
    .attr("letter-spacing", "0.04em")
    .attr("fill", color.muted)
    .style("text-transform", "uppercase")
}

// The legend's items in a row, wrapped onto more rows at maxWidth. Returns
// the widest row's width, the last row's, and the number of rows
function drawLegend(g: G, items: LegendItem[], y: number, maxWidth: number) {
  let x = 0
  let row = 0
  let widest = 0
  const cy = y - type.agate.size * 0.35
  for (const item of items) {
    const ig = g.append("g")
    const w = drawSymbol(ig, item, cy)
    const t = ig
      .append("text")
      .attr("x", w + 6)
      .attr("y", y)
      .text(item.text)
    const iw = w + 6 + t.node()!.getComputedTextLength()
    if (x > 0 && (item.break || x + iw > maxWidth)) {
      x = 0
      row++
    }
    ig.attr("transform", `translate(${x},${row * legendRow})`)
    widest = Math.max(widest, x + iw)
    x += iw + 18
  }
  return { width: widest, last: x - 18, rows: row + 1 }
}

// a legend item's symbol at x = 0, returning its width, so the text after
// it lines up
function drawSymbol(g: G, item: LegendItem, cy: number) {
  const ring = (s: Selection<any, any, any, any>) =>
    item.hollow
      ? s
          .attr("fill", color.bg)
          .attr("stroke", item.color)
          .attr("stroke-width", 1.5)
      : s.attr("fill", item.color)
  if (item.symbol === "dot" && item.label) {
    // a numbered disc, as the chart numbers its own
    g.append("circle").attr("cx", 6).attr("cy", cy).attr("r", 6).call(ring)
    g.append("text")
      .attr("x", 6)
      .attr("y", cy + 3.5)
      .attr("text-anchor", "middle")
      .attr("font-family", font.head)
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("letter-spacing", 0)
      .attr("fill", color.bg)
      .text(item.label)
    return 12
  }
  if (item.symbol === "dot") {
    g.append("circle").attr("cx", 5).attr("cy", cy).attr("r", 4.5).call(ring)
    return 10
  }
  if (item.symbol === "diamond") {
    g.append("rect")
      .attr("x", 1.5)
      .attr("y", cy - 3.5)
      .attr("width", 7)
      .attr("height", 7)
      .attr("transform", `rotate(45 5 ${cy})`)
      .call(ring)
    return 10
  }
  if (item.symbol === "cross") {
    g.append("path")
      .attr("d", `M1,${cy - 4}L9,${cy + 4}M1,${cy + 4}L9,${cy - 4}`)
      .attr("stroke", item.color)
      .attr("stroke-width", 1.75)
    return 10
  }
  if (item.symbol === "dash") {
    // a reference line, drawn as the chart draws it
    g.append("line")
      .attr("x2", 22)
      .attr("y1", cy)
      .attr("y2", cy)
      .attr("stroke", item.color)
      .attr("stroke-width", 1.25)
      .attr("stroke-dasharray", "5 4")
    return 22
  }
  if (item.symbol === "line" || item.symbol === "dotline") {
    const pts: [number, number][] = [
      [0, cy + 3],
      [8, cy - 4],
      [15, cy + 1],
      [22, cy - 3],
    ]
    g.append("polyline")
      .attr("points", pts.join(" "))
      .attr("fill", "none")
      .attr("stroke", item.color)
      .attr("stroke-width", 1.25)
    if (item.symbol === "dotline")
      for (const [px, py] of pts)
        g.append("circle")
          .attr("cx", px)
          .attr("cy", py)
          .attr("r", 1.75)
          .attr("fill", item.color)
    return 22
  }
  if (item.symbol === "tick") {
    g.append("line")
      .attr("x1", 5)
      .attr("x2", 5)
      .attr("y1", cy - 7)
      .attr("y2", cy + 7)
      .attr("stroke", item.color)
      .attr("stroke-width", 2.5)
    return 10
  }
  // a small bar, with its label inside as on the chart's own bars
  const rect = g
    .append("rect")
    .attr("y", cy - 8)
    .attr("height", 16)
    .attr("fill", item.color)
  const label = g
    .append("text")
    .attr("y", cy + 4)
    .attr("text-anchor", "middle")
    .attr("font-family", font.head)
    .attr("font-size", 12)
    .attr("font-weight", 600)
    .attr("fill", color.bg)
    .text(item.label ?? "")
  const w = Math.max(label.node()!.getComputedTextLength() + 10, 16)
  rect.attr("width", w)
  label.attr("x", w / 2)
  return w
}

// a phrase as a sentence: capitalized, with a period unless it ends in one
const sentence = (s: string) =>
  s[0].toUpperCase() + s.slice(1) + (/[.!?…]$/.test(s) ? "" : ".")

// The footer every frame ends with: a rule, the source, and the URL, which
// keeps its case so it can be typed. `total` is the frame's height
function drawFooter(
  svg: Selection<SVGSVGElement, undefined, null, undefined>,
  width: number,
  total: number,
  source: string,
  url: string,
) {
  const ruleY = total - footerHeight + 6
  svg
    .append("line")
    .attr("x1", pad)
    .attr("x2", width - pad)
    .attr("y1", ruleY)
    .attr("y2", ruleY)
    .attr("stroke", color.ink)
  const footerY = ruleY + 20
  svg.append("text").attr("x", pad).attr("y", footerY).call(agate).text(source)
  svg
    .append("text")
    .attr("x", width - pad)
    .attr("y", footerY)
    .attr("text-anchor", "end")
    .attr("font-family", font.agate)
    .attr("font-size", type.agate.size)
    .attr("font-weight", 600)
    .text(url)
}

// An empty frame: newsprint, the frame's type, attached so text can be
// measured
function frameSvg(container: HTMLElement) {
  const svg = create("svg")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("class", "frame")
    .attr("font-family", font.head)
    .attr("fill", color.ink)
    .style("font-variant-numeric", "tabular-nums")
  container.replaceChildren(svg.node()!)
  return svg
}

// A frame with no band or legend strip, for a view that carries its own
// header (the matchup's team bands): the body, then the footer. Fit size
export function buildBareFrame(
  container: HTMLElement,
  source: string,
  url: string,
  renderBody: (g: SVGGElement, width: number) => { height: number },
): SVGSVGElement {
  const { width } = sizes.auto
  const svg = frameSvg(container)
  const bg = svg.append("rect").attr("fill", color.bg)
  const g = svg
    .append("g")
    .attr("class", "frame-body")
    .attr("transform", `translate(${pad},${pad})`)
  const body = renderBody(g.node()!, width - pad * 2)
  const total = pad + body.height + 12 + footerHeight
  drawFooter(svg, width, total, source, url)
  svg
    .attr("width", width)
    .attr("height", total)
    .attr("viewBox", `0 0 ${width} ${total}`)
  bg.attr("width", width).attr("height", total)
  return svg.node()!
}

export function buildFrame(
  container: HTMLElement,
  size: Size,
  desc: Description,
  url: string,
  renderBody: (
    g: SVGGElement,
    size: { width: number; height?: number },
  ) => Body,
): Frame {
  const { width, height } = sizes[size]
  // attached first, so text can be measured
  const svg = frameSvg(container)

  const bg = svg.append("rect").attr("fill", color.bg)

  // --- the band: headline and deck on the left, the logo box on the right.
  // A game's two teams get a band each instead, with the headline and deck
  // under them on newsprint
  const vs = desc.versus
  const vsHeight = 76
  const { band, text, team } = bandColors(desc.team)
  const onBand = vs ? color.ink : text
  const bandRect = svg
    .append("rect")
    .attr("fill", vs ? "none" : band)
    .attr("width", width)
  if (vs) versusBands(svg.append("g").node()!, width, vsHeight, vs)
  const deckSize = type.deck.size
  const deckLine = deckSize * 1.3
  const titleTop = vs ? vsHeight + 16 : pad - 4
  const title = svg
    .append("text")
    .attr("class", "frame-title")
    .attr("x", pad)
    .attr("font-family", font.head)
    .attr("font-weight", type.title.weight)
    .attr("fill", onBand)
    .style("text-transform", "uppercase")
    .text(desc.title)

  // the logo box is a fixed width at the band's right end, as tall as the
  // band
  const box = 116
  const textWidth = width - pad * 2 - (vs ? 0 : box)
  // the headline shrinks to fit on one line. Under a game's bands it's a
  // kicker, smaller, since the bands are the headline
  let titleSize: number = vs ? 26 : type.title.size
  title.attr("font-size", titleSize)
  const tw = title.node()!.getComputedTextLength()
  if (tw > textWidth) {
    titleSize = Math.max(24, (titleSize * textWidth) / tw)
    title.attr("font-size", titleSize)
  }
  title.attr("y", titleTop + titleSize * 0.82)

  const context = svg
    .append("text")
    .attr("class", "frame-context")
    .attr("font-family", font.serif)
    .attr("font-size", deckSize)
    .attr("fill", onBand)
  const deck = desc.who ? `${sentence(desc.who)} ${desc.context}` : desc.context
  // under a game's bands the deck follows the kicker on its line, like a
  // dateline, and wraps under itself, unless a long kicker leaves it too
  // little room
  const titleBase = titleTop + titleSize * 0.82
  const after = pad + title.node()!.getComputedTextLength() + 14
  const inline = vs && textWidth - (after - pad) >= 240
  const deckX = inline ? after : pad
  const lines = wrap(context.node()!, deck, textWidth - (deckX - pad))
  const deckTop = inline ? titleBase : titleBase + 8 + deckSize
  context.attr("data-text", deck)
  lines.forEach((l, i) =>
    context
      .append("tspan")
      .attr("x", deckX)
      .attr("y", deckTop + i * deckLine)
      .text(l),
  )
  const deckBottom = deckTop + (lines.length - 1) * deckLine
  const bandHeight = vs ? deckBottom + 14 : Math.max(box, deckBottom + pad - 6)
  bandRect.attr("height", bandHeight)
  if (vs)
    svg
      .append("line")
      .attr("x1", pad)
      .attr("x2", width - pad)
      .attr("y1", bandHeight)
      .attr("y2", bandHeight)
      .attr("stroke", color.grid)

  // the logo box: newsprint, so every logo reads whatever the band color.
  // A game's bands have their own
  if (!vs) {
    const bx0 = width - box
    svg
      .append("rect")
      .attr("x", bx0)
      .attr("width", box)
      .attr("height", bandHeight)
      .attr("fill", color.bg)
    svg
      .append("line")
      .attr("x1", bx0)
      .attr("x2", bx0)
      .attr("y2", bandHeight)
      .attr("stroke", color.ink)
      .attr("stroke-width", 2)
    if (team) {
      const s = box - 24
      svg
        .append("image")
        .attr("href", logoUrl(team.abbreviation))
        .attr("x", bx0 + 12)
        .attr("y", (bandHeight - s) / 2)
        .attr("width", s)
        .attr("height", s)
    } else {
      // views about no one team carry the wordmark instead
      const words = ["STEP", "BACK", "CLUB"]
      const ws = (box - 26) / 3
      const top = (bandHeight - ws * 3) / 2
      words.forEach((w, i) =>
        svg
          .append("text")
          .attr("x", bx0 + box / 2)
          .attr("y", top + ws * (i + 0.86))
          .attr("text-anchor", "middle")
          .attr("font-size", ws * 1.08)
          .attr("font-weight", 700)
          .text(w),
      )
    }
  }

  // --- the legend strip: what the marks mean, and the counts
  const strip = svg.append("g").call(agate)
  const stripY = bandHeight + stripHeight / 2 + type.agate.size * 0.35
  const legend = strip.append("g").attr("transform", `translate(${pad},0)`)
  const legendSize = drawLegend(
    legend,
    desc.legend ?? [],
    stripY,
    width - pad * 2,
  )
  let stripBottom = bandHeight + stripHeight + (legendSize.rows - 1) * legendRow
  if (desc.counts) {
    const counts = strip
      .append("text")
      .attr("x", width - pad)
      .attr("y", stripY)
      .attr("text-anchor", "end")
      .text(desc.counts)
    // the counts go at the end of the legend's last row when they fit
    // there, and otherwise get their own row under it
    const lastY = stripY + (legendSize.rows - 1) * legendRow
    counts.attr("y", lastY)
    if (
      legendSize.last + counts.node()!.getComputedTextLength() + 24 >
      width - pad * 2
    ) {
      counts.attr("y", lastY + legendRow)
      stripBottom += legendRow
    }
  }
  svg
    .append("line")
    .attr("x2", width)
    .attr("y1", stripBottom)
    .attr("y2", stripBottom)
    .attr("stroke", color.ink)

  // --- the body
  const headerHeight = stripBottom + 18
  const g = svg
    .append("g")
    .attr("class", "frame-body")
    .attr("transform", `translate(${pad},${headerHeight})`)
  const bodyHeight = height && height - headerHeight - footerHeight
  const body = renderBody(g.node()!, {
    width: width - pad * 2,
    height: bodyHeight,
  })

  const total = height ?? headerHeight + body.height + footerHeight
  drawFooter(svg, width, total, desc.source, url)

  svg
    .attr("width", width)
    .attr("height", total)
    .attr("viewBox", `0 0 ${width} ${total}`)
  bg.attr("width", width).attr("height", total)

  return {
    svg: svg.node()!,
    body,
    bx: pad,
    by: headerHeight,
    title: title.node()!,
    context: context.node()!,
  }
}
