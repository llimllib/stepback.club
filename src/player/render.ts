// A player's page as plain DOM: his band, his career a season to a row in
// four views, the comparables' chips under the chart, and a season's
// games. Data: load.ts; the chart: chart.ts. Design:
// docs/plans/2026-11-18-player-page-design.md
import { bandColors } from "../kit/frame"
import { lineStyle } from "../kit/lines"
import { hasAll, squash, terms } from "../kit/match"
import { el, signed } from "../team/render"
import type { Comp } from "./comps"
import type { Bio, Game, RatingDay, StatSeason } from "./load"

const base = import.meta.env.BASE_URL.replace(/\/?$/, "/")
const dash = "—"
const fixed = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : dash)
const pct = (v: number, d = 1) =>
  Number.isFinite(v) ? (v * 100).toFixed(d) : dash
const sign = (v: number) =>
  !Number.isFinite(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "pos" : "neg"
const div = (a: number, b: number) => (b ? a / b : NaN)
export const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })

export const playerUrl = (id: string) => `${base}player?id=${id}`

// --- the band: his name in his team's colors, his headshot in the box

export function playerBand(b: Bio) {
  const { band, text } = bandColors(b.team || undefined)
  const draft = Number.isFinite(b.draftYear)
    ? Number.isFinite(b.draftNumber)
      ? `Drafted ${b.draftYear} · #${b.draftNumber}`
      : `Undrafted (${b.draftYear})`
    : ""
  const from = b.college && b.college !== "None" ? b.college : b.country
  const facts = [
    b.position,
    b.height,
    Number.isFinite(b.weight) ? `${b.weight} lb` : "",
    Number.isFinite(b.age) ? `Age ${b.age}` : "",
    draft,
    from,
  ]
    .filter(Boolean)
    .join(" · ")
  const img = el("img", {
    src: `https://cdn.nba.com/headshots/nba/latest/260x190/${b.id}.png`,
    alt: "",
    width: 98,
    height: 72,
  })
  // without his headshot (cdn.nba.com doesn't have one), no empty box
  img.addEventListener("error", () => img.parentElement?.remove())
  const team = b.team
    ? el(
        "a",
        { href: `${base}team?team=${b.team}`, className: "team-link" },
        b.current ? b.teamName : `Last: ${b.teamName}`,
      )
    : ""
  const head = el(
    "div",
    { className: "team-band player-band" },
    el("span", { className: "logo" }, img),
    el(
      "span",
      { className: "who" },
      el("h1", { className: "tname" }, b.name),
      el(
        "span",
        { className: "tnums" },
        team,
        team && facts ? " · " : "",
        facts,
      ),
    ),
  )
  head.style.background = band
  head.style.color = text
  return head
}

// --- the career table

export type View = "ratings" | "per-game" | "advanced" | "per-100"
export const views: { key: View; label: string }[] = [
  { key: "ratings", label: "Ratings" },
  { key: "per-game", label: "Per game" },
  { key: "advanced", label: "Advanced" },
  { key: "per-100", label: "Per 100" },
]

// a season of the table: his box score, OpenRAPM and net points, and
// yarapm on the season's last day. The career row has no ratings
export interface CareerRow extends StatSeason {
  age: number
  yOff: number
  yDef: number
  yTot: number
  yPrior: number
  career?: boolean
}

export function careerRows(
  seasons: StatSeason[],
  offset: number | undefined,
  ratings: RatingDay[],
): CareerRow[] {
  const last = new Map<number, RatingDay>()
  for (const r of ratings) last.set(r.season, r)
  return seasons.map(s => {
    const r = last.get(s.season)
    return {
      ...s,
      age: offset === undefined ? NaN : s.season - offset,
      yOff: r?.off ?? NaN,
      yDef: r?.def ?? NaN,
      yTot: r?.v ?? NaN,
      yPrior: r?.prior ?? NaN,
    }
  })
}

