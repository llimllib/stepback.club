// Checks the scores page in a browser: a full night at desktop and phone
// widths, the days with no games, ESPN's or the NBA's data missing, and
// yarapm's predictions for the days ahead, also missing. Needs
// the dev server; an agent runs it as
//
//   node scripts/with-dev.mjs node scripts/scores-check.mjs [date]
//
// The date is a night with games (default 2026-10-28). Saves
// shots/scores-<width>.png and shots/scores-ahead-<width>.png, and exits 1
// if a check fails
import { chromium } from "playwright"
import fs from "node:fs"

const server = process.env.SHOT_SERVER ?? "http://localhost:4321/nba/"
const night = process.argv[2] ?? "2026-10-28"
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

// Open the page and wait until it's done, empty or failed
async function open(query, { width = 1100, block } = {}) {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height: 900 },
  })
  page.on("pageerror", e => console.error(`[page error] ${e.message}`))
  if (block) await page.route(block, r => r.abort())
  await page.goto(`${server}scores${query}`)
  await page.waitForSelector("#games:not([data-state=loading])[data-state]", {
    timeout: 30_000,
  })
  return page
}

const state = page => page.locator("#games").getAttribute("data-state")
const note = page => page.locator("#note").textContent()

// a full night, wide and narrow
for (const width of [1100, 390]) {
  const page = await open(`?date=${night}`, { width })
  check((await state(page)) === "done", `${night} at ${width}px loads`)
  const games = await page.locator(".game").count()
  check(games > 0, `${night} at ${width}px has ${games} games`)
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  )
  check(wide <= 0, `${width}px doesn't scroll sideways (${wide}px over)`)
  // ESPN's factors only nearly sum to the margin, so this reports, not fails
  const sums = await page.$$eval(".game:has(.why:not(.missing))", gs =>
    gs.map(g => {
      const t = g.querySelector(".why").textContent.replace(/−/g, "-")
      const [a, h] = [...g.querySelector(".score").textContent.matchAll(/\d+/g)]
      const margin = Math.abs(a - h)
      const parts = [...t.matchAll(/[A-Z]+ ([+-]?\d+)/gi)].map(m => +m[1])
      return [margin, parts.reduce((s, v) => s + v, 0), t]
    }),
  )
  check(sums.length === games, `every game has ESPN's net points line`)
  for (const [margin, sum, t] of sums)
    if (margin !== sum) console.log(`     off by ${sum - margin}: ${t}`)
  await page.screenshot({ path: `shots/scores-${width}.png`, fullPage: true })
  await page.close()
}

// the default is yesterday, or the latest day with games
{
  const page = await open("")
  check((await state(page)) === "done", `the default date loads`)
  console.log(`     ${await page.locator("#day").textContent()}`)
  // prev moves to an earlier game day, in place
  await page.click("#prev")
  await page.waitForSelector("#games[data-state=done]")
  check(/date=/.test(page.url()), `prev goes to ${page.url().split("?")[1]}`)
  await page.close()
}

// days with no games
for (const [date, what] of [
  ["2026-08-15", "the offseason"],
  ["2030-01-01", "a season the bucket doesn't have"],
]) {
  const page = await open(`?date=${date}`)
  check((await state(page)) === "empty", `${what} says there are no games`)
  check(
    (await page.locator("#note a").count()) > 0,
    `${what} links to a day with games`,
  )
  console.log(`     ${await note(page)}`)
  await page.close()
}

// ESPN missing: the scores still show
{
  const page = await open(`?date=${night}`, { block: "**/espn/team_box/**" })
  const missing = await page.locator(".why.missing").count()
  const games = await page.locator(".game").count()
  check(
    games > 0 && missing === games,
    `without ESPN, ${games} games say net points aren't in`,
  )
  await page.close()
}

// the NBA's logs missing: an error, with a retry
{
  const page = await open(`?date=${night}`, {
    block: "**/stats/team_game_logs/**",
  })
  check((await state(page)) === "failed", `without the NBA's logs, it fails`)
  console.log(`     ${await note(page)}`)
  check((await page.locator("#note button").count()) === 1, `with a retry`)
  await page.close()
}

// the days ahead: today, or the next day with games, predicted
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/New_York",
})
async function ahead(opts) {
  let page = await open(`?date=${today}`, opts)
  if ((await state(page)) === "empty") {
    const next = await page.locator("#next").getAttribute("href")
    await page.close()
    page = await open(next, opts)
  }
  return page
}
for (const width of [1100, 390]) {
  const page = await ahead({ width })
  const day = await page.locator("#day").textContent()
  check((await state(page)) === "done", `${day} at ${width}px loads`)
  const predicted = await page.locator(".game.predicted").count()
  check(predicted > 0, `${day} has ${predicted} predicted games`)
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  )
  check(wide <= 0, `${width}px doesn't scroll sideways (${wide}px over)`)
  console.log(`     ${await note(page)}`)
  await page.screenshot({
    path: `shots/scores-ahead-${width}.png`,
    fullPage: true,
  })
  await page.close()
}

// next goes on past today into the predicted days
{
  const page = await ahead()
  await page.click("#next")
  await page.waitForSelector("#games[data-state=done]")
  check(
    (await page.locator(".game.predicted").count()) > 0,
    `next goes on to ${page.url().split("?")[1]}, predicted`,
  )
  await page.close()
}

// yarapm missing: the days ahead fail with a retry, the nights played don't
{
  const page = await ahead({ block: "**/yarapm/**" })
  check((await state(page)) === "failed", `without yarapm, today fails`)
  console.log(`     ${await note(page)}`)
  check((await page.locator("#note button").count()) === 1, `with a retry`)
  await page.close()
}
{
  const page = await open(`?date=${night}`, { block: "**/yarapm/**" })
  check(
    (await state(page)) === "done" && (await page.locator(".game").count()) > 0,
    `without yarapm, ${night}'s scores still show`,
  )
  await page.close()
}

await browser.close()
if (failed) {
  console.log(`${failed} failed`)
  process.exitCode = 1
}
