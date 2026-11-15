// A team's page as plain DOM, and its one chart, net rating over the
// season, as SVG in the kit's frame so it exports. Data: load.ts. Design:
// https://github.com/llimllib/stepback.club/issues/40
import { line, max, min, scaleLinear, scaleUtc, select, utcMonth } from "d3"
import { agate, bandColors, buildFrame, logoUrl } from "../kit/frame"
import { gutterWidth, lineLabels } from "../kit/lines"
import { color, SITE, type } from "../kit/theme"
import type { Body } from "../kit/tool"
import { factors as factorList, ordinal } from "../scores/factors"
import type { Ranked, RosterPlayer, TeamGame, TeamPage } from "./load"

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...children)
  return e
}

const dash = "—"
// signed, one decimal: +5.1, −0.4
export const signed = (v: number) => {
  if (!Number.isFinite(v)) return dash
  const t = Math.abs(v).toFixed(1)
  if (t === "0.0") return t
  return v > 0 ? `+${t}` : `−${t}`
}
const sign = (v: number) =>
  !Number.isFinite(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "pos" : "neg"
const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const tz = "America/New_York"
// "Nov 13", from a game's date, which is already US Eastern
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })
const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })
// "vs. NYK", "at NYK", or "vs." at a neutral site
const where = (home: boolean | null) => (home === false ? "at" : "vs.")
const nickname = (name: string) =>
  name.endsWith("Trail Blazers")
    ? "Trail Blazers"
    : (name.split(" ").at(-1) ?? name)

// games back, as newspapers print it
function gamesBack(gb: number) {
  if (gb <= 0) return ""
  const whole = Math.floor(gb)
  const half = gb - whole >= 0.5 ? "½" : ""
  return `${whole || ""}${half} GB`
}

const logo = (abbrev: string, size: number) =>
  el("img", { src: logoUrl(abbrev), alt: "", width: size, height: size })

// --- the band: the team's name in its colors, its logo in a newsprint box,
// and under the name its record and place

export function teamBand(p: TeamPage) {
  const t = p.team
  const { band, text } = bandColors(t.abbrev)
  const confName = t.conf === "East" ? "East" : "West"
  const sub = [
    `${t.wins}-${t.losses}`,
    `${ordinal(t.seed)} in the ${confName}`,
    gamesBack(t.gb),
  ]
    .filter(Boolean)
    .join(" · ")
  const head = el(
    "div",
    { className: "team-band" },
    el("span", { className: "logo" }, logo(t.abbrev, 72)),
    el(
      "span",
      { className: "who" },
      el("h1", { className: "tname" }, t.name),
      el("span", { className: "tnums" }, sub),
    ),
  )
  head.style.background = band
  head.style.color = text
  return head
}

// --- now: the next game, the last one, and the last ten

