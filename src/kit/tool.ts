// The contract every tool implements. A tool says what question controls it
// has, how to load data, and how to draw its chart into the body of a frame;
// the kit supplies the frame, URL state, annotations and export
import type { Versus } from "./frame"
import type { Params, ParamValue } from "./state"

export interface Option {
  value: ParamValue
  label: string
  // a select shows options with a group under its heading
  group?: string
}

// Question controls only: season, team, metric, filter. Five at most; framing
// (title, labels, size) happens on the chart, and rendering knobs don't exist
export type Control =
  | { key: string; label: string; kind: "select"; options: Option[] }
  | {
      key: string
      label: string
      kind: "range"
      min: number
      max: number
      step: number
    }
  | { key: string; label: string; kind: "toggle" }
  // a slider over a list of values, showing the label of the one picked
  | { key: string; label: string; kind: "steps"; options: Option[] }
  // a two-handle slider over a list of values, writing two params
  | {
      key: string
      keyTo: string
      label: string
      kind: "span"
      options: Option[]
    }
  // pick several from a short list with a select, shown as chips: a
  // comma-separated param. None picked is `none`
  | {
      key: string
      label: string
      kind: "multi"
      options: Option[]
      none: string
      // at most this many
      max: number
    }
  // pick several from a long list by searching: a comma-separated param
  | {
      key: string
      label: string
      kind: "players"
      options: Option[]
      // at most this many
      max: number
      // shown, under the label, when none are picked; adding one replaces
      // them
      fallback?: { label: string; values: string[] }
    }

// Something a label or arrow can attach to, in body coordinates
export interface Mark {
  key: string
  x: number
  y: number
  r: number
  // half the width of a bar-shaped mark, which is hit along its length
  w?: number
  // what a click on the mark labels it with. Without one, a click doesn't
  // label it, but arrows still point at it
  label?: string
  // the chart drew its own label for this mark, as an element with
  // data-mark set to the key: clicking the mark hides and shows that one
  labeled?: boolean
  // the size of the chart's labels, so a label added by a click matches them
  labelSize?: number
}

export interface Body {
  height: number
  marks: Mark[]
  // Convert between body coordinates and a serializable data position, so
  // free annotations stay attached to the data when it changes
  invert(x: number, y: number): unknown | undefined
  project(pos: unknown): [number, number] | undefined
}

export interface LegendItem {
  // line: a series over time. dotline: one known only at its dots. rule:
  // a solid reference line, dash: a dashed one
  symbol:
    | "dot"
    | "diamond"
    | "cross"
    | "tick"
    | "bar"
    | "dash"
    | "rule"
    | "line"
    | "dotline"
  color: string
  // a dot or diamond's outline only
  hollow?: boolean
  // start a new row of the legend with this item
  break?: boolean
  // drawn inside a bar, so the legend doesn't rely on color alone
  label?: string
  text: string
}

export interface Description {
  // the headline: short
  title: string
  // the deck under it, written as a phrase ("Net points per game in the
  // 2025–26 playoffs, through June 13")
  context: string
  // who's on the chart: a sentence before the deck ("The five leaders in
  // net points"). A tool that sets it, even to "", gets it edited in place
  // of the whole deck, so the rest stays generated
  who?: string
  legend?: LegendItem[]
  // the right side of the legend strip ("7 games · 9 players")
  counts?: string
  source: string
  // the team the view is about: the band takes its color and logo
  team?: string
  // a game between two teams: each gets a band, away on the left, and the
  // headline and deck go under them. Takes the place of `team`'s band
  versus?: Versus
}

export interface Tool<P extends Params, D> {
  id: string
  name: string
  defaults: P
  load(p: P): Promise<D>
  // Fix up params that don't fit the data, e.g. a team with no playoff games
  normalize?(d: D, p: P): P
  controls(d: D, p: P): Control[]
  describe(d: D, p: P): Description
  // `set` changes params from the chart, as a click on a column header
  // sorts by it. Give such elements the class frame-control; embeds ignore
  // them
  render(
    g: SVGGElement,
    d: D,
    p: P,
    size: { width: number; height?: number },
    set: (patch: Partial<P>) => void,
  ): Body
}
