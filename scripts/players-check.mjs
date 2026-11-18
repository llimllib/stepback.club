// Checks the players page in a browser: at desktop and phone widths,
// sorting, the team filter, the search, the day slider, a past season, a
// day it doesn't rate and yarapm missing. Needs the dev server; an agent
// runs it as
//
//   node scripts/with-dev.mjs node scripts/players-check.mjs
//
// Saves the first screen of each width to shots/players-<width>.png and
// one team's table to shots/players-team.png, and exits 1 if a check fails
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

async function open(query, { width = 1100, block } = {}) {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height: 900 },
  })
  page.on("pageerror", e => console.error(`[page error] ${e.message}`))
  if (block) await page.route(block, r => r.abort())
  await page.goto(`${server}players${query}`)
  await page.waitForSelector("#players:not([data-state=loading])[data-state]", {
    state: "attached",
    timeout: 30_000,
  })
  return page
}

const state = page => page.locator("#players").getAttribute("data-state")
const rowCount = page => page.locator(".players tbody tr").count()
const firstName = page =>
  page.locator(".players tbody tr").first().locator(".name a").innerText()
const query = page => new URL(page.url()).search
// a column's values, top to bottom, as numbers: "rank" or a column's key
const column = (page, key) =>
  page.$$eval(
    `.players tbody tr td.${key === "rank" ? "rank" : `k-${key}`}`,
    tds => tds.map(td => +td.textContent.replace("−", "-").replace(/,/g, "")),
  )

for (const width of [1100, 390]) {
  const page = await open("", { width })
  check((await state(page)) === "done", `${width}px: loads`)
  const n = await rowCount(page)
  check(n > 300, `${width}px: every player (${n})`)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  check(!overflow, `${width}px: no sideways scroll`)
  // the first screenful: the table is hundreds of rows
  await page.screenshot({ path: `shots/players-${width}.png` })
  await page.close()
}

{
  const page = await open("")
  // best first by total: ranks run 1, 2, 3
  const ranks = await column(page, "rank")
  check(
    ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3,
    "sorted by total, ranked",
  )

  // sorting by a head: the URL says so, and the column runs down
  await page.locator(".players .cols button", { hasText: "Usg%" }).click()
  check(query(page).includes("sort=usg"), "sorting puts it in the URL")
  // the qualified players first, highest first, then a rule, then the rest
  const all = await page.$$eval(".players tbody tr", trs =>
    trs.map(tr =>
      tr.classList.contains("unqualified")
        ? "rule"
        : ["usg", "mpg", "gp"].map(
            k => +tr.querySelector(`.k-${k}`).textContent.replace("—", "NaN"),
          ),
    ),
  )
  const cut = all.indexOf("rule")
  check(cut > 50, `a qualifying rule, below ${cut} players`)
  const top = all.slice(0, cut)
  check(
    top.every(([u], i) => !i || u <= top[i - 1][0]),
    "the qualified sorted by usage, highest first",
  )
  check(
    top.every(([, mpg]) => mpg >= 15),
    "every qualified player plays 15 minutes a game",
  )
  check(
    all.slice(cut + 1).every(r => r !== "rule"),
    "one qualifying rule",
  )

  // a second click reverses it: the qualified still first, lowest first
  await page.locator(".players .cols button", { hasText: "Usg%" }).click()
  check(query(page).includes("order=asc"), "a second click: order=asc")
  check(
    (await page.locator(".players .cols th.sorted").innerText()).includes("▲"),
    "a second click: the head says ▲",
  )
  const low = (await column(page, "usg")).filter(Number.isFinite)
  const rule = await page.$$eval(".players tbody tr", trs =>
    trs.findIndex(tr => tr.classList.contains("unqualified")),
  )
  const above = low.slice(0, rule)
  check(
    rule > 50 && above.every((v, i) => !i || v >= above[i - 1]),
    "reversed: the qualified lowest first, above the rule",
  )
  // a third, back to highest first
  await page.locator(".players .cols button", { hasText: "Usg%" }).click()
  check(!query(page).includes("order="), "a third click: highest first again")

  // the team filter
  await page.selectOption("select[name=team]", "BOS")
  const teams = await page.$$eval(".players tbody td.team", tds =>
    tds.map(td => td.textContent),
  )
  check(
    teams.length >= 10 && teams.length <= 25 && teams.every(t => t === "BOS"),
    `the team filter (${teams.length} Celtics)`,
  )
  check(query(page).includes("team=BOS"), "the team in the URL")

  // a search without accents finds a name with them
  await page.selectOption("select[name=team]", "")
  await page.fill("input[name=q]", "jokic")
  check(
    (await rowCount(page)) === 1 && (await firstName(page)) === "Nikola Jokić",
    "searching jokic finds Nikola Jokić",
  )
  // punctuation and word order don't count
  for (const [typed, name] of [
    ["dayr", "Day'Ron Sharpe"],
    ["sharpe day", "Day'Ron Sharpe"],
    ["karl anthony", "Karl-Anthony Towns"],
  ]) {
    await page.fill("input[name=q]", typed)
    const names = await page.$$eval(".players tbody .name a", as =>
      as.map(a => a.textContent),
    )
    check(names.includes(name), `searching ${typed} finds ${name}`)
  }
  await page.fill("input[name=q]", "zzzz")
  check(
    (await page.locator(".players td.none").count()) === 1,
    "no match says so",
  )
  await page.close()
}

