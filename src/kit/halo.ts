import { color } from "./theme"

// A halo in the background color behind a text, so the lines and dots it
// crosses don't break the letters. The halo is a copy of the text drawn
// underneath, not `paint-order: stroke`: Firefox applies that to each run
// of one font, and a name with letters from both of a font's files
// (Dončić) has each run's halo cut into the letters before it
export function halo(text: SVGTextElement, width: number) {
  const under = text.cloneNode(true) as SVGTextElement
  under.setAttribute("fill", "none")
  under.setAttribute("stroke", color.bg)
  under.setAttribute("stroke-width", String(width))
  under.setAttribute("stroke-linejoin", "round")
  under.setAttribute("aria-hidden", "true")
  text.before(under)
}
