// Four factors: Dean Oliver's four, every team in each, as four scatters in
// a 2×2 grid, each a team's own rate against its opponents'. Picking a team
// puts it in color and the rest in gray. The four are Team charts' pairs;
// see docs/plans/2026-11-17-four-factors-design.md
import { max, select, sum } from "d3"
import { metadata, read } from "../kit/data"
import { agate, cityAndName, logoUrl } from "../kit/frame"
import { placeLogos } from "../kit/labels"
import { scatterPlot, sign } from "../kit/scatter"
import { teams } from "../kit/teams"
import { color, font } from "../kit/theme"
import type { Body, LegendItem, Mark, Tool } from "../kit/tool"
import {
  factorStats as stats,
  factors,
  loadLogs,
  margin as factorMargin,
  type Totals,
} from "./team-logs"

// season 0 is the latest season the data has; load resolves it. `last` is
// "" for the whole season, or each team's last n games; `team` is the one
// in color, or "" for all of them
const defaults = {
  season: 0,
  team: "",
  playoffs: false,
  last: "",
}
type P = typeof defaults

// the panels, in Oliver's order, and how each writes a team's margin
const panels: {
  id: keyof typeof factors
  title: string
  margin: (c: number) => string
}[] = [
  {
    id: "efg",
    title: "Shooting",
    margin: c => `${sign(c)}${Math.abs(c * 100).toFixed(1)} eFG%`,
  },
  {
    id: "tov-both",
    title: "Turnovers",
    margin: c => `${sign(c)}${Math.abs(c).toFixed(1)} TOV/100`,
  },
  {
    id: "rebounding",
    title: "Offensive rebounding",
    margin: c => `${sign(c)}${Math.abs(c * 100).toFixed(1)} OREB%`,
  },
  {
    id: "ft-rate",
    title: "Free throws",
    margin: c => `${sign(c)}${Math.abs(c).toFixed(3)} FTM/FGA`,
  },
]
type PanelId = (typeof panels)[number]["id"]

interface Team {
  abbrev: string
  name: string
  games: number
  // each panel's x and y
  at: Record<PanelId, { x: number; y: number }>
  // each panel's margin, higher better, and its rank among the teams, 1 the best
  margin: Record<PanelId, number>
  rank: Record<PanelId, number>
}

interface D {
  season: number
  seasons: number[]
  latest: number
  playoffs: boolean
  hasPlayoffs: boolean
  last: string
  windows: { value: string; label: string }[]
  teams: Team[]
  league: Record<PanelId, { x: number; y: number }>
  through?: Date
}

const fmtSeason = (s: number) => `${s - 1}–${String(s).slice(2)}`
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st
const ordinal = (n: number) => {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}
// "The Celtics'", "The Jazz's"
const possessive = (full: string) => {
  const { name } = cityAndName(full)
  return `The ${name}${name.endsWith("s") ? "'" : "'s"}`
}

const point = (id: PanelId, t: Totals) => ({
  x: stats[factors[id].x].get(t),
  y: stats[factors[id].y].get(t),
})

// the filter that grays the teams the chart isn't about
const grayId = "fourfactors-gray"

