// Export a frame as a PNG. A canvas can only draw an SVG if everything it
// references is inline, so fonts and images are fetched and embedded as data
// URLs first. Cross-origin images that don't allow CORS can't be embedded;
// they're left out and reported
import { fontFace, fontFiles } from "./theme"

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.addEventListener("load", () => resolve(r.result as string))
    r.addEventListener("error", reject)
    r.readAsDataURL(blob)
  })
}

const inlined = new Map<string, Promise<string | undefined>>()

function inline(url: string): Promise<string | undefined> {
  let p = inlined.get(url)
  if (!p) {
    p = fetch(url, { mode: "cors" })
      .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then(dataUrl)
      .catch(() => undefined)
    inlined.set(url, p)
  }
  return p
}

// An image the size it's drawn at in the PNG. The browser rasterizes an SVG
// drawn to a canvas without mipmaps, so a 500px logo squeezed into a 45px
// box comes out aliased and pixelly. Halving it on a canvas until it's
// close, then one last smooth step, averages every source pixel in
const resampled = new Map<string, Promise<string | undefined>>()

function resample(
  src: string,
  boxW: number,
  boxH: number,
): Promise<string | undefined> {
  const key = `${boxW}x${boxH} ${src}`
  let p = resampled.get(key)
  if (!p) {
    p = (async () => {
      const img = new Image()
      img.src = src
      await img.decode()
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      if (!nw || !nh) return src
      // fit the image in its box, as preserveAspectRatio's default does
      const fit = Math.min(boxW / nw, boxH / nh)
      const w = Math.max(1, Math.round(nw * fit))
      const h = Math.max(1, Math.round(nh * fit))
      if (w >= nw) return src
      let from: CanvasImageSource = img
      let fw = nw
      let fh = nh
      while (fw / 2 >= w && fh / 2 >= h) {
        fw = Math.round(fw / 2)
        fh = Math.round(fh / 2)
        from = step(from, fw, fh)
      }
      return step(from, w, h).toDataURL("image/png")
    })().catch(() => src)
    resampled.set(key, p)
  }
  return p
}

function step(from: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(from, 0, 0, w, h)
  return c
}

// How many viewBox units one of the element's own units is, from the
// transforms between it and the SVG
function unitScale(svg: SVGSVGElement, el: SVGGraphicsElement): number {
  const root = svg.getScreenCTM()
  const own = el.getScreenCTM()
  if (!root || !own) return 1
  const m = root.inverse().multiply(own)
  return Math.hypot(m.a, m.b) || 1
}

export interface ExportResult {
  blob: Blob
  missingImages: number
}

export async function toPng(
  svg: SVGSVGElement,
  baseUrl: string,
  scale = 2,
): Promise<ExportResult> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // each cloned image beside the one it was cloned from, which is laid out
  // and so knows its transforms
  const originals = [...svg.querySelectorAll<SVGImageElement>("image")]
  const images = [...clone.querySelectorAll<SVGImageElement>("image")].map(
    (img, i) => [img, originals[i]] as const,
  )
  clone.querySelectorAll(".no-export").forEach(e => e.remove())

  const faces = await Promise.all(
    fontFiles.map(async f => {
      const src = await inline(new URL(f.url, baseUrl).href)
      return src ? fontFace(f, src) : ""
    }),
  )
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style")
  style.textContent = faces.join("\n")
  clone.prepend(style)

  let missingImages = 0
  await Promise.all(
    images.map(async ([img, original]) => {
      if (!clone.contains(img)) return
      const href = img.getAttribute("href")
      if (!href || href.startsWith("data:")) return
      let src = await inline(new URL(href, baseUrl).href)
      if (src) {
        const k = unitScale(svg, original) * scale
        const w = Number(img.getAttribute("width")) * k
        const h = Number(img.getAttribute("height")) * k
        if (w > 0 && h > 0)
          src = await resample(src, Math.ceil(w), Math.ceil(h))
      }
      if (src) img.setAttribute("href", src)
      else {
        img.remove()
        missingImages++
      }
    }),
  )

  const { width, height } = svg.viewBox.baseVal
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  await img.decode()
  // decode() can resolve before the SVG's embedded fonts have loaded, and
  // text in a face that's still loading draws as nothing. There's no event
  // for that inside an image, so give the fonts a moment
  await new Promise(r => setTimeout(r, 300))
  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error("toBlob"))),
      "image/png",
    ),
  )
  return { blob, missingImages }
}

// An Export PNG button and its status line, for a chart drawn without the
// tool's rail, as in a note. It exports whichever frame `chart` holds when
// clicked, so a redrawn frame is the one exported
export function exportRow(chart: HTMLElement, name: string): HTMLElement {
  const row = document.createElement("div")
  row.className = "export-row"
  const button = document.createElement("button")
  button.type = "button"
  button.className = "export"
  button.textContent = "Export PNG"
  const note = document.createElement("span")
  note.setAttribute("role", "status")
  row.append(button, note)
  // the site root, for fetching fonts
  const base = new URL(
    import.meta.env.BASE_URL.replace(/\/?$/, "/"),
    location.href,
  ).href
  button.addEventListener("click", async () => {
    const svg = chart.querySelector<SVGSVGElement>("svg")
    if (!svg) return
    button.disabled = true
    note.textContent = "Exporting…"
    try {
      const { blob, missingImages } = await toPng(svg, base)
      download(blob, `${name}.png`)
      note.textContent = missingImages
        ? `Exported, but ${missingImages} images couldn't be embedded (no CORS)`
        : ""
    } catch (e) {
      console.error(e)
      note.textContent = "Couldn't export"
    } finally {
      button.disabled = false
    }
  })
  return row
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
