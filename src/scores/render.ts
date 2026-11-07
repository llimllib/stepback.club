// The scores page's game blocks: a score line, the four factors for both
// teams, and the net points line saying how the winner won; or, for a game
// not played yet, yarapm's prediction. Plain DOM; the data is load.ts's and
// predict.ts's
import { logoUrl } from "../kit/frame"
import {
  roundToSum,
  sides,
  type Factors,
  type Game,
  type TeamLine,
} from "./load"
import type { Logged, PredictedTeam, Prediction } from "./predict"

const pct = (v: number) => (v * 100).toFixed(1)
// a rate under 1, as box scores print it: .17
const rate = (v: number) => v.toFixed(2).replace(/^0/, "")
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0")

// The four factors, and which way is better
const columns: {
  head: string
  title: string
  key: keyof TeamLine
  fmt: (v: number) => string
  higher: boolean
}[] = [
  {
    head: "eFG%",
    title: "Effective field goal percentage",
    key: "efg",
    fmt: pct,
    higher: true,
  },
  {
    head: "TOV%",
    title: "Turnovers per 100 possessions",
    key: "tov",
    fmt: pct,
    higher: false,
  },
  {
    head: "OREB%",
    title: "Offensive rebound percentage",
    key: "oreb",
    fmt: pct,
    higher: true,
  },
  {
    head: "FTR",
    title: "Free throw rate: free throws made per shot",
    key: "ftr",
    fmt: rate,
    higher: true,
  },
]

const factorNames: [keyof Factors, string][] = [
  ["shooting", "Shoot"],
  ["turnovers", "TOV"],
  ["rebounding", "Reb"],
  ["freethrows", "FT"],
]

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...children)
  return e
}

// A team's logo, beside its abbreviation in the headline, so it's decoration: no alt text.
// Teams ESPN has no logo for (international preseason opponents) go without
function logo(t: { abbrev: string }) {
  const img = el("img", {
    className: "logo",
    src: logoUrl(t.abbrev),
    alt: "",
    loading: "lazy",
  })
  img.addEventListener("error", () => img.remove())
  return img
}

export function gameBlock(g: Game, base: string) {
  const [a, h] = g.teams
  const w = sides(g)[0]
  // the winner's bold, the loser's muted
  const score = (t: TeamLine) =>
    el(
      t === w ? "b" : "span",
      {},
      el("abbr", { title: t.name }, logo(t), `${t.abbrev} ${t.pts}`),
    )

  const head = el(
    "tr",
    {},
    el("th", {}),
    ...columns.map(c => el("th", { scope: "col", title: c.title }, c.head)),
  )
  const row = (t: TeamLine, o: TeamLine) =>
    el(
      "tr",
      {},
      el(
        "th",
        { scope: "row" },
        el("abbr", { title: t.name }, t.abbrev),
        " ",
        el("span", { className: "record" }, `${t.wins}-${t.losses}`),
      ),
      ...columns.map(c => {
        const [v, ov] = [t[c.key] as number, o[c.key] as number]
        // the better of the two is bold, so it reads without color. Compare
        // what's printed, so a tie in print isn't bold on one side
        const [p, op] = [c.fmt(v), c.fmt(ov)]
        const better = p !== op && (c.higher ? v > ov : v < ov)
        return el("td", {}, better ? el("b", {}, p) : p)
      }),
    )

  const rotations = `${base}rotations?season=${g.season}&team=${w.abbrev}&game=${g.game_id}`
  return el(
    "article",
    { className: "game" },
    el(
      "p",
      { className: "status" },
      [g.status, g.kind].filter(Boolean).join(" · "),
    ),
    el("h2", { className: "score" }, score(a), score(h)),
    el(
      "table",
      { className: "box" },
      el("thead", {}, head),
      el("tbody", {}, row(a, h), row(h, a)),
    ),
    el("p", { className: "why" }, "Net points…"),
    el("a", { className: "more", href: rotations }, "Rotations →"),
  )
}