export const fourFactors: Tool<P, D> = {
  id: "fourfactors",
  name: "Four factors",
  defaults,
  wide: true,
  sizes: ["landscape", "bigSquare", "column"],

  async load(p) {
    const meta = await metadata()
    const { first_season, last_season } = meta.team_game_logs
    const season = Math.min(
      last_season,
      Math.max(first_season, p.season || last_season),
    )
    const [loaded, names] = await Promise.all([
      loadLogs(season, p),
      read("stats", "team_seasons", season, [
        "team_id",
        "nba_abbrev",
        "full_name",
      ]),
    ])
    const byId = new Map(names.map(t => [t.team_id, t]))
    const shown: Team[] = []
    for (const [team_id, t] of loaded.totals) {
      const info = byId.get(team_id)
      if (!info) continue
      const at = {} as Team["at"]
      const margin = {} as Team["margin"]
      for (const { id } of panels) {
        at[id] = point(id, t)
        margin[id] = factorMargin(factors[id], at[id].x, at[id].y)
      }
      if (Object.values(margin).some(m => !isFinite(m))) continue
      shown.push({
        abbrev: info.nba_abbrev,
        name: info.full_name,
        games: t.games,
        at,
        margin,
        rank: {} as Team["rank"],
      })
    }
    for (const { id } of panels)
      [...shown]
        .sort((a, b) => b.margin[id] - a.margin[id])
        .forEach((t, i) => (t.rank[id] = i + 1))

    // the league's averages, from its totals
    const all = [...loaded.totals.values()]
    const totals: Totals = {}
    for (const k of Object.keys(all[0] ?? {})) totals[k] = sum(all, t => t[k])
    const league = {} as D["league"]
    for (const { id } of panels)
      league[id] = all.length ? point(id, totals) : { x: 0, y: 0 }

    const seasons = []
    for (let s = last_season; s >= first_season; s--) seasons.push(s)
    return {
      season,
      seasons,
      latest: last_season,
      playoffs: loaded.playoffs,
      hasPlayoffs: loaded.hasPlayoffs,
      last: loaded.last,
      windows: loaded.windows,
      teams: shown,
      league,
      through: loaded.through,
    }
  },

  normalize(d, p) {
    return {
      ...p,
      season: d.season,
      playoffs: d.playoffs,
      last: d.last,
      team: d.teams.some(t => t.abbrev === p.team) ? p.team : "",
    }
  },

  controls(d) {
    return [
      {
        key: "season",
        label: "Season",
        kind: "select",
        options: d.seasons.map(s => ({ value: s, label: fmtSeason(s) })),
      },
      {
        key: "team",
        label: "Team",
        kind: "select",
        options: [
          { value: "", label: "All teams" },
          ...[...d.teams]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(t => ({ value: t.abbrev, label: t.name })),
        ],
      },
      ...(d.hasPlayoffs
        ? [{ key: "playoffs", label: "Playoffs", kind: "toggle" as const }]
        : []),
      ...(d.windows.length > 1
        ? [
            {
              key: "last",
              label: "Games",
              kind: "steps" as const,
              options: d.windows,
            },
          ]
        : []),
    ]
  },

  describe(d, p) {
    const picked = d.teams.find(t => t.abbrev === p.team)
    const kind = d.playoffs ? "playoffs" : "regular season"
    const span = !d.last
      ? `in the ${fmtSeason(d.season)} ${kind}`
      : `over each team's last ${d.last} games of the ${fmtSeason(d.season)} ${kind}`
    // a past season's last date is the end of the season, which says nothing
    const through =
      d.season === d.latest && d.through
        ? `, through ${fmtDate(d.through)}`
        : ""
    const [fill] = picked ? (teams.get(picked.abbrev)?.colors ?? []) : []
    const legend: LegendItem[] = [
      ...(picked
        ? [
            {
              symbol: "dot" as const,
              color: fill ?? color.ink,
              text: `${cityAndName(picked.name).name} in color`,
            },
          ]
        : []),
      { symbol: "dash", color: color.muted, text: "league average" },
      {
        symbol: "line",
        color: color.faint,
        text: "diagonals: the team's margin",
      },
    ]
    const most = max(d.teams, t => t.games) ?? 0
    return {
      title: picked
        ? `${possessive(picked.name)} four factors`
        : "Four factors",
      context: `Dean Oliver's four factors, each team's own rate against its opponents', ${span}${through}`,
      legend,
      counts: `${most} games`,
      source: "Data: NBA.com",
      team: picked?.abbrev,
    }
  },

  render(node, d, p, size): Body {
    const g = select(node)
    const picked = d.teams.find(t => t.abbrev === p.team)
    // the picked team goes last, so it's drawn on top
    const order = picked
      ? [...d.teams.filter(t => t !== picked), picked]
      : d.teams

    g.append("defs")
      .append("filter")
      .attr("id", grayId)
      .attr("color-interpolation-filters", "sRGB")
      .append("feColorMatrix")
      .attr("type", "saturate")
      .attr("values", 0)

    // two columns, or one on a phone; a fixed height is shared by the rows
    const cols = size.width >= 900 ? 2 : 1
    const rows = panels.length / cols
    const gapX = 44
    const gapY = 28
    const titleH = 30
    const panelW = (size.width - gapX * (cols - 1)) / cols
    const panelH =
      size.height && (size.height - gapY * (rows - 1)) / rows - titleH

    const marks: Mark[] = []
    const placed: {
      id: PanelId
      ox: number
      oy: number
      w: number
      h: number
      body: Body
    }[] = []
    let oy = 0
    for (const [i, panel] of panels.entries()) {
      const f = factors[panel.id]
      const [sx, sy] = [stats[f.x], stats[f.y]]
      const ox = (i % cols) * (panelW + gapX)
      if (i % cols === 0 && i > 0) oy += placed[i - 1].h + gapY

      // the panel's name, and the picked team's margin and rank in it
      const head = g.append("g").attr("transform", `translate(${ox},${oy})`)
      head
        .append("text")
        .attr("y", 20)
        .attr("font-family", font.head)
        .attr("font-size", 22)
        .attr("font-weight", 700)
        .style("text-transform", "uppercase")
        .text(panel.title)
      if (picked)
        head
          .append("text")
          .attr("x", panelW)
          .attr("y", 19)
          .attr("text-anchor", "end")
          .call(agate)
          .attr("fill", color.ink)
          .text(
            `${cityAndName(picked.name).name} ${panel.margin(picked.margin[panel.id])}, ${ordinal(picked.rank[panel.id])}`,
          )
      head
        .append("line")
        .attr("x2", panelW)
        .attr("y1", titleH - 2)
        .attr("y2", titleH - 2)
        .attr("stroke", color.ink)

      // logos sized to the plot, which is wider than tall in landscape
      const estW = panelW - 76
      const estH = panelH ? panelH - 68 : estW * 0.82
      const logo = Math.round(
        Math.max(18, Math.min(28, Math.min(estW, estH * 1.6) / 22)),
      )
      const r = 3
      const pg = g
        .append("g")
        .attr("transform", `translate(${ox},${oy + titleH})`)
      const { plot, x, y, plotW, plotH, left, top, height, body } = scatterPlot(
        pg.node()!,
        {
          size: { width: panelW, height: panelH },
          x: {
            title: sx.label,
            pct: sx.pct,
            signed: sx.signed,
            reverse: sx.lower,
          },
          y: {
            title: sy.label,
            pct: sy.pct,
            signed: sy.signed,
            reverse: sy.lower,
          },
          xs: d.teams.map(t => t.at[panel.id].x),
          ys: d.teams.map(t => t.at[panel.id].y),
          league: d.league[panel.id],
          guide: { kind: "diff", name: f.diff },
          corners: f.corners,
          inset: logo / 2,
        },
      )

      const dots = order.map(t => ({
        key: t.abbrev,
        x: x(t.at[panel.id].x),
        y: y(t.at[panel.id].y),
        r,
      }))
      const at = placeLogos(
        dots,
        { width: plotW, height: plotH },
        logo,
        0.4,
        picked?.abbrev,
      )

      // the rest, grayed and faded when a team is picked; then the team
      const rest = plot.append("g")
      if (picked) rest.attr("filter", `url(#${grayId})`).attr("opacity", 0.35)
      const front = plot.append("g")
      for (const [j, t] of order.entries()) {
        const layer = t === picked ? front : rest
        const s = t === picked ? Math.round(logo * 1.35) : logo
        const dot = dots[j]
        const [cx, cy] = at.get(t.abbrev)!
        const [dx, dy] = [dot.x - cx, dot.y - cy]
        // a logo on its value marks it; a moved one leaves a dot there, and
        // a line to it
        if (Math.hypot(dx, dy) > logo / 2) {
          const k = Math.min(
            1,
            ((logo / 2) * 0.8) / Math.abs(dx || 1e-9),
            ((logo / 2) * 0.8) / Math.abs(dy || 1e-9),
          )
          const [fill, stroke] = teams.get(t.abbrev)?.colors ?? []
          layer
            .append("line")
            .attr("x1", dot.x)
            .attr("y1", dot.y)
            .attr("x2", cx + dx * k)
            .attr("y2", cy + dy * k)
            .attr("stroke", color.muted)
          layer
            .append("circle")
            .attr("cx", dot.x)
            .attr("cy", dot.y)
            .attr("r", r)
            .attr("fill", fill ?? color.ink)
            .attr("stroke", stroke ?? color.bg)
        }
        layer
          .append("image")
          .attr("href", logoUrl(t.abbrev))
          .attr("x", cx - s / 2)
          .attr("y", cy - s / 2)
          .attr("width", s)
          .attr("height", s)
          .append("title")
          .text(
            [
              `${t.name} · ${t.games} games`,
              ...panels.map(
                q =>
                  `${q.title} ${q.margin(t.margin[q.id])}, ${ordinal(t.rank[q.id])}`,
              ),
            ].join("\n"),
          )
        marks.push({
          key: `${t.abbrev}-${panel.id}`,
          x: cx + left + ox,
          y: cy + top + oy + titleH,
          r: s / 2,
          label: t.abbrev,
          labelSize: 12.5,
        })
      }

      if (!d.teams.length)
        plot
          .append("text")
          .attr("x", plotW / 2)
          .attr("y", plotH / 2)
          .attr("text-anchor", "middle")
          .attr("fill", color.muted)
          .text("No games yet")

      placed.push({
        id: panel.id,
        ox,
        oy: oy + titleH,
        w: panelW,
        h: height + titleH,
        body: body([]),
      })
    }
    const last = placed.at(-1)!
    const height = last.oy - titleH + last.h

    return {
      height,
      marks,
      // a note's position: its panel, and that panel's two stats
      invert(px, py) {
        for (const q of placed) {
          const pos = q.body.invert(px - q.ox, py - q.oy)
          if (pos) return { panel: q.id, ...(pos as object) }
        }
        return undefined
      },
      project(pos) {
        const { panel } = pos as { panel?: PanelId }
        const q = placed.find(o => o.id === panel)
        const at = q?.body.project(pos)
        return q && at ? [at[0] + q.ox, at[1] + q.oy] : undefined
      },
    }
  },
}
