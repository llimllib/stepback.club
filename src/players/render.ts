// The players page as plain DOM: the question controls (season, day,
// team, a name search) and the table, sortable by any number. Data:
// load.ts. Design: docs/plans/2026-11-18-players-design.md
import { hasAll, squash, terms } from "../kit/match"
import { el, signed } from "../team/render"
import { QUALIFY, type Player, type Season, type Since } from "./load"

export interface State {
  season: number
  // YYYY-MM-DD, one of the season's days
  date: string
  // what the change column measures from
  since: Since
  // a team's abbreviation, or "" for every team
  team: string
  sort: SortKey
  // "desc", best first, or "asc", a second click on the column's head
  order: "desc" | "asc"
  q: string
}

const dash = "—"
const fixed = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : dash)
const sign = (v: number) =>
  !Number.isFinite(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "pos" : "neg"
export const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
export const fmtDay = (d: string, year = false, weekday = !year) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: year ? "numeric" : undefined,
  })

type Group = "role" | "rating" | "source"
interface Col {
  key: SortKey
  label: string
  title: string
  group: Group
  value: (p: Player) => number
  text: (p: Player) => string
  // a signed value, colored by its sign (which it also prints)
  signed?: boolean
  // a box-score rate: sorted by it, the players who qualify come first
  rate?: boolean
}

export type SortKey =
  | "gp"
  | "mpg"
  | "ppg"
  | "usg"
  | "ts"
  | "off"
  | "def"
  | "net"
  | "delta"
  | "prior"
  | "beyond"

export const cols: Col[] = [
  {
    key: "off",
    label: "Off",
    title: "Offense: points per 100 possessions better than average",
    group: "rating",
    value: p => p.off,
    text: p => signed(p.off),
    signed: true,
  },
  {
    key: "def",
    label: "Def",
    title:
      "Defense: points per 100 possessions better than average, positive is good",
    group: "rating",
    value: p => p.def,
    text: p => signed(p.def),
    signed: true,
  },
  {
    key: "net",
    label: "Total",
    title:
      "Offense plus defense: points per 100 possessions better than average",
    group: "rating",
    value: p => p.net,
    text: p => signed(p.net),
    signed: true,
  },
  {
    key: "delta",
    // its head names the day it's measured from; see table
    label: "Change",
    title: "How much his total has moved since the day in its head",
    group: "rating",
    value: p => p.delta,
    text: p => signed(p.delta),
    signed: true,
  },
  {
    key: "prior",
    label: "Box score",
    title:
      "What his box score alone says, offense plus defense: the prior yarapm pulls his ratings toward",
    group: "source",
    value: p => p.prior,
    text: p => signed(p.prior),
    signed: true,
  },
  {
    key: "beyond",
    label: "Beyond box",
    title:
      "What the lineup data adds to his box score: his total minus his box score. High for players whose impact the box score misses",
    group: "source",
    value: p => p.net - p.prior,
    text: p => signed(p.net - p.prior),
    signed: true,
  },
  {
    key: "gp",
    label: "GP",
    title: "Games played this regular season, before the day",
    group: "role",
    value: p => p.gp,
    text: p => (p.gp ? String(p.gp) : dash),
  },
  {
    key: "mpg",
    rate: true,
    label: "Min",
    title: "Minutes a game",
    group: "role",
    value: p => p.mpg,
    text: p => fixed(p.mpg),
  },
  {
    key: "ppg",
    rate: true,
    label: "Pts",
    title: "Points a game",
    group: "role",
    value: p => p.ppg,
    text: p => fixed(p.ppg),
  },
  {
    key: "usg",
    rate: true,
    label: "Usg%",
    title:
      "Usage: the share of his team's plays he finishes with a shot, free throws or a turnover while he's on the floor",
    group: "role",
    value: p => p.usg,
    text: p => fixed(p.usg),
  },
  {
    key: "ts",
    rate: true,
    label: "TS%",
    title:
      "True shooting: points per shot, counting free throws, as a percentage",
    group: "role",
    value: p => p.ts,
    text: p => fixed(p.ts),
  },
]
const groups: { key: Group; label: string }[] = [
  { key: "rating", label: "yarapm" },
  { key: "source", label: "Components" },
  { key: "role", label: "Role" },
]
export const sortKeys = new Set<string>(cols.map(c => c.key))
// the first column of each group, which opens with a rule
const opens = (c: Col) => cols.find(x => x.group === c.group) === c

