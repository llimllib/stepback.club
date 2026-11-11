// The matchup page: the players a prediction rests on. Both teams'
// projected lineups in one table, paired by minutes, with each player's
// expected minutes and three ratings: yarapm's, EPM and net points.
// Data and plain DOM; the page is src/pages/matchup.astro. Design:
// docs/plans/2026-11-10-matchup-design.md
import { read, readWhere } from "../kit/data"
import { select } from "d3"
import {
  agate,
  bandColors,
  buildBareFrame,
  versusBands,
  logoUrl,
  type VersusSide,
} from "../kit/frame"
import { color, font, SITE } from "../kit/theme"
import {
  factors as factorList,
  ordinal,
  seasonFactors,
  type Factors,
  type Side,
} from "./factors"
import { iso } from "./load"
import {
  predictionFor,
  seasonOfGame,
  type PredictedTeam,
  type Prediction,
} from "./predict"

// The three ratings, each in points per 100 possessions, positive is good:
// yarapm's (this site's model), dunksandthrees' predictive EPM, and ESPN's
// net points per 100 possessions this season
export interface Ratings {
  yarapm: number
  epm: number
  netPts: number
}
export type Model = keyof Ratings

export const models: { key: Model; label: string; title: string }[] = [
  {
    key: "yarapm",
    label: "yarapm",
    title:
      "This site's rating: points per 100 possessions better than an average player",
  },
  {
    key: "epm",
    label: "EPM",
    title:
      "dunksandthrees' predictive EPM: points per 100 possessions better than an average player",
  },
  {
    key: "netPts",
    label: "Net pts",
    title:
      "ESPN's net points per 100 possessions this season: his share of his team's margin",
  },
]

export interface LineupPlayer {
  name: string
  // expected minutes, counting the chance he doesn't play
  min: number
  play: number
  ratings: Ratings
}

export interface Lineup {
  team: PredictedTeam
  players: LineupPlayer[]
  // the team's net rating by each model: its players' ratings weighted by
  // expected minutes, five on the floor. yarapm's is yarapm's own, so it
  // matches the prediction whatever the rounding
  net: Ratings
  // yarapm's expected points, as shown: whole points, or one decimal when
  // both teams' round to the same (113.0, 112.7)
  expected: string
}

export interface Matchup {
  prediction: Prediction
  lineups: [Lineup, Lineup]
  // the day of the EPM it shows, if any
  epmAsOf?: string
  // every team's four factors this season, if the logs could be read
  factors?: Factors
}

// Net points per 100 is noise on a few games' possessions (Rupert, +45 on
// 6): under this many team possessions on the court, offense and defense
// together, a player has none
export const NET_PTS_MIN_POSS = 200

