// Freeze the data for the note on five ways to rate a team
// (src/notes/2026-11-12-five-ways.md): reads the published bucket once and
// writes src/notes/2026-11-12-five-ways.json.
//
//   NODE_USE_ENV_PROXY=1 node scripts/freeze-fiveways.mjs   # in the sandbox
//   node scripts/freeze-fiveways.mjs
//
// Each source's ratings are worked out as the efficiency tool's are
// (src/tools/efficiency.ts), for the regular season, the whole season: a
// team's offense and defense are its points scored and allowed per 100
// possessions against the plain mean of the teams' ratings, and net is
// their sum
import fs from "node:fs"
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

const OUT = "src/notes/2026-11-12-five-ways.json"
const SEASON = 2027

const url = path => `https://basketball-data.billmill.org/${path}`
const at = (root, dataset) => `${root}/${dataset}/season=${SEASON}/data.parquet`
// a fetch that tries again when a request fails, as the sandbox's proxy
// sometimes does under hyparquet's burst of range requests
async function patient(input, init, tries = 6) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(input, init)
      if (res.status < 500 || i === tries) return res
    } catch (e) {
      if (i === tries) throw e
    }
    await new Promise(r => setTimeout(r, 500 * 2 ** i))
  }
}
async function read(path, columns) {
  const file = await asyncBufferFromUrl({ url: url(path), fetch: patient })
  return parquetReadObjects({ file, columns, compressors })
}
const maxDate = rows =>
  rows.reduce((m, r) => (r.as_of_date > m ? r.as_of_date : m), new Date(0))
const day = d => d.toISOString().slice(0, 10)

// NBA.com: the regular season's games, summed
async function nba() {
  const [logs, games] = await Promise.all([
    read(at("nba/stats", "team_game_logs"), [
      "game_id",
      "team_id",
      "game_date",
      "pts",
      "plus_minus",
      "poss",
    ]),
    read(at("nba/stats", "games"), ["game_id", "game_type"]),
  ])
  const type = new Map(games.map(g => [g.game_id, g.game_type]))
  const by = new Map()
  let through = new Date(0)
  for (const r of logs) {
    if (type.get(r.game_id) !== "regular_season" || !(r.poss > 0)) continue
    const t = by.get(r.team_id) ?? { pts: 0, allowed: 0, poss: 0 }
    t.pts += r.pts
    t.allowed += r.pts - r.plus_minus
    t.poss += r.poss
    by.set(r.team_id, t)
    if (r.game_date > through) through = r.game_date
  }
  const rows = [...by].map(([team_id, t]) => ({
    team_id,
    ortg: (100 * t.pts) / t.poss,
    drtg: (100 * t.allowed) / t.poss,
  }))
  return { rows, through }
}

async function ctg() {
  const rows = await read(at("nba/ctg", "ctg_team_summary"), [
    "team_id",
    "season_type",
    "as_of_date",
    "off_rtg",
    "def_rtg",
  ])
  const mine = rows.filter(
    r => r.season_type === "regular_season" && r.off_rtg != null,
  )
  return {
    rows: mine.map(r => ({
      team_id: r.team_id,
      ortg: r.off_rtg,
      drtg: r.def_rtg,
    })),
    through: maxDate(mine),
  }
}

// yarapm's latest day, at full strength or with the expected lineup
async function rapm(full) {
  const rows = await read(at("yarapm", "team_ratings_daily"), [
    "as_of_date",
    "team_id",
    "off",
    "def",
    "full_off",
    "full_def",
    "league_average",
  ])
  const through = maxDate(rows)
  return {
    rows: rows
      .filter(r => +r.as_of_date === +through)
      .map(r => {
        const [off, def] = full ? [r.full_off, r.full_def] : [r.off, r.def]
        return {
          team_id: r.team_id,
          ortg: r.league_average + off,
          drtg: r.league_average - def,
        }
      }),
    through,
  }
}

// dunksandthrees' team EPM, on the NBA.com scale
async function epm(league) {
  const rows = await read(at("nba/dunksandthrees", "team_epm"), [
    "as_of_date",
    "team_id",
    "o_epm",
    "d_epm",
  ])
  return {
    rows: rows.map(r => ({
      team_id: r.team_id,
      ortg: league + r.o_epm,
      drtg: league - r.d_epm,
    })),
    through: maxDate(rows),
  }
}

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length

const [teams, nbaRatings, ctgRatings, full, expected] = await Promise.all([
  read(at("nba/stats", "team_seasons"), ["team_id", "nba_abbrev"]),
  nba(),
  ctg(),
  rapm(true),
  rapm(false),
])
const league = mean(nbaRatings.rows.map(r => (r.ortg + r.drtg) / 2))
const epmRatings = await epm(league)
const abbrev = new Map(teams.map(t => [t.team_id, t.nba_abbrev]))

const SOURCES = [
  ["nba", "NBA.com", nbaRatings],
  ["ctg", "Cleaning the Glass", ctgRatings],
  ["rapm", "RAPM, full strength", full],
  ["rapm_today", "RAPM, expected lineup", expected],
  ["epm", "EPM, Dunks & Threes", epmRatings],
]

const r1 = v => Math.round(v * 10) / 10
const sources = SOURCES.map(([id, label, { rows, through }]) => {
  const avg = mean(rows.map(r => (r.ortg + r.drtg) / 2))
  return {
    id,
    label,
    through: day(through),
    avg: r1(avg),
    teams: rows
      .filter(r => abbrev.has(r.team_id) && Number.isFinite(r.ortg))
      .map(r => ({
        team: abbrev.get(r.team_id),
        net: r1(r.ortg - r.drtg),
        off: r1(r.ortg - avg),
        def: r1(avg - r.drtg),
      }))
      .sort((a, b) => b.net - a.net),
  }
})

fs.writeFileSync(
  OUT,
  JSON.stringify(
    { frozen: day(new Date()), season: SEASON, sources },
    null,
    1,
  ) + "\n",
)
for (const s of sources)
  console.log(s.id, s.through, s.teams.length, s.teams[0], s.avg)
