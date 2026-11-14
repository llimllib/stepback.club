// Mount a tool on a page: question controls above the chart, the frame, the
// annotation layer, and the framing actions below it. All state round-trips
// through the URL
import { AnnotationLayer, type Annotation, type Mode } from "./annotate"
import { buildFrame, fontsReady, sizes, type Size } from "./frame"
import { download, toPng } from "./export"
import {
  decodeHash,
  encodeHash,
  readParams,
  writeParams,
  type Params,
} from "./state"
import { SITE } from "./theme"
import { controlElement } from "./controls"
import type { Control, Tool } from "./tool"

const framing = { title: "", sub: "", who: "", size: "auto" }

// the site root, for fetching fonts. BASE_URL has no trailing slash in dev,
// and without one, relative URLs resolve against the parent directory
const base = () =>
  new URL(import.meta.env.BASE_URL.replace(/\/?$/, "/"), location.href).href

// SVG text has no title attribute, and a <title> inside it would join its
// textContent, so the tooltip goes on a group around it
function tooltip(el: SVGElement, text: string) {
  const ns = "http://www.w3.org/2000/svg"
  const g = document.createElementNS(ns, "g")
  const title = document.createElementNS(ns, "title")
  title.textContent = text
  el.before(g)
  g.append(title, el)
}

