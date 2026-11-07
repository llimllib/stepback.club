// Cumulative stats: the running total of one stat, game by game, for a few
// players. A season and a career are the same chart over a different span of
// seasons. See docs/plans/2026-10-25-cumulative-design.md
import { format, line, max, precisionFixed, scaleLinear, select, sum } from "d3"
import { metadata, read } from "../kit/data"
import { agate } from "../kit/frame"
import { gutterWidth, lineLabels, lineStyle } from "../kit/lines"
import { color, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"

// 0 is the latest season the data has; load resolves them. Empty players
// means the leaders in the stat
const defaults = {
  from: 0,
  to: 0,
  playoffs: false,
  stat: "t_net_pts",
  players: "",
}
type P = typeof defaults

// every one is a column of ESPN's player_box. `signed` stats can go below
// zero, and get signs and a strong zero line; `digits` is their precision
const stats: Record<
  string,
  { label: string; signed?: boolean; digits?: number }
> = {
  t_net_pts: { label: "Net points", signed: true, digits: 1 },
  o_net_pts: { label: "Offensive net points", signed: true, digits: 1 },
  d_net_pts: { label: "Defensive net points", signed: true, digits: 1 },
  t_wpa: { label: "Win probability added", signed: true, digits: 2 },
  o_wpa: { label: "Offensive WPA", signed: true, digits: 2 },
  d_wpa: { label: "Defensive WPA", signed: true, digits: 2 },
  plus_minus: { label: "Plus-minus", signed: true },
  pts: { label: "Points" },
  reb: { label: "Rebounds" },
  oreb: { label: "Offensive rebounds" },
  dreb: { label: "Defensive rebounds" },
  ast: { label: "Assists" },
  stl: { label: "Steals" },
  blk: { label: "Blocks" },
  tov: { label: "Turnovers" },
  fgm: { label: "Field goals made" },
  fga: { label: "Field goals attempted" },
  fg3m: { label: "3-pointers made" },
  fg3a: { label: "3-pointers attempted" },
  ftm: { label: "Free throws made" },
  fta: { label: "Free throws attempted" },
  def_fouls: { label: "Defensive fouls" },
  off_fouls: { label: "Offensive fouls" },
}

const MAX_PLAYERS = 12
const LEADERS = 5

interface Game {
  game_id: string
  date: Date
  playoff: boolean
  v: number
}

interface D {
  from: number
  to: number
  seasons: number[]
  latest: number
  stat: string
  names: Map<string, string>
  // each player's games in the span, in date order
  games: Map<string, Game[]>
}

interface Point {
  n: number
  v: number
  game?: Game
}

const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date, year = false) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  })

// a value, signed when the stat can go negative. Ticks pass their own
// precision, which follows the tick step
function formatter(stat: string, digits = stats[stat].digits ?? 0) {
  const s = stats[stat]
  const f = format(`,.${digits}f`)
  return (v: number) => {
    const t = f(Math.abs(v))
    if (!s.signed || t === f(0)) return t
    return v > 0 ? `+${t}` : `−${t}`
  }
}

// the games a view counts
const counted = (d: D, p: P, id: string) =>
  (d.games.get(id) ?? []).filter(g => p.playoffs || !g.playoff)

