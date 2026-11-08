// Team efficiency: every team's net, offensive and defensive rating as a
// table ranked by one of them, with a strip of logos beside it on a true
// scale, so the gaps the ranking hides show. The ratings are its results
// (NBA.com, Cleaning the Glass) or its players' RAPM (yarapm). See
// docs/plans/2026-10-25-team-efficiency-design.md
import { max, mean, scaleLinear, select } from "d3"
import { metadata, read } from "../kit/data"
import { agate, logoUrl } from "../kit/frame"
import { color, font, type } from "../kit/theme"
import type { Body, Mark, Tool } from "../kit/tool"

// season 0 is the latest season the source has; load resolves it. `last`
// is the window: "" for the whole season, a number of games (NBA) or "2wk"
// (CTG)
const defaults = {
  season: 0,
  source: "nba",
  playoffs: false,
  last: "",
  sort: "net",
}
type P = typeof defaults

type Key = "net" | "off" | "def"
const columns: { key: Key; label: string }[] = [
  { key: "net", label: "Net" },
  { key: "off", label: "Offense" },
  { key: "def", label: "Defense" },
]

// `catalog` is where the dataset is: nba_data's, or yarapm's
const sources: Record<
  string,
  { label: string; dataset: string; catalog?: "yarapm"; credit?: string }
> = {
  nba: { label: "NBA.com", dataset: "team_game_logs" },
  ctg: { label: "Cleaning the Glass", dataset: "ctg_team_summary" },
  rapm: {
    label: "RAPM, full strength",
    dataset: "team_ratings_daily",
    catalog: "yarapm",
    credit: "yarapm",
  },
  rapm_today: {
    label: "RAPM, expected lineup",
    dataset: "team_ratings_daily",
    catalog: "yarapm",
    credit: "yarapm",
  },
}
const isRapm = (source: string) => sources[source].catalog === "yarapm"

interface Team {
  abbrev: string
  name: string
  // points scored and allowed per 100 possessions
  ortg: number
  drtg: number
  games: number
  // the record over the same games
  wins: number
  losses: number
  // better than average, so positive is good in every column, and
  // off + def = net
  net: number
  off: number
  def: number
}

interface D {
  season: number
  seasons: number[]
  latest: number
  source: string
  playoffs: boolean
  // whether the season has playoff games yet; without them, no toggle
  hasPlayoffs: boolean
  last: string
  // the windows this source and season type have, in slider order
  windows: { value: string; label: string }[]
  teams: Team[]
  // the average team's rating, offense and defense alike: zero in every
  // column, so a team's rating is this plus its offense, or minus its
  // defense
  avg: number
  through?: Date
}

const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
// a signed rating difference: +4.1, −2.0, 0.0
function signed(v: number) {
  const t = Math.abs(v).toFixed(1)
  if (t === "0.0") return t
  return v > 0 ? `+${t}` : `−${t}`
}

// a team's record, after its abbreviation: " (4-1)"
const record = (t: Team) => ` (${t.wins}-${t.losses})`

// one team-season's games in the window, summed: the NBA's way, so a
// blowout counts by its possessions, not as one game in an average
async function loadNba(season: number, p: P) {
  const [logs, games] = await Promise.all([
    read("stats", "team_game_logs", season, [
      "game_id",
      "team_id",
      "game_date",
      "pts",
      "plus_minus",
      "poss",
    ]),
    read("stats", "games", season, ["game_id", "game_type"]),
  ])
  const gameType = new Map(games.map(g => [g.game_id, g.game_type as string]))
  // the play-in goes with the playoffs, as it does at CTG. A season with
  // none played yet has no playoffs to show
  const post = ["playoffs", "play_in"]
  const hasPlayoffs = logs.some(r => post.includes(gameType.get(r.game_id)!))
  const playoffs = p.playoffs && hasPlayoffs
  const kinds = playoffs ? post : ["regular_season"]
  const byTeam = new Map<string, typeof logs>()
  for (const r of logs) {
    if (!kinds.includes(gameType.get(r.game_id)!) || !(r.poss > 0)) continue
    let list = byTeam.get(r.team_id)
    if (!list) byTeam.set(r.team_id, (list = []))
    list.push(r)
  }
  const most = max([...byTeam.values()], l => l.length) ?? 0
  // every fifth game short of the most played, then the whole season
  const windows = []
  for (let n = 5; n < most; n += 5)
    windows.push({ value: String(n), label: `Last ${n}` })
  windows.push({ value: "", label: "Season" })
  const last = windows.some(w => w.value === p.last) ? p.last : ""

  let through: Date | undefined
  const rows = [...byTeam].map(([team_id, list]) => {
    list.sort((a, b) => +b.game_date - +a.game_date)
    const used = last ? list.slice(0, Number(last)) : list
    let [pts, allowed, poss, wins] = [0, 0, 0, 0]
    for (const r of used) {
      pts += r.pts
      allowed += r.pts - r.plus_minus
      poss += r.poss
      if (r.plus_minus > 0) wins++
      if (!through || r.game_date > through) through = r.game_date
    }
    return {
      team_id,
      ortg: (100 * pts) / poss,
      drtg: (100 * allowed) / poss,
      games: used.length,
      wins,
      losses: used.length - wins,
    }
  })
  return { rows, windows, last, through, playoffs, hasPlayoffs }
}

