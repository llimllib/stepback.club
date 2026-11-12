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
    [...clone.querySelectorAll("image")].map(async img => {
      const href = img.getAttribute("href")
      if (!href || href.startsWith("data:")) return
      const src = await inline(new URL(href, baseUrl).href)
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
