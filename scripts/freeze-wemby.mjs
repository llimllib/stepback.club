// Freeze the data for the note on Wembanyama's game against Dallas on
// 2026-11-04 (src/notes/2026-11-05-wembanyama.md): reads the published
// bucket once and writes src/notes/2026-11-05-wembanyama.json, so the note
// shows what it showed when it was written, whatever ESPN revises later.
//
//   NODE_USE_ENV_PROXY=1 node scripts/freeze-wemby.mjs   # in the sandbox
//   node scripts/freeze-wemby.mjs
import fs from "node:fs"
import { asyncBufferFromUrl, cachedAsyncBuffer, parquetRead } from "hyparquet"
import { compressors } from "hyparquet-compressors"

const OUT = "src/notes/2026-11-05-wembanyama.json"
const STAR = { game: "0022600184", player: "1641705", season: 2027 }
const seasons = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]
// the cloud's bins, in net points
const BIN = { o: 0.25, d: 0.1 }
// player_details' action types that add up to its total; the rest overlap
// them (rim, dunk, and 2ptShooting are all 2pt). The small ones are summed
// as "other"
const PARTS = ["2pt", "3pt", "freethrow", "foul", "rebound", "turnover"]
const OTHER = ["period", "stoppage", "timeout", "jumpball", "violation"]

const url = (source, dataset, season) =>
  `https://basketball-data.billmill.org/nba/${source}/${dataset}/season=${season}/data.parquet`

async function read(source, dataset, season, columns) {
  const file = cachedAsyncBuffer(
    await asyncBufferFromUrl({ url: url(source, dataset, season) }),
  )
  return new Promise((resolve, reject) =>
    parquetRead({
      file,
      columns,
      compressors,
      rowFormat: "object",
      onComplete: resolve,
    }).catch(reject),
  )
}

const games = []
const named = new Map()
// a player-game's per-category defense and offense, keyed by category
const parts = new Map([...PARTS, "other"].map(k => [k, { o: [], d: [] }]))
let star
let starParts

for (const season of seasons) {
  console.error(`season ${season}`)
  const [box, people, teams, sched, details] = await Promise.all([
    read("espn", "player_box", season, [
      "game_id",
      "player_id",
      "team_id",
      "played",
      "seconds_played",
      "pts",
      "reb",
      "ast",
      "blk",
      "stl",
      "tov",
      "fgm",
      "fga",
      "fg3m",
      "fg3a",
      "ftm",
      "fta",
      "plus_minus",
      "o_net_pts",
      "d_net_pts",
    ]),
    read("stats", "player_seasons", season, ["player_id", "name"]),
    read("stats", "team_seasons", season, ["team_id", "nba_abbrev"]),
    read("stats", "games", season, [
      "game_id",
      "game_date",
      "home_team_id",
      "away_team_id",
    ]),
    read("espn", "player_details", season, [
      "game_id",
      "player_id",
      "action_type",
      "o_net_pts",
      "d_net_pts",
    ]),
  ])
  const names = new Map(people.map(p => [p.player_id, p.name]))
  const abbrevs = new Map(teams.map(t => [t.team_id, t.nba_abbrev]))
  const byGame = new Map(sched.map(g => [g.game_id, g]))
  const played = new Set()
  for (const b of box) {
    if (!b.played) continue
    const key = `${b.player_id}:${b.game_id}`
    played.add(key)
    const g = byGame.get(b.game_id)
    const opp =
      b.team_id === g?.home_team_id ? g?.away_team_id : g?.home_team_id
    const game = {
      key,
      name: names.get(b.player_id) ?? b.player_id,
      date: g?.game_date.toISOString().slice(0, 10),
      team: abbrevs.get(b.team_id) ?? "",
      opp: abbrevs.get(opp) ?? "",
      pts: b.pts,
      reb: b.reb,
      blk: b.blk,
      o: b.o_net_pts,
      d: b.d_net_pts,
    }
    games.push(game)
    if (b.game_id === STAR.game && b.player_id === STAR.player)
      star = {
        ...game,
        ast: b.ast,
        stl: b.stl,
        tov: b.tov,
        fgm: b.fgm,
        fga: b.fga,
        fg3m: b.fg3m,
        fg3a: b.fg3a,
        ftm: b.ftm,
        fta: b.fta,
        min: Math.round(b.seconds_played / 60),
        plus_minus: b.plus_minus,
      }
  }

  // each player-game's categories, summed over the small ones
  const sums = new Map()
  for (const r of details) {
    const k = PARTS.includes(r.action_type)
      ? r.action_type
      : OTHER.includes(r.action_type)
        ? "other"
        : undefined
    if (!k) continue
    const key = `${r.player_id}:${r.game_id}`
    if (!played.has(key)) continue
    let s = sums.get(key)
    if (!s) sums.set(key, (s = {}))
    s[k] ??= { o: 0, d: 0 }
    s[k].o += r.o_net_pts ?? 0
    s[k].d += r.d_net_pts ?? 0
  }
  for (const [key, s] of sums) {
    for (const [k, v] of parts) {
      v.o.push(s[k]?.o ?? 0)
      v.d.push(s[k]?.d ?? 0)
    }
    if (key === `${STAR.player}:${STAR.game}`) starParts = s
  }
}
if (!star || !starParts) throw new Error("Wembanyama's game isn't in the data")