// A game's matchup: undefined if yarapm doesn't predict it
export async function matchup(game_id: string): Promise<Matchup | undefined> {
  const prediction = await predictionFor(game_id)
  if (!prediction) return undefined
  const season = seasonOfGame(game_id)
  // a player on a roster may not have played this season yet, so last
  // season's names fill in. EPM and net points are other sources, so a
  // missing file leaves their columns blank rather than failing the page
  const [minutes, names, lastNames, epm, netPts, factors] = await Promise.all([
    read("yarapm", "minutes", season, [
      "game_id",
      "team_id",
      "player_id",
      "min",
      "play_prob",
    ]),
    read("stats", "player_seasons", season, ["player_id", "name"]),
    read("stats", "player_seasons", season - 1, ["player_id", "name"]).catch(
      () => [],
    ),
    read("dunksandthrees", "epm_predictive", season, [
      "player_id",
      "as_of_date",
      "epm",
    ]).catch(() => []),
    read("espn", "net_pts_season", season, [
      "player_id",
      "season_type",
      "o_net_pts",
      "d_net_pts",
      "o_team_poss",
      "d_team_poss",
    ]).catch(() => []),
    seasonFactors(season).catch(() => undefined),
  ])
  const rows = minutes.filter(r => r.game_id === game_id && r.min > 0)
  // the build's day's ratings: the file is sorted by player, so only these
  // players' row groups are read
  const ratings = await readWhere(
    "yarapm",
    "ratings_daily",
    season,
    ["player_id", "as_of_date", "o_rating", "d_rating"],
    { player_id: { $in: rows.map(r => r.player_id) } },
  )
  const rating = new Map(
    ratings
      .filter(r => iso(r.as_of_date) === prediction.asOf)
      .map(r => [r.player_id, r.o_rating + r.d_rating]),
  )
  const epmOf = new Map(epm.map(r => [r.player_id, r.epm as number]))
  // per 100 as ESPN computes it: offense and defense each per 100 of their
  // possessions, added
  const netPtsOf = new Map(
    netPts
      .filter(
        r =>
          r.season_type === "regular_season" &&
          r.o_team_poss + r.d_team_poss >= NET_PTS_MIN_POSS,
      )
      .map(r => [
        r.player_id,
        (r.o_net_pts / r.o_team_poss + r.d_net_pts / r.d_team_poss) * 100,
      ]),
  )
  const name = new Map(
    [...lastNames, ...names].map(p => [p.player_id, p.name as string]),
  )

  const lineup = (team: PredictedTeam): Lineup => {
    const players = rows
      .filter(r => r.team_id === team.team_id)
      .map(r => ({
        name: name.get(r.player_id) ?? r.player_id,
        min: r.min,
        play: r.play_prob,
        ratings: {
          yarapm: rating.get(r.player_id) ?? NaN,
          epm: epmOf.get(r.player_id) ?? NaN,
          netPts: netPtsOf.get(r.player_id) ?? NaN,
        },
      }))
      .sort((a, b) => b.min - a.min)
    // a player without a rating counts as average
    const net = (k: Model) =>
      players.reduce(
        (t, p) => t + (isNaN(p.ratings[k]) ? 0 : (p.min * p.ratings[k]) / 48),
        0,
      )
    // a model with no ratings at all has no net either
    const any = (k: Model) => players.some(p => !isNaN(p.ratings[k]))
    return {
      team,
      players,
      expected: "",
      net: {
        yarapm: team.net,
        epm: any("epm") ? net("epm") : NaN,
        netPts: any("netPts") ? net("netPts") : NaN,
      },
    }
  }
  const lineups: [Lineup, Lineup] = [
    lineup(prediction.teams[0]),
    lineup(prediction.teams[1]),
  ]
  const [pa, ph] = prediction.teams.map(t => t.pts)
  const digits = Math.round(pa) === Math.round(ph) ? 1 : 0
  lineups[0].expected = pa.toFixed(digits)
  lineups[1].expected = ph.toFixed(digits)
  const epmAsOf = epm.length ? iso(epm[0].as_of_date) : undefined
  return { prediction, lineups, epmAsOf, factors }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...children)
  return e
}

// signed, one decimal: +5.1, −0.4
export const signed = (v: number) =>
  isNaN(v)
    ? ""
    : Math.abs(v) < 0.05
      ? "0.0"
      : v > 0
        ? `+${v.toFixed(1)}`
        : `−${(-v).toFixed(1)}`

// whole minutes, but not 0 for a player who might get in
const minutes = (v: number) => (v < 0.5 ? "<1" : v.toFixed(0))

// starters, by minutes: a rule under them
const STARTERS = 5
// a chance to play under this is shown beside the name
const DOUBTFUL = 0.8

// "Boston Celtics" → "Celtics", "Portland Trail Blazers" → "Trail Blazers"
export const nickname = (name: string) =>
  name.endsWith("Trail Blazers")
    ? "Trail Blazers"
    : (name.split(" ").at(-1) ?? name)

// a rating's cell: signed, in blue or red, so its sign reads in grayscale
// and its color at a glance
function num(v: number, className = "") {
  const sign = isNaN(v) || Math.abs(v) < 0.05 ? "" : v > 0 ? "pos" : "neg"
  return el(
    "td",
    { className: ["num", sign, className].filter(Boolean).join(" ") },
    isNaN(v) ? "—" : signed(v),
  )
}

// a player's name, with his chance to play beside it when it's in doubt
function nameCell(p: LineupPlayer | undefined) {
  const th = el("th", { scope: "row", className: "name" })
  if (!p) return th
  th.append(p.name)
  if (p.play < DOUBTFUL)
    th.append(
      " ",
      el("small", { title: "Chance he plays" }, `${Math.round(p.play * 100)}%`),
    )
  return th
}

// a band's subhead: the team's record going in, its chance to win and
// yarapm's expected points
const subhead = (l: Lineup) =>
  `${l.team.wins}-${l.team.losses} · ${Math.round(l.team.win * 100)}% to win · expected ${l.expected}`

// one team's head: its name in its colors, and under it its record, its
// chance to win and yarapm's expected points
function teamHead(l: Lineup, side: "away" | "home", colSpan: number) {
  const { band, text } = bandColors(l.team.abbrev)
  const th = el("th", { scope: "colgroup", colSpan, className: `team ${side}` })
  th.style.background = band
  th.style.color = text
  th.append(
    el(
      "div",
      { className: "band" },
      el(
        "span",
        { className: "logo" },
        el("img", {
          src: logoUrl(l.team.abbrev),
          alt: "",
          width: 40,
          height: 40,
        }),
      ),
      el(
        "span",
        { className: "who" },
        el("span", { className: "tname full" }, l.team.name),
        el("span", { className: "tname short" }, nickname(l.team.name)),
        el("span", { className: "tnums" }, subhead(l)),
      ),
    ),
  )
  return th
}

