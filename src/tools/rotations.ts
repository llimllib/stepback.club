// Both teams' rotations in one game, the away team's over the home team's:
// one row per player, one bar per stint on the game clock, colored and
// labeled by the score margin while they were on, with each personal foul on
// it and the game's margin between the two. The team picked only chooses
// whose schedule the game comes from
import {
  area,
  curveLinear,
  curveStepAfter,
  line,
  max,
  min,
  range,
  scaleLinear,
  select,
  sum,
} from "d3"
import { lookups, read, readWhere, type Row as DataRow } from "../kit/data"
import { agate, cityAndName, type VersusSide } from "../kit/frame"
import { halo } from "../kit/halo"
import { color, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"

const seasons = [2027, 2026, 2025]

// game is a game id; empty means the team's latest game
// all: every field goal and turnover on the bars, not just fouls
const defaults = { season: seasons[0], team: "BOS", game: "", all: false }
type P = typeof defaults

interface Stint {
  player_id: string
  in: number
  out: number
  pts: number
  pm: number
}

interface Foul {
  t: number
  // the player's count after it: 6 is fouling out
  n: number
  // "Shooting", "Offensive Charge", ...
  kind: string
}

// a field goal or a turnover
interface Play {
  t: number
  kind: "made" | "missed" | "to"
  // 2 or 3 for a shot
  value: number
  // the shot or turnover type
  sub: string
}

interface Game {
  game_id: string
  date: Date
  // "vs NYK" or "@ NYK"
  where: string
  // the team is listed first: it's the away team, or at a neutral site,
  // which has neither, the winner, as the scores page lists them
  first: boolean
  neutral: boolean
  // "Finals G7", "Preseason", ... empty for the regular season
  kind: string
  opp_team_id: string
  opp: string
  opp_name: string
  pts: number
  opp_pts: number
}

interface D {
  season: number
  // NBA teams with rotation data, by abbreviation
  teams: Map<string, { team_id: string; name: string }>
  // each team's games, latest first
  games: Map<string, Game[]>
  // stints by `${game_id}:${team_id}`
  stints: Map<string, Stint[]>
  names: Map<string, string>
  // the shown game's scoring plays, in order, and its personal fouls by
  // player, when its season has them
  events?: {
    game_id: string
    plays: DataRow[]
    fouls: Map<string, Foul[]>
    // field goals and turnovers by player
    actions: Map<string, Play[]>
  }
}

interface Row {
  player_id: string
  name: string
  stints: Stint[]
  min: number
  pm: number
}

const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date, year = false, month: "short" | "long" = "short") =>
  d.toLocaleDateString("en-US", {
    month,
    day: "numeric",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  })
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0")
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
const result = (g: Game) =>
  `${g.pts > g.opp_pts ? "W" : "L"} ${g.pts}–${g.opp_pts}`

// the margin graph's clip paths need ids unique on the page
let clips = 0

const rounds = ["", "Round 1", "Round 2", "Conf. finals", "Finals"]

// Periods are 12 minutes, overtimes 5, as seconds from the start of the game
const periodStart = (n: number) =>
  n <= 4 ? (n - 1) * 720 : 2880 + (n - 5) * 300
const periodName = (n: number) =>
  n <= 4 ? `Q${n}` : n === 5 ? "OT" : `${n - 4}OT`

// The game clock at a time, as a period and the time left in it. An out time
// on a period's last second is the end of that period, not the start of the next
function clock(t: number, isOut = false) {
  const u = isOut ? t - 0.05 : t
  let n = 1
  while (periodStart(n + 1) <= u) n++
  return { period: periodName(n), left: periodStart(n + 1) - t }
}

// A stint on the game clock: "Q1 7:12–2:40", "Q1 2:40–Q2 9:00", or
// "Q2 8:35–end of Q3"
function span(s: Stint) {
  const a = clock(s.in)
  const b = clock(s.out, true)
  const end =
    b.left < 0.05
      ? `end of ${b.period}`
      : b.period === a.period
        ? mmss(b.left)
        : `${b.period} ${mmss(b.left)}`
  return `${a.period} ${mmss(a.left)}–${end}`
}

// Substitutions: every check-in after the opening tip, between periods
// included, except a player shown leaving and re-entering at the same moment
function substitutions(stints: Stint[]) {
  const outs = new Set(stints.map(s => `${s.player_id}:${s.out}`))
  return stints.filter(s => s.in > 0 && !outs.has(`${s.player_id}:${s.in}`))
    .length
}

