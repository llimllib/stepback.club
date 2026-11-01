// The annotation layer. Two kinds of thing go on top of a chart:
//
// - labels on marks: click a mark to label it, drag the label to move it.
//   These label data, so they use the data typography
// - notes and arrows: free text and hand-drawn arrows in the voice color.
//   These are the take, so they look like a sketch
//
// Everything is anchored to data where possible: a label belongs to a mark's
// key, and notes are stored as the tool's data positions, so annotations
// survive data refreshes and changes of export size
import rough from "roughjs"
import { color, font, type } from "./theme"
import type { Frame } from "./frame"
import type { Mark } from "./tool"

// A position: a tool data position, or a fraction of the frame for places
// outside the chart body
export type Pos = { d: unknown } | { f: [number, number] }

export type Annotation =
  | { t: "label"; key: string; dx: number; dy: number }
  // hides the chart's own label for a mark
  | { t: "hide"; key: string }
  | { t: "text"; at: Pos; text: string }
  | { t: "arrow"; from: Pos; to: Pos | { key: string }; s: number }

export type Mode = "select" | "text" | "arrow"

// a label right of its mark starts there, one left of it ends there, and
// one above or below it is centered on it
const anchor = (m: Mark, dx: number) => {
  const edge = m.r + (m.w ?? 0)
  return dx > edge ? "start" : dx < -edge ? "end" : "middle"
}

const SVGNS = "http://www.w3.org/2000/svg"

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
  parent: Element,
) {
  const e = document.createElementNS(SVGNS, name)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  parent.appendChild(e)
  return e
}

export class AnnotationLayer {
  private g: SVGGElement
  private marks: Map<string, Mark>
  private selected: number | undefined
  private width: number
  private height: number

  constructor(
    private frame: Frame,
    public anns: Annotation[],
    public mode: Mode,
    // called with the new annotations after each finished edit
    private onChange: (anns: Annotation[]) => void,
    private onMode: (mode: Mode) => void,
  ) {
    const vb = frame.svg.viewBox.baseVal
    this.width = vb.width
    this.height = vb.height
    this.marks = new Map(
      frame.body.marks.map(m => [
        m.key,
        { ...m, x: m.x + frame.bx, y: m.y + frame.by },
      ]),
    )
    this.g = el("g", { class: "annotations" }, frame.svg)
    frame.svg.addEventListener("pointerdown", e => this.pointerdown(e))
    frame.svg.addEventListener("dblclick", e => this.dblclick(e))
    frame.svg.addEventListener("pointermove", e => this.hover(e))
    this.render()
  }

  // --- coordinates

  private toFrame(pos: Pos): [number, number] | undefined {
    if ("f" in pos) return [pos.f[0] * this.width, pos.f[1] * this.height]
    const p = this.frame.body.project(pos.d)
    return p && [p[0] + this.frame.bx, p[1] + this.frame.by]
  }

  private fromFrame(x: number, y: number): Pos {
    const { bx, by, body } = this.frame
    const d = body.invert(x - bx, y - by)
    return d === undefined ? { f: [x / this.width, y / this.height] } : { d }
  }

