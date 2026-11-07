// Reads nba_data v2's parquet files directly from the browser, from the
// published bucket: the only data source, in dev and production. Each dataset
// is one file per season at nba/<source>/<dataset>/season=<season>/data.parquet;
// see ~/code/nba_data/docs/DATA_DICTIONARY.md, and "Data" in
// docs/plans/2026-10-10-site-v2-design.md. yarapm's ratings are a source
// too, though they're its own catalog, at yarapm/<dataset>/...; see
// ~/code/nba-rapm/docs/DATA.md
import {
  asyncBufferFromUrl,
  cachedAsyncBuffer,
  parquetMetadataAsync,
  parquetReadObjects,
  type ParquetQueryFilter,
} from "hyparquet"
import { compressors } from "hyparquet-compressors"

const BASE = "https://basketball-data.billmill.org"

export type Row = Record<string, any>

export function datasetUrl(source: string, dataset: string, season: number) {
  const root = source === "yarapm" ? "yarapm" : `nba/${source}`
  return `${BASE}/${root}/${dataset}/season=${season}/data.parquet`
}

const cache = new Map<string, Promise<Row[]>>()

// Read the given columns of one season of a dataset. Results are cached for
// the life of the page, so tools can call this freely when params change
export function read(
  source: string,
  dataset: string,
  season: number,
  columns: string[],
): Promise<Row[]> {
  const url = datasetUrl(source, dataset, season)
  const key = `${url}|${columns.join(",")}`
  let rows = cache.get(key)
  if (!rows) {
    rows = (async () => {
      const file = cachedAsyncBuffer(await asyncBufferFromUrl({ url }))
      return parquetReadObjects({ file, columns, compressors })
    })()
    rows.catch(() => cache.delete(key))
    cache.set(key, rows)
  }
  return rows
}

const opened = new Map<string, ReturnType<typeof open>>()

// A file and its footer, read once. hyparquet's first read is otherwise the
// file's last 512KB, which for a table read a game at a time is most of it
async function open(url: string) {
  const file = cachedAsyncBuffer(await asyncBufferFromUrl({ url }))
  const footer = await parquetMetadataAsync(file, {
    initialFetchSize: 131_072,
  })
  return { file, metadata: footer }
}

// Read the rows of one season of a dataset that match a filter, such as one
// game's. On a column the file is sorted by, an operator filter
// (`{ game_id: { $eq: id } }`) skips the row groups that can't match, so
// only the matching rows are fetched
export function readWhere(
  source: string,
  dataset: string,
  season: number,
  columns: string[],
  filter: ParquetQueryFilter,
): Promise<Row[]> {
  const url = datasetUrl(source, dataset, season)
  const key = `${url}|${columns.join(",")}|${JSON.stringify(filter)}`
  let rows = cache.get(key)
  if (!rows) {
    let file = opened.get(url)
    if (!file) {
      file = open(url)
      file.catch(() => opened.delete(url))
      opened.set(url, file)
    }
    rows = file.then(f =>
      parquetReadObjects({ ...f, columns, filter, compressors }),
    )
    rows.catch(() => cache.delete(key))
    cache.set(key, rows)
  }
  return rows
}

export interface DatasetInfo {
  // nba_data's only
  source?: string
  first_season: number
  last_season: number
  seasons: number
  updated: string
}

const meta = new Map<string, Promise<Record<string, DatasetInfo>>>()

// A catalog's description of every dataset: which seasons it has, and when
// it last changed
export function metadata(catalog: "nba" | "yarapm" = "nba") {
  let m = meta.get(catalog)
  if (!m) {
    m = fetch(`${BASE}/${catalog}/metadata.json`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => j.datasets)
    m.catch(() => meta.delete(catalog))
    meta.set(catalog, m)
  }
  return m
}

// The lookup tables, which every tool needs to turn ids into names
export async function lookups(season: number) {
  const [teams, players, games] = await Promise.all([
    read("stats", "team_seasons", season, [
      "team_id",
      "nba_abbrev",
      "full_name",
      "is_nba",
    ]),
    read("stats", "player_seasons", season, ["player_id", "name"]),
    read("stats", "games", season, [
      "game_id",
      "game_date",
      "game_type",
      "playoff_round",
      "series_game",
      "home_team_id",
      "away_team_id",
    ]),
  ])
  return {
    teams: new Map(teams.map(t => [t.team_id, t])),
    players: new Map(players.map(p => [p.player_id, p.name as string])),
    games: new Map(games.map(g => [g.game_id, g])),
  }
}

export function headshotUrl(playerId: string) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`
}