// the career, from the seasons' totals: the rates weighted by minutes,
// the on-court ratings by possessions
export function careerTotal(rows: CareerRow[]): CareerRow {
  const total = (f: (r: CareerRow) => number) =>
    rows.reduce((t, r) => t + (Number.isFinite(f(r)) ? f(r) : 0), 0)
  const weighted = (
    f: (r: CareerRow) => number,
    by: (r: CareerRow) => number,
  ) =>
    div(
      total(r => (Number.isFinite(f(r)) ? f(r) * by(r) : 0)),
      total(r => (Number.isFinite(f(r)) ? by(r) : 0)),
    )
  const byMin = (f: (r: CareerRow) => number) => weighted(f, r => r.min)
  const byPoss = (f: (r: CareerRow) => number) => weighted(f, r => r.poss)
  const first = rows[0]
  return {
    ...first,
    career: true,
    season: NaN,
    team: "",
    teams: 1,
    age: NaN,
    gp: total(r => r.gp),
    min: total(r => r.min),
    pts: total(r => r.pts),
    fgm: total(r => r.fgm),
    fga: total(r => r.fga),
    fg3m: total(r => r.fg3m),
    fg3a: total(r => r.fg3a),
    ftm: total(r => r.ftm),
    fta: total(r => r.fta),
    oreb: total(r => r.oreb),
    dreb: total(r => r.dreb),
    reb: total(r => r.reb),
    ast: total(r => r.ast),
    tov: total(r => r.tov),
    stl: total(r => r.stl),
    blk: total(r => r.blk),
    poss: total(r => r.poss),
    usg: byMin(r => r.usg),
    astPct: byMin(r => r.astPct),
    orebPct: byMin(r => r.orebPct),
    drebPct: byMin(r => r.drebPct),
    tovPct: byMin(r => r.tovPct),
    ortg: byPoss(r => r.ortg),
    drtg: byPoss(r => r.drtg),
    open: NaN,
    openO: NaN,
    openD: NaN,
    netPts: NaN,
    yOff: NaN,
    yDef: NaN,
    yTot: NaN,
    yPrior: NaN,
  }
}

interface Col {
  key: string
  label: string
  title: string
  // the group it's in: a rule opens each
  group?: string
  value: (r: CareerRow) => number
  text?: (r: CareerRow) => string
  signed?: boolean
}

const perGame = (f: (r: CareerRow) => number) => (r: CareerRow) =>
  div(f(r), r.gp)
const per100 = (f: (r: CareerRow) => number) => (r: CareerRow) =>
  div(100 * f(r), r.poss)
const trueShooting = (r: CareerRow) => div(r.pts, 2 * (r.fga + 0.44 * r.fta))

// the columns every view opens with, after Season and Team
const lead: Col[] = [
  {
    key: "age",
    label: "Age",
    title: "His age at the season's end",
    value: r => r.age,
    text: r => (Number.isFinite(r.age) ? String(r.age) : ""),
  },
  {
    key: "gp",
    label: "GP",
    title: "Games played",
    value: r => r.gp,
    text: r => String(r.gp),
  },
  {
    key: "mpg",
    label: "Min",
    title: "Minutes a game",
    value: perGame(r => r.min),
  },
]