export function nowStrip(p: TeamPage, base: string) {
  const cells: HTMLElement[] = []
  const cell = (label: string, ...body: (Node | string)[]) =>
    el(
      "div",
      { className: "now-cell" },
      el("h2", { className: "kicker" }, label),
      ...body,
    )

  const n = p.next
  if (n) {
    const day = n.start.toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    const time = n.start.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    })
    cells.push(
      cell(
        "Next",
        el(
          "p",
          { className: "now-big" },
          `${where(n.home)} `,
          teamLink(n.opp.abbrev, base, n.opp.abbrev),
        ),
        el(
          "p",
          { className: "now-sub" },
          `${n.kind ? `${n.kind} · ` : ""}${day} · ${time} ET`,
        ),
        ...(Number.isFinite(n.win)
          ? [
              el(
                "p",
                { className: "now-sub" },
                `yarapm: ${Math.round(n.win * 100)}% to win`,
              ),
              el(
                "a",
                { className: "more", href: `${base}matchup?game=${n.game_id}` },
                "Matchup →",
              ),
            ]
          : []),
      ),
    )
  }

  const last = p.games.at(-1)
  if (last)
    cells.push(
      cell(
        "Last",
        el(
          "p",
          { className: "now-big" },
          el(
            "span",
            { className: last.win ? "" : "loss" },
            last.win ? "W" : "L",
          ),
          ` ${last.pts}–${last.allowed} ${where(last.home)} `,
          teamLink(last.opp.abbrev, base, last.opp.abbrev),
        ),
        el("p", { className: "now-sub" }, shortDate(last.date)),
        el(
          "a",
          { className: "more", href: rotations(p, last, base) },
          "Rotations →",
        ),
      ),
    )

  const ten = p.games.slice(-10)
  if (ten.length) {
    const wins = ten.filter(g => g.win).length
    const poss = ten.reduce((s, g) => s + (g.poss || 0), 0)
    const net = poss
      ? (100 * ten.reduce((s, g) => s + (g.poss ? g.pts - g.allowed : 0), 0)) /
        poss
      : NaN
    cells.push(
      cell(
        `Last ${ten.length}`,
        el("p", { className: "now-big" }, `${wins}-${ten.length - wins}`),
        el(
          "p",
          { className: "now-sub" },
          el("span", { className: sign(net) }, signed(net)),
          " net rating",
        ),
        el(
          "p",
          { className: "streak" },
          ...ten.map(g =>
            el(
              "span",
              {
                className: g.win ? "w" : "l",
                title: `${shortDate(g.date)} ${where(g.home)} ${g.opp.abbrev}, ${g.win ? "W" : "L"} ${g.pts}–${g.allowed}`,
              },
              g.win ? "W" : "L",
            ),
          ),
        ),
      ),
    )
  }
  return el("section", { className: "now" }, ...cells)
}

const teamLink = (abbrev: string, base: string, text: string) =>
  el("a", { href: `${base}team?team=${abbrev}` }, text)

const rotations = (p: TeamPage, g: TeamGame, base: string) =>
  `${base}rotations?season=${p.season}&team=${p.team.abbrev}&game=${g.game_id}`

// --- how good: offense, defense and net by results and by the two
// models, each with its rank

const rankCell = (r: Ranked | undefined) =>
  el(
    "td",
    { className: "rank" },
    r && Number.isFinite(r.rank) ? ordinal(r.rank) : "",
  )
const valueCell = (r: Ranked | undefined) =>
  el(
    "td",
    { className: `num ${sign(r?.value ?? NaN)}` },
    signed(r?.value ?? NaN),
  )

export function howGood(p: TeamPage) {
  const sources = [
    {
      label: "Results",
      title:
        "Points per 100 possessions better than the league's average, this season's games",
      s: p.results,
    },
    {
      label: "yarapm",
      title:
        "yarapm's team rating at full strength: its players' ratings weighted by their minutes",
      s: p.yarapm,
    },
    {
      label: "EPM",
      title:
        "Dunks & Threes' team EPM: its players' EPM weighted by their expected minutes",
      s: p.epm,
    },
  ].filter(x => x.s)
  const rows = [
    { key: "off" as const, label: "Offense" },
    { key: "def" as const, label: "Defense" },
    { key: "net" as const, label: "Net" },
  ]
  const avg = p.league.rating
  const raw = (k: "off" | "def") =>
    k === "off" ? avg + p.results.off.value : avg - p.results.def.value
  return el(
    "table",
    { className: "factors how-good" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("td"),
        ...sources.map(x =>
          el("th", { scope: "colgroup", colSpan: 2, title: x.title }, x.label),
        ),
      ),
    ),
    el(
      "tbody",
      {},
      ...rows.map(r =>
        el(
          "tr",
          { className: r.key === "net" ? "total" : "" },
          el(
            "th",
            {
              scope: "row",
              title:
                r.key === "net"
                  ? "Offense plus defense"
                  : `${r.label}: ${raw(r.key).toFixed(1)} points per 100 possessions ${r.key === "off" ? "scored" : "allowed"}, against the league's ${avg.toFixed(1)}`,
            },
            r.label,
          ),
          ...sources.flatMap(x => [
            valueCell(x.s![r.key]),
            rankCell(x.s![r.key]),
          ]),
        ),
      ),
    ),
  )
}