// a value's rank among all: 1 + how many are greater
const rank = (vs, v) => 1 + vs.filter(x => x > v + 1e-9).length
const os = games.map(g => g.o)
const ds = games.map(g => g.d)
const nets = games.map(g => g.o + g.d)
const rest = games.filter(g => g.key !== star.key)
const top = (f, n) => [...rest].sort((a, b) => f(b) - f(a)).slice(0, n)
// the best nights in net points, which are scorers'; the best on defense,
// which are big men's; and the nearest to the star at both
for (const pick of [
  ...top(g => g.o + g.d, 4),
  ...top(g => g.d, 2),
  ...top(g => Math.min(g.o / star.o, g.d / star.d), 2),
])
  named.set(pick.key, pick)

const cloud = new Map()
for (const g of games) {
  const k = `${Math.floor(g.o / BIN.o)},${Math.floor(g.d / BIN.d)}`
  cloud.set(k, (cloud.get(k) ?? 0) + 1)
}

const round = v => Math.round(v * 100) / 100
const out = {
  frozen: new Date().toISOString().slice(0, 10),
  games: games.length,
  star: { ...star, o: round(star.o), d: round(star.d) },
  ranks: {
    o: rank(os, star.o),
    d: rank(ds, star.d),
    net: rank(nets, star.o + star.d),
    // games at or beyond the star's offense and defense both, his own
    // included
    both: games.filter(g => g.o >= star.o && g.d >= star.d).length,
    pts: rank(
      games.map(g => g.pts),
      star.pts,
    ),
    // games with at least his points and rebounds, and with at least his
    // blocks
    ptsReb: games.filter(g => g.pts >= star.pts && g.reb >= star.reb).length,
    blk: games.filter(g => g.blk >= star.blk).length,
  },
  // his net points by category, with his rank in each among all games
  parts: [...PARTS, "other"].map(k => ({
    kind: k,
    o: round(starParts[k]?.o ?? 0),
    d: round(starParts[k]?.d ?? 0),
    oRank: rank(parts.get(k).o, starParts[k]?.o ?? 0),
    dRank: rank(parts.get(k).d, starParts[k]?.d ?? 0),
  })),
  named: [...named.values()].map(g => ({ ...g, o: round(g.o), d: round(g.d) })),
  bin: BIN,
  // [o bin, d bin, count]: a bin covers o from o bin × BIN.o up one BIN.o
  cloud: [...cloud].map(([k, n]) => [...k.split(",").map(Number), n]),
}
fs.writeFileSync(OUT, JSON.stringify(out) + "\n")
console.error(
  `${OUT}: ${games.length} games, ${cloud.size} bins, ${fs.statSync(OUT).size} bytes`,
)