// the rows the view shows: its team's, matching its search, by its column
// in its order, with no value last either way. Sorted by a box-score rate,
// the players who qualify come first, in either order; `unqualified` is
// where the rest start, or -1
export function rows(all: Player[], s: State) {
  const col = cols.find(c => c.key === s.sort)!
  const ts = terms(s.q)
  const dir = s.order === "asc" ? -1 : 1
  const shown = all
    .filter(p => !s.team || p.team === s.team)
    .filter(p => !ts.length || hasAll(squash(p.name), ts))
    .sort((a, b) => {
      if (col.rate && a.qualified !== b.qualified)
        return +b.qualified - +a.qualified
      const [va, vb] = [col.value(a), col.value(b)]
      const [fa, fb] = [Number.isFinite(va), Number.isFinite(vb)]
      if (fa !== fb) return +fb - +fa
      return (fa ? dir * (vb - va) : 0) || b.net - a.net
    })
  return {
    shown,
    unqualified: col.rate ? shown.findIndex(p => !p.qualified) : -1,
  }
}

// --- the controls: season, day, change since, team, search

const sinceNames: Record<Since, string> = {
  week: "A week ago",
  month: "A month ago",
  start: "Opening night",
}

export interface Controls {
  node: HTMLElement
  // set the controls to a season's choices and the state's values
  update(season: Season, seasons: number[], s: State): void
}

// a control under its agate label
const field = (label: string, ...input: Node[]) =>
  el("label", { className: "field" }, el("span", {}, label), ...input)

export function controls(on: (change: Partial<State>) => void): Controls {
  const season: HTMLSelectElement = document.createElement("select")
  season.name = "season"
  season.addEventListener("change", () =>
    on({ season: +season.value, date: "" }),
  )

  // a day of the season: one it doesn't rate (the All-Star break) shows
  // the last one before it
  const day: HTMLInputElement = document.createElement("input")
  Object.assign(day, { type: "date", name: "date", required: true })
  day.addEventListener("change", () => {
    if (day.value) on({ date: day.value })
  })

  const since: HTMLSelectElement = document.createElement("select")
  since.name = "since"
  since.append(
    ...Object.entries(sinceNames).map(([value, label]) =>
      el("option", { value }, label),
    ),
  )
  since.addEventListener("change", () => on({ since: since.value as Since }))

  const team: HTMLSelectElement = document.createElement("select")
  team.name = "team"
  team.addEventListener("change", () => on({ team: team.value }))

  const q: HTMLInputElement = document.createElement("input")
  Object.assign(q, {
    type: "search",
    name: "q",
    placeholder: "Name",
    autocomplete: "off",
  })
  q.addEventListener("input", () => on({ q: q.value }))

  const node: HTMLFormElement = el(
    "form",
    { className: "player-controls" },
    field("Season", season),
    field("Day", day),
    field("Change since", since),
    field("Team", team),
    field("Search", q),
  )
  node.addEventListener("submit", e => e.preventDefault())

  return {
    node,
    update(data, seasons, s) {
      season.replaceChildren(
        ...seasons.map(n =>
          el(
            "option",
            { value: String(n), selected: n === s.season },
            fmtSeason(n),
          ),
        ),
      )
      day.min = data.days[0]
      day.max = data.days.at(-1)!
      day.value = s.date
      since.value = s.since
      team.replaceChildren(
        el("option", { value: "", selected: !s.team }, "Every team"),
        ...data.teams.map(t =>
          el(
            "option",
            { value: t.abbrev, selected: t.abbrev === s.team },
            t.name,
          ),
        ),
      )
      if (q.value !== s.q) q.value = s.q
    },
  }
}

// --- the table

const base = import.meta.env.BASE_URL.replace(/\/?$/, "/")

function playerCell(p: Player, season: number) {
  const meta = [p.position, Number.isFinite(p.age) ? String(p.age) : ""]
    .filter(Boolean)
    .join(" · ")
  return el(
    "th",
    { scope: "row", className: "name" },
    el(
      "a",
      {
        href: `${base}rapm?players=${p.player_id}&from=${season}&to=${season}`,
        title: `${p.name}'s yarapm over the season`,
      },
      p.name,
    ),
    meta ? el("small", {}, ` ${meta}`) : "",
  )
}