// The team and game a view shows: the team asked for, or the first, and the
// game asked for, or the team's latest
function pick(d: Omit<D, "events">, p: P) {
  const team = d.teams.has(p.team) ? p.team : [...d.teams.keys()][0]
  const games = d.games.get(d.teams.get(team)!.team_id)!
  const game = games.some(g => g.game_id === p.game) ? p.game : games[0].game_id
  return { team, game }
}

interface Side {
  team_id: string
  abbrev: string
  name: string
  pts: number
}

// The game shown, and its two teams in the order they're drawn: away on
// top, home under it
function matchup(d: D, p: P) {
  const team = d.teams.get(p.team)!
  const game = d.games.get(team.team_id)!.find(gm => gm.game_id === p.game)!
  const picked: Side = {
    team_id: team.team_id,
    abbrev: p.team,
    name: team.name,
    pts: game.pts,
  }
  const opp: Side = {
    team_id: game.opp_team_id,
    abbrev: game.opp,
    name: game.opp_name || game.opp,
    pts: game.opp_pts,
  }
  const sides: [Side, Side] = game.first ? [picked, opp] : [opp, picked]
  return { game, sides }
}

// The game's periods: four, and any overtimes
function periodCount(d: D, game: string) {
  const last = max(
    [...d.stints]
      .filter(([k]) => k.startsWith(`${game}:`))
      .flatMap(([, ss]) => ss.map(s => s.out)),
  )!
  let n = 4
  while (periodStart(n + 1) < last) n++
  return n
}

const byPlay = (d: D, game: string) =>
  d.events?.game_id === game && d.events.plays.length > 0

const fouls = (d: D, game: string) =>
  d.events?.game_id === game ? d.events.fouls : new Map<string, Foul[]>()

const fouledOut = "#e69f00"

const ordinal = (n: number) =>
  `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`

// The margin, from team_id's side, after every scoring play
function margins(d: D, game: Game, team_id: string, opp_id: string) {
  if (byPlay(d, game.game_id)) {
    const plays = d.events!.plays
    const sign = plays[0].home_team_id === team_id ? 1 : -1
    return [
      { t: 0, m: 0 },
      ...plays.map(r => ({
        t: r.time as number,
        m: sign * (r.home_score - r.away_score),
      })),
    ]
  }
  return subMargins(d, game, team_id, opp_id)
}

// The margin, from team_id's side, at every substitution, for seasons
// without scoring plays. A stint's plus-minus is the change in margin across
// it, so from 0–0 at the tip each stint gives the margin when it ends from
// the margin when it began. Runs between substitutions don't show
function subMargins(d: D, game: Game, team_id: string, opp_id: string) {
  const at = new Map([[0, 0]])
  for (const [id, sign] of [
    [team_id, 1],
    [opp_id, -1],
  ] as const) {
    // a stint begins when another ends, so by then that one's been counted
    const ss = [...(d.stints.get(`${game.game_id}:${id}`) ?? [])].sort(
      (a, b) => a.out - b.out || a.in - b.in,
    )
    for (const s of ss) {
      const m = at.get(s.in)
      if (m !== undefined && !at.has(s.out)) at.set(s.out, m + sign * s.pm)
    }
  }
  return [...at].map(([t, m]) => ({ t, m })).sort((a, b) => a.t - b.t)
}

function rows(d: D, game: string, team_id: string): Row[] {
  const byPlayer = new Map<string, Stint[]>()
  for (const s of d.stints.get(`${game}:${team_id}`) ?? [])
    byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s])
  const out = [...byPlayer].map(([player_id, stints]) => ({
    player_id,
    name: d.names.get(player_id) ?? player_id,
    stints: stints.sort((a, b) => a.in - b.in),
    min: sum(stints, s => s.out - s.in) / 60,
    pm: sum(stints, s => s.pm),
  }))
  // starters by minutes, then the bench in the order they came in
  const starter = (r: Row) => r.stints[0].in === 0
  return out.sort((a, b) =>
    starter(a) !== starter(b)
      ? starter(a)
        ? -1
        : 1
      : starter(a)
        ? b.min - a.min
        : a.stints[0].in - b.stints[0].in,
  )
}