// How the winner won, from ESPN: each factor's net points over the loser's,
// the biggest underlined. Without
// ESPN's numbers, say they're not in yet
export function setFactors(block: Element, g: Game, f: Factors | undefined) {
  const why = block.querySelector(".why")!
  if (!f) {
    why.replaceChildren("Net points not in yet")
    why.classList.add("missing")
    return
  }
  const values = roundToSum(factorNames.map(([k]) => f[k]))
  const top = values.indexOf(Math.max(...values))
  const w = sides(g)[0]
  why.classList.remove("missing")
  why.replaceChildren(
    // whose side it's from: the winner isn't always listed first
    `${w.abbrev}: `,
    ...factorNames.flatMap(([, name], i) => {
      const text = `${name} ${signed(values[i])}`
      return [i ? " · " : "", i === top ? el("u", {}, text) : text]
    }),
  )
}

// What yarapm predicted for a played game, under how the winner won:
// "Predicted DEN by 10 · 77% · Right"
export function setLogged(block: Element, l: Logged | undefined) {
  if (!l) return
  const by = l.margin < 1 ? l.margin.toFixed(1) : Math.round(l.margin)
  block
    .querySelector(".why")!
    .after(
      el(
        "p",
        { className: "logged" },
        `Predicted ${l.abbrev} by ${by} · ${Math.round(l.win * 100)}% · `,
        l.right ? el("b", {}, "Right") : "Wrong",
      ),
    )
}

const startTime = (d: Date) =>
  `${d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  })} ET`

// a rating, signed: +5.8, −4.2
const rating = (v: number) =>
  isNaN(v)
    ? ""
    : v > 0.05
      ? `+${v.toFixed(1)}`
      : v < -0.05
        ? `−${(-v).toFixed(1)}`
        : "0.0"

const predictedColumns: {
  head: string
  title: string
  value: (t: PredictedTeam) => number
  fmt: (v: number) => string
}[] = [
  {
    head: "Win",
    title: "Chance to win",
    value: t => t.win,
    fmt: v => `${Math.round(v * 100)}%`,
  },
  {
    head: "Today",
    title:
      "Net rating with the expected lineup: points per 100 possessions better than an average team",
    value: t => t.net,
    fmt: rating,
  },
  {
    head: "Full",
    title: "Net rating at full strength, with everyone available",
    value: t => t.full,
    fmt: rating,
  },
]

// A game not played yet: yarapm's expected score, each team's chance to win
// and ratings, and who each is likely without
export function predictionBlock(p: Prediction) {
  const [a, h] = p.teams
  const fav = a.win > h.win ? a : h
  // whole points, unless they'd round to a tie
  const digits = Math.round(a.pts) === Math.round(h.pts) ? 1 : 0
  const score = (t: PredictedTeam) =>
    el(
      t === fav ? "b" : "span",
      {},
      el(
        "abbr",
        { title: t.name },
        logo(t),
        `${t.abbrev} ${t.pts.toFixed(digits)}`,
      ),
    )

  const head = el(
    "tr",
    {},
    el("th", {}),
    ...predictedColumns.map(c =>
      el("th", { scope: "col", title: c.title }, c.head),
    ),
  )
  const row = (t: PredictedTeam, o: PredictedTeam) =>
    el(
      "tr",
      {},
      el(
        "th",
        { scope: "row" },
        el("abbr", { title: t.name }, t.abbrev),
        " ",
        el("span", { className: "record" }, `${t.wins}-${t.losses}`),
      ),
      ...predictedColumns.map(c => {
        const [v, ov] = [c.value(t), c.value(o)]
        const [s, os] = [c.fmt(v), c.fmt(ov)]
        return el("td", {}, s !== os && v > ov ? el("b", {}, s) : s)
      }),
    )

  // who each team is likely without, and their chances to play: "IND:
  // Haliburton 16% · Oubre 33% to play"
  const out = p.teams.filter(t => t.missing.length)
  const without = el(
    "p",
    { className: "why" },
    ...(out.length
      ? out.flatMap((t, i) => [
          i ? el("br") : "",
          `${t.abbrev}: `,
          t.missing
            .map(m => `${m.name} ${Math.round(m.play * 100)}%`)
            .join(" · "),
          " to play",
        ])
      : ["Both at full strength"]),
  )

  return el(
    "article",
    { className: "game predicted" },
    el(
      "p",
      { className: "status" },
      [
        startTime(p.start),
        "Prediction",
        p.kind,
        p.neutral ? "Neutral site" : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ),
    el("h2", { className: "score" }, score(a), score(h)),
    el(
      "table",
      { className: "box" },
      el("thead", {}, head),
      el("tbody", {}, row(a, h), row(h, a)),
    ),
    without,
  )
}