export async function mount<P extends Params, D>(
  root: HTMLElement,
  tool: Tool<P, D>,
) {
  const defaults = { ...framing, ...tool.defaults } as Params
  let p = readParams(defaults) as P & typeof framing
  const hashA = new URLSearchParams(location.hash.slice(1)).get("a")
  let anns: Annotation[] = (hashA && (await decodeHash(hashA))) || []
  let hash = hashA ? `#a=${hashA}` : ""
  let mode: Mode = "select"
  let data: D | undefined
  let layer: AnnotationLayer | undefined
  let frame: ReturnType<typeof buildFrame> | undefined

  // question controls, the chart, then framing and export: a rail beside the
  // chart on wide screens, in that order down the page on narrow ones
  root.classList.add("tool")
  const allowed = tool.sizes ?? (Object.keys(sizes) as Size[])
  root.innerHTML = `
    <form class="controls"></form>
    <div class="chart-host"><div class="chart"></div><div class="status"></div>
      <div class="reloading">${loadingText()}</div></div>
    <div class="actions">
      <fieldset class="sizes"${allowed.length < 2 ? " hidden" : ""}><legend>Size</legend>${allowed
        .map(k => [k, sizes[k]] as const)
        .map(
          ([k, s]) =>
            `<button type="button" data-size="${k}">${s.label}</button>`,
        )
        .join("")}</fieldset>
      <fieldset class="modes"><legend>Annotate</legend>
        <button type="button" data-mode="text" title="Click the chart to add a note (N)">✎ Note</button>
        <button type="button" data-mode="arrow" title="Drag to draw an arrow (A)">↗ Arrow</button>
        <button type="button" class="clear">Clear</button>
      </fieldset>
      <button type="button" class="export">Export PNG</button>
      <p class="hint">Click the headline or deck to rewrite it.
      <span class="hint-label">Click a dot to label it.</span>
      Drag labels and notes to move them; double-click a note to edit it; select one and press Delete to
      remove it.</p>
    </div>`
  const controlsEl = root.querySelector<HTMLFormElement>(".controls")!
  const chartEl = root.querySelector<HTMLElement>(".chart")!
  const statusEl = root.querySelector<HTMLElement>(".status")!

  const save = () => writeParams(p, defaults, hash)

  async function saveAnnotations(next: Annotation[]) {
    anns = next
    hash = anns.length ? `#a=${await encodeHash(anns)}` : ""
    save()
  }

  // change params, from a control or the chart, and redraw
  function set(patch: Params) {
    p = { ...p, ...patch }
    update()
  }

  function renderControls(controls: Control[]) {
    // a re-render replaces the controls, so keep the focus where it was:
    // adding players one after another shouldn't need a click each
    const focused = (
      document.activeElement as HTMLElement | null
    )?.closest<HTMLElement>(".controls [data-key]")?.dataset.key
    controlsEl.replaceChildren(
      ...controls.map(c => {
        const el = controlElement(c, p, set)
        el.dataset.key = c.key
        return el
      }),
    )
    if (focused)
      controlsEl
        .querySelector<HTMLElement>(
          `[data-key="${focused}"] :is(input[type=search], input, select)`,
        )
        ?.focus()
  }

  function draw() {
    if (data === undefined) return
    const desc = tool.describe(data, p)
    if (p.title) desc.title = p.title
    if (desc.who !== undefined && p.who) desc.who = p.who
    if (p.sub) desc.context = p.sub
    // a tool with a who edits that, not the whole deck
    const deckKey = desc.who !== undefined && !p.sub ? "who" : "sub"
    // the printed URL names the tool, not the view: a reader types it in
    // from an image, and a query string is too long to type
    const url = `${SITE}/${tool.id}`
    const size = (
      allowed.includes(p.size as Size) ? p.size : allowed[0]
    ) as Size
    // the chart's own controls work only when a click isn't for a note
    const fromChart = (patch: Partial<P>) => {
      if (mode === "select") set(patch as Params)
    }
    frame = buildFrame(chartEl, size, desc, url, (g, s) =>
      tool.render(g, data!, p, s, fromChart),
    )
    layer = new AnnotationLayer(frame, anns, mode, saveAnnotations, showMode)
    root.querySelector<HTMLElement>(".hint-label")!.hidden =
      !frame.body.marks.some(m => m.label)
    frame.title.addEventListener("click", () => editFraming("title"))
    frame.context.addEventListener("click", () => editFraming(deckKey))
    for (const t of [frame.title, frame.context]) tooltip(t, "Click to rewrite")
    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-size]"))
      b.classList.toggle("on", b.dataset.size === size)
    showMode(mode)
  }

  function showMode(m: Mode) {
    mode = m
    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-mode]"))
      b.classList.toggle("on", b.dataset.mode === m)
  }

  // Rewrite the title, the deck or the deck's who in place. Empty restores
  // the generated one
  function editFraming(key: "title" | "sub" | "who") {
    if (!frame || mode !== "select") return
    const target = key === "title" ? frame.title : frame.context
    const r = target.getBoundingClientRect()
    const host = chartEl.parentElement!.getBoundingClientRect()
    // the deck wraps, so it gets a textarea that wraps too
    const input: HTMLInputElement | HTMLTextAreaElement =
      document.createElement(key === "title" ? "input" : "textarea")
    input.className = `framing-input framing-${key === "title" ? key : "sub"}`
    const generated = () => {
      const d = tool.describe(data!, p)
      return key === "title" ? d.title : key === "sub" ? d.context : d.who!
    }
    // the deck is wrapped into lines, so its text is kept whole on the element
    if (key === "who") {
      input.value = p.who || generated()
      input.placeholder = "Who's on the chart"
    } else input.value = target.dataset.text ?? target.textContent ?? ""
    const cs = getComputedStyle(target)
    // the text's own size, scaled as the SVG is: the box's height counts
    // every line of a wrapped deck
    const scale =
      frame.svg.getBoundingClientRect().width / frame.svg.viewBox.baseVal.width
    const fontSize = Number(target.getAttribute("font-size")) * scale
    Object.assign(input.style, {
      left: `${r.left - host.left - 4}px`,
      top: `${r.top - host.top - 4}px`,
      width: `${Math.max(r.width + 40, 300)}px`,
      fontSize: `${fontSize}px`,
      fontWeight: cs.fontWeight,
    })
    chartEl.parentElement!.appendChild(input)
    if (input instanceof HTMLTextAreaElement) {
      const fit = () => {
        input.style.height = "auto"
        input.style.height = `${input.scrollHeight + 2}px`
      }
      input.addEventListener("input", fit)
      fit()
    }
    input.focus()
    input.select()
    let done = false
    const finish = (commit: boolean) => {
      if (done) return
      done = true
      input.remove()
      if (!commit) return
      const v = input.value.trim()
      p = { ...p, [key]: v === generated() ? "" : v }
      save()
      draw()
    }
    // HTMLElement's, as TypeScript can't type a listener on the union
    ;(input as HTMLElement).addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault()
        finish(true)
      }
      if (e.key === "Escape") finish(false)
    })
    input.addEventListener("blur", () => finish(true))
  }

  async function update() {
    statusEl.textContent = ""
    // the first load has nothing to dim, so it holds the chart's place
    if (!frame) placeholder(chartEl, "loading")
    root.classList.add("loading")
    try {
      const [loaded] = await Promise.all([tool.load(p), fontsReady()])
      data = loaded
      p = { ...p, ...tool.normalize?.(data, p) }
      renderControls(tool.controls(data, p))
      save()
      draw()
    } catch (e) {
      console.error(e)
      // the old chart doesn't answer the question now asked, so it goes
      data = frame = layer = undefined
      placeholder(chartEl, "failed", update, e)
    } finally {
      root.classList.remove("loading")
    }
  }

  root.querySelector(".sizes")!.addEventListener("click", e => {
    const size = (e.target as HTMLElement).closest("button")?.dataset.size
    if (!size) return
    p = { ...p, size }
    save()
    draw()
  })
  const setMode = (m: Mode) => {
    const next = mode === m ? "select" : m
    if (layer) layer.setMode(next)
    else showMode(next)
  }
  root.querySelector(".modes")!.addEventListener("click", e => {
    const m = (e.target as HTMLElement).closest("button")?.dataset.mode
    if (m) setMode(m as Mode)
  })
  root.querySelector(".clear")!.addEventListener("click", () => {
    p = { ...p, title: "", sub: "", who: "" }
    saveAnnotations([])
    draw()
  })
  root.querySelector(".export")!.addEventListener("click", async () => {
    if (!frame) return
    statusEl.textContent = "Exporting…"
    const { blob, missingImages } = await toPng(frame.svg, base())
    const name = (frame.title.textContent || tool.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
    download(blob, `${name}.png`)
    statusEl.textContent = missingImages
      ? `Exported, but ${missingImages} images couldn't be embedded (no CORS)`
      : ""
  })
  document.addEventListener("keydown", e => {
    if ((e.target as HTMLElement).matches("input, textarea, select")) return
    if (e.key === "Delete" || e.key === "Backspace") {
      if (layer?.deleteSelected()) e.preventDefault()
    } else if (e.key === "Escape") setMode("select")
    else if (e.key === "n") setMode("text")
    else if (e.key === "a") setMode("arrow")
  })

  await update()
}

