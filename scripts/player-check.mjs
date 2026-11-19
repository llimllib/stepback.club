// Checks a player's page in a browser: at desktop and phone widths, each of
// the table's views, a comparable from the URL and one added from the
// chips, a career before yarapm (2013–14), a career that started before
// it, an unknown id and the index, and yarapm and ESPN missing. Needs the
// dev server; an agent runs it as
//
//   node scripts/with-dev.mjs node scripts/player-check.mjs [id]
//
// The player defaults to Jayson Tatum. Saves shots/player-<width>.png and
// shots/player-vs.png, and exits 1 if a check fails
import { chromium } from "playwright"
import fs from "node:fs"

const server = process.env.SHOT_SERVER ?? "http://localhost:4321/nba/"
const id = process.argv[2] ?? "1628369"
fs.mkdirSync("shots", { recursive: true })

// Chromium ignores proxy env vars on macOS and drops credentials in a proxy
// URL, so pass them apart
const proxy = process.env.HTTPS_PROXY && new URL(process.env.HTTPS_PROXY)
const browser = await chromium.launch(
  proxy
    ? {
        proxy: {
          server: `${proxy.protocol}//${proxy.host}`,
          username: decodeURIComponent(proxy.username),
          password: decodeURIComponent(proxy.password),
        },
      }
    : {},
)