// --- the four factors: the team's offense and its defense, each value
// with its rank among the 30 teams

export function factorsTable(p: TeamPage) {
  const f = p.factors?.teams.get(p.team.id)
  if (!f) return undefined
  const league = p.factors!.league
  const cell = (
    side: "offense" | "defense",
    key: (typeof factorList)[number],
  ) => {
    const v = f[side][key.key]
    const better =
      (side === "offense") === key.higher
        ? v > league[key.key]
        : v < league[key.key]
    return [
      el("td", { className: `num ${better ? "pos" : "neg"}` }, key.fmt(v)),
      el("td", { className: "rank" }, ordinal(f.rank[side][key.key])),
    ]
  }
  return el(
    "table",
    { className: "factors" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("td"),
        el("th", { scope: "colgroup", colSpan: 2 }, "Offense"),
        el("th", { scope: "colgroup", colSpan: 2 }, "Defense"),
        el("th", { scope: "col", className: "lg" }, "League"),
      ),
    ),
    el(
      "tbody",
      {},
      ...factorList.map(k =>
        el(
          "tr",
          {},
          el("th", { scope: "row", title: k.title }, k.label),
          ...cell("offense", k),
          ...cell("defense", k),
          el("td", { className: "lg" }, k.fmt(league[k.key])),
        ),
      ),
    ),
  )
}

// --- the roster: role (games, minutes, points, usage, true shooting),
// then value (the three ratings)

const fixed = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : dash)
const injuryLabel: Record<string, string> = {
  out: "Out",
  day_to_day: "DTD",
  suspension: "Susp.",
}

function playerName(pl: RosterPlayer) {
  const th = el("th", { scope: "row", className: "name" }, pl.name)
  if (pl.injury) {
    const returns = pl.injury.returns
      ? `, expected back ${fmtDay(pl.injury.returns)}`
      : ""
    th.append(
      " ",
      el(
        "small",
        {
          className: "injury",
          title: `ESPN: ${pl.injury.text || pl.injury.status}${returns}`,
        },
        injuryLabel[pl.injury.status] ?? pl.injury.status,
      ),
    )
  }
  if (pl.twoWay)
    th.append(" ", el("small", { title: "Two-way contract" }, "2W"))
  return th
}

export const rosterCols = [
  { label: "GP", title: "Games played for the team, this regular season" },
  { label: "Min", title: "Minutes a game" },
  { label: "Pts", title: "Points a game" },
  {
    label: "Usg%",
    title:
      "Usage: the share of the team's plays he finishes with a shot, free throws or a turnover while he's on the floor",
  },
  {
    label: "TS%",
    title:
      "True shooting: points per shot, counting free throws, as a percentage",
  },
  {
    label: "yarapm",
    title: "yarapm: points per 100 possessions better than an average player",
  },
  {
    label: "EPM",
    title:
      "Dunks & Threes' predictive EPM: points per 100 possessions better than an average player",
  },
  {
    label: "Net pts",
    title:
      "ESPN's net points per 100 possessions this season: his share of the team's margin",
  },
]

