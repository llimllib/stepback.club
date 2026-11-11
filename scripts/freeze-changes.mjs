// Freeze the data for the note on players whose game changed from 2025–26
// to the start of 2026–27 (src/notes/2026-11-11-changes.md): reads the
// published bucket once and writes src/notes/2026-11-11-changes.json.
//
//   NODE_USE_ENV_PROXY=1 node scripts/freeze-changes.mjs   # in the sandbox
//   node scripts/freeze-changes.mjs
//
// Every stat is summed from the regular season's player game logs, plus
// shots from 4 feet or closer from the play-by-play, so this season's value
// can be resampled by game for its noise. Usage is the NBA's: each game's
// usg_pct gives the team's plays while the player was on, plays / usg_pct,
// and a season's usage is its plays over those.
import fs from "node:fs"
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

const OUT = "src/notes/2026-11-11-changes.json"
const BEFORE = 2026
const NOW = 2027
// who qualifies: minutes last season and this
const MIN = { before: 800, now: 150 }
const RIM_FEET = 4
const BOOTS = 2000

// the panels, in order: a player and the stat that changed
const PANELS = [
  ["Franz Wagner", "ast100"],
  ["Desmond Bane", "fg3share"],
  ["Jalen Green", "fg3a100"],
  ["Stephen Curry", "fta100"],
  ["Stephon Castle", "ftr"],
  ["Jaylen Brown", "usg"],
  ["Victor Wembanyama", "rim100"],
  ["Ausar Thompson", "dreb100"],
  ["Draymond Green", "fga100"],
]
// usage against efficiency, for the note's second part
const EFFICIENCY = [
  "Jrue Holiday",
  "Kentavious Caldwell-Pope",
  "De'Aaron Fox",
  "Jaylen Wells",
  "Rui Hachimura",
  "Kel'el Ware",
  "Brandon Miller",
  "Paul George",
  "Brook Lopez",
  "Duncan Robinson",
  "Joel Embiid",
  "Shai Gilgeous-Alexander",
]

// each stat from a season's summed counts, its label, and its unit
const per100 = k => s => (s[k] / s.poss) * 100
const STATS = {
  usg: { f: s => (s.plays / s.team_plays) * 100, label: "Usage", unit: "%" },
  ts: {
    f: s => (s.pts / (2 * (s.fga + 0.44 * s.fta))) * 100,
    label: "True shooting",
    unit: "%",
  },
  pts100: { f: per100("pts"), label: "Points per 100 possessions" },
  ast100: { f: per100("ast"), label: "Assists per 100 possessions" },
  tov100: { f: per100("tov"), label: "Turnovers per 100 possessions" },
  tovshare: {
    f: s => (s.tov / s.plays) * 100,
    label: "Turnovers, share of his plays",
    unit: "%",
  },
  fga100: { f: per100("fga"), label: "Shots per 100 possessions" },
  fg3a100: { f: per100("fg3a"), label: "Threes per 100 possessions" },
  fg3share: {
    f: s => (s.fg3a / s.fga) * 100,
    label: "Threes, share of his shots",
    unit: "%",
  },
  fg3pct: { f: s => (s.fg3m / s.fg3a) * 100, label: "3-pt %", unit: "%" },
  rim100: {
    f: per100("rim_fga"),
    label: `Shots from ${RIM_FEET} ft or closer per 100 possessions`,
  },
  rimpct: {
    f: s => (s.rim_fgm / s.rim_fga) * 100,
    label: `FG% from ${RIM_FEET} ft or closer`,
    unit: "%",
  },
  fta100: { f: per100("fta"), label: "Free throws per 100 possessions" },
  ftr: {
    f: s => (s.fta / s.fga) * 100,
    label: "Free throws per 100 shots",
  },
  ftpct: { f: s => (s.ftm / s.fta) * 100, label: "FT %", unit: "%" },
  oreb100: { f: per100("oreb"), label: "Off. rebounds per 100 possessions" },
  dreb100: { f: per100("dreb"), label: "Def. rebounds per 100 possessions" },
  stl100: { f: per100("stl"), label: "Steals per 100 possessions" },
  blk100: { f: per100("blk"), label: "Blocks per 100 possessions" },
  pfd100: { f: per100("pfd"), label: "Fouls drawn per 100 possessions" },
  mpg: { f: s => s.min / s.gp, label: "Minutes per game" },
}