// The box between the teams, like a scoreboard's: "at" ("vs." at a neutral
// site), the day and the time, in ink. The export draws the same
function atBox(p: Prediction) {
  const { day, time } = gameTime(p)
  return [
    el("span", { className: "at-word" }, p.neutral ? "vs." : "at"),
    el("span", { className: "at-when" }, day),
    el("span", { className: "at-when" }, time),
  ]
}

// in the mirrored table, the head's middle cell, over the middle rule
const atCell = (p: Prediction) =>
  el("th", { scope: "col", colSpan: 2, className: "at" }, ...atBox(p))

// between a phone's two tables
export const atBar = (p: Prediction) =>
  el("div", { className: "at at-bar" }, ...atBox(p))

const minTitle = "Expected minutes, counting the chance he doesn't play"

// a side's column heads, in the same order on both sides
const sideHeads = (mid = false) =>
  models.map((m, i) =>
    el(
      "th",
      { scope: "col", title: m.title, className: mid && !i ? "mid" : "" },
      m.label,
    ),
  )

const minHead = () =>
  el("th", { scope: "col", title: minTitle, className: "min" }, "Min")

const netTitle =
  "The team's net rating by each model: its players' ratings weighted by expected minutes, five on the floor"

// a team's net rating by each model
const nets = (l: Lineup, mid = false) =>
  models.map((x, i) => num(l.net[x.key], mid && !i ? "mid" : ""))

// the first bench player's row: a small gap above it sets the starters off
const benched = (i: number) => (i === STARTERS ? "bench" : "")

// Both lineups in one table, the away team left and the home team right,
// mirrored around the middle, each row a pair of players at the same place
// in their rotations: the most minutes against the most minutes. Each side
// is name, minutes and the three ratings; the last row is each team's net
// rating by the three
export function matchupTable(m: Matchup) {
  const [a, h] = m.lineups
  const head = el(
    "thead",
    {},
    el(
      "tr",
      {},
      teamHead(a, "away", 4),
      atCell(m.prediction),
      teamHead(h, "home", 4),
    ),
    el(
      "tr",
      { className: "cols" },
      el("td"),
      minHead(),
      ...sideHeads(),
      ...sideHeads(true),
      minHead(),
      el("td"),
    ),
  )
  const teamRow = el(
    "tr",
    { className: "net", title: netTitle },
    el("th", { scope: "row", className: "name" }, "Team"),
    el("td", { className: "min" }),
    ...nets(a),
    ...nets(h, true),
    el("td", { className: "min" }),
    el("th", { scope: "row", className: "name" }, "Team"),
  )

  const ratings = (p: LineupPlayer | undefined, mid = false) =>
    models.map((x, i) =>
      p
        ? num(p.ratings[x.key], mid && !i ? "mid" : "")
        : el("td", { className: mid && !i ? "num mid" : "num" }),
    )
  const row = (
    pa: LineupPlayer | undefined,
    ph: LineupPlayer | undefined,
    className: string,
  ) =>
    el(
      "tr",
      { className },
      nameCell(pa),
      el("td", { className: "min" }, pa ? minutes(pa.min) : ""),
      ...ratings(pa),
      ...ratings(ph, true),
      el("td", { className: "min" }, ph ? minutes(ph.min) : ""),
      nameCell(ph),
    )
  const n = Math.max(a.players.length, h.players.length)
  const rows: HTMLElement[] = []
  for (let i = 0; i < n; i++)
    rows.push(row(a.players[i], h.players[i], benched(i)))

  // fixed widths, so the two names take the same room whatever they are
  const cols = [
    "name",
    "min",
    "num",
    "num",
    "num",
    "num",
    "num",
    "num",
    "min",
    "name",
  ]
  return el(
    "table",
    { className: "versus" },
    el("colgroup", {}, ...cols.map(c => el("col", { className: c }))),
    head,
    el("tbody", {}, ...rows),
    el("tfoot", {}, teamRow),
  )
}