let failed = 0
function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`)
  if (!ok) failed++
}

async function open(query, { width = 1100, block } = {}) {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height: 900 },
  })
  page.on("pageerror", e => console.error(`[page error] ${e.message}`))
  if (block) await page.route(block, r => r.abort())
  // a load that fails is tried once more: in a sandbox, the proxy drops a
  // connection now and then, which fails a page that reads 120 files
  for (let tries = 0; tries < 2; tries++) {
    await page.goto(`${server}player${query}`)
    await page.waitForSelector(
      "#player:not([data-state=loading])[data-state]",
      { state: "attached", timeout: 60_000 },
    )
    await page.waitForLoadState("networkidle")
    const st = await page.locator("#player").getAttribute("data-state")
    if (st !== "failed") break
    console.log(`     ${query}: ${await page.locator("#status").textContent()}`)
  }
  return page
}

const state = page => page.locator("#player").getAttribute("data-state")
const count = (page, sel) => page.locator(sel).count()
// what the page downloaded, in MB
const downloaded = page =>
  page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .reduce((t, r) => t + (r.transferSize || r.encodedBodySize || 0), 0) /
      1e6,
  )

for (const width of [1100, 390]) {
  const page = await open(`?id=${id}`, { width })
  check((await state(page)) === "done", `${width}px: loads`)
  check((await count(page, ".career tbody tr")) > 0, `${width}px: seasons`)
  check(
    (await count(page, ".player-chart svg.frame")) === 1,
    `${width}px: the chart`,
  )
  check(
    (await count(page, ".comps .chip")) >= 4,
    `${width}px: comparables (${await count(page, ".comps .chip")})`,
  )
  check((await count(page, ".player-games tbody tr")) > 0, `${width}px: games`)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  check(!overflow, `${width}px: no sideways scroll`)
  if (width === 1100)
    console.log(`     downloaded ${(await downloaded(page)).toFixed(1)}MB`)
  await page
    .locator(".player-page")
    .screenshot({ path: `shots/player-${width}.png` })
  await page.close()
}

// each view, and the career row in all but Ratings
{
  const page = await open(`?id=${id}`)
  for (const v of ["Per game", "Advanced", "Per 100", "Ratings"]) {
    await page.locator(".view-tabs a", { hasText: v }).click()
    const foot = await count(page, ".career tfoot tr")
    check(
      (await count(page, ".career tbody tr")) > 0 &&
        (v === "Ratings" ? foot === 0 : foot === 1),
      `view ${v}`,
    )
  }
  check(page.url().includes("view=") === false, "Ratings is the default view")
  // adding the first suggestion puts a second line on the chart and in
  // the URL
  const name = await page.locator(".comps .chip").first().textContent()
  await page.locator(".comps .chip").first().click()
  await page.waitForFunction(() =>
    document
      .querySelector(".player-chart .frame-legend, .player-chart svg")
      ?.textContent?.includes("2 players"),
  )
  check(page.url().includes("vs="), `adding ${name?.trim()}: in the URL`)
  // a season's link picks its games
  await page.locator(".career tbody tr:last-child .season a").click()
  await page.waitForFunction(
    () => !document.querySelector(".player-games")?.closest("[data-loading]"),
  )
  check(page.url().includes("season="), "a season's link: in the URL")
  await page.close()
}

// comparables from the URL
{
  const page = await open(`?id=${id}&vs=1629029,203999`)
  const text = await page.locator(".player-chart svg").textContent()
  check(text.includes("3 players"), "vs: three lines")
  await page
    .locator(".player-chart")
    .screenshot({ path: "shots/player-vs.png" })
  await page.close()
}

// a comparable's season failing to load: once, it's fetched again and his
// whole career is drawn; every time, he's left off and named, never drawn
// with a hole in his career (Dirk Nowitzki's 2015–16, beside Wembanyama,
// whose seasons are all later)
for (const times of [1, Infinity]) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  let failures = 0
  await page.route("**/yarapm/ratings_daily/season=2016/**", r =>
    failures++ < times ? r.abort() : r.continue(),
  )
  await page.goto(`${server}player?id=1641705&vs=1717`)
  await page.waitForSelector("#player:not([data-state=loading])[data-state]", {
    state: "attached",
    timeout: 60_000,
  })
  const svg = await page.locator(".player-chart svg").textContent()
  const chips = await page.locator(".player-page").textContent()
  if (times === 1)
    check(
      svg.includes("Dirk Nowitzki") && svg.includes("2 players"),
      "a season failing once: retried, both careers drawn",
    )
  else
    check(
      !svg.includes("Dirk Nowitzki") &&
        chips.includes("Couldn't load Dirk Nowitzki's ratings") &&
        !page.url().includes("vs="),
      "a season failing every time: left off, and says so",
    )
  await page.close()
}

// LeBron, who started before yarapm; Yao Ming, who finished before it
{
  const page = await open("?id=2544")
  check((await state(page)) === "done", "a career from 2004: loads")
  check(
    (await count(page, ".player-chart svg.frame")) === 1,
    "a career from 2004: the chart from 2014",
  )
  await page.close()
}
{
  const page = await open("?id=2397")
  check((await state(page)) === "done", "a career before 2014: loads")
  check(
    (await page.locator(".player-chart").textContent()).includes(
      "yarapm rates seasons from",
    ),
    "a career before 2014: says yarapm doesn't rate it",
  )
  await page.close()
}

// a rookie who hasn't played (Jayden Quaintance, hurt, in November 2026;
// once he plays, pick another)
{
  const page = await open("?id=1643519")
  check((await state(page)) === "done", "a rookie without games: loads")
  check(
    (await page.locator(".player-page").textContent()).includes("No games yet"),
    "a rookie without games: says so",
  )
  await page.close()
}

// the optional sources missing
for (const [what, block] of [
  ["yarapm", "**/yarapm/**"],
  ["ESPN", "**/nba/espn/**"],
]) {
  const page = await open(`?id=${id}`, { block })
  check((await state(page)) === "done", `without ${what}: loads`)
  check((await count(page, ".career tbody tr")) > 0, `without ${what}: seasons`)
  check(
    (await count(page, ".player-games tbody tr")) > 0,
    `without ${what}: games`,
  )
  await page.close()
}

// an unknown id, and none: the search
{
  const page = await open("?id=999")
  check((await state(page)) === "empty", "unknown id: says so")
  await page.locator(".player-search input").fill("tatum")
  check((await count(page, ".player-index li")) >= 1, "unknown id: a search")
  await page.close()
}
{
  const page = await open("")
  await page.locator(".player-search input").fill("jokic")
  check(
    (await page.locator(".player-index li").first().textContent()).includes(
      "Jokić",
    ),
    "no id: the search finds Jokić",
  )
  await page.close()
}

await browser.close()
if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
