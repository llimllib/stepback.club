// Reads nba_data v2's parquet files directly from the browser, from the
// published bucket: the only data source, in dev and production. Each dataset
// is one file per season at nba/<source>/<dataset>/season=<season>/data.parquet;
// see ~/code/nba_data/docs/DATA_DICTIONARY.md, and "Data" in
// docs/plans/2026-10-10-site-v2-design.md. yarapm's ratings are a source
// too, though they're its own catalog, at yarapm/<dataset>/...; see
// ~/code/nba-rapm/docs/DATA.md
import {
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
  type AsyncBuffer,
  type ParquetQueryFilter,
} from "hyparquet"
import { compressors } from "hyparquet-compressors"

const BASE = "https://basketball-data.billmill.org"

export type Row = Record<string, any>

export function datasetUrl(source: string, dataset: string, season: number) {
  const root = source === "yarapm" ? "yarapm" : `nba/${source}`
  return `${BASE}/${root}/${dataset}/season=${season}/data.parquet`
}

// hyparquet's cachedAsyncBuffer, except that a fetch that fails is
// forgotten: hyparquet's keeps the rejected promise, so a range that failed
// once (a dropped connection) failed every read of it for the life of the
// page. A file under 512KB is fetched whole, a larger one by the ranges read
const WHOLE = 1 << 19
function cached({ byteLength, slice }: AsyncBuffer): AsyncBuffer {
  const ranges = new Map<string, Promise<ArrayBuffer>>()
  const fetchRange = (key: string, start: number, end?: number) => {
    let p = ranges.get(key)
    if (!p) {
      p = Promise.resolve(slice(start, end))
      p.catch(() => ranges.delete(key))
      ranges.set(key, p)
    }
    return p
  }
  if (byteLength < WHOLE)
    return {
      byteLength,
      slice: async (start, end) =>
        (await fetchRange("whole", 0, byteLength)).slice(start, end),
    }
  return {
    byteLength,
    slice(start, end) {
      // a suffix range is the same bytes as its absolute one
      const s = start < 0 ? byteLength + start : start
      const e = end ?? byteLength
      return fetchRange(`${s},${e}`, s, e)
    },
  }
}

const cache = new Map<string, Promise<Row[]>>()
const files = new Map<string, ReturnType<typeof fetchFile>>()

// A file, fetched once for the page: a small one (under 512KB, most of
// them) whole, a larger one by the ranges read. Reads of different columns
// share it, so a page whose tools want different columns of the same file
// downloads it once
async function fetchFile(url: string) {
  return cached(await asyncBufferFromUrl({ url }))
}
function sharedFile(url: string) {
  let f = files.get(url)
  if (!f) {
    f = fetchFile(url)
    f.catch(() => files.delete(url))
    files.set(url, f)
  }
  return f
}

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
    rows = (async () =>
      parquetReadObjects({
        file: await sharedFile(url),
        columns,
        compressors,
      }))()
    rows.catch(() => cache.delete(key))
    cache.set(key, rows)
  }
  return rows
}

const opened = new Map<string, ReturnType<typeof open>>()

// A file and its footer, read once. hyparquet's first read is otherwise the
// file's last 512KB, which for a table read a game at a time is most of it
async function open(url: string) {
  const file = cached(await asyncBufferFromUrl({ url }))
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
