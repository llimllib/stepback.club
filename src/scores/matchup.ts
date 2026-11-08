// The matchup page: the players a prediction rests on. Each team's
// projected lineup, with each player's expected minutes, chance to play,
// box-score prior and rating, and what he adds to the team's rating. Data
// and plain DOM; the page is src/pages/matchup.astro. Design:
// docs/plans/2026-11-07-predictions-design.md
import { read, readWhere } from "../kit/data"
import { iso } from "./load"
import {
  predictionFor,
  seasonOfGame,
  type PredictedTeam,
  type Prediction,
} from "./predict"

export interface LineupPlayer {
  name: string
  // expected minutes, counting the chance he doesn't play
  min: number
  play: number
  // points per 100 possessions above average: his box-score prior, and his
  // rating, which on-court results move away from it
  prior: number
  rating: number
}

export interface Lineup {
  team: PredictedTeam
  players: LineupPlayer[]
  // the team's rating before it's measured against the average team: its
  // players' ratings weighted by minutes, five on the floor. And the same
  // from their priors alone
  total: number
  fromPriors: number
}

export interface Matchup {
  prediction: Prediction
  lineups: [Lineup, Lineup]
}

// minutes-weighted: what a player adds to a lineup's rating, with five on
// the floor for 48 minutes
const adds = (min: number, v: number) => (min * v) / 48

// A game's matchup: undefined if yarapm doesn't predict it
export async function matchup(game_id: string): Promise<Matchup | undefined> {
  const prediction = await predictionFor(game_id)
  if (!prediction) return undefined
  const season = seasonOfGame(game_id)
  // a player on a roster may not have played this season yet, so last
  // season's names fill in
  const [minutes, names, lastNames] = await Promise.all([
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
  ])
  const rows = minutes.filter(r => r.game_id === game_id && r.min > 0)
  // the build's day's ratings: the file is sorted by player, so only these
  // players' row groups are read
  const ratings = await readWhere(
    "yarapm",
    "ratings_daily",
    season,
    ["player_id", "as_of_date", "o_rating", "d_rating", "o_prior", "d_prior"],
    { player_id: { $in: rows.map(r => r.player_id) } },
  )
  const rating = new Map(
    ratings
      .filter(r => iso(r.as_of_date) === prediction.asOf)
      .map(r => [r.player_id, r]),
  )
  const name = new Map(
    [...lastNames, ...names].map(p => [p.player_id, p.name as string]),
  )

  const lineup = (team: PredictedTeam): Lineup => {
    const players = rows
      .filter(r => r.team_id === team.team_id)
      .map(r => {
        const g = rating.get(r.player_id)
        return {
          name: name.get(r.player_id) ?? r.player_id,
          min: r.min,
          play: r.play_prob,
          prior: g ? g.o_prior + g.d_prior : NaN,
          rating: g ? g.o_rating + g.d_rating : NaN,
        }
      })
      .sort((a, b) => b.min - a.min)
    const sum = (f: (p: LineupPlayer) => number) =>
      players.reduce((t, p) => t + (isNaN(f(p)) ? 0 : adds(p.min, f(p))), 0)
    return {
      team,
      players,
      total: sum(p => p.rating),
      fromPriors: sum(p => p.prior),
    }
  }
  const lineups: [Lineup, Lineup] = [
    lineup(prediction.teams[0]),
    lineup(prediction.teams[1]),
  ]
  return { prediction, lineups }
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
const signed = (v: number) =>
  isNaN(v)
    ? ""
    : Math.abs(v) < 0.05
      ? "0.0"
      : v > 0
        ? `+${v.toFixed(1)}`
        : `−${(-v).toFixed(1)}`

// One team's lineup as a table, the players in order of their minutes, and
// what they add up to: the team's net rating, and what it would be from the
// players' priors alone
export function lineupTable(l: Lineup) {
  // what an average team's lineup adds up to, which the total is measured
  // against: from yarapm's net rating, so the net here is its, whatever the
  // rounding of the minutes and ratings it publishes
  const average = l.total - l.team.net
  const head = el(
    "tr",
    {},
    el("th", { scope: "col" }, l.team.abbrev),
    ...[
      ["Min", "Expected minutes, counting the chance he doesn't play"],
      ["Play", "Chance he plays"],
      [
        "Prior",
        "His box-score prior: points per 100 possessions above average",
      ],
      [
        "Rating",
        "His rating: the prior, moved by on-court results. Points per 100 possessions above average",
      ],
      ["Adds", "What he adds to the team's rating: rating × minutes ÷ 48"],
    ].map(([h, title]) => el("th", { scope: "col", title }, h)),
  )
  const rows = l.players.map(p =>
    el(
      "tr",
      {},
      el("th", { scope: "row" }, p.name),
      el("td", {}, p.min.toFixed(1)),
      el("td", {}, `${Math.round(p.play * 100)}%`),
      el("td", {}, signed(p.prior)),
      // a rating well away from the prior is what on-court results say,
      // and what the box score doesn't: bold
      el(
        "td",
        {},
        Math.abs(p.rating - p.prior) >= 1.5
          ? el("b", {}, signed(p.rating))
          : signed(p.rating),
      ),
      el("td", {}, signed(adds(p.min, p.rating))),
    ),
  )
  // the sum, under Adds: what the players add up to, less what an average
  // team's do, is the team's net rating. And the same from the priors
  // alone, which is what the box score says
  const sum = (label: string, v: number, title = "") =>
    el(
      "tr",
      {},
      el("th", { scope: "row", colSpan: 5, title }, label),
      el("td", {}, signed(v)),
    )
  return el(
    "table",
    { className: "lineup" },
    el("thead", {}, head),
    el("tbody", {}, ...rows),
    el(
      "tfoot",
      {},
      sum("Total", l.total),
      sum("Less an average team", -average),
      sum("Net rating", l.team.net),
      sum(
        "From priors alone",
        l.fromPriors - average,
        "The net rating with each player at his box-score prior",
      ),
    ),
  )
}
