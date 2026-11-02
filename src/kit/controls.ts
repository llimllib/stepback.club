// The question controls, as native elements where there's one that fits:
// select, range (and steps, a range over a list) and checkbox. Three have none and are built here: a two-handle
// slider over a span of values, a select that picks several, and a search
// box that picks several players
import type { Params } from "./state"
import type { Control, Option } from "./tool"

type Set = (patch: Params) => void

export function controlElement(c: Control, p: Params, set: Set): HTMLElement {
  if (c.kind === "span") return span(c, p, set)
  if (c.kind === "players") return players(c, p, set)
  if (c.kind === "multi") return multi(c, p, set)

  const label = document.createElement("label")
  const name = document.createElement("span")
  name.textContent = c.label
  label.append(name)
  const value = p[c.key]
  let input: HTMLInputElement | HTMLSelectElement
  if (c.kind === "select") {
    const select = (input = document.createElement("select"))
    const groups = new Map<string, HTMLOptGroupElement>()
    for (const o of c.options) {
      const opt = new Option(o.label, String(o.value))
      opt.selected = o.value === value
      if (o.group === undefined) {
        select.add(opt)
        continue
      }
      let group = groups.get(o.group)
      if (!group) {
        group = document.createElement("optgroup")
        group.label = o.group
        groups.set(o.group, group)
        select.append(group)
      }
      group.append(opt)
    }
  } else if (c.kind === "range") {
    input = document.createElement("input")
    Object.assign(input, {
      type: "range",
      min: c.min,
      max: c.max,
      step: c.step,
      value,
    })
    const out = document.createElement("output")
    out.value = String(value)
    input.addEventListener("input", () => (out.value = input.value))
    label.append(input, out)
  } else if (c.kind === "steps") {
    // over the options' indices, so the steps needn't be evenly spaced
    const steps = c.options
    const range = document.createElement("input")
    Object.assign(range, { type: "range", min: 0, max: steps.length - 1 })
    range.value = String(
      Math.max(
        0,
        steps.findIndex(o => o.value === value),
      ),
    )
    const out = document.createElement("output")
    const show = () => (out.value = steps[Number(range.value)]?.label ?? "")
    range.addEventListener("input", show)
    show()
    label.append(range, out)
    range.addEventListener("change", () =>
      set({ [c.key]: steps[Number(range.value)].value }),
    )
    return label
  } else {
    input = document.createElement("input")
    input.type = "checkbox"
    input.checked = Boolean(value)
  }
  if (!input.parentElement) label.append(input)
  input.addEventListener("change", () => {
    const v =
      c.kind === "toggle"
        ? (input as HTMLInputElement).checked
        : typeof value === "number"
          ? Number(input.value)
          : input.value
    set({ [c.key]: v })
  })
  return label
}

function field(text: string) {
  const div = document.createElement("div")
  div.className = "field"
  const name = document.createElement("span")
  name.textContent = text
  div.append(name)
  return div
}

// Two range inputs stacked on one track, over the indices of the options;
// only their thumbs take pointer events, so either can be grabbed. Both on
// one value is a span of one
function span(
  c: Extract<Control, { kind: "span" }>,
  p: Params,
  set: Set,
): HTMLElement {
  const div = field(c.label)
  const out = document.createElement("output")
  const track = document.createElement("div")
  track.className = "dual"
  const index = (v: unknown) =>
    Math.max(
      0,
      c.options.findIndex(o => o.value === v),
    )
  const last = c.options.length - 1
  // an option's place along the track
  const pct = (i: number) => `${last ? (i / last) * 100 : 0}%`
  const inputs = [p[c.key], p[c.keyTo]].map((v, i) => {
    const input = document.createElement("input")
    Object.assign(input, { type: "range", min: 0, max: last, step: 1 })
    input.value = String(index(v))
    input.setAttribute("aria-label", `${c.label}: ${i ? "to" : "from"}`)
    track.append(input)
    return input
  })
  const values = () => inputs.map(i => Number(i.value)).sort((a, b) => a - b)
  const show = () => {
    const [lo, hi] = values()
    div.style.setProperty("--lo", pct(lo))
    div.style.setProperty("--hi", pct(hi))
    out.value =
      lo === hi
        ? c.options[lo].label
        : `${c.options[lo].label} → ${c.options[hi].label}`
  }
  for (const input of inputs) {
    input.addEventListener("input", show)
    input.addEventListener("change", () => {
      const [lo, hi] = values()
      set({ [c.key]: c.options[lo].value, [c.keyTo]: c.options[hi].value })
    })
  }
  show()
  div.append(out, track)
  return div
}

// the picks in a comma-separated param
const picks = (v: unknown) =>
  String(v || "")
    .split(",")
    .filter(Boolean)