// One team's lineup alone, for a phone, where both sides don't fit: the
// away team's table, then the home team's
export function teamTable(l: Lineup, side: "away" | "home") {
  const rows = l.players.map((p, i) =>
    el(
      "tr",
      { className: benched(i) },
      nameCell(p),
      el("td", { className: "min" }, minutes(p.min)),
      ...models.map(x => num(p.ratings[x.key])),
    ),
  )
  const teamRow = el(
    "tr",
    { className: "net", title: netTitle },
    el("th", { scope: "row", className: "name" }, "Team"),
    el("td", { className: "min" }),
    ...models.map(x => num(l.net[x.key])),
  )
  return el(
    "table",
    { className: "lineup" },
    el(
      "colgroup",
      {},
      ...["name", "min", "num", "num", "num"].map(c =>
        el("col", { className: c }),
      ),
    ),
    el(
      "thead",
      {},
      el("tr", {}, teamHead(l, side, 5)),
      el("tr", { className: "cols" }, el("td"), minHead(), ...sideHeads()),
    ),
    el("tbody", {}, ...rows),
    el("tfoot", {}, teamRow),
  )
}

// --- the export: the same table drawn as SVG in the kit's frame, which is
// what a PNG is made from

// The table alone, under its own team bands, and the footer: no band or
// legend strip, which would repeat the bands. The date the ratings are from
// leads the footer, since they change every day
export function matchupFrame(container: HTMLElement, m: Matchup) {
  const asOf = new Date(`${m.prediction.asOf}T12:00:00Z`).toLocaleDateString(
    "en-US",
    { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" },
  )
  return buildBareFrame(
    container,
    `As of ${asOf} · Data: yarapm · dunksandthrees · ESPN Analytics`,
    `${SITE}/matchup`,
    (g, width) => drawVersus(g, m, width),
  )
}

// the game's start, in US Eastern: "Tue, Nov 10" and "8:00 PM ET"
function gameTime(p: Prediction) {
  const tz = "America/New_York"
  return {
    day: p.start.toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    time: `${p.start.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    })} ET`,
  }
}

const valueColor = (v: number) =>
  isNaN(v) || Math.abs(v) < 0.05 ? color.ink : v > 0 ? color.pos : color.neg

// The mirrored table in SVG: each team's band, the column heads, a row per
// pair of players, with a gap before the bench, and each team's net ratings
function drawVersus(node: SVGGElement, m: Matchup, width: number) {
  const g = select(node)
  const game = m.prediction
  const { day, time } = gameTime(game)
  const [a, h] = m.lineups
  const mid = width / 2
  const gap = 8
  // wide enough for "NET PTS" in tracked agate
  const numW = 54
  const minW = 28
  const bandH = 52
  const headH = 22
  const rowH = 22
  const nameSize = 14

  // the right edge of each column a value is right-aligned to, left to right
  // on each side, in the same order: minutes, then the ratings
  const left = mid - gap - numW * 3
  const cols = (i: number) => {
    const start = i ? mid + gap : left - minW
    return i
      ? {
          ratings: models.map((_, k) => start + numW * (k + 1) - 4),
          min: start + numW * 3 + minW - 4,
        }
      : {
          min: start + minW - 4,
          ratings: models.map((_, k) => left + numW * (k + 1) - 4),
        }
  }

  // each team's band, with the box between them like a scoreboard's: "at"
  // ("vs." at a neutral site), the day and the time
  versusBands(node, width, bandH, {
    sides: [a, h].map(l => ({
      abbrev: l.team.abbrev,
      name: l.team.name,
      sub: subhead(l),
    })) as [VersusSide, VersusSide],
    word: game.neutral ? "vs." : "at",
    lines: [day, time],
  })

  // column heads
  const headY = bandH + 15
  const head = (x: number, t: string) =>
    g
      .append("text")
      .attr("x", x)
      .attr("y", headY)
      .attr("text-anchor", "end")
      .call(agate)
      .attr("font-size", 10)
      .text(t)
  ;[0, 1].forEach(i => {
    const c = cols(i)
    head(c.min, "Min")
    models.forEach((x, k) => head(c.ratings[k], x.label))
  })
  const top = bandH + headH
  const rule = (y: number) =>
    g
      .append("line")
      .attr("x2", width)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", color.ink)
  rule(top)

  // a value, right-aligned, in its color
  const value = (x: number, y: number, v: number, weight = 400) =>
    g
      .append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "end")
      .attr("font-family", font.agate)
      .attr("font-size", 12)
      .attr("font-weight", weight)
      .attr("fill", isNaN(v) ? color.muted : valueColor(v))
      .text(isNaN(v) ? "—" : signed(v))

  const n = Math.max(a.players.length, h.players.length)
  // a gap sets the starters off from the bench
  const benchGap = 8
  const yOf = (i: number) => top + 4 + i * rowH + (i >= STARTERS ? benchGap : 0)
  const playersBottom = yOf(n)
  rule(playersBottom)

  // each team's net rating by the three, under the players
  const netY = playersBottom + rowH / 2 + 9
  ;[a, h].forEach((l, i) => {
    const c = cols(i)
    g.append("text")
      .attr("x", i ? width : 0)
      .attr("y", netY)
      .attr("text-anchor", i ? "end" : "start")
      .attr("font-family", font.head)
      .attr("font-weight", 700)
      .attr("font-size", nameSize)
      .style("text-transform", "uppercase")
      .text("Team")
    models.forEach((x, k) => value(c.ratings[k], netY, l.net[x.key], 700))
  })
  const bottom = playersBottom + rowH + 8

  // the middle rule
  g.append("line")
    .attr("x1", mid)
    .attr("x2", mid)
    .attr("y1", top)
    .attr("y2", bottom)
    .attr("stroke", color.ink)

  const side = (l: Lineup, i: number) => {
    const c = cols(i)
    l.players.forEach((p, k) => {
      const base = yOf(k) + rowH / 2 + 5
      models.forEach((x, j) => value(c.ratings[j], base, p.ratings[x.key]))
      g.append("text")
        .attr("x", c.min)
        .attr("y", base)
        .attr("text-anchor", "end")
        .attr("font-family", font.agate)
        .attr("font-size", 12)
        .attr("fill", color.muted)
        .text(minutes(p.min))
      // the name at the outside edge, with a chance to play in doubt
      const name = g
        .append("text")
        .attr("x", i ? width : 0)
        .attr("y", base)
        .attr("text-anchor", i ? "end" : "start")
        .attr("font-family", font.head)
        .attr("font-weight", 600)
        .attr("font-size", nameSize)
      const doubt = p.play < DOUBTFUL ? `${Math.round(p.play * 100)}%` : ""
      const pct = () =>
        name
          .append("tspan")
          .attr("font-family", font.agate)
          .attr("font-weight", 400)
          .attr("font-size", 10)
          .attr("fill", color.muted)
          .text(doubt)
      // the home side reads right to left, so its chance goes before the
      // name, nearer the middle
      if (doubt && i) {
        pct()
        name.append("tspan").text(` ${p.name}`)
      } else {
        name.append("tspan").text(p.name)
        if (doubt) {
          name.append("tspan").text(" ")
          pct()
        }
      }
    })
  }
  side(a, 0)
  side(h, 1)

  return { height: bottom + 4 }
}