export function rosterTable(p: TeamPage) {
  const rating = (v: number) =>
    el("td", { className: `num rating ${sign(v)}` }, signed(v))
  const rows = p.roster.map(pl =>
    el(
      "tr",
      { className: pl.gp ? "" : "unplayed" },
      playerName(pl),
      el("td", { className: "num" }, pl.gp ? String(pl.gp) : dash),
      el("td", { className: "num" }, fixed(pl.mpg)),
      el("td", { className: "num" }, fixed(pl.ppg)),
      el("td", { className: "num" }, fixed(pl.usg)),
      el(
        "td",
        { className: "num" },
        Number.isFinite(pl.ts) ? (pl.ts * 100).toFixed(1) : dash,
      ),
      rating(pl.yarapm),
      rating(pl.epm),
      rating(pl.netPts),
    ),
  )
  return el(
    "div",
    { className: "scroll" },
    el(
      "table",
      { className: "roster" },
      el(
        "thead",
        {},
        el(
          "tr",
          { className: "groups" },
          el("td"),
          el("th", { scope: "colgroup", colSpan: 5 }, "Role"),
          el(
            "th",
            { scope: "colgroup", colSpan: 3, className: "value" },
            "Value",
          ),
        ),
        el(
          "tr",
          { className: "cols" },
          el("th", { scope: "col", className: "name" }, "Player"),
          ...rosterCols.map((c, i) =>
            el(
              "th",
              {
                scope: "col",
                title: c.title,
                className: i === 5 ? "value" : "",
              },
              c.label,
            ),
          ),
        ),
      ),
      el("tbody", {}, ...rows),
    ),
  )
}

// --- the game log: every game, newest first

export function gameLogTable(p: TeamPage, base: string) {
  const rows = p.games
    .toReversed()
    .map(g =>
      el(
        "tr",
        {},
        el("td", { className: "date" }, shortDate(g.date)),
        el(
          "td",
          { className: "opp" },
          `${g.home === false ? "@" : "vs"} `,
          logo(g.opp.abbrev, 18),
          " ",
          teamLink(g.opp.abbrev, base, g.opp.abbrev),
          g.kind ? el("small", {}, ` ${g.kind}`) : "",
        ),
        el(
          "td",
          { className: "result" },
          el(
            "a",
            { href: rotations(p, g, base), title: "Rotations" },
            el("b", { className: g.win ? "" : "loss" }, g.win ? "W" : "L"),
            ` ${g.pts}–${g.allowed}`,
          ),
        ),
        el("td", { className: "num" }, fixed(g.ortg)),
        el("td", { className: "num" }, fixed(g.drtg)),
        el("td", { className: `num ${sign(g.net)}` }, signed(g.net)),
        el(
          "td",
          { className: "num pre" },
          Number.isFinite(g.pre) ? `${Math.round(g.pre * 100)}%` : "",
        ),
      ),
    )
  return el(
    "div",
    { className: "scroll" },
    el(
      "table",
      { className: "gamelog" },
      el(
        "thead",
        {},
        el(
          "tr",
          { className: "cols" },
          el("th", { scope: "col", className: "date" }, "Date"),
          el("th", { scope: "col", className: "opp" }, "Opp"),
          el(
            "th",
            {
              scope: "col",
              className: "result",
              title: "Each links to the game's rotations",
            },
            "Result",
          ),
          el(
            "th",
            { scope: "col", title: "Points scored per 100 possessions" },
            "Off",
          ),
          el(
            "th",
            { scope: "col", title: "Points allowed per 100 possessions" },
            "Def",
          ),
          el("th", { scope: "col", title: "Offense minus defense" }, "Net"),
          el(
            "th",
            {
              scope: "col",
              title:
                "yarapm's chance this team would win, before tip-off. It started logging on Nov 4, 2026",
            },
            "Pre",
          ),
        ),
      ),
      el("tbody", {}, ...rows),
    ),
  )
}

// --- the chart: net rating over the season. The team's over its last 10
// games against yarapm's at full strength as of each day, with each game's
// own net rating behind them

// the rolling window, and the fewest games the line starts with
export const WINDOW = 10
const MIN_WINDOW = 5
// the orange of the kit's palette: yarapm, against the results' ink
const MODEL = "#E69F00"

interface Pt {
  date: Date
  v: number
}

const gameDate = (g: TeamGame) => new Date(`${g.date}T12:00:00Z`)