const viewCols: Record<View, Col[]> = {
  ratings: [
    {
      key: "yOff",
      group: "yarapm",
      label: "Off",
      title:
        "yarapm's offense on the season's last day: points per 100 possessions better than average",
      value: r => r.yOff,
      signed: true,
    },
    {
      key: "yDef",
      group: "yarapm",
      label: "Def",
      title: "yarapm's defense on the season's last day, positive is good",
      value: r => r.yDef,
      signed: true,
    },
    {
      key: "yTot",
      group: "yarapm",
      label: "Total",
      title: "yarapm's total on the season's last day",
      value: r => r.yTot,
      signed: true,
    },
    {
      key: "yPrior",
      group: "Total = box + beyond",
      label: "Box score",
      title: "What his box score alone says: the prior yarapm pulls him toward",
      value: r => r.yPrior,
      signed: true,
    },
    {
      key: "beyond",
      group: "Total = box + beyond",
      label: "Beyond box",
      title: "What the lineup data adds: his total minus his box score",
      value: r => r.yTot - r.yPrior,
      signed: true,
    },
    {
      key: "open",
      group: "Others",
      label: "OpenRAPM",
      title: "OpenRAPM's total for the season",
      value: r => r.open,
      signed: true,
    },
    {
      key: "netPts",
      group: "Others",
      label: "Net pts",
      title:
        "ESPN's net points per 100 of his team's possessions, 2018–19 on. Blank under 200 possessions",
      value: r => r.netPts,
      signed: true,
    },
  ],
  "per-game": [
    {
      key: "pts",
      label: "Pts",
      title: "Points a game",
      value: perGame(r => r.pts),
    },
    {
      key: "reb",
      label: "Reb",
      title: "Rebounds a game",
      value: perGame(r => r.reb),
    },
    {
      key: "ast",
      label: "Ast",
      title: "Assists a game",
      value: perGame(r => r.ast),
    },
    {
      key: "stl",
      label: "Stl",
      title: "Steals a game",
      value: perGame(r => r.stl),
    },
    {
      key: "blk",
      label: "Blk",
      title: "Blocks a game",
      value: perGame(r => r.blk),
    },
    {
      key: "tov",
      label: "Tov",
      title: "Turnovers a game",
      value: perGame(r => r.tov),
    },
    {
      key: "fgp",
      label: "FG%",
      title: "Field goal percentage",
      value: r => div(r.fgm, r.fga),
      text: r => pct(div(r.fgm, r.fga)),
    },
    {
      key: "fg3m",
      label: "3PM",
      title: "Threes made a game",
      value: perGame(r => r.fg3m),
    },
    {
      key: "fg3a",
      label: "3PA",
      title: "Threes tried a game",
      value: perGame(r => r.fg3a),
    },
    {
      key: "fg3p",
      label: "3P%",
      title: "Three-point percentage",
      value: r => div(r.fg3m, r.fg3a),
      text: r => pct(div(r.fg3m, r.fg3a)),
    },
    {
      key: "ftp",
      label: "FT%",
      title: "Free throw percentage",
      value: r => div(r.ftm, r.fta),
      text: r => pct(div(r.ftm, r.fta)),
    },
  ],
  advanced: [
    {
      key: "ts",
      label: "TS%",
      title: "True shooting: points ÷ (2 × (FGA + 0.44 × FTA))",
      value: trueShooting,
      text: r => pct(trueShooting(r)),
    },
    {
      key: "efg",
      label: "eFG%",
      title: "Field goal percentage, with threes worth 1.5",
      value: r => div(r.fgm + 0.5 * r.fg3m, r.fga),
      text: r => pct(div(r.fgm + 0.5 * r.fg3m, r.fga)),
    },
    {
      key: "usg",
      label: "Usg%",
      title:
        "The share of his team's plays he finishes while he's on the floor",
      value: r => r.usg,
      text: r => pct(r.usg),
    },
    {
      key: "astPct",
      label: "Ast%",
      title:
        "The share of his teammates' baskets he assists while he's on the floor",
      value: r => r.astPct,
      text: r => pct(r.astPct),
    },
    {
      key: "astTo",
      label: "Ast/To",
      title: "Assists per turnover",
      value: r => div(r.ast, r.tov),
      text: r => fixed(div(r.ast, r.tov), 2),
    },
    {
      key: "orebPct",
      label: "OReb%",
      title:
        "The share of his team's misses he rebounds while he's on the floor",
      value: r => r.orebPct,
      text: r => pct(r.orebPct),
    },
    {
      key: "drebPct",
      label: "DReb%",
      title:
        "The share of the other team's misses he rebounds while he's on the floor",
      value: r => r.drebPct,
      text: r => pct(r.drebPct),
    },
    {
      key: "tovPct",
      label: "Tov%",
      title: "Turnovers per 100 of his plays",
      value: r => r.tovPct,
    },
    {
      key: "ortg",
      group: "On the floor",
      label: "Off",
      title: "His team's points per 100 possessions while he's on the floor",
      value: r => r.ortg,
    },
    {
      key: "drtg",
      group: "On the floor",
      label: "Def",
      title:
        "The other team's points per 100 possessions while he's on the floor",
      value: r => r.drtg,
    },
    {
      key: "nrtg",
      group: "On the floor",
      label: "Net",
      title: "Offense minus defense, while he's on the floor",
      value: r => r.ortg - r.drtg,
      signed: true,
    },
  ],
  "per-100": [
    {
      key: "pts",
      label: "Pts",
      title: "Points per 100 possessions",
      value: per100(r => r.pts),
    },
    {
      key: "reb",
      label: "Reb",
      title: "Rebounds per 100 possessions",
      value: per100(r => r.reb),
    },
    {
      key: "ast",
      label: "Ast",
      title: "Assists per 100 possessions",
      value: per100(r => r.ast),
    },
    {
      key: "stl",
      label: "Stl",
      title: "Steals per 100 possessions",
      value: per100(r => r.stl),
    },
    {
      key: "blk",
      label: "Blk",
      title: "Blocks per 100 possessions",
      value: per100(r => r.blk),
    },
    {
      key: "tov",
      label: "Tov",
      title: "Turnovers per 100 possessions",
      value: per100(r => r.tov),
    },
    {
      key: "fga",
      label: "FGA",
      title: "Shots per 100 possessions",
      value: per100(r => r.fga),
    },
    {
      key: "fg3a",
      label: "3PA",
      title: "Threes tried per 100 possessions",
      value: per100(r => r.fg3a),
    },
    {
      key: "fta",
      label: "FTA",
      title: "Free throws per 100 possessions",
      value: per100(r => r.fta),
    },
  ],
}