// the leaders in the stat over the span, for a view with no players picked
function leaders(d: D, p: P) {
  return [...d.games.keys()]
    .map(id => [id, sum(counted(d, p, id), g => g.v)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LEADERS)
    .map(([id]) => id)
}

function picked(p: P) {
  return p.players.split(",").filter(Boolean)
}

// the players on the chart: the picked ones, or the leaders
function shown(d: D, p: P) {
  const ids = picked(p)
  return ids.length ? ids : leaders(d, p)
}

// a stat's label inside a phrase: "offensive WPA"
const statName = (stat: string) =>
  stats[stat].label[0].toLowerCase() + stats[stat].label.slice(1)

// "the five leaders in net points", or nothing when the players were picked,
// as their names are on the chart
function who(d: D, p: P) {
  if (picked(p).length) return ""
  const n = leaders(d, p).length
  const what = statName(d.stat)
  if (!n) return ""
  if (n === 1) return `The leader in ${what}`
  return `The top ${["two", "three", "four", "five"][n - 2]} in ${what}`
}

// each shown player's running total, from zero before his first game
function series(d: D, p: P) {
  return shown(d, p).map((id, i) => {
    let v = 0
    const points: Point[] = [{ n: 0, v: 0 }]
    counted(d, p, id).forEach((game, j) => {
      v += game.v
      points.push({ n: j + 1, v, game })
    })
    return {
      id,
      name: d.names.get(id) ?? id,
      ...lineStyle(i),
      points,
    }
  })
}

export const cumulative: Tool<P, D> = {
  id: "cumulative",
  name: "Cumulative stats",
  defaults,

  async load(p) {
    const meta = await metadata()
    const { first_season, last_season } = meta.player_box
    const clamp = (s: number) =>
      Math.min(last_season, Math.max(first_season, s))
    const to = clamp(p.to || last_season)
    const from = clamp(p.from || to)
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const stat = p.stat in stats ? p.stat : defaults.stat

    const span = []
    for (let s = lo; s <= hi; s++) span.push(s)
    const seasons = await Promise.all(
      span.map(s =>
        Promise.all([
          read("espn", "player_box", s, ["game_id", "player_id", stat]),
          read("stats", "games", s, ["game_id", "game_date", "game_type"]),
          read("stats", "player_seasons", s, ["player_id", "name"]),
        ]),
      ),
    )

    const names = new Map<string, string>()
    const games = new Map<string, Game[]>()
    for (const [box, gameRows, players] of seasons) {
      for (const pl of players) names.set(pl.player_id, pl.name)
      const info = new Map(gameRows.map(g => [g.game_id as string, g]))
      for (const r of box) {
        const g = info.get(r.game_id)
        // the NBA Cup final isn't a regular-season game; the play-in counts
        // with the playoffs
        if (
          !g ||
          !["regular_season", "play_in", "playoffs"].includes(g.game_type)
        )
          continue
        let list = games.get(r.player_id)
        if (!list) games.set(r.player_id, (list = []))
        list.push({
          game_id: r.game_id,
          date: g.game_date,
          playoff: g.game_type !== "regular_season",
          v: Number(r[stat] ?? 0),
        })
      }
    }
    // game ids aren't in date order across game types
    for (const list of games.values())
      list.sort(
        (a, b) => +a.date - +b.date || a.game_id.localeCompare(b.game_id),
      )

    const all = []
    for (let s = first_season; s <= last_season; s++) all.push(s)
    return {
      from: lo,
      to: hi,
      seasons: all,
      latest: last_season,
      stat,
      names,
      games,
    }
  },

  normalize(d, p) {
    const p2 = { ...p, from: d.from, to: d.to, stat: d.stat }
    // players with no games in the span drop out. None left means the
    // leaders, which aren't written down, so they follow the stat and span
    const ids = picked(p)
      .filter(id => d.games.has(id))
      .slice(0, MAX_PLAYERS)
    return { ...p2, players: ids.join(",") }
  },

  controls(d, p) {
    return [
      {
        key: "from",
        keyTo: "to",
        label: "Seasons",
        kind: "span",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      { key: "playoffs", label: "Include playoffs", kind: "toggle" },
      {
        key: "stat",
        label: "Stat",
        kind: "select",
        options: Object.entries(stats).map(([k, s]) => ({
          value: k,
          label: s.label,
        })),
      },
      {
        key: "players",
        label: "Players",
        kind: "players",
        max: MAX_PLAYERS,
        fallback: {
          label: `Leaders in ${statName(d.stat)}`,
          values: leaders(d, p),
        },
        options: [...d.games.keys()]
          .map(id => ({ value: id, label: d.names.get(id) ?? id }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ]
  },

  describe(d, p) {
    const ss = series(d, p)
    const kind = p.playoffs ? "regular season and playoffs" : "regular season"
    const span =
      d.from === d.to
        ? `in the ${fmtSeason(d.to)} ${kind}`
        : `over the ${fmtSeason(d.from)} to ${fmtSeason(d.to)} ${kind.replace("season", "seasons")}`
    const last = max(
      ss.flatMap(s => s.points),
      pt => pt.game?.date,
    )
    const through =
      d.to === d.latest && last ? `, through ${fmtDate(last)}` : ""
    const most = max(ss, s => s.points.length - 1) ?? 0
    return {
      title: stats[d.stat].label,
      who: who(d, p),
      context: `Running total by games played ${span}${through}`,
      counts: `${ss.length} players · ${most} games`,
      source: "Data: ESPN Analytics",
    }
  },

  render(node, d, p, size): Body {
    const ss = series(d, p)
    const fmt = formatter(d.stat)
    const g = select(node)
    const top = 22
    const bottom = 48

    const ends = ss.map(s => s.points[s.points.length - 1])
    const maxN = Math.max(1, max(ends, e => e.n) ?? 0)
    const values = ss.flatMap(s => s.points.map(pt => pt.v))
    const [lo, hi] = [Math.min(0, ...values), Math.max(0, ...values)]
    const y = scaleLinear().domain([lo, hi]).nice(6)
    // a dip just under zero gets a sliver, not a whole tick of room
    if (lo < 0 && -lo < (hi - lo) * 0.04)
      y.domain([lo - (hi - lo) * 0.01, y.domain()[1]])

    // measure the tick labels and the names, for the margins
    const measure = g.append("text")
    const width = (t: string, fontSize: number, weight: number) =>
      measure
        .attr("font-size", fontSize)
        .attr("font-weight", weight)
        .text(t)
        .node()!
        .getComputedTextLength()
    const ticksY = y.ticks(6)
    const tick = formatter(
      d.stat,
      precisionFixed(ticksY.length > 1 ? ticksY[1] - ticksY[0] : 1),
    )
    const left =
      (max(ticksY, t => width(tick(t), type.tick.size, type.tick.weight)) ??
        20) + 10
    const gutter = gutterWidth(
      ss.map((s, i) => ({ name: s.name, sub: fmt(ends[i].v) })),
      width,
    )
    measure.remove()

    const plotW = size.width - left - gutter
    const height = size.height ?? Math.round(plotW * 0.62) + top + bottom
    const plotH = height - top - bottom
    const x = scaleLinear().domain([0, maxN]).range([0, plotW])
    y.range([plotH, 0])
    const plot = g.append("g").attr("transform", `translate(${left},${top})`)

    // grid, then zero, the strongest line
    const ticksX = x.ticks(8).filter(Number.isInteger)
    const grid = plot.append("g").attr("stroke", color.grid)
    for (const t of ticksX)
      grid.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y2", plotH)
    for (const t of ticksY)
      if (t !== 0)
        grid.append("line").attr("y1", y(t)).attr("y2", y(t)).attr("x2", plotW)
    plot
      .append("line")
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("x2", plotW)
      .attr("stroke", color.zero)
      .attr("stroke-width", 1.5)

    // axes
    const axis = plot
      .append("g")
      .attr("font-size", type.tick.size)
      .attr("font-weight", type.tick.weight)
      .attr("fill", color.muted)
    for (const t of ticksX)
      axis
        .append("text")
        .attr("x", x(t))
        .attr("y", plotH + 18)
        .attr("text-anchor", "middle")
        .text(t)
    for (const t of ticksY)
      axis
        .append("text")
        .attr("x", -8)
        .attr("y", y(t) + 4.5)
        .attr("text-anchor", "end")
        .text(tick(t))
    plot
      .append("text")
      .attr("x", plotW / 2)
      .attr("y", plotH + 40)
      .attr("text-anchor", "middle")
      .call(agate)
      .text("Games played →")
    plot
      .append("text")
      .attr("x", -left)
      .attr("y", -10)
      .call(agate)
      .text(`↑ ${stats[d.stat].label}, running total`)

    // the lines, the last-picked underneath
    const path = line<Point>()
      .x(pt => x(pt.n))
      .y(pt => y(pt.v))
    for (const s of ss.toReversed())
      plot
        .append("path")
        .attr("d", path(s.points))
        .attr("fill", "none")
        .attr("stroke", s.color)
        .attr("stroke-width", 2.25)
        .attr("stroke-linejoin", "round")
        .attr("stroke-dasharray", s.dashed ? "7 4" : null)

    lineLabels(
      plot,
      ss.map((s, i) => ({
        ...s,
        sub: `${fmt(ends[i].v)} · ${ends[i].n} g`,
        x: x(ends[i].n),
        y: y(ends[i].v),
      })),
      plotW,
      plotH,
    )

    // every game is a mark, so it can be labeled or pointed at
    const marks: Mark[] = []
    for (const s of ss)
      for (const pt of s.points)
        if (pt.game)
          marks.push({
            key: `${s.id}:${pt.game.game_id}`,
            x: x(pt.n) + left,
            y: y(pt.v) + top,
            r: 3,
            label: `G${pt.n} · ${fmt(pt.v)} · ${fmtDate(pt.game.date, d.from !== d.to)}`,
          })

    if (!ss.some(s => s.points.length > 1))
      plot
        .append("text")
        .attr("x", plotW / 2)
        .attr("y", plotH / 2)
        .attr("text-anchor", "middle")
        .attr("fill", color.muted)
        .text("No games yet")

    return {
      height,
      marks,
      // a note's position: games played and value
      invert(px, py) {
        const [u, v] = [px - left, py - top]
        if (u < 0 || u > plotW || v < 0 || v > plotH) return undefined
        return { g: +x.invert(u).toFixed(2), v: +y.invert(v).toFixed(3) }
      },
      project(pos) {
        const { g: n, v } = pos as { g: number; v: number }
        return [x(n) + left, y(v) + top]
      },
    }
  },
}