// --- the four factors, by possession: one team's offense against the
// other's defense, each value with its rank among the 30 teams

// one possession's table: "When the Celtics have the ball", the offense's
// values and ranks, then the defense's
function possessionTable(
  off: Lineup,
  def: Lineup,
  f: Factors,
): HTMLElement | undefined {
  const o = f.teams.get(off.team.team_id)
  const d = f.teams.get(def.team.team_id)
  if (!o || !d) return undefined
  const cell = (
    side: "offense" | "defense",
    s: Side,
    rank: Side,
    key: (typeof factorList)[number],
  ) => {
    const v = s[key.key]
    const avg = f.league[key.key]
    // better than the league on this side of the ball: blue; worse: red
    const better = (side === "offense") === key.higher ? v > avg : v < avg
    return [
      el("td", { className: `num ${better ? "pos" : "neg"}` }, key.fmt(v)),
      el("td", { className: "rank" }, ordinal(rank[key.key])),
    ]
  }
  return el(
    "table",
    { className: "factors" },
    el(
      "caption",
      {},
      `When the ${nickname(off.team.name)} ${off.team.name.endsWith("s") ? "have" : "has"} the ball`,
    ),
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("td"),
        el(
          "th",
          { scope: "colgroup", colSpan: 2 },
          `${nickname(off.team.name)} offense`,
        ),
        el(
          "th",
          { scope: "colgroup", colSpan: 2 },
          `${nickname(def.team.name)} defense`,
        ),
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
          ...cell("offense", o.offense, o.rank.offense, k),
          ...cell("defense", d.defense, d.rank.defense, k),
        ),
      ),
    ),
  )
}

// Both possessions side by side, under a heading. Nothing if the logs couldn't be read or a team hasn't played
export function factorsSection(m: Matchup): HTMLElement[] {
  const f = m.factors
  if (!f) return []
  const [a, h] = m.lineups
  const tables = [possessionTable(a, h, f), possessionTable(h, a, f)]
  if (tables.some(t => !t)) return []
  return [
    el("h2", { className: "kicker section-head" }, "Four factors"),
    el("div", { className: "possessions" }, ...(tables as HTMLElement[])),
  ]
}