// the net rating over each game's last WINDOW games, from their totals
export function rolling(games: TeamGame[]): Pt[] {
  const played = games.filter(g => g.poss > 0)
  const out: Pt[] = []
  played.forEach((g, i) => {
    if (i + 1 < MIN_WINDOW) return
    const w = played.slice(Math.max(0, i + 1 - WINDOW), i + 1)
    const poss = w.reduce((s, x) => s + x.poss, 0)
    const margin = w.reduce((s, x) => s + x.pts - x.allowed, 0)
    out.push({ date: gameDate(g), v: (100 * margin) / poss })
  })
  return out
}

export function chartFrame(container: HTMLElement, p: TeamPage) {
  const roll = rolling(p.games)
  const model: Pt[] = p.history.map(h => ({
    date: new Date(
      Date.UTC(
        h.date.getUTCFullYear(),
        h.date.getUTCMonth(),
        h.date.getUTCDate(),
        12,
      ),
    ),
    v: h.full,
  }))
  const lastGame = p.games.at(-1)
  const through = lastGame ? `, through ${shortDate(lastGame.date)}` : ""
  return buildFrame(
    container,
    "auto",
    {
      title: `${nickname(p.team.name)} net rating`,
      context: `Points per 100 possessions better than their opponents over their last ${WINDOW} games, against yarapm's rating of their roster at full strength, ${fmtSeason(p.season)}${through}`,
      team: p.team.abbrev,
      legend: [
        { symbol: "line", color: color.ink, text: `last ${WINDOW} games` },
        { symbol: "line", color: MODEL, text: "yarapm, full strength" },
        { symbol: "dot", color: color.faint, text: "one game" },
      ],
      source: "Data: NBA.com, yarapm",
    },
    `${SITE}/team`,
    (node, size) => drawChart(node, size, p, roll, model),
  ).svg
}

