// Checks a team's page in a browser: at desktop and phone widths, with its
// optional sources (yarapm, EPM, ESPN's injuries) missing, an unknown team
// and no team (the index). Needs the dev server; an agent runs it as
//
//   node scripts/with-dev.mjs node scripts/team-check.mjs [team]
//
// The team defaults to BOS. Saves shots/team-<width>.png and
// shots/team-index.png, and exits 1 if a check fails
import { chromium } from "playwright"
import fs from "node:fs"

const server = process.env.SHOT_SERVER ?? "http://localhost:4321/nba/"
const team = process.argv[2] ?? "BOS"
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

// Open the page and wait until it's done, empty or failed, and its images
// have loaded
async function open(query, { width = 1100, block } = {}) {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height: 900 },
  })
  page.on("pageerror", e => console.error(`[page error] ${e.message}`))
  if (block) await page.route(block, r => r.abort())
  await page.goto(`${server}team${query}`)
  await page.waitForSelector("#team:not([data-state=loading])[data-state]", {
    state: "attached",
    timeout: 30_000,
  })
  await page.waitForLoadState("networkidle")
  return page
}

const state = page => page.locator("#team").getAttribute("data-state")
const rows = (page, table) => page.locator(`.${table} tbody tr`).count()

for (const width of [1100, 390]) {
  const page = await open(`?team=${team}`, { width })
  check((await state(page)) === "done", `${width}px: loads`)
  check((await rows(page, "roster")) >= 13, `${width}px: a full roster`)
  check((await rows(page, "gamelog")) > 0, `${width}px: games`)
  check(
    (await page.locator(".team-chart svg.frame").count()) === 1,
    `${width}px: the chart`,
  )
  // nothing wider than the page but the tables that scroll
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  check(!overflow, `${width}px: no sideways scroll`)
  const broken = await page.evaluate(
    () =>
      [...document.querySelectorAll("#team img")].filter(
        i => !i.complete || i.naturalWidth === 0,
      ).length,
  )
  check(broken === 0, `${width}px: every logo loaded (${broken} didn't)`)
  await page
    .locator(".team-page")
    .screenshot({ path: `shots/team-${width}.png` })
  await page.close()
}

// the optional sources missing: the page still loads without them
for (const [what, block] of [
  ["yarapm", "**/yarapm/**"],
  ["EPM", "**/dunksandthrees/**"],
  ["ESPN", "**/nba/espn/**"],
]) {
  const page = await open(`?team=${team}`, { block })
  check((await state(page)) === "done", `without ${what}: loads`)
  check((await rows(page, "roster")) >= 13, `without ${what}: a roster`)
  await page.close()
}

// an unknown team, and none: the index
{
  const page = await open("?team=XYZ")
  check((await state(page)) === "empty", "unknown team: says so")
  check(
    (await page.locator(".team-index li").count()) === 30,
    "unknown team: the index",
  )
  await page.close()
}
{
  const page = await open("")
  check(
    (await page.locator(".team-index li").count()) === 30,
    "no team: the index",
  )
  await page.locator(".team-page").screenshot({ path: "shots/team-index.png" })
  await page.close()
}

await browser.close()
if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