export const rotations: Tool<P, D> = {
  id: "rotations",
  name: "Rotations",
  defaults,

  async load(p) {
    const [rot, lk] = await Promise.all([
      read("stats", "game_rotations", p.season, [
        "game_id",
        "team_id",
        "player_id",
        "in_time",
        "out_time",
        "pts",
        "plus_minus",
        "matches_box_score",
      ]),
      lookups(p.season),
    ])
    // games whose stints don't add up to the box score have a missed
    // substitution or similar, so they're left out. The ones that do add up
    // have every point scored, so they also give the final score
    const stints = new Map<string, Stint[]>()
    const teamPts = new Map<string, Map<string, number>>()
    for (const r of rot) {
      if (!r.matches_box_score) continue
      const key = `${r.game_id}:${r.team_id}`
      if (!stints.has(key)) stints.set(key, [])
      stints.get(key)!.push({
        player_id: r.player_id,
        in: r.in_time,
        out: r.out_time,
        pts: r.pts,
        pm: r.plus_minus,
      })
      if (!teamPts.has(r.game_id)) teamPts.set(r.game_id, new Map())
      const pts = teamPts.get(r.game_id)!
      pts.set(r.team_id, (pts.get(r.team_id) ?? 0) + r.pts)
    }
    const games = new Map<string, Game[]>()
    for (const [game_id, pts] of teamPts) {
      const g = lk.games.get(game_id)
      if (!g) continue
      const kind =
        g.game_type === "playoffs"
          ? `${rounds[g.playoff_round]} G${g.series_game}`
          : g.game_type === "play_in"
            ? "Play-in"
            : g.game_type === "preseason"
              ? "Preseason"
              : g.game_type === "cup_final"
                ? "Cup final"
                : ""
      for (const [team_id, own] of pts) {
        const [opp_id, opp_pts] = [...pts].find(([id]) => id !== team_id) ?? []
        if (!opp_id) continue
        if (!games.has(team_id)) games.set(team_id, [])
        // neutral-site games have no home team, and read "vs"
        const neutral = !g.home_team_id
        games.get(team_id)!.push({
          game_id,
          date: g.game_date,
          where: `${g.away_team_id === team_id ? "@" : "vs"} ${lk.teams.get(opp_id)?.nba_abbrev ?? ""}`,
          first: neutral ? own > opp_pts! : g.away_team_id === team_id,
          neutral,
          opp_team_id: opp_id,
          opp: lk.teams.get(opp_id)?.nba_abbrev ?? "",
          opp_name: lk.teams.get(opp_id)?.full_name ?? "",
          kind,
          pts: own,
          opp_pts: opp_pts!,
        })
      }
    }
    for (const gs of games.values())
      gs.sort((a, b) => +b.date - +a.date || b.game_id.localeCompare(a.game_id))
    const teams = new Map(
      [...games.keys()]
        .map(id => lk.teams.get(id))
        // a team missing from team_seasons is a lookup that's behind the
        // rotations, so skip it rather than fail
        .filter((t): t is DataRow => Boolean(t?.is_nba))
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map(t => [t.nba_abbrev, { team_id: t.team_id, name: t.full_name }]),
    )
    const d = { season: p.season, teams, games, stints, names: lk.players }
    // the shown game's play-by-play. A season without it (one nba_data
    // hasn't published yet) has no fouls, and falls back to the margin at
    // each sub
    const { game } = pick(d, p)
    const events = await readWhere(
      "stats",
      "game_events",
      p.season,
      [
        "action_id",
        "time",
        "person_id",
        "action_type",
        "sub_type",
        "pts",
        "home_team_id",
        "home_score",
        "away_score",
        "shot_result",
        "shot_value",
        "is_field_goal",
      ],
      { game_id: { $eq: game } },
    ).catch(() => [])
    events.sort((a, b) => a.action_id - b.action_id)
    // personal fouls, numbered in order. Technicals aren't, and defensive
    // 3 seconds is a team technical with the player's id. The descriptions'
    // own count ("P4.T2") is missing from some fouls and repeated on
    // technicals, so it isn't used. Counted this way, 99.85% of player games
    // in 2026-2027 match the box score's PF
    const byPlayer = new Map<string, Foul[]>()
    for (const e of events) {
      if (
        e.action_type !== "Foul" ||
        !e.person_id ||
        /Technical|Flopping|Bench|3 Second/.test(e.sub_type)
      )
        continue
      if (!byPlayer.has(e.person_id)) byPlayer.set(e.person_id, [])
      const fs = byPlayer.get(e.person_id)!
      fs.push({ t: e.time, n: fs.length + 1, kind: e.sub_type })
    }
    const actions = new Map<string, Play[]>()
    for (const e of events) {
      if (!e.person_id) continue
      const play: Play | undefined = e.is_field_goal
        ? {
            t: e.time,
            kind: e.shot_result === "Made" ? "made" : "missed",
            value: e.shot_value,
            sub: e.sub_type,
          }
        : e.action_type === "Turnover"
          ? { t: e.time, kind: "to", value: 0, sub: e.sub_type }
          : undefined
      if (!play) continue
      if (!actions.has(e.person_id)) actions.set(e.person_id, [])
      actions.get(e.person_id)!.push(play)
    }
    return {
      ...d,
      events: {
        game_id: game,
        plays: events.filter(e => e.pts > 0),
        fouls: byPlayer,
        actions,
      },
    }
  },

  normalize(d, p) {
    return { ...p, ...pick(d, p) }
  },

  controls(d, p) {
    const games = d.games.get(d.teams.get(p.team)!.team_id)!
    return [
      {
        key: "season",
        label: "Season",
        kind: "select",
        options: seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      {
        key: "team",
        label: "Team",
        kind: "select",
        options: [...d.teams].map(([abbrev, t]) => ({
          value: abbrev,
          label: t.name,
        })),
      },
      {
        key: "game",
        label: "Game",
        kind: "select",
        options: games.map(g => ({
          value: g.game_id,
          label: [fmtDate(g.date), g.where, g.kind, result(g)]
            .filter(Boolean)
            .join(" · "),
        })),
      },
      ...(byPlay(d, p.game)
        ? [{ key: "all", label: "All events", kind: "toggle" as const }]
        : []),
    ]
  },

  describe(d, p) {
    const { game: g, sides } = matchup(d, p)
    const ot = periodCount(d, g.game_id) - 4
    const day = g.date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    // the season, which also dates the day in the box
    const season = fmtSeason(d.season)
    const subs = (t: Side) =>
      substitutions(d.stints.get(`${g.game_id}:${t.team_id}`)!)
    return {
      title: "Rotations",
      context: !g.kind
        ? `${season} regular season`
        : /^(Round|Conf|Finals)/.test(g.kind)
          ? `${g.kind} of the ${season} playoffs`
          : `${g.kind}, ${season}`,
      counts: `${sides[0].abbrev} ${subs(sides[0])} subs · ${sides[1].abbrev} ${subs(sides[1])}`,
      versus: {
        sides: sides.map(t => ({
          abbrev: t.abbrev,
          ...cityAndName(t.name),
          score: t.pts,
          won: t.pts > sides.find(o => o !== t)!.pts,
        })) as [VersusSide, VersusSide],
        word: g.neutral ? "vs." : "at",
        lines: [
          day,
          ot === 0 ? "Final" : ot === 1 ? "Final/OT" : `Final/${ot}OT`,
        ],
      },
      legend: [
        { symbol: "bar", color: color.pos, label: "+1", text: "won the stint" },
        {
          symbol: "bar",
          color: color.neg,
          label: "−1",
          text: "lost the stint",
        },
        // the margin labels its own sides, so it's only in the legend when
        // it's known just at the subs, which the dots need explaining
        ...(byPlay(d, p.game)
          ? []
          : [
              {
                symbol: "dotline" as const,
                color: color.ink,
                text: "margin at each sub",
              },
            ]),
        ...(fouls(d, p.game).size > 0
          ? [
              {
                symbol: "dot" as const,
                color: color.ink,
                // with all events on, numbered, so it isn't the made 2
                ...(p.all ? { label: "1" } : {}),
                text: "personal foul",
              },
            ]
          : []),
        ...(p.all && byPlay(d, p.game)
          ? [
              // the shots and turnovers on a row of their own
              {
                symbol: "dot" as const,
                color: color.ink,
                text: "made 2",
                break: true,
              },
              {
                symbol: "dot" as const,
                color: color.ink,
                hollow: true,
                text: "missed 2",
              },
              { symbol: "diamond" as const, color: color.ink, text: "made 3" },
              {
                symbol: "diamond" as const,
                color: color.ink,
                hollow: true,
                text: "missed 3",
              },
              { symbol: "cross" as const, color: color.ink, text: "turnover" },
            ]
          : []),
      ],
      source: "Data: NBA.com play-by-play",
      team: p.team,
    }
  },

  render(node, d, p, size): Body {
    const { game, sides } = matchup(d, p)
    const [away, home] = sides
    // the away team on top, the home team under the margin
    const blocks = sides.map(t => ({
      name: t.name,
      rows: rows(d, p.game, t.team_id),
    }))
    const ms = margins(d, game, away.team_id, home.team_id)
    // the margin after each scoring play, or, without them, at each sub,
    // which is known only at its points and so is drawn with a dot at each
    const plays = byPlay(d, p.game)
    const g = select(node)
    const topHeight = 22
    const axisHeight = 40
    // a team's name over its rows, and the space either side of the margin
    const headH = 28
    const gap = 14
    // at a fixed size, rows share the height left, the margin graph taking
    // four of them, or three when two long benches leave rows tight
    const players = blocks[0].rows.length + blocks[1].rows.length
    const room = size.height
      ? size.height - topHeight - axisHeight - 2 * headH - 2 * gap
      : 0
    const marginRows = room && room / (players + 4) < 18 ? 3 : 4
    const rowH = size.height
      ? Math.max(11, Math.min(44, room / (players + marginRows)))
      : 30
    // two long benches in a small export shrink the rows' text and bars
    // with them, so the chart fits the frame
    const textSize = Math.min(type.label.size, rowH + 1)
    const barH = rowH >= 16 ? Math.min(rowH * 0.66, 24) : rowH * 0.75
    // fouls hang from the bars' bottom edge, clear of their labels,
    // numbered while the bars are tall enough for a digit, and plain dots
    // below that
    const numbered = barH >= 16
    const foulR = numbered ? 6 : Math.max(2, barH * 0.25)
    const foulY = barH / 2 + foulR / 3
    const foulsBy = fouls(d, p.game)
    const actionsBy =
      p.all && d.events?.game_id === p.game
        ? d.events.actions
        : new Map<string, Play[]>()
    // shots sit on the bar's top edge, turnovers hang below it with the
    // fouls
    const shotR = Math.max(2, Math.min(3.5, barH * 0.2))
    const shotY = -barH / 2

    // from the top of the plot: a head, the team's rows, the margin, then
    // the opponent's head and rows
    const marginTop = headH + blocks[0].rows.length * rowH + gap
    const marginH = marginRows * rowH
    const heads = [0, marginTop + marginH + gap]
    const placed = blocks.flatMap((b, j) =>
      b.rows.map((r, i) => ({ r, y: heads[j] + headH + i * rowH })),
    )
    const plotH = heads[1] + headH + blocks[1].rows.length * rowH
    const height = size.height ?? topHeight + plotH + axisHeight

    const measure = g
      .append("text")
      .attr("font-size", textSize)
      .attr("font-weight", 600)
    const nameWidth = max(placed, ({ r }) =>
      measure.text(r.name).node()!.getComputedTextLength(),
    )
    measure.remove()
    const labelWidth = (nameWidth ?? 0) + 12
    // minutes and plus-minus columns on the right
    const colW = 44
    const statsWidth = colW * 2

    // the game runs to the end of its last period, overtimes included
    const periods = periodCount(d, p.game)
    const end = periodStart(periods + 1)
    // the last score holds to the final horn
    if (plays) ms.push({ t: end, m: ms[ms.length - 1].m })
    const x = scaleLinear()
      .domain([0, end])
      .range([labelWidth, size.width - statsWidth - 8])

    // the margin, from the away team's side: above zero is its lead. Each side
    // gets some room, so its label fits even if that team never led
    const lo = Math.min(
      min(ms, s => s.m)!,
      -4,
    )
    const hi = Math.max(
      max(ms, s => s.m)!,
      4,
    )
    const y = scaleLinear()
      .domain([lo - 1, hi + 1])
      .range([marginTop + marginH, marginTop])
    const zero = y(0)
    // gridlines far enough apart for their numbers
    const step = [5, 10, 20].find(s => y(0) - y(s) >= 20) ?? 40
    const ticks = [
      ...range(-step, lo - 0.5, -step),
      ...range(step, hi + 0.5, step),
    ]

    const plot = g.append("g").attr("transform", `translate(0,${topHeight})`)

    // the margin's fill, blue where the away team led and red where it trailed,
    // in the lighter blue and red of the same RdBu scale as the bars
    const id = `rotations-margin-${++clips}`
    const defs = plot.append("defs")
    for (const [side, y0, y1] of [
      ["lead", marginTop - gap, zero],
      ["trail", zero, marginTop + marginH + gap],
    ] as const)
      defs
        .append("clipPath")
        .attr("id", `${id}-${side}`)
        .append("rect")
        .attr("x", 0)
        .attr("y", y0)
        .attr("width", size.width)
        .attr("height", y1 - y0)
    // the score changes only at a basket, so after every scoring play the
    // margin holds flat until the next one. Without them, the margin between
    // subs is unknown, so its points are joined straight
    const drawn = ms
    const curve = plays ? curveStepAfter : curveLinear
    const fill = area<{ t: number; m: number }>()
      .x(s => x(s.t))
      .y0(zero)
      .y1(s => y(s.m))
      .curve(curve)
    for (const [side, tint] of [
      ["lead", "#92c5de"],
      ["trail", "#f4a582"],
    ])
      plot
        .append("path")
        .datum(drawn)
        .attr("d", fill)
        .attr("fill", tint)
        .attr("clip-path", `url(#${id}-${side})`)
    plot
      .append("g")
      .selectAll("line")
      .data(ticks)
      .join("line")
      .attr("x1", x(0))
      .attr("x2", x(end))
      .attr("y1", v => y(v))
      .attr("y2", v => y(v))
      .attr("stroke", color.grid)
      .attr("stroke-width", 0.75)

    // period boundaries through both rotations and the margin, with the
    // period names above
    const bounds = Array.from({ length: periods + 1 }, (_, i) =>
      periodStart(i + 1),
    )
    plot
      .append("g")
      .selectAll("line")
      .data(bounds)
      .join("line")
      .attr("x1", t => x(t))
      .attr("x2", t => x(t))
      .attr("y1", -4)
      .attr("y2", plotH + 4)
      .attr("stroke", t => (t === 0 || t === 1440 ? color.faint : color.grid))
    plot
      .append("g")
      .selectAll("text")
      .data(bounds.slice(0, -1))
      .join("text")
      .attr("x", (t, i) => (x(t) + x(bounds[i + 1])) / 2)
      .attr("y", -9)
      .attr("text-anchor", "middle")
      .call(agate)
      .text((_, i) => periodName(i + 1))

    // the margin: zero, its line, and the final margin at its end
    plot
      .append("line")
      .attr("x1", x(0))
      .attr("x2", x(end))
      .attr("y1", zero)
      .attr("y2", zero)
      .attr("stroke", color.zero)
      .attr("stroke-width", 1.5)
    // the line in the fill's own blue and red, so it reads as the fill's edge
    const edge = line<{ t: number; m: number }>()
      .x(s => x(s.t))
      .y(s => y(s.m))
      .curve(curve)
    for (const [side, stroke] of [
      ["lead", color.pos],
      ["trail", color.neg],
    ])
      plot
        .append("path")
        .datum(drawn)
        .attr("d", edge)
        .attr("fill", "none")
        .attr("stroke", stroke)
        .attr("stroke-width", 1.5)
        .attr("clip-path", `url(#${id}-${side})`)
    plot
      .append("g")
      .selectAll("circle")
      .data(plays ? [] : ms)
      .join("circle")
      .attr("cx", s => x(s.t))
      .attr("cy", s => y(s.m))
      .attr("r", 1.75)
      .attr("fill", color.ink)
    const final = away.pts - home.pts
    plot
      .append("text")
      .attr("x", x(end) + 6)
      .attr("y", y(final) + 4.5)
      .attr("font-size", type.label.size)
      .attr("font-weight", 600)
      .attr("fill", final > 0 ? color.pos : final < 0 ? color.neg : color.ink)
      .text(signed(final))
    // which side is whose, and how far ahead, in the names' column
    for (const [text, ty] of [
      [`${away.abbrev} ahead`, zero - 6],
      [`${home.abbrev} ahead`, zero + 14],
    ] as const)
      plot.append("text").attr("x", 0).attr("y", ty).call(agate).text(text)
    plot
      .append("g")
      .selectAll("text")
      .data(ticks)
      .join("text")
      .attr("x", labelWidth - 6)
      .attr("y", v => y(v) + 4)
      .attr("text-anchor", "end")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .attr("fill", color.muted)
      .text(v => Math.abs(v))

    // each team's name on a rule over its rows, with its columns' heads
    blocks.forEach((b, j) => {
      const base = heads[j] + headH - 9
      const head = plot.append("g")
      head
        .append("line")
        .attr("x1", 0)
        .attr("x2", size.width)
        .attr("y1", base + 5)
        .attr("y2", base + 5)
        .attr("stroke", color.ink)
      // the period lines run behind it
      halo(
        head
          .append("text")
          .attr("x", 0)
          .attr("y", base)
          .call(agate)
          .attr("fill", color.ink)
          .attr("font-weight", 600)
          .text(b.name)
          .node()!,
        4,
      )
      for (const [i, label] of ["MIN", "+/−"].entries())
        head
          .append("text")
          .attr("x", size.width - colW * (1 - i))
          .attr("y", base)
          .attr("text-anchor", "end")
          .call(agate)
          .text(label)
    })

    // minutes elapsed, beneath
    const axis = plot
      .append("g")
      .attr("transform", `translate(0,${plotH + 18})`)
    axis
      .selectAll("text")
      .data(bounds)
      .join("text")
      .attr("x", t => x(t))
      .attr("text-anchor", "middle")
      .attr("font-size", type.tick.size)
      .attr("fill", color.muted)
      .text(t => t / 60)
    axis
      .append("text")
      .attr("x", x(end / 2))
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .call(agate)
      .text("minutes")

    // stints are marks for arrows to point at, with no labels: the bars
    // already print their margins
    const marks: Mark[] = []
    for (const { r, y: top } of placed) {
      const cy = top + rowH / 2
      const row = plot.append("g").attr("transform", `translate(0,${cy})`)
      row
        .append("text")
        .attr("x", 0)
        .attr("y", 4.5)
        .attr("font-size", textSize)
        .attr("font-weight", 600)
        .text(r.name)
      row
        .append("text")
        .attr("x", size.width - colW)
        .attr("y", 4.5)
        .attr("text-anchor", "end")
        .attr("font-size", textSize)
        .text(mmss(r.min * 60))
      row
        .append("text")
        .attr("x", size.width)
        .attr("y", 4.5)
        .attr("text-anchor", "end")
        .attr("font-size", textSize)
        .attr("font-weight", 600)
        .attr("fill", r.pm > 0 ? color.pos : r.pm < 0 ? color.neg : color.ink)
        .text(signed(r.pm))

      for (const s of r.stints) {
        const x0 = x(s.in)
        const w = Math.max(x(s.out) - x0, 1.5)
        const tone = s.pm > 0 ? color.pos : s.pm < 0 ? color.neg : color.grid
        const bar = row.append("g")
        bar
          .append("rect")
          .attr("x", x0)
          .attr("y", -barH / 2)
          .attr("width", w)
          .attr("height", barH)
          .attr("fill", tone)
          // a hairline gap between stints that end and start at once
          .attr("stroke", color.bg)
          .attr("stroke-width", 0.75)
        const text = signed(s.pm)
        // label the bar when the number fits inside it
        if (w >= text.length * 7 + 6)
          bar
            .append("text")
            .attr("x", x0 + w / 2)
            .attr("y", 4)
            .attr("text-anchor", "middle")
            .attr("font-size", 11)
            .attr("font-weight", 600)
            .attr("fill", s.pm === 0 ? color.muted : color.bg)
            .attr("pointer-events", "none")
            .text(text)
        bar
          .append("title")
          .text(
            `${r.name}: ${span(s)} (${mmss(s.out - s.in)})\n` +
              `${signed(s.pm)} margin, ${s.pts} pts`,
          )
        marks.push({
          key: `${r.player_id}:${s.in}`,
          x: x0 + w / 2,
          y: cy + topHeight,
          r: barH / 2,
          w: w / 2,
        })
      }

      // a foul right after another is nudged along so both read, which can
      // put it a few seconds late
      let prev = -Infinity
      for (const f of foulsBy.get(r.player_id) ?? []) {
        const fx = Math.max(x(f.t), prev + 2 * foulR + 1)
        prev = fx
        const at = clock(f.t)
        const foul = row.append("g")
        // the sixth, fouling out, is orange (Okabe-Ito's) ringed in red,
        // with a halo so the ring holds against a red bar
        const out = f.n >= 6
        if (out)
          foul
            .append("circle")
            .attr("cx", fx)
            .attr("cy", foulY)
            .attr("r", foulR + 2.5)
            .attr("fill", color.bg)
        foul
          .append("circle")
          .attr("cx", fx)
          .attr("cy", foulY)
          .attr("r", foulR)
          .attr("fill", out ? fouledOut : color.ink)
          .attr("stroke", out ? color.neg : color.bg)
          .attr("stroke-width", out ? 2 : 1)
        if (numbered)
          foul
            .append("text")
            .attr("x", fx)
            .attr("y", foulY + 3.5)
            .attr("text-anchor", "middle")
            .attr("font-size", 10)
            .attr("font-weight", 700)
            .attr("fill", out ? color.ink : color.bg)
            .attr("pointer-events", "none")
            .text(f.n)
        foul
          .append("title")
          .text(
            `${r.name}: ${ordinal(f.n)} foul (${f.kind.toLowerCase()}), ` +
              `${at.period} ${mmss(at.left)}` +
              (out ? ", fouled out" : ""),
          )
      }

      // field goals: filled made, hollow missed, a circle for two and a
      // diamond for three. Turnovers are an ink ×
      let prevShot = -Infinity
      let prevTo = -Infinity
      for (const a of actionsBy.get(r.player_id) ?? []) {
        const at = clock(a.t)
        const mark = row.append("g")
        const when = `${at.period} ${mmss(at.left)}`
        if (a.kind === "to") {
          const tx = Math.max(x(a.t), prevTo + 2 * shotR + 1)
          prevTo = tx
          const s = shotR
          mark
            .append("path")
            .attr(
              "d",
              `M${tx - s},${foulY - s}L${tx + s},${foulY + s}` +
                `M${tx - s},${foulY + s}L${tx + s},${foulY - s}`,
            )
            .attr("stroke", color.bg)
            .attr("stroke-width", 4)
          mark
            .append("path")
            .attr(
              "d",
              `M${tx - s},${foulY - s}L${tx + s},${foulY + s}` +
                `M${tx - s},${foulY + s}L${tx + s},${foulY - s}`,
            )
            .attr("stroke", color.ink)
            .attr("stroke-width", 1.75)
          mark
            .append("title")
            .text(`${r.name}: turnover (${a.sub.toLowerCase()}), ${when}`)
          continue
        }
        const sx = Math.max(x(a.t), prevShot + 2 * shotR + 1)
        prevShot = sx
        const made = a.kind === "made"
        const shape = mark.append(a.value === 3 ? "rect" : "circle")
        if (a.value === 3)
          shape
            .attr("x", sx - shotR)
            .attr("y", shotY - shotR)
            .attr("width", 2 * shotR)
            .attr("height", 2 * shotR)
            .attr("transform", `rotate(45 ${sx} ${shotY})`)
        // a circle as big to the eye as the diamond, whose points reach
        // shotR * 1.41 and whose area is a circle's of shotR * 1.13
        else
          shape
            .attr("cx", sx)
            .attr("cy", shotY)
            .attr("r", shotR * 1.25)
        shape
          .attr("fill", made ? color.ink : color.bg)
          .attr("stroke", made ? color.bg : color.ink)
          .attr("stroke-width", made ? 1 : 1.5)
        mark
          .append("title")
          .text(
            `${r.name}: ${made ? "made" : "missed"} ${a.value}` +
              ` (${a.sub.toLowerCase()}), ${when}`,
          )
      }
    }

    return {
      height,
      marks,
      // a note's position: a time in the game, and a player's row or a
      // margin
      invert(px, py) {
        const py0 = py - topHeight
        const t = Math.round(x.invert(px))
        const hit = placed.find(o => py0 >= o.y && py0 < o.y + rowH)
        if (hit)
          return {
            x: t,
            p: hit.r.player_id,
            f: +((py0 - hit.y) / rowH).toFixed(3),
          }
        if (py0 >= marginTop - gap && py0 < marginTop + marginH + gap)
          return { x: t, m: +y.invert(py0).toFixed(1) }
        return undefined
      },
      project(pos) {
        const {
          x: t,
          p: player,
          f,
          m,
        } = pos as {
          x: number
          p?: string
          f?: number
          m?: number
        }
        if (m !== undefined) return [x(t), topHeight + y(m)]
        const o = placed.find(q => q.r.player_id === player)
        return o ? [x(t), topHeight + o.y + f! * rowH] : undefined
      },
    }
  },
}