function drawChart(
  node: SVGGElement,
  size: { width: number; height?: number },
  p: TeamPage,
  roll: Pt[],
  model: Pt[],
): Body {
  const g = select(node)
  const top = 22
  const bottom = 30
  const ticks = p.games
    .filter(x => x.poss > 0)
    .map(x => ({ date: gameDate(x), v: x.net }))

  // symmetric about zero, wide enough for the lines and most games; a game
  // past it sits on the edge
  const lineMax = max([...roll, ...model], d => Math.abs(d.v)) ?? 0
  const gameMax = max(ticks, d => Math.abs(d.v)) ?? 0
  const lim = Math.min(30, Math.max(10, lineMax * 1.15, Math.min(gameMax, 30)))
  const y = scaleLinear().domain([-lim, lim]).nice(6)
  const [lo, hi] = y.domain()

  const measure = g.append("text")
  const width = (t: string, fontSize: number, weight: number) =>
    measure
      .attr("font-size", fontSize)
      .attr("font-weight", weight)
      .text(t)
      .node()!
      .getComputedTextLength()
  const ticksY = y.ticks(6)
  const left =
    (max(ticksY, t =>
      width(signed(t).replace(".0", ""), type.tick.size, type.tick.weight),
    ) ?? 20) + 10
  const ends = [
    roll.length && {
      name: `Last ${WINDOW}`,
      sub: signed(roll.at(-1)!.v),
      color: color.ink,
      dashed: false,
      pt: roll.at(-1)!,
    },
    model.length && {
      name: "yarapm",
      sub: signed(model.at(-1)!.v),
      color: MODEL,
      dashed: false,
      pt: model.at(-1)!,
    },
  ].filter(Boolean) as {
    name: string
    sub: string
    color: string
    dashed: boolean
    pt: Pt
  }[]
  const gutter = gutterWidth(ends, width)
  measure.remove()

  const plotW = size.width - left - gutter
  const height = size.height ?? Math.round(plotW * 0.55) + top + bottom
  const plotH = height - top - bottom
  const dates = [...ticks, ...model].map(d => d.date)
  const first = min(dates) ?? new Date()
  const last = max(dates) ?? new Date()
  const x = scaleUtc()
    .domain([first, +last === +first ? new Date(+first + 86_400_000) : last])
    .range([0, plotW])
  y.range([plotH, 0])
  const plot = g.append("g").attr("transform", `translate(${left},${top})`)

  const grid = plot.append("g").attr("stroke", color.grid)
  const axis = plot
    .append("g")
    .attr("font-size", type.tick.size)
    .attr("font-weight", type.tick.weight)
    .attr("fill", color.muted)
  let prev = -Infinity
  for (const t of x.ticks(6)) {
    const at = x(t)
    if (at - prev < 48) continue
    prev = at
    grid.append("line").attr("x1", at).attr("x2", at).attr("y2", plotH)
    axis
      .append("text")
      .attr("x", at)
      .attr("y", plotH + 20)
      .attr("text-anchor", "middle")
      .text(
        +utcMonth.floor(t) === +t
          ? t.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
          : fmtDay(t),
      )
  }
  for (const t of ticksY)
    if (t !== 0)
      grid.append("line").attr("y1", y(t)).attr("y2", y(t)).attr("x2", plotW)
  for (const t of ticksY)
    axis
      .append("text")
      .attr("x", -8)
      .attr("y", y(t) + 4.5)
      .attr("text-anchor", "end")
      .text(t === 0 ? "0" : signed(t).replace(".0", ""))
  plot
    .append("text")
    .attr("x", -left)
    .attr("y", -10)
    .call(agate)
    .text("↑ Net rating, points per 100 possessions")

  // each game, faint, behind the lines; past the axis, on its edge
  for (const t of ticks) {
    const out = t.v > hi || t.v < lo
    plot
      .append("circle")
      .attr("cx", x(t.date))
      .attr("cy", y(Math.max(lo, Math.min(hi, t.v))))
      .attr("r", 2.75)
      .attr("fill", out ? "none" : color.faint)
      .attr("stroke", out ? color.faint : "none")
      .attr("stroke-width", 1.25)
      .append("title")
      .text(signed(t.v))
  }

  // zero, the strongest line, over the games
  plot
    .append("line")
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("x2", plotW)
    .attr("stroke", color.zero)
    .attr("stroke-width", 1.5)

  const path = line<Pt>()
    .x(d => x(d.date))
    .y(d => y(d.v))
  // the model under the results
  if (model.length > 1)
    plot
      .append("path")
      .attr("d", path(model))
      .attr("fill", "none")
      .attr("stroke", MODEL)
      .attr("stroke-width", 2.5)
      .attr("stroke-linejoin", "round")
  if (roll.length > 1)
    plot
      .append("path")
      .attr("d", path(roll))
      .attr("fill", "none")
      .attr("stroke", color.ink)
      .attr("stroke-width", 2.5)
      .attr("stroke-linejoin", "round")

  lineLabels(
    plot,
    ends.map(e => ({ ...e, x: x(e.pt.date), y: y(e.pt.v) })),
    plotW,
    plotH,
  )

  return {
    height,
    marks: [],
    invert: () => undefined,
    project: () => undefined,
  }
}

// --- the index: every team, by conference, for /team with no team

export function teamIndex(
  teams: {
    nba_abbrev: string
    full_name: string
    conference: string
    division: string
  }[],
  base: string,
) {
  const confs = ["East", "West"]
  return el(
    "div",
    { className: "team-index" },
    ...confs.map(c =>
      el(
        "section",
        {},
        el(
          "h2",
          { className: "kicker section-head" },
          c === "East" ? "Eastern Conference" : "Western Conference",
        ),
        el(
          "ul",
          {},
          ...teams
            .filter(t => t.conference === c)
            .sort((a, b) => a.full_name.localeCompare(b.full_name))
            .map(t =>
              el(
                "li",
                {},
                el(
                  "a",
                  { href: `${base}team?team=${t.nba_abbrev}` },
                  logo(t.nba_abbrev, 28),
                  t.full_name,
                ),
              ),
            ),
        ),
      ),
    ),
  )
}