async function loadCtg(season: number, p: P) {
  const rows = await read("ctg", "ctg_team_summary", season, [
    "team_id",
    "season_type",
    "as_of_date",
    "wins",
    "losses",
    "off_rtg",
    "def_rtg",
    "wins_last_2wk",
    "losses_last_2wk",
    "off_rtg_last_2wk",
    "def_rtg_last_2wk",
  ])
  const hasPlayoffs = rows.some(r => r.season_type === "playoffs")
  const playoffs = p.playoffs && hasPlayoffs
  const kind = playoffs ? "playoffs" : "regular_season"
  // CTG's playoff numbers come for the whole playoffs only
  const windows = playoffs
    ? [{ value: "", label: "Season" }]
    : [
        { value: "", label: "Season" },
        { value: "2wk", label: "Last 2 weeks" },
      ]
  const last = windows.some(w => w.value === p.last) ? p.last : ""
  const sfx = last ? "_last_2wk" : ""
  const mine = rows.filter(
    r => r.season_type === kind && r[`off_rtg${sfx}`] != null,
  )
  return {
    rows: mine.map(r => ({
      team_id: r.team_id as string,
      ortg: r[`off_rtg${sfx}`] as number,
      drtg: r[`def_rtg${sfx}`] as number,
      games: r[`wins${sfx}`] + r[`losses${sfx}`],
      wins: r[`wins${sfx}`] as number,
      losses: r[`losses${sfx}`] as number,
    })),
    windows,
    last,
    through: max(mine, r => r.as_of_date as Date),
    playoffs,
    hasPlayoffs,
  }
}

// A team-season's ratings from its players' RAPM, as of yarapm's latest
// day: its last build for this season, the day after the Finals for a past
// one. At full strength, everyone available, or with the expected lineup,
// counting who's likely out. They're already against the average team; the
// records are the NBA's, the regular season's
async function loadRapm(season: number, p: P, full: boolean) {
  const [ratings, nba] = await Promise.all([
    read("yarapm", "team_ratings_daily", season, [
      "as_of_date",
      "team_id",
      "off",
      "def",
      "full_off",
      "full_def",
      "league_average",
    ]),
    loadNba(season, { ...p, playoffs: false, last: "" }),
  ])
  const through = max(ratings, r => r.as_of_date as Date)
  const records = new Map(nba.rows.map(r => [r.team_id, r]))
  const rows = ratings
    .filter(r => +r.as_of_date === +through!)
    .map(r => {
      const [off, def] = full ? [r.full_off, r.full_def] : [r.off, r.def]
      const games = records.get(r.team_id)
      return {
        team_id: r.team_id as string,
        ortg: r.league_average + off,
        drtg: r.league_average - def,
        games: games?.games ?? 0,
        wins: games?.wins ?? 0,
        losses: games?.losses ?? 0,
      }
    })
  return {
    rows,
    windows: [{ value: "", label: "Season" }],
    last: "",
    through,
    playoffs: false,
    hasPlayoffs: false,
  }
}

// the teams in the view's order, best first
function sorted(d: D, p: P) {
  const key = (columns.find(c => c.key === p.sort) ?? columns[0]).key
  return [...d.teams].sort(
    (a, b) => b[key] - a[key] || a.abbrev.localeCompare(b.abbrev),
  )
}

// A RAPM view says what it is: the players' ratings, not the team's results
function describeRapm(d: D) {
  const lineup =
    d.source === "rapm"
      ? "at full strength, everyone available"
      : "with its expected lineup, counting who's likely out"
  // a past season's ratings are its final ones
  const when =
    d.season === d.latest && d.through
      ? `as of ${fmtDate(d.through)}`
      : `at the end of the ${fmtSeason(d.season)} season`
  return {
    title: "Team strength",
    context: `Points per 100 possessions better or worse than the average team, from each team's players' RAPM ${lineup}, ${when}`,
    legend: [
      { symbol: "bar" as const, color: color.pos, label: "+", text: "better" },
      { symbol: "bar" as const, color: color.neg, label: "−", text: "worse" },
    ],
    counts: `average ${d.avg.toFixed(1)}`,
    source: `Data: ${sources[d.source].credit}`,
  }
}