const COUNTS = [
  "min",
  "poss",
  "pts",
  "fgm",
  "fga",
  "fg3m",
  "fg3a",
  "ftm",
  "fta",
  "oreb",
  "dreb",
  "ast",
  "tov",
  "stl",
  "blk",
  "pfd",
]

const url = path => `https://basketball-data.billmill.org/${path}`
const nba = (dataset, season) =>
  `nba/stats/${dataset}/season=${season}/data.parquet`
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

// each player's regular-season games in a season, with their rim shots
async function seasonGames(n) {
  const [logs, events] = await Promise.all([
    read(nba("player_game_logs", n), [
      "game_id",
      "game_date",
      "player_id",
      "team_id",
      "usg_pct",
      ...COUNTS,
    ]),
    read(nba("game_events", n), [
      "game_id",
      "person_id",
      "is_field_goal",
      "shot_value",
      "shot_distance",
      "shot_result",
    ]),
  ])
  // twos only: about 7% of threes, mostly from the corners, have a
  // shot_distance of 0 (their description gives no feet), though their x
  // and y put them 22 feet out. A two's distance agrees with its x and y
  const rim = new Map()
  for (const e of events) {
    if (
      !e.is_field_goal ||
      e.shot_value !== 2 ||
      e.shot_distance > RIM_FEET ||
      !e.person_id
    )
      continue
    const k = `${e.game_id}|${e.person_id}`
    const r = rim.get(k) ?? rim.set(k, { a: 0, m: 0 }).get(k)
    r.a++
    if (e.shot_result === "Made") r.m++
  }
  const games = new Map()
  for (const g of logs) {
    if (!g.game_id.startsWith("002")) continue
    const r = rim.get(`${g.game_id}|${g.player_id}`) ?? { a: 0, m: 0 }
    const plays = g.fga + 0.44 * g.fta + g.tov
    const row = {
      ...Object.fromEntries(COUNTS.map(k => [k, g[k] ?? 0])),
      date: new Date(g.game_date).toISOString().slice(0, 10),
      team_id: g.team_id,
      gp: 1,
      rim_fga: r.a,
      rim_fgm: r.m,
      // a game with no plays, or no usage, adds nothing to either
      plays: g.usg_pct > 0 ? plays : 0,
      team_plays: g.usg_pct > 0 ? plays / g.usg_pct : 0,
    }
    const list =
      games.get(g.player_id) ?? games.set(g.player_id, []).get(g.player_id)
    list.push(row)
  }
  for (const list of games.values())
    list.sort((a, b) => (a.date < b.date ? -1 : 1))
  return games
}

const KEYS = [...COUNTS, "gp", "rim_fga", "rim_fgm", "plays", "team_plays"]
const sum = games => {
  const s = Object.fromEntries(KEYS.map(k => [k, 0]))
  for (const g of games) for (const k of KEYS) s[k] += g[k]
  return s
}
const values = s =>
  Object.fromEntries(
    Object.entries(STATS).map(([k, { f }]) => {
      const v = f(s)
      return [k, Number.isFinite(v) ? +v.toFixed(2) : null]
    }),
  )

// a seeded generator, so a rerun on the same data gives the same noise
let seed = 20261111
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
// the standard error of each stat this season, from resampling his games
function noise(games) {
  const draws = Object.fromEntries(Object.keys(STATS).map(k => [k, []]))
  for (let b = 0; b < BOOTS; b++) {
    const s = sum(games.map(() => games[Math.floor(random() * games.length)]))
    for (const [k, { f }] of Object.entries(STATS)) {
      const v = f(s)
      if (Number.isFinite(v)) draws[k].push(v)
    }
  }
  return Object.fromEntries(
    Object.entries(draws).map(([k, vs]) => {
      if (vs.length < BOOTS / 2) return [k, null]
      const mean = vs.reduce((a, b) => a + b, 0) / vs.length
      const sd = Math.sqrt(
        vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length,
      )
      return [k, +sd.toFixed(2)]
    }),
  )
}