// the total's bar, from zero. The track runs from the day's lowest total
// to its highest, so zero sits where they put it (about a third of the
// way in) rather than in the middle, and the best players' bars start
// close to their numbers
type Range = { lo: number; hi: number }
const pct = (v: number, r: Range) => (100 * (v - r.lo)) / (r.hi - r.lo)
function bar(v: number, r: Range) {
  const fill = el("span", { className: `fill ${sign(v)}` })
  const [a, b] = [pct(0, r), pct(v, r)]
  fill.style.left = `${Math.min(a, b)}%`
  fill.style.width = `${Math.abs(b - a)}%`
  const track = el("span", { className: "track" }, fill)
  track.style.setProperty("--zero", `${a}%`)
  return el("td", { className: "bar", ariaHidden: "true" }, track)
}

// `from` is the day the change column measures from, if there is one
export function table(
  all: Player[],
  s: State,
  from: string | undefined,
  onSort: (k: SortKey) => void,
) {
  const { shown, unqualified } = rows(all, s)
  const nets = all.map(p => p.net).filter(Number.isFinite)
  const range = { lo: Math.min(-1, ...nets), hi: Math.max(1, ...nets) }
  const head = (c: Col) => {
    const on = c.key === s.sort
    const asc = on && s.order === "asc"
    const b = el(
      "button",
      {
        type: "button",
        title: on
          ? `${c.title}. Click to sort ${asc ? "highest" : "lowest"} first`
          : `${c.title}. Click to sort by it`,
      },
      c.key === "delta" && from
        ? `Since ${fmtDay(from, false, false)}`
        : c.label,
      on ? (asc ? " ▲" : " ▼") : "",
    )
    b.addEventListener("click", () => onSort(c.key))
    const th = el(
      "th",
      {
        scope: "col",
        className: [
          opens(c) ? "opens" : "",
          on ? "sorted" : "",
          c.key === "net" ? "total-head" : "",
        ]
          .filter(Boolean)
          .join(" "),
        ...(on ? { ariaSort: asc ? "ascending" : "descending" } : {}),
        // the total's head spans its number and its bar, so they read as
        // one column
        colSpan: c.key === "net" ? 2 : 1,
      },
      b,
    )
    return th
  }
  const body = shown.map(p =>
    el(
      "tr",
      {},
      el("td", { className: "rank" }, String(p.rank)),
      playerCell(p, s.season),
      el(
        "td",
        { className: "team" },
        p.team
          ? el(
              "a",
              { href: `${base}team?team=${p.team}`, className: "team-link" },
              p.team,
            )
          : dash,
      ),
      ...cols.flatMap(c => {
        const cls = [
          "num",
          `k-${c.key}`,
          opens(c) ? "opens" : "",
          c.signed ? sign(c.value(p)) : "",
          c.key === s.sort ? "sorted" : "",
          c.key === "net" ? "total" : "",
        ]
        const td = el(
          "td",
          { className: cls.filter(Boolean).join(" ") },
          c.text(p),
        )
        return c.key === "net" ? [td, bar(p.net, range)] : [td]
      }),
    ),
  )
  // the rule above the players who don't qualify, saying why they're there
  if (unqualified >= 0)
    body.splice(
      unqualified,
      0,
      el(
        "tr",
        { className: "unqualified" },
        el(
          "td",
          { colSpan: cols.length + 4 },
          `Not qualified: under ${QUALIFY.mpg} minutes a game, or under a quarter of the season's games`,
        ),
      ),
    )
  if (!shown.length)
    body.push(
      el(
        "tr",
        {},
        el(
          "td",
          { colSpan: cols.length + 4, className: "none" },
          "No players match.",
        ),
      ),
    )

  return el(
    "div",
    { className: "scroll" },
    el(
      "table",
      { className: "players" },
      el(
        "thead",
        {},
        el(
          "tr",
          { className: "groups" },
          el("td", { colSpan: 3 }),
          ...groups.map(g =>
            el(
              "th",
              {
                scope: "colgroup",
                colSpan:
                  cols.filter(c => c.group === g.key).length +
                  (g.key === "rating" ? 1 : 0),
              },
              g.label,
            ),
          ),
        ),
        el(
          "tr",
          { className: "cols" },
          el(
            "th",
            {
              scope: "col",
              className: "rank",
              title: "Rank by total among every player rated that day",
            },
            "#",
          ),
          el("th", { scope: "col", className: "name" }, "Player"),
          el("th", { scope: "col", className: "team" }, "Team"),
          ...cols.map(head),
        ),
      ),
      el("tbody", {}, ...body),
    ),
  )
}