// the day slider: its first day, before any games
{
  const page = await open("")
  await page.locator("input[name=day]").focus()
  await page.keyboard.press("Home")
  const q = query(page)
  check(/date=\d{4}-\d{2}-\d{2}/.test(q), `the slider's day in the URL (${q})`)
  const gp = await column(page, "gp")
  check(
    gp.every(v => !Number.isFinite(v)),
    "the season's first day: no games yet",
  )
  await page.close()
}

// a past season, its final day, and a day in it it doesn't rate
{
  const page = await open("?season=2026")
  check((await state(page)) === "done", "a past season loads")
  const text = await page.locator(".players-status").innerText()
  check(/final ratings/i.test(text), `its final ratings (${text})`)
  await page.close()

  const day = await open("?season=2026&date=2026-02-15")
  const t2 = await day.locator(".players-status").innerText()
  check(
    /feb 1[0-5], 2026/i.test(t2),
    `the All-Star break: the last day before it (${t2})`,
  )
  const delta = (await column(day, "delta")).filter(Number.isFinite)
  check(delta.length > 300, "midseason: a week's change for most")
  await day.close()
}

// the link at the top goes down to the key
{
  const page = await open("")
  await page.click(".players-status a[href='#key']")
  check(
    await page.locator("#key").evaluate(h => {
      const r = h.getBoundingClientRect()
      return r.top >= 0 && r.top < window.innerHeight
    }),
    "the key link scrolls to the key",
  )
  await page.close()
}

// box score + beyond box = total
{
  const page = await open("?sort=beyond")
  check(query(page).includes("sort=beyond"), "sorts by beyond box")
  check(
    (await page.locator(".players tr.unqualified").count()) === 0,
    "a rating's sort has no qualifying rule",
  )
  const [net, box, beyond] = await Promise.all(
    ["net", "prior", "beyond"].map(k => column(page, k)),
  )
  check(
    net.every((v, i) => Math.abs(box[i] + beyond[i] - v) <= 0.11),
    "box score + beyond box = total, within rounding",
  )
  check(
    beyond.every((v, i) => !i || v <= beyond[i - 1]),
    "sorted by beyond box, highest first",
  )
  await page.close()
}

// one team's players, with totals either side of zero
{
  const page = await open("?season=2026&team=WAS")
  const nets = await column(page, "net")
  check(
    nets.some(v => v > 0) && nets.some(v => v < 0),
    "a team's totals either side of zero",
  )
  await page
    .locator(".players-table")
    .screenshot({ path: "shots/players-team.png" })
  await page.close()
}

// an unknown season: the latest
{
  const page = await open("?season=1990")
  check((await state(page)) === "done", "an unknown season: the latest")
  await page.close()
}

// yarapm missing: says so
{
  const page = await open("", { block: "**/yarapm/**" })
  check((await state(page)) === "failed", "without yarapm: says it couldn't")
  await page.close()
}

await browser.close()
if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log("all ok")