export const efficiency: Tool<P, D> = {
  id: "efficiency",
  name: "Team efficiency",
  defaults,

  async load(p) {
    const source = p.source in sources ? p.source : defaults.source
    const meta = await metadata(sources[source].catalog)
    const { first_season, last_season } = meta[sources[source].dataset]
    const season = Math.min(
      last_season,
      Math.max(first_season, p.season || last_season),
    )
    const [loaded, names] = await Promise.all([
      source === "ctg"
        ? loadCtg(season, p)
        : isRapm(source)
          ? loadRapm(season, p, source === "rapm")
          : loadNba(season, p),
      read("stats", "team_seasons", season, [
        "team_id",
        "nba_abbrev",
        "full_name",
      ]),
    ])
    const byId = new Map(names.map(t => [t.team_id, t]))
    // the average team, for zero: the plain mean of the teams' ratings, as
    // CTG publishes no possessions to weight it by
    const avg = mean(loaded.rows, r => (r.ortg + r.drtg) / 2) ?? 0
    const teams = loaded.rows
      .filter(r => byId.has(r.team_id) && Number.isFinite(r.ortg))
      .map(r => ({
        abbrev: byId.get(r.team_id)!.nba_abbrev as string,
        name: byId.get(r.team_id)!.full_name as string,
        ortg: r.ortg,
        drtg: r.drtg,
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        net: r.ortg - r.drtg,
        off: r.ortg - avg,
        def: avg - r.drtg,
      }))

    const seasons = []
    for (let s = last_season; s >= first_season; s--) seasons.push(s)
    return {
      season,
      seasons,
      latest: last_season,
      source,
      playoffs: loaded.playoffs,
      hasPlayoffs: loaded.hasPlayoffs,
      last: loaded.last,
      windows: loaded.windows,
      teams,
      avg,
      through: loaded.through,
    }
  },

  normalize(d, p) {
    return {
      ...p,
      season: d.season,
      source: d.source,
      playoffs: d.playoffs,
      // a window the source doesn't have, as after switching sources, is
      // the source's default: the whole season
      last: d.last,
      sort: columns.some(c => c.key === p.sort) ? p.sort : "net",
    }
  },

  controls(d) {
    const games =
      d.windows.length < 2
        ? []
        : d.source === "nba"
          ? [
              {
                key: "last",
                label: "Games",
                kind: "steps" as const,
                options: d.windows,
              },
            ]
          : [
              {
                key: "last",
                label: "Games",
                kind: "select" as const,
                options: d.windows,
              },
            ]
    return [
      {
        key: "season",
        label: "Season",
        kind: "select",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      {
        key: "source",
        label: "Source",
        kind: "select",
        options: Object.entries(sources).map(([k, s]) => ({
          value: k,
          label: s.label,
        })),
      },
      ...(d.hasPlayoffs
        ? [{ key: "playoffs", label: "Playoffs", kind: "toggle" as const }]
        : []),
      ...games,
      {
        key: "sort",
        label: "Sort by",
        kind: "select",
        options: columns.map(c => ({ value: c.key, label: c.label })),
      },
    ]
  },

  describe(d) {
    if (isRapm(d.source)) return describeRapm(d)
    const kind = d.playoffs ? "playoffs" : "regular season"
    const span = !d.last
      ? `in the ${fmtSeason(d.season)} ${kind}`
      : d.last === "2wk"
        ? `over the last two weeks of the ${fmtSeason(d.season)} ${kind}`
        : `over each team's last ${d.last} games of the ${fmtSeason(d.season)} ${kind}`
    // a past season's last date is the end of the season, which says nothing
    const through =
      d.season === d.latest && d.through
        ? `, through ${fmtDate(d.through)}`
        : ""
    const ctg =
      d.source === "ctg" ? ". Cleaning the Glass leaves out garbage time" : ""
    return {
      title: "Team efficiency",
      context: `Points per 100 possessions better or worse than the average team ${span}${through}${ctg}`,
      legend: [
        { symbol: "bar", color: color.pos, label: "+", text: "better" },
        { symbol: "bar", color: color.neg, label: "−", text: "worse" },
      ],
      // the average is zero in every column: with it, +6.4 on offense is a
      // rating you can work out
      counts: `average ${d.avg.toFixed(1)}`,
      source: `Data: ${sources[d.source].label}`,
    }
  },

  render(node, d, p, size, set): Body {
    const ts = sorted(d, p)
    const sortKey = (columns.find(c => c.key === p.sort) ?? columns[0]).key
    const g = select(node)
    const W = size.width
    const head = 30
    const bottom = 10
    const n = Math.max(ts.length, 1)
    const rowH = size.height ? (size.height - head - bottom) / n : 22
    const height = size.height ?? Math.round(head + rowH * n + bottom)
    const rowY = (i: number) => head + i * rowH
    // text shrinks with the rows on short frames
    const fs = Math.min(14, rowH * 0.68)

    // columns: rank and team, three bar columns, the strip. The team
    // column fits the widest name and record
    const logo = Math.min(rowH - 3, 20)
    const recFs = fs * 0.85
    const measureTeam = g.append("text").attr("font-size", fs)
    const teamW =
      30 +
      logo +
      (max(ts, t => {
        measureTeam.text(null)
        measureTeam
          .append("tspan")
          .attr("font-weight", type.label.weight)
          .text(t.abbrev)
        measureTeam.append("tspan").attr("font-size", recFs).text(record(t))
        return measureTeam.node()!.getComputedTextLength()
      }) ?? 40) +
      12
    measureTeam.remove()
    const stripW = Math.round(W * 0.22)
    const gap = 18
    const colW = (W - teamW - stripW - gap) / 3
    const colX = (i: number) => teamW + i * colW
    // each column's numbers run down its middle, and its bars grow out of
    // them: right of the number if better, left if worse. So a bar always
    // touches its own number, and the numbers line up. The cost: zero is
    // the number's width, so +0.1 and −0.1 look further apart than they are
    const center = (j: number) => colX(j) + colW / 2
    const measure = g
      .append("text")
      .attr("font-size", fs)
      .attr("font-weight", 600)
    const half =
      (max(ts, t =>
        max(columns, c =>
          measure.text(signed(t[c.key])).node()!.getComputedTextLength(),
        ),
      ) ?? 30) /
        2 +
      4
    measure.remove()
    const maxAbs = Math.max(
      1,
      max(ts, t =>
        Math.max(Math.abs(t.net), Math.abs(t.off), Math.abs(t.def)),
      ) ?? 1,
    )
    // one scale for all three columns, so offense and defense add up to net
    const len = scaleLinear()
      .domain([0, maxAbs])
      .range([0, colW / 2 - half - 8])

    // rules every five rows, as in a newspaper's standings
    const rules = g.append("g").attr("stroke", color.grid)
    for (let i = 5; i < ts.length; i += 5)
      rules
        .append("line")
        .attr("x2", teamW + colW * 3)
        .attr("y1", rowY(i))
        .attr("y2", rowY(i))

    // headers, over the numbers; the sorted one gets ▼ and ink, and a
    // click on one sorts by it
    columns.forEach((c, i) =>
      g
        .append("text")
        .attr("class", "frame-control")
        .attr("x", center(i))
        .attr("y", head - 10)
        .attr("text-anchor", "middle")
        .call(agate)
        .attr("fill", c.key === sortKey ? color.ink : color.muted)
        .attr("font-weight", c.key === sortKey ? 700 : 400)
        .text(c.key === sortKey ? `${c.label} ▼` : c.label)
        .on("click", () => set({ sort: c.key }))
        .append("title")
        .text(`Sort by ${c.label.toLowerCase()}`),
    )

    const marks: Mark[] = []
    ts.forEach((t, i) => {
      const y = rowY(i)
      const cy = y + rowH / 2
      const row = g.append("g")
      row
        .append("text")
        .attr("x", 18)
        .attr("y", cy + fs * 0.35)
        .attr("text-anchor", "end")
        .attr("font-size", fs * 0.85)
        .attr("fill", color.muted)
        .text(i + 1)
      row
        .append("image")
        .attr("href", logoUrl(t.abbrev))
        .attr("x", 26)
        .attr("y", cy - logo / 2)
        .attr("width", logo)
        .attr("height", logo)
      const name = row
        .append("text")
        .attr("x", 30 + logo)
        .attr("y", cy + fs * 0.35)
        .attr("font-size", fs)
      name.append("tspan").attr("font-weight", type.label.weight).text(t.abbrev)
      name
        .append("tspan")
        .attr("font-size", recFs)
        .attr("fill", color.muted)
        .text(record(t))
      name
        .append("title")
        .text(
          `${t.name}, ${t.wins}-${t.losses}\n${t.ortg.toFixed(1)} offensive rating · ${t.drtg.toFixed(1)} defensive rating · ${t.games} games`,
        )
      columns.forEach((c, j) => {
        const v = t[c.key]
        const l = len(Math.abs(v))
        const a = v >= 0 ? center(j) + half : center(j) - half - l
        const bh = Math.max(3, Math.min(rowH * 0.55, 12))
        row
          .append("rect")
          .attr("x", a)
          .attr("y", cy - bh / 2)
          .attr("width", Math.max(l, 0.5))
          .attr("height", bh)
          .attr("fill", v >= 0 ? color.pos : color.neg)
        row
          .append("text")
          .attr("x", center(j))
          .attr("y", cy + fs * 0.35)
          .attr("text-anchor", "middle")
          .attr("font-size", fs)
          .attr("font-weight", c.key === sortKey ? 600 : 500)
          .attr("fill", c.key === sortKey ? color.ink : color.muted)
          .text(signed(v))
      })
      marks.push({
        key: `row:${t.abbrev}`,
        x: colX(3) - 6,
        y: cy,
        r: rowH / 2,
        label: `${t.name} · ${signed(t.net)} net`,
      })
    })

    // the strip: logos at their value in the sorted column, on a true
    // scale, so tiers and gaps show
    const sx0 = W - stripW
    const values = ts.map(t => t[sortKey])
    const lo = Math.min(0, ...values)
    const hi = Math.max(0, ...values)
    const size2 = Math.max(10, Math.min(20, rowH))
    const sy = scaleLinear()
      .domain([lo, hi])
      .nice()
      .range([rowY(ts.length) - size2 / 2, head + size2 / 2])
    const strip = g.append("g")
    strip
      .append("text")
      .attr("x", sx0 + stripW / 2)
      .attr("y", head - 10)
      .attr("text-anchor", "middle")
      .call(agate)
      .attr("fill", color.ink)
      .text(`${columns.find(c => c.key === sortKey)!.label}, to scale`)
    const ticks = sy.ticks(5)
    for (const v of ticks) {
      strip
        .append("line")
        .attr("x1", sx0 + 30)
        .attr("x2", W)
        .attr("y1", sy(v))
        .attr("y2", sy(v))
        .attr("stroke", v === 0 ? color.zero : color.grid)
        .attr("stroke-width", v === 0 ? 1.5 : 1)
      strip
        .append("text")
        .attr("x", sx0 + 24)
        .attr("y", sy(v) + 4)
        .attr("text-anchor", "end")
        .attr("font-size", type.tick.size - 2)
        .attr("fill", color.muted)
        .text(v === 0 ? "avg" : signed(v).replace(".0", ""))
    }
    // nudge colliding logos sideways, nearest the middle first
    const mid = sx0 + 30 + (stripW - 30) / 2
    const placed: { x: number; y: number }[] = []
    for (const t of ts) {
      const y = sy(t[sortKey])
      let x = mid
      for (let k = 0; k < 40; k++) {
        const off = Math.ceil(k / 2) * (size2 * 0.55) * (k % 2 ? 1 : -1)
        x = mid + off
        if (
          !placed.some(
            q => Math.abs(q.x - x) < size2 && Math.abs(q.y - y) < size2,
          )
        )
          break
      }
      placed.push({ x, y })
      strip
        .append("image")
        .attr("href", logoUrl(t.abbrev))
        .attr("x", x - size2 / 2)
        .attr("y", y - size2 / 2)
        .attr("width", size2)
        .attr("height", size2)
        .append("title")
        .text(`${t.name} ${signed(t[sortKey])}`)
      marks.push({
        key: t.abbrev,
        x,
        y,
        r: size2 / 2,
        label: `${t.abbrev} ${signed(t[sortKey])}`,
      })
    }

    if (!ts.length)
      g.append("text")
        .attr("x", W / 2)
        .attr("y", head + 40)
        .attr("text-anchor", "middle")
        .attr("fill", color.muted)
        .attr("font-family", font.head)
        .text("No games yet")

    return {
      height,
      marks,
      // a note's position: where it is in the body, as fractions, so it
      // keeps its place at every export size
      invert(px, py) {
        if (px < 0 || px > W || py < 0 || py > height) return undefined
        return { fx: +(px / W).toFixed(4), fy: +(py / height).toFixed(4) }
      },
      project(pos) {
        const { fx, fy } = pos as { fx: number; fy: number }
        return [fx * W, fy * height]
      },
    }
  },
}
