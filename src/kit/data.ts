// Reads nba_data v2's parquet files directly from the browser, from the
// published bucket: the only data source, in dev and production. Each dataset
// is one file per season at nba/<source>/<dataset>/season=<season>/data.parquet;
// see ~/code/nba_data/docs/DATA_DICTIONARY.md, and "Data" in
// docs/plans/2026-10-10-site-v2-design.md. yarapm's ratings are a source
// too, though they're its own catalog, at yarapm/<dataset>/...; see
// ~/code/nba-rapm/docs/DATA.md
import {
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

// A file changed on the bucket between two requests for its bytes
class FileChanged extends Error {}

const TAIL = 1 << 19

// Total size from a 206's `Content-Range: bytes 0-99/1234`
function rangeTotal(res: Response) {
  const m = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")
  return m ? Number(m[1]) : undefined
}

// A file, as hyparquet's AsyncBuffer, with its size from the same response
// as its bytes. hyparquet's asyncBufferFromUrl sizes a file with a HEAD
// request, and right after nba_data rewrites a file a browser's cache can
// answer the HEAD and the GET with different versions of it (Firefox did),
// so the footer isn't where the size says: "footer != PAR1". The first
// request is the file's last 512KB instead, which is all of a small file
// (most of them), and a larger one's footer. A larger file's other ranges
// are fetched as read, once each, and must be the same version (ETag and
// size) as its tail; a range that fails is forgotten, so it's retried
async function fetchFile(url: string): Promise<AsyncBuffer> {
  const res = await fetch(url, { headers: { Range: `bytes=-${TAIL}` } })
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`)
  const tail = await res.arrayBuffer()
  const byteLength =
    res.status === 206 ? (rangeTotal(res) ?? tail.byteLength) : tail.byteLength
  const tailStart = byteLength - tail.byteLength
  if (tailStart === 0)
    return { byteLength, slice: (start, end) => tail.slice(start, end) }

  const etag = res.headers.get("etag")
  const ranges = new Map<string, Promise<ArrayBuffer>>()
  const fetchRange = async (start: number, end: number) => {
    const r = await fetch(url, {
      headers: { Range: `bytes=${start}-${end - 1}` },
    })
    if (r.status !== 206) throw new Error(`fetch failed ${r.status}: ${url}`)
    const tag = r.headers.get("etag")
    if (rangeTotal(r) !== byteLength || (etag && tag && tag !== etag))
      throw new FileChanged(`${url} changed while it was read`)
    return r.arrayBuffer()
  }
  return {
    byteLength,
    slice(start, end) {
      const s = start < 0 ? byteLength + start : start
      const e = end ?? byteLength
      if (s >= tailStart) return tail.slice(s - tailStart, e - tailStart)
      const key = `${s},${e}`
      let p = ranges.get(key)
      if (!p) {
        p = fetchRange(s, e)
        p.catch(() => ranges.delete(key))
        ranges.set(key, p)
      }
      return p
    },
  }
}

const cache = new Map<string, Promise<Row[]>>()
const files = new Map<string, Promise<AsyncBuffer>>()

// A file, fetched once for the page. Reads of different columns share it,
// so a page whose tools want different columns of the same file downloads
// it once
function sharedFile(url: string) {
  let f = files.get(url)
  if (!f) {
    f = fetchFile(url)
    f.catch(() => files.delete(url))
    files.set(url, f)
  }
  return f
}

// Run a read of a file; if the file changed under it, start over once from
// a fresh copy
async function withFile<T>(
  url: string,
  readFile: (file: AsyncBuffer) => Promise<T>,
): Promise<T> {
  try {
    return await readFile(await sharedFile(url))
  } catch (e) {
    if (!(e instanceof FileChanged)) throw e
    files.delete(url)
    opened.delete(url)
    return readFile(await sharedFile(url))
  }
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
    rows = withFile(url, file =>
      parquetReadObjects({ file, columns, compressors }),
    )
    rows.catch(() => cache.delete(key))
    cache.set(key, rows)
  }
  return rows
}

const opened = new Map<string, ReturnType<typeof parquetMetadataAsync>>()

// A file's footer, parsed once. It's in the file's tail, which fetchFile
// already has
function footer(url: string, file: AsyncBuffer) {
  let m = opened.get(url)
  if (!m) {
    m = parquetMetadataAsync(file)
    m.catch(() => opened.delete(url))
    opened.set(url, m)
  }
  return m
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
    rows = withFile(url, async file =>
      parquetReadObjects({
        file,
        metadata: await footer(url, file),
        columns,
        filter,
        compressors,
      }),
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