// A select that adds its choice to the picks, shown as chips under it. Its
// first option says what's picked: `none`, or how many
function multi(
  c: Extract<Control, { kind: "multi" }>,
  p: Params,
  set: Set,
): HTMLElement {
  const div = field(c.label)
  div.classList.add("multi")
  const picked = picks(p[c.key])
  const write = (vs: string[]) => set({ [c.key]: vs.join(",") })

  const select = document.createElement("select")
  select.setAttribute("aria-label", `Add to ${c.label.toLowerCase()}`)
  const full = picked.length >= c.max
  select.add(
    new Option(
      !picked.length ? c.none : full ? `${c.max} at most` : `Add another…`,
      "",
    ),
  )
  for (const o of c.options)
    if (!picked.includes(String(o.value)))
      select.add(new Option(o.label, String(o.value)))
  select.disabled = full
  select.addEventListener("change", () => {
    if (select.value) write([...picked, select.value])
  })

  const byValue = new Map(c.options.map(o => [String(o.value), o]))
  const chips = document.createElement("div")
  chips.className = "chips"
  for (const v of picked) {
    const chip = document.createElement("button")
    chip.type = "button"
    chip.className = "chip"
    chip.title = "Remove"
    chip.textContent = `${byValue.get(v)?.label ?? v} ×`
    chip.addEventListener("click", () => write(picked.filter(x => x !== v)))
    chips.append(chip)
  }

  div.append(select, chips)
  return div
}

// lower case without accents, so "jokic" finds Jokić
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// A search box with the picked players as chips under it. Every word typed
// has to appear in the name
function players(
  c: Extract<Control, { kind: "players" }>,
  p: Params,
  set: Set,
): HTMLElement {
  const div = field(c.label)
  div.classList.add("players")
  const picked = String(p[c.key] || "")
    .split(",")
    .filter(Boolean)
  const byValue = new Map(c.options.map(o => [String(o.value), o]))
  const write = (ids: string[]) => set({ [c.key]: ids.join(",") })

  // with none picked, the fallback's chips stand in, muted. Removing one
  // keeps the rest as picks; adding one replaces them
  const fallback = picked.length ? undefined : c.fallback
  const shown = fallback?.values ?? picked
  const chips = document.createElement("div")
  chips.className = "chips"
  chips.classList.toggle("fallback", !!fallback)
  for (const id of shown) {
    const chip = document.createElement("button")
    chip.type = "button"
    chip.className = "chip"
    chip.title = "Remove"
    chip.textContent = `${byValue.get(id)?.label ?? id} ×`
    chip.addEventListener("click", () => write(shown.filter(v => v !== id)))
    chips.append(chip)
  }
  const note = document.createElement("p")
  note.className = "fallback-note"
  note.hidden = !fallback
  note.textContent = `${fallback?.label ?? ""}, until you add a player`

  const box = document.createElement("div")
  box.className = "search"
  const input = document.createElement("input")
  input.type = "search"
  input.autocomplete = "off"
  input.setAttribute("aria-label", `Add to ${c.label.toLowerCase()}`)
  const full = picked.length >= c.max
  input.disabled = full
  input.placeholder = full ? `${c.max} at most` : "Add a player…"
  const list = document.createElement("ul")
  list.setAttribute("role", "listbox")
  box.append(input, list)

  const folded = c.options.map(o => [fold(o.label), o] as const)
  let matches: Option[] = []
  let active = 0
  const show = () => {
    const terms = fold(input.value).split(/\s+/).filter(Boolean)
    matches = terms.length
      ? folded
          .filter(
            ([f, o]) =>
              !picked.includes(String(o.value)) &&
              terms.every(t => f.includes(t)),
          )
          .map(([, o]) => o)
          .slice(0, 12)
      : []
    active = Math.min(active, Math.max(matches.length - 1, 0))
    list.replaceChildren(
      ...matches.map((o, i) => {
        const li = document.createElement("li")
        li.setAttribute("role", "option")
        li.textContent = o.label
        li.classList.toggle("on", i === active)
        // mousedown, so it lands before the input's blur hides the list
        li.addEventListener("mousedown", e => {
          e.preventDefault()
          add(o)
        })
        return li
      }),
    )
  }
  const add = (o: Option | undefined) => {
    if (o) write([...picked, String(o.value)])
  }
  input.addEventListener("input", () => {
    active = 0
    show()
  })
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") active = Math.min(active + 1, matches.length - 1)
    else if (e.key === "ArrowUp") active = Math.max(active - 1, 0)
    else if (e.key === "Enter") add(matches[active])
    else if (e.key === "Escape") input.value = ""
    else return
    e.preventDefault()
    show()
  })
  input.addEventListener("blur", () => list.replaceChildren())
  input.addEventListener("focus", show)

  div.append(box, note, chips)
  return div
}