const [before, now, people, teams] = await Promise.all([
  seasonGames(BEFORE),
  seasonGames(NOW),
  read(nba("player_seasons", NOW), ["player_id", "name"]),
  read(nba("team_seasons", NOW), ["team_id", "nba_abbrev"]),
])
const nameOf = new Map(people.map(p => [p.player_id, p.name]))
const abbrev = new Map(teams.map(t => [t.team_id, t.nba_abbrev]))
const idOf = new Map(people.map(p => [p.name, p.player_id]))

const players = []
for (const [id, games] of now) {
  const old = before.get(id)
  if (!old) continue
  const s0 = sum(old)
  const s1 = sum(games)
  if (s0.min < MIN.before || s1.min < MIN.now) continue
  players.push({
    id,
    name: nameOf.get(id) ?? id,
    // their team at the end of last season, and now
    teams: [abbrev.get(old.at(-1).team_id), abbrev.get(games.at(-1).team_id)],
    gp: [s0.gp, s1.gp],
    min: [Math.round(s0.min), Math.round(s1.min)],
    before: values(s0),
    now: values(s1),
    games,
  })
}

// how much each stat usually changed among the qualifiers: half the spread
// of the middle 68%, a standard deviation that ignores the wild few
const typical = {}
for (const k of Object.keys(STATS)) {
  const ds = players
    .map(p => p.now[k] - p.before[k])
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const q = f => ds[Math.floor(f * (ds.length - 1))]
  typical[k] = +((q(0.84) - q(0.16)) / 2).toFixed(2)
}
// where a player's change ranks among the qualifiers, by size, with its
// sign: 1 is the biggest rise, -1 the biggest fall
function rank(p, k) {
  const d = p.now[k] - p.before[k]
  const same = players
    .map(q => q.now[k] - q.before[k])
    .filter(v => Number.isFinite(v) && Math.sign(v) === Math.sign(d))
  return Math.sign(d) * (same.filter(v => Math.abs(v) > Math.abs(d)).length + 1)
}

const byName = new Map(players.map(p => [p.name, p]))
const find = name => {
  const p = byName.get(name)
  if (!p) throw new Error(`${name} doesn't qualify (id ${idOf.get(name)})`)
  return p
}

// everything about a player that the prose might use
function facts(p) {
  const se = noise(p.games)
  const changes = Object.fromEntries(
    Object.keys(STATS).map(k => {
      const d = p.now[k] - p.before[k]
      return [
        k,
        {
          before: p.before[k],
          now: p.now[k],
          se: se[k],
          // the change in standard errors of this season's value, and in
          // the qualifiers' typical changes
          noise_z: se[k] ? +(d / se[k]).toFixed(1) : null,
          typical_z: +(d / typical[k]).toFixed(1),
          rank: Number.isFinite(d) ? rank(p, k) : null,
        },
      ]
    }),
  )
  return {
    id: p.id,
    name: p.name,
    teams: p.teams,
    gp: p.gp,
    min: p.min,
    stats: changes,
  }
}

const panels = PANELS.map(([name, stat]) => {
  const p = find(name)
  const f = facts(p)
  return { ...f, stat }
})
const efficiency = EFFICIENCY.map(name => facts(find(name)))

// the league behind each panel: every qualifier's value this season
const league = Object.fromEntries(
  [...new Set(PANELS.map(([, k]) => k))].map(k => [
    k,
    players.map(p => p.now[k]).filter(Number.isFinite),
  ]),
)

const through = [...now.values()]
  .flat()
  .map(g => g.date)
  .sort()
  .at(-1)

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      frozen: new Date().toISOString().slice(0, 10),
      through,
      seasons: [BEFORE, NOW],
      qualify: MIN,
      qualifiers: players.length,
      rimFeet: RIM_FEET,
      stats: Object.fromEntries(
        Object.entries(STATS).map(([k, s]) => [
          k,
          { label: s.label, unit: s.unit ?? "" },
        ]),
      ),
      typical,
      league,
      panels,
      efficiency,
    },
    null,
    1,
  ),
)
console.error(`${players.length} players, through ${through}: ${OUT}`)