export function viewTabs(
  view: View,
  href: (v: View) => string,
  on: (v: View) => void,
) {
  return el(
    "nav",
    { className: "view-tabs", ariaLabel: "Views" },
    ...views.map(v => {
      const a = el(
        "a",
        {
          href: href(v.key),
          ...(v.key === view ? { ariaCurrent: "page" } : {}),
        },
        v.label,
      )
      a.addEventListener("click", e => {
        e.preventDefault()
        on(v.key)
      })
      return a
    }),
  )
}

// the first column of a group opens it with a rule
const opens = (c: Col, i: number, list: Col[]) =>
  !!c.group && list[i - 1]?.group !== c.group

export interface Sort {
  key: string
  asc: boolean
}

// `season` is the season the page is on, whose row is marked and whose
// link picks it
export function careerTable(
  rows: CareerRow[],
  view: View,
  sort: Sort,
  season: number,
  onSort: (key: string) => void,
  onSeason: (season: number, href: string) => void,
  seasonHref: (season: number) => string,
) {
  const cols = [...lead, ...viewCols[view]]
  const col = cols.find(c => c.key === sort.key)
  const sorted = col
    ? rows.toSorted((a, b) => {
        const [va, vb] = [col.value(a), col.value(b)]
        const [fa, fb] = [Number.isFinite(va), Number.isFinite(vb)]
        if (fa !== fb) return +fb - +fa
        return (fa ? (sort.asc ? va - vb : vb - va) : 0) || b.season - a.season
      })
    : rows.toSorted((a, b) =>
        sort.asc ? a.season - b.season : b.season - a.season,
      )
  // the career, at the foot, where it adds up
  const foot = view === "ratings" || rows.length < 2 ? [] : [careerTotal(rows)]

  const head = (c: Col, i: number, list: Col[]) => {
    const on = sort.key === c.key
    const b = el(
      "button",
      { type: "button", title: `${c.title}. Click to sort by it` },
      c.label,
      on ? (sort.asc ? " ▲" : " ▼") : "",
    )
    b.addEventListener("click", () => onSort(c.key))
    return el(
      "th",
      {
        scope: "col",
        className: [opens(c, i, list) ? "opens" : "", on ? "sorted" : ""]
          .filter(Boolean)
          .join(" "),
        ...(on ? { ariaSort: sort.asc ? "ascending" : "descending" } : {}),
      },
      b,
    )
  }
  const seasonHead = (() => {
    const on = sort.key === "season"
    const b = el(
      "button",
      { type: "button", title: "Click to sort by season" },
      "Season",
      on ? (sort.asc ? " ▲" : " ▼") : "",
    )
    b.addEventListener("click", () => onSort("season"))
    return el(
      "th",
      { scope: "col", className: `season${on ? " sorted" : ""}` },
      b,
    )
  })()

  const row = (r: CareerRow) => {
    let first: HTMLElement
    if (r.career)
      first = el("th", { scope: "row", className: "season" }, "Career")
    else {
      const href = seasonHref(r.season)
      const a = el(
        "a",
        {
          href,
          title: `His ${fmtSeason(r.season)} games, and players like him then`,
        },
        fmtSeason(r.season),
      )
      a.addEventListener("click", e => {
        e.preventDefault()
        onSeason(r.season, href)
      })
      first = el("th", { scope: "row", className: "season" }, a)
    }
    return el(
      "tr",
      {
        className: [
          r.career ? "career-row" : "",
          r.season === season ? "current" : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      first,
      el(
        "td",
        { className: "team" },
        r.team
          ? el(
              "a",
              { href: `${base}team?team=${r.team}`, className: "team-link" },
              r.team,
            )
          : "",
        r.teams > 1 ? el("small", {}, ` ${r.teams} teams`) : "",
      ),
      ...cols.map((c, i) => {
        const v = c.value(r)
        return el(
          "td",
          {
            className: [
              "num",
              opens(c, i, cols) ? "opens" : "",
              c.signed ? sign(v) : "",
              sort.key === c.key ? "sorted" : "",
            ]
              .filter(Boolean)
              .join(" "),
          },
          c.text ? c.text(r) : c.signed ? signed(v) : fixed(v),
        )
      }),
    )
  }

  // the groups' heads, over the columns that have one
  const groupRow: HTMLElement[] = [el("td", { colSpan: 2 + lead.length })]
  const vc = viewCols[view]
  for (let i = 0; i < vc.length;) {
    let j = i
    while (j < vc.length && vc[j].group === vc[i].group) j++
    groupRow.push(
      vc[i].group
        ? el(
            "th",
            { scope: "colgroup", colSpan: j - i, className: "opens" },
            vc[i].group!,
          )
        : el("td", { colSpan: j - i }),
    )
    i = j
  }

  return el(
    "div",
    { className: "scroll" },
    el(
      "table",
      { className: "players career" },
      el(
        "thead",
        {},
        vc.some(c => c.group)
          ? el("tr", { className: "groups" }, ...groupRow)
          : "",
        el(
          "tr",
          { className: "cols" },
          seasonHead,
          el("th", { scope: "col", className: "team" }, "Team"),
          ...cols.map(head),
        ),
      ),
      el("tbody", {}, ...sorted.map(row)),
      foot.length ? el("tfoot", {}, ...foot.map(row)) : "",
    ),
  )
}

// --- the comparables: chips under the chart

export interface Pick {
  id: string
  name: string
}

export function compChips(
  comps: (Comp & { name: string })[],
  shown: Pick[],
  age: number,
  all: { id: string; name: string; label: string }[],
  add: (id: string) => void,
  remove: (id: string) => void,
) {
  const on = new Set(shown.map(s => s.id))
  const picked = el(
    "div",
    { className: "chips" },
    ...shown.map((s, i) => {
      const style = lineStyle(i + 1)
      const swatch = el("span", {
        className: `swatch${style.dashed ? " dashed" : ""}`,
      })
      swatch.style.setProperty("--c", style.color)
      const b = el(
        "button",
        {
          type: "button",
          className: "chip on",
          title: `Take ${s.name} off the chart`,
        },
        swatch,
        s.name,
        " ×",
      )
      b.addEventListener("click", () => remove(s.id))
      return b
    }),
  )
  const suggested = comps
    .filter(c => !on.has(c.player_id))
    .map(c => {
      const b = el(
        "button",
        {
          type: "button",
          className: "chip",
          title: `Add ${c.name}'s career to the chart`,
        },
        "+ ",
        c.name,
        el("small", {}, ` ${fmtSeason(c.season)}`),
      )
      b.addEventListener("click", () => add(c.player_id))
      return b
    })

  // a search to add anyone yarapm has rated
  const input: HTMLInputElement = Object.assign(
    document.createElement("input"),
    { type: "search", placeholder: "Add a player", autocomplete: "off" },
  )
  const results = el("div", { className: "results" })
  const choose = (id: string) => {
    input.value = ""
    results.replaceChildren()
    add(id)
  }
  input.addEventListener("input", () => {
    const ts = terms(input.value)
    if (!ts.length) return results.replaceChildren()
    const hits = all
      .filter(p => !on.has(p.id) && hasAll(squash(p.name), ts))
      .slice(0, 8)
    results.replaceChildren(
      ...hits.map(p => {
        const b = el("button", { type: "button" }, p.label)
        b.addEventListener("click", () => choose(p.id))
        return b
      }),
    )
  })
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const first = results.querySelector("button")
      first?.click()
    }
  })

  return el(
    "div",
    { className: "comps" },
    shown.length
      ? el(
          "div",
          { className: "comps-row" },
          el("span", { className: "label" }, "On the chart"),
          picked,
        )
      : "",
    el(
      "div",
      { className: "comps-row" },
      el(
        "span",
        {
          className: "label",
          title:
            "Players whose three seasons up to this age were nearest his in size, role, style and OpenRAPM",
        },
        Number.isFinite(age) ? `Like him at ${age}` : "Like him",
      ),
      suggested.length
        ? el("div", { className: "chips" }, ...suggested)
        : el(
            "span",
            { className: "none" },
            comps.length
              ? "All on the chart"
              : "No one close enough to compare",
          ),
    ),
    el(
      "div",
      { className: "comps-row" },
      el("span", { className: "label" }, "Anyone"),
      el("div", { className: "add" }, input, results),
    ),
  )
}

