// The matchup page: the players a prediction rests on. Both teams'
// projected lineups in one table, paired by minutes, with each player's
// expected minutes and three ratings: yarapm's, EPM and net points.
// Data and plain DOM; the page is src/pages/matchup.astro. Design:
// docs/plans/2026-11-10-matchup-design.md
import { read, readWhere } from "../kit/data"
import { select } from "d3"
import { agate, bandColors, buildBareFrame, logoUrl } from "../kit/frame"
import { color, font, SITE } from "../kit/theme"
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
}

export interface Matchup {
  prediction: Prediction
  lineups: [Lineup, Lineup]
  // the day of the EPM it shows, if any
  epmAsOf?: string
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
  const [minutes, names, lastNames, epm, netPts] = await Promise.all([
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
  const epmAsOf = epm.length ? iso(epm[0].as_of_date) : undefined
  return { prediction, lineups, epmAsOf }
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

// one team's head: its name in its colors and its chance to win
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
        el(
          "span",
          { className: "tnums" },
          `${Math.round(l.team.win * 100)}% to win`,
        ),
      ),
    ),
  )
  return th
}

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
    el("tr", {}, teamHead(a, "away", 5), teamHead(h, "home", 5)),
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

  // the box between the bands, like a scoreboard's: "at" ("vs." at a
  // neutral site), the day and the time, in ink
  const boxW = 92
  const seam = 3
  const boxX = mid - boxW / 2
  g.append("rect")
    .attr("x", boxX)
    .attr("width", boxW)
    .attr("height", bandH)
    .attr("fill", color.ink)
  g.append("text")
    .attr("x", mid)
    .attr("y", 21)
    .attr("text-anchor", "middle")
    .attr("font-family", font.head)
    .attr("font-weight", 700)
    .attr("font-size", 18)
    .attr("fill", color.bg)
    .style("text-transform", "uppercase")
    .text(game.neutral ? "vs." : "at")
  ;[day, time].forEach((t, k) =>
    g
      .append("text")
      .attr("x", mid)
      .attr("y", 34 + k * 11)
      .attr("text-anchor", "middle")
      .call(agate)
      .attr("font-size", 9.5)
      .attr("letter-spacing", "0.02em")
      .attr("fill", color.bg)
      .text(t),
  )

  // each team's band: its color, the name and chance to win, the logo in a
  // newsprint box at the outside edge
  ;[a, h].forEach((l, i) => {
    const { band, text } = bandColors(l.team.abbrev)
    const x0 = i ? mid + boxW / 2 + seam : 0
    const w = mid - boxW / 2 - seam
    g.append("rect")
      .attr("x", x0)
      .attr("width", w)
      .attr("height", bandH)
      .attr("fill", band)
    // the logo box, inset so the band surrounds it on every side
    const inset = 6
    const box = bandH - inset * 2
    const bx = i ? x0 + w - inset - box : x0 + inset
    g.append("rect")
      .attr("x", bx)
      .attr("y", inset)
      .attr("width", box)
      .attr("height", box)
      .attr("fill", color.bg)
    g.append("image")
      .attr("href", logoUrl(l.team.abbrev))
      .attr("x", bx + 4)
      .attr("y", inset + 4)
      .attr("width", box - 8)
      .attr("height", box - 8)
    const tx = i ? x0 + w - inset - box - 10 : x0 + inset + box + 10
    const anchor = i ? "end" : "start"
    g.append("text")
      .attr("x", tx)
      .attr("y", 25)
      .attr("text-anchor", anchor)
      .attr("font-family", font.head)
      .attr("font-weight", 700)
      .attr("font-size", 24)
      .attr("fill", text)
      .style("text-transform", "uppercase")
      .text(l.team.name)
    g.append("text")
      .attr("x", tx)
      .attr("y", 42)
      .attr("text-anchor", anchor)
      .call(agate)
      .attr("fill", text)
      .text(`${Math.round(l.team.win * 100)}% to win`)
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
