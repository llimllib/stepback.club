// Checks the four factors tool in a browser: at desktop and phone widths,
// with and without a team, a last-n window, a past season's playoffs, an
// unknown team and the column size. Needs the dev server; an agent runs it as
//
//   node scripts/with-dev.mjs node scripts/fourfactors-check.mjs
//
// Saves shots/fourfactors-<width>.png and shots/fourfactors-team-<width>.png
// of the page, and exits 1 if a check fails
import { chromium } from "playwright"
import fs from "node:fs"

const server = process.env.SHOT_SERVER ?? "http://localhost:4321/nba/"
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

async function open(query, width = 1100) {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height: 900 },
  })
  page.on("pageerror", e => console.error(`[page error] ${e.message}`))
  await page.goto(`${server}fourfactors${query}`)
  await page.waitForSelector("svg.frame", { timeout: 30_000 })
  await page.waitForLoadState("networkidle")
  return page
}

// what the chart drew: its size, the logos in its body, the grayed groups
const chart = page =>
  page.evaluate(() => {
    const svg = document.querySelector("svg.frame")
    const body = svg.querySelector(".frame-body")
    return {
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
      title: svg.querySelector(".frame-title").textContent,
      logos: body.querySelectorAll("image").length,
      grayed: body.querySelectorAll("g[filter]").length,
      broken: [...body.querySelectorAll("image")].filter(
        i => !i.getAttribute("href"),
      ).length,
      controlsAbove:
        document.querySelector(".controls").getBoundingClientRect().bottom <=
        document.querySelector(".chart").getBoundingClientRect().top + 1,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      team: new URLSearchParams(location.search).get("team"),
    }
  })

for (const width of [1100, 390]) {
  const page = await open("", width)
  const c = await chart(page)
  check(c.title === "Four factors", `${width}px: "${c.title}"`)
  check(c.logos >= 120, `${width}px: every team in all four (${c.logos})`)
  check(c.grayed === 0, `${width}px: no team, nothing grayed`)
  check(c.controlsAbove, `${width}px: controls above the chart`)
  check(!c.overflow, `${width}px: no sideways scroll`)
  // square on a desktop, one column on a phone
  check(
    c.width === (width > 719 ? 1080 : 720),
    `${width}px: frame ${c.width} wide`,
  )
  await page
    .locator("#tool")
    .screenshot({ path: `shots/fourfactors-${width}.png` })
  await page.close()

  const team = await open("?team=BOS", width)
  const t = await chart(team)
  check(t.title === "The Celtics' four factors", `${width}px: "${t.title}"`)
  check(t.grayed === 4, `${width}px: the rest grayed in four panels`)
  await team
    .locator("#tool")
    .screenshot({ path: `shots/fourfactors-team-${width}.png` })
  await team.close()
}

{
  const page = await open("?last=10")
  const deck = await page.locator(".frame-context").getAttribute("data-text")
  check(/last 10 games/.test(deck), `last 10: "${deck}"`)
  await page.close()
}
{
  const page = await open("?season=2026&playoffs=1&team=NYK")
  const deck = await page.locator(".frame-context").getAttribute("data-text")
  const c = await chart(page)
  check(/2025–26 playoffs/.test(deck), `playoffs: "${deck}"`)
  // fewer teams in the playoffs, but every one in all four
  check(c.logos % 4 === 0 && c.logos >= 64, `playoffs: ${c.logos / 4} teams`)
  await page.close()
}
{
  const page = await open("?team=XYZ")
  const c = await chart(page)
  check(!c.team && c.grayed === 0, "an unknown team is dropped")
  await page.close()
}
{
  // the default on a desktop is square; a phone's column can be picked
  const first = await open("")
  const square = await chart(first)
  await first.close()
  check(
    square.width === 1080 && square.height === 1080,
    `square: ${square.width}×${square.height}`,
  )
  const page = await open("?size=column")
  const c = await chart(page)
  check(c.width === 720, `column on a desktop: ${c.width} wide`)
  await page.close()
}

await browser.close()
if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