// "Loading…" a letter at a time, so a bold can sweep across it
export function loadingText() {
  const letters = [..."Loading…"]
    .map((c, i) => `<span aria-hidden="true" style="--i:${i}">${c}</span>`)
    .join("")
  return `<p class="loading-text" role="status" aria-label="Loading">${letters}</p>`
}

// What's in a chart's place until it's drawn: a note that it's loading, or
// that it couldn't load, with a way to try again
function placeholder(
  el: HTMLElement,
  state: "loading" | "failed",
  retry?: () => void,
  error?: unknown,
) {
  const box = document.createElement("div")
  box.className = "chart-placeholder"
  box.dataset.state = state
  if (state === "loading") {
    box.innerHTML = loadingText()
  } else {
    // the data is rewritten in place, so a read mid-update fails, and
    // works again a minute later
    box.innerHTML = `
      <p><b>Couldn't load this chart.</b> The data may be updating; try
      again in a minute.</p>
      <p class="detail"></p>
      <button type="button">Try again</button>`
    box.querySelector(".detail")!.textContent = String(
      error instanceof Error ? error.message : (error ?? ""),
    )
    box.querySelector("button")!.addEventListener("click", e => {
      // on the front page the chart is inside a link
      e.preventDefault()
      e.stopPropagation()
      retry?.()
    })
  }
  el.replaceChildren(box)
}

// A tool's frame at preset params, without controls: for the front page. It
// resolves once the chart is drawn, which after a failure is when a retry
// works
export function embed<P extends Params, D>(
  root: HTMLElement,
  tool: Tool<P, D>,
  params: Partial<P> = {},
): Promise<{ data: D; p: P }> {
  return new Promise(resolve => {
    const attempt = async () => {
      placeholder(root, "loading")
      try {
        let p = { ...tool.defaults, ...params } as P
        const [data] = await Promise.all([tool.load(p), fontsReady()])
        p = { ...p, ...tool.normalize?.(data, p) }
        // the preset is part of the chart's address
        const q = new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString()
        const url = `${SITE}/${tool.id}${q ? `?${q}` : ""}`
        buildFrame(root, "auto", tool.describe(data, p), url, (g, s) =>
          tool.render(g, data, p, s, () => {}),
        )
        resolve({ data, p })
      } catch (e) {
        console.error(e)
        placeholder(root, "failed", attempt, e)
      }
    }
    attempt()
  })
}