  private pointer(e: { clientX: number; clientY: number }): [number, number] {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      this.frame.svg.getScreenCTM()!.inverse(),
    )
    return [pt.x, pt.y]
  }

  private markAt(x: number, y: number): Mark | undefined {
    let best: Mark | undefined
    let bestD = Infinity
    for (const m of this.marks.values()) {
      const d = Math.hypot(Math.max(Math.abs(m.x - x) - (m.w ?? 0), 0), m.y - y)
      if (d <= m.r + 3 && d < bestD) {
        best = m
        bestD = d
      }
    }
    return best
  }

  // --- drawing

  render() {
    this.g.replaceChildren()
    const hidden = new Set(
      this.anns.flatMap(a => (a.t === "hide" ? [a.key] : [])),
    )
    for (const e of this.frame.svg.querySelectorAll("[data-mark]"))
      if (hidden.has(e.getAttribute("data-mark")!))
        e.setAttribute("display", "none")
      else e.removeAttribute("display")
    this.anns.forEach((a, i) => {
      if (a.t === "label") this.drawLabel(a, i)
      else if (a.t === "text") this.drawText(a, i)
      else if (a.t === "arrow") this.drawArrow(a, i)
    })
    this.frame.svg.classList.toggle("mode-text", this.mode === "text")
    this.frame.svg.classList.toggle("mode-arrow", this.mode === "arrow")
  }

  private drawLabel(a: Extract<Annotation, { t: "label" }>, i: number) {
    const m = this.marks.get(a.key)
    if (!m?.label) return
    const x = m.x + a.dx
    const y = m.y + a.dy
    const g = el("g", { "data-i": i, class: "ann ann-label" }, this.g)
    // a leader line once the label has been dragged away from its mark,
    // measured from the nearest end of a bar
    const w = Math.sign(a.dx) * Math.min(Math.abs(a.dx), m.w ?? 0)
    const dist = Math.hypot(a.dx - w, a.dy)
    if (dist > m.r + 16) {
      const k = (m.r + 2) / dist
      el(
        "line",
        {
          x1: m.x + w + (a.dx - w) * k,
          y1: m.y + a.dy * k,
          x2: x,
          y2: y - 4,
          stroke: color.muted,
          "stroke-width": 1,
        },
        g,
      )
    }
    const t = el(
      "text",
      {
        x,
        y,
        "font-size": m.labelSize ?? type.label.size,
        "font-weight": type.label.weight,
        fill: color.ink,
        stroke: color.bg,
        "stroke-width": 4,
        "stroke-linejoin": "round",
        "paint-order": "stroke",
        "text-anchor": anchor(m, a.dx),
      },
      g,
    )
    t.textContent = m.label
    if (this.selected === i) this.outline(g)
  }

  private drawText(a: Extract<Annotation, { t: "text" }>, i: number) {
    const p = this.toFrame(a.at)
    if (!p) return
    const g = el("g", { "data-i": i, class: "ann ann-text" }, this.g)
    const t = el(
      "text",
      {
        x: p[0],
        y: p[1],
        "font-family": font.hand,
        "font-size": type.note.size,
        "font-weight": 600,
        fill: color.voice,
        stroke: color.bg,
        "stroke-width": 5,
        "stroke-linejoin": "round",
        "paint-order": "stroke",
      },
      g,
    )
    a.text.split("\n").forEach((line, j) => {
      const s = el("tspan", { x: p[0], dy: j ? "0.95em" : "0.3em" }, t)
      s.textContent = line
    })
    if (this.selected === i) this.outline(g)
  }

  private drawArrow(a: Extract<Annotation, { t: "arrow" }>, i: number) {
    const from = this.toFrame(a.from)
    let to: [number, number] | undefined
    let gap = 4
    if ("key" in a.to) {
      const m = this.marks.get(a.to.key)
      if (m) {
        to = [m.x, m.y]
        gap = m.r + 5
      }
    } else to = this.toFrame(a.to)
    if (!from || !to) return
    const [x0, y0] = from
    const len = Math.hypot(to[0] - x0, to[1] - y0)
    if (len < 8) return
    // stop short of the target, and bow the line a little
    const k = (len - gap) / len
    const x1 = x0 + (to[0] - x0) * k
    const y1 = y0 + (to[1] - y0) * k
    const nx = -(y1 - y0) / len
    const ny = (x1 - x0) / len
    const bow = Math.min(len * 0.12, 30)
    const mid: [number, number] = [
      (x0 + x1) / 2 + nx * bow,
      (y0 + y1) / 2 + ny * bow,
    ]
    const rc = rough.svg(this.frame.svg)
    const opts = {
      stroke: color.voice,
      strokeWidth: 2.2,
      roughness: 1.1,
      bowing: 1,
      seed: a.s,
      disableMultiStroke: true,
    }
    const g = el("g", { "data-i": i, class: "ann ann-arrow" }, this.g)
    g.appendChild(rc.curve([[x0, y0], mid, [x1, y1]], opts))
    const angle = Math.atan2(y1 - mid[1], x1 - mid[0])
    for (const da of [Math.PI * 0.82, -Math.PI * 0.82])
      g.appendChild(
        rc.line(
          x1,
          y1,
          x1 + 13 * Math.cos(angle + da),
          y1 + 13 * Math.sin(angle + da),
          opts,
        ),
      )
    // a wide invisible line, so the arrow is easy to click
    el(
      "path",
      {
        d: `M${x0},${y0} Q${mid[0]},${mid[1]} ${x1},${y1}`,
        stroke: "transparent",
        "stroke-width": 14,
        fill: "none",
      },
      g,
    )
    if (this.selected === i) this.outline(g)
  }

  private outline(g: SVGGElement) {
    const b = g.getBBox()
    el(
      "rect",
      {
        x: b.x - 4,
        y: b.y - 3,
        width: b.width + 8,
        height: b.height + 6,
        fill: "none",
        stroke: color.voice,
        "stroke-dasharray": "3 3",
        class: "no-export",
      },
      g,
    )
  }

  // --- interaction

  private commit() {
    this.render()
    this.onChange(this.anns)
  }

  setMode(mode: Mode) {
    this.mode = mode
    this.selected = undefined
    this.render()
    this.onMode(mode)
  }

  deleteSelected() {
    if (this.selected === undefined) return false
    this.anns.splice(this.selected, 1)
    this.selected = undefined
    this.commit()
    return true
  }

  private hover(e: PointerEvent) {
    if (this.mode !== "select") return
    const [x, y] = this.pointer(e)
    const over =
      (e.target as Element).closest(".ann, text[data-mark]") ||
      this.markAt(x, y)?.label
    this.frame.svg.style.cursor = over ? "pointer" : ""
  }

  private pointerdown(e: PointerEvent) {
    if (e.button !== 0) return
    const [x, y] = this.pointer(e)
    if (this.mode === "text") {
      e.preventDefault()
      this.editText(this.fromFrame(x, y), "", text => {
        if (text) this.anns.push({ t: "text", at: this.fromFrame(x, y), text })
        this.setMode("select")
        this.commit()
      })
      return
    }
    if (this.mode === "arrow") return this.dragArrow(e, x, y)

    const target = (e.target as Element).closest(".ann")
    if (target)
      return this.dragAnnotation(e, Number(target.getAttribute("data-i")), x, y)
    const own = (e.target as Element).closest("text[data-mark]")
    if (own instanceof SVGTextElement) return this.dragChartLabel(e, own, x, y)

    const mark = this.markAt(x, y)
    if (mark?.label) {
      // toggle the mark's label: the chart's own if it drew one, else ours
      const i = this.anns.findIndex(
        a => (a.t === "label" || a.t === "hide") && a.key === mark.key,
      )
      if (i >= 0) this.anns.splice(i, 1)
      else if (mark.labeled) this.anns.push({ t: "hide", key: mark.key })
      else
        this.anns.push({
          t: "label",
          key: mark.key,
          dx: (mark.w ?? 0) + mark.r + 4,
          dy: 4,
        })
      this.selected = undefined
      return this.commit()
    }
    if (this.selected !== undefined) {
      this.selected = undefined
      this.render()
    }
  }

  private drag(
    e: PointerEvent,
    move: (x: number, y: number) => void,
    end: (moved: boolean) => void,
  ) {
    e.preventDefault()
    const svg = this.frame.svg
    svg.setPointerCapture(e.pointerId)
    const [sx, sy] = this.pointer(e)
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const [x, y] = this.pointer(ev)
      if (!moved && Math.hypot(x - sx, y - sy) < 3) return
      moved = true
      move(x, y)
    }
    const onUp = () => {
      svg.removeEventListener("pointermove", onMove)
      svg.removeEventListener("pointerup", onUp)
      end(moved)
    }
    svg.addEventListener("pointermove", onMove)
    svg.addEventListener("pointerup", onUp)
  }

  private dragAnnotation(e: PointerEvent, i: number, sx: number, sy: number) {
    const a = this.anns[i]
    const start = structuredClone(a)
    const origin = a.t === "text" ? this.toFrame(a.at) : undefined
    this.drag(
      e,
      (x, y) => {
        if (a.t === "label" && start.t === "label") {
          a.dx = start.dx + x - sx
          a.dy = start.dy + y - sy
        } else if (a.t === "text" && origin) {
          a.at = this.fromFrame(origin[0] + x - sx, origin[1] + y - sy)
        }
        this.render()
      },
      moved => {
        if (moved) return this.commit()
        // a click: select it, so Delete removes it
        this.selected = this.selected === i ? undefined : i
        this.render()
      },
    )
  }

  // A drag on the chart's own label hides it and moves one of ours, put
  // where the chart's was
  private dragChartLabel(
    e: PointerEvent,
    text: SVGTextElement,
    sx: number,
    sy: number,
  ) {
    const key = text.getAttribute("data-mark")!
    const m = this.marks.get(key)
    if (!m?.label) return
    // the chart's label is centered on x with its baseline at y
    const ctm = text.getScreenCTM()!
    const toFrame = (x: number, y: number) => {
      const p = new DOMPoint(x, y).matrixTransform(ctm)
      return this.pointer({ clientX: p.x, clientY: p.y })
    }
    const tx = text.x.baseVal[0].value
    const half = text.getComputedTextLength() / 2
    const [cx, base] = toFrame(tx, text.y.baseVal[0].value)
    const [left] = toFrame(tx - half, 0)
    const [right] = toFrame(tx + half, 0)
    const edge = m.r + (m.w ?? 0)
    const label: Extract<Annotation, { t: "label" }> = {
      t: "label",
      key,
      dx:
        left - m.x > edge
          ? left - m.x
          : right - m.x < -edge
            ? right - m.x
            : cx - m.x,
      dy: base - m.y,
    }
    const start = { ...label }
    this.drag(
      e,
      (x, y) => {
        if (!this.anns.includes(label))
          this.anns.push({ t: "hide", key }, label)
        label.dx = start.dx + x - sx
        label.dy = start.dy + y - sy
        this.render()
      },
      moved => {
        if (moved) this.commit()
      },
    )
  }

  private dragArrow(e: PointerEvent, x0: number, y0: number) {
    const a: Annotation = {
      t: "arrow",
      from: this.fromFrame(x0, y0),
      to: this.fromFrame(x0, y0),
      s: Math.floor(Math.random() * 2 ** 31),
    }
    this.anns.push(a)
    this.drag(
      e,
      (x, y) => {
        const m = this.markAt(x, y)
        a.to = m ? { key: m.key } : this.fromFrame(x, y)
        this.render()
      },
      moved => {
        if (!moved) this.anns.pop()
        this.setMode("select")
        this.commit()
      },
    )
  }

  private dblclick(e: MouseEvent) {
    const target = (e.target as Element).closest(".ann-text")
    if (!target) return
    const i = Number(target.getAttribute("data-i"))
    const a = this.anns[i]
    if (a.t !== "text") return
    this.editText(a.at, a.text, text => {
      if (text) a.text = text
      else this.anns.splice(i, 1)
      this.selected = undefined
      this.commit()
    })
  }

  // An HTML textarea over the chart, for typing a note. Enter commits,
  // shift-enter adds a line, escape cancels
  private editText(at: Pos, value: string, done: (text: string) => void) {
    const p = this.toFrame(at)
    if (!p) return
    const svg = this.frame.svg
    const rect = svg.getBoundingClientRect()
    const host = svg.parentElement!
    const hostRect = host.getBoundingClientRect()
    const scale = rect.width / this.width
    const input = document.createElement("textarea")
    input.className = "note-input"
    input.value = value
    input.rows = Math.max(1, value.split("\n").length)
    Object.assign(input.style, {
      left: `${rect.left - hostRect.left + p[0] * scale}px`,
      top: `${rect.top - hostRect.top + p[1] * scale - type.note.size * scale * 0.6}px`,
      fontSize: `${type.note.size * scale}px`,
      fontFamily: font.hand,
      color: color.voice,
    })
    host.appendChild(input)
    input.focus()
    let finished = false
    const finish = (text: string | undefined) => {
      if (finished) return
      finished = true
      input.remove()
      if (text !== undefined) done(text.trim())
      else this.setMode("select")
    }
    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault()
        finish(input.value)
      } else if (ev.key === "Escape") finish(undefined)
      input.rows = input.value.split("\n").length
    })
    input.addEventListener("blur", () => finish(input.value))
  }
}