// --- a season's games

const typeLabel: Record<string, string> = {
  playoffs: "Playoffs",
  play_in: "Play-in",
  regular_season: "Regular season",
  cup_final: "Regular season",
}

const made = (m: number, a: number) => `${m}–${a}`

export function gameLogTable(games: Game[]) {
  const espn = games.some(g => Number.isFinite(g.net))
  const cols = [
    ["Min", "Minutes"],
    ["Pts", "Points"],
    ["Reb", "Rebounds"],
    ["Ast", "Assists"],
    ["Stl", "Steals"],
    ["Blk", "Blocks"],
    ["Tov", "Turnovers"],
    ["FG", "Field goals made–attempted"],
    ["3P", "Threes made–attempted"],
    ["FT", "Free throws made–attempted"],
    ["+/−", "The score while he was on the floor"],
    ...(espn
      ? [
          ["Off", "ESPN's offensive net points: points he added on offense"],
          ["Def", "ESPN's defensive net points"],
          ["Net", "ESPN's net points, offense plus defense"],
        ]
      : []),
  ]
  const n = 3 + cols.length
  const body: HTMLElement[] = []
  let section = ""
  for (const g of games) {
    const label = typeLabel[g.type] ?? g.type
    if (label !== section) {
      section = label
      body.push(
        el("tr", { className: "section" }, el("td", { colSpan: n }, label)),
      )
    }
    const net = (v: number) =>
      el("td", { className: `num ${sign(v)}` }, signed(v))
    body.push(
      el(
        "tr",
        {},
        el(
          "td",
          { className: "date" },
          el("a", { href: `${base}scores?date=${g.date}` }, shortDate(g.date)),
        ),
        el(
          "td",
          { className: "opp" },
          `${g.home === false ? "@" : "vs"} `,
          el(
            "a",
            { href: `${base}team?team=${g.opp}`, className: "team-link" },
            g.opp,
          ),
          g.type === "cup_final" ? el("small", {}, " Cup final") : "",
        ),
        el(
          "td",
          { className: "result" },
          el("b", { className: g.win ? "" : "loss" }, g.win ? "W" : "L"),
          Number.isFinite(g.score) ? ` ${g.score}–${g.allowed}` : "",
        ),
        el("td", { className: "num" }, fixed(g.min, 0)),
        el("td", { className: "num strong" }, String(g.pts)),
        el("td", { className: "num" }, String(g.reb)),
        el("td", { className: "num" }, String(g.ast)),
        el("td", { className: "num" }, String(g.stl)),
        el("td", { className: "num" }, String(g.blk)),
        el("td", { className: "num" }, String(g.tov)),
        el("td", { className: "num" }, made(g.fgm, g.fga)),
        el("td", { className: "num" }, made(g.fg3m, g.fg3a)),
        el("td", { className: "num" }, made(g.ftm, g.fta)),
        el(
          "td",
          { className: `num ${sign(g.pm)}` },
          g.pm > 0 ? `+${g.pm}` : g.pm < 0 ? `−${-g.pm}` : "0",
        ),
        ...(espn ? [net(g.oNet), net(g.dNet), net(g.net)] : []),
      ),
    )
  }
  return el(
    "div",
    { className: "scroll" },
    el(
      "table",
      { className: "gamelog player-games" },
      el(
        "thead",
        {},
        el(
          "tr",
          { className: "cols" },
          el("th", { scope: "col", className: "date" }, "Date"),
          el("th", { scope: "col", className: "opp" }, "Opp"),
          el("th", { scope: "col", className: "result" }, "Result"),
          ...cols.map(([label, title], i) =>
            el(
              "th",
              {
                scope: "col",
                title,
                className: espn && i === cols.length - 3 ? "opens" : "",
              },
              label,
            ),
          ),
        ),
      ),
      el("tbody", {}, ...body),
    ),
  )
}

// --- the index: a search over every player

export function playerIndex(
  players: { id: string; name: string; label: string }[],
) {
  const input: HTMLInputElement = Object.assign(
    document.createElement("input"),
    { type: "search", placeholder: "A player's name", autocomplete: "off" },
  )
  input.setAttribute("aria-label", "Search players")
  const list: HTMLUListElement = document.createElement("ul")
  list.className = "player-index"
  const show = () => {
    const ts = terms(input.value)
    const hits = ts.length
      ? players.filter(p => hasAll(squash(p.name), ts)).slice(0, 40)
      : []
    list.replaceChildren(
      ...hits.map(p =>
        el("li", {}, el("a", { href: playerUrl(p.id) }, p.label)),
      ),
    )
  }
  input.addEventListener("input", show)
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") list.querySelector("a")?.click()
  })
  setTimeout(() => input.focus())
  return el("div", { className: "player-search" }, input, list)
}
