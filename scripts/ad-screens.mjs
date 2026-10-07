/**
 * Screens for marketing, captured from the running product.
 *
 * Two differences from `capture-screens.mjs`, which documents the product:
 * this runs with `APP_ENV=production` so no environment banner appears, and
 * against a company whose setup checklist has been dismissed — an advertisement
 * should not be a picture of an unfinished account.
 *
 * Everything else is the real application. No mockups, no retouching.
 *
 * Usage:
 *   ALLOW_SEED_RESET=true npm run db:seed
 *   APP_ENV=production npx next dev -p 3210
 *   node scripts/ad-screens.mjs [baseUrl]
 */
import { launchChromium } from './browser.mjs'
import { mkdir, rm } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3210'
const OUT = 'ad-screens'
const EMAIL = process.env.DEMO_EMAIL ?? 'mike@precisiongaragedoor.test'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

let n = 0

async function shot(page, name, { scrollTo = 0, full = false } = {}) {
  n += 1
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`
  await page.evaluate((y) => window.scrollTo(0, y), scrollTo)
  // Fonts, images and any entrance transition.
  await page.waitForTimeout(700)
  await page.screenshot({ path: file, fullPage: full })
  console.log(`  ${file}`)
  return file
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/today/, { timeout: 40_000 })
  await page.waitForTimeout(1200)
}

/** Fail loudly rather than shipping an advert with a staging badge on it. */
async function assertClean(page, where) {
  const text = await page.evaluate(() => document.body.innerText)
  for (const forbidden of [
    'DEVELOPMENT',
    'STAGING',
    'Finish setting up',
    'DEMO',
    // A rebuild underneath a running `next start` serves HTML where the
    // chunks should be, and every screen after it is this sentence on white.
    // Worth failing on rather than discovering in an advert.
    'Application error',
  ]) {
    if (text.includes(forbidden)) {
      throw new Error(`"${forbidden}" is visible on ${where} — not usable for an advert`)
    }
  }
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const browser = await launchChromium()

  // --- Phone: the field --------------------------------------------------
  const phone = await browser.newContext(PHONE)
  const page = await phone.newPage()
  try {
    await signIn(page)
    await assertClean(page, 'Today')
    await shot(page, 'today')
    await shot(page, 'today-schedule', { scrollTo: 320 })

    const jobHref = await page.locator('a[href^="/jobs/"]').first().getAttribute('href')
    const jobUrl = `${BASE}${jobHref}`

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    await shot(page, 'job')

    await page.goto(`${jobUrl}/inspection`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await shot(page, 'inspection')

    await page.click('button[aria-label="Springs: Failed"]')
    await page.waitForSelector('button:has-text("Build Options")', { timeout: 30_000 })
    await shot(page, 'inspection-finding')

    await page.click('button:has-text("Build Options")')
    await page.waitForSelector('button:has-text("Added ·")', { timeout: 30_000 })
    await shot(page, 'inspection-options-added')

    await page.locator('button:has-text("Finish inspection"), a:has-text("Finish inspection")')
      .first().click()
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await page.waitForTimeout(1000)

    await page.locator('a[href^="/estimates/"]').first().click()
    await page.waitForURL(/\/estimates\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await page.waitForTimeout(1200)
    await shot(page, 'estimate')
    await shot(page, 'estimate-options', { scrollTo: 520 })

    // --- Presentation Mode: what the homeowner sees ----------------------
    await page.click('button:has-text("Present to Customer")')
    await page.waitForURL(/\/present$/, { timeout: 30_000 })
    await page.waitForTimeout(900)
    await shot(page, 'presentation-handover')

    await page.click('button:has-text("Present Estimate")')
    await page.waitForSelector('text=/Choose (your option|one of)/', { timeout: 30_000 })
    await page.waitForTimeout(900)
    await shot(page, 'presentation-customer')
    await shot(page, 'presentation-options', { scrollTo: 460 })

    await page.locator('button:has-text("Double Spring Change")').first().click()
    await page.waitForTimeout(900)
    await page.locator('button:has-text("Approve")').last().click()
    await page.waitForTimeout(1300)
    await shot(page, 'presentation-approving')

    // Back out without signing; the signed state is not what sells the screen.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    await page.locator('button:has-text("Technician")').first().click()
    await page.waitForTimeout(700)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button:has-text("Unlock")')
    await page.waitForURL((url) => !url.pathname.startsWith('/present'), { timeout: 30_000 })

    for (const [path, name, scrollTo] of [
      ['/schedule', 'schedule', 0],
      ['/customers', 'customers', 0],
      ['/inventory', 'inventory', 0],
      ['/money', 'money', 0],
      ['/invoices', 'invoices', 0],
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1100)
      await assertClean(page, path)
      await shot(page, name, { scrollTo })
    }

    // The door's own history — the thing no spreadsheet keeps. Reached the way
    // a person reaches it: a customer, then their door.
    await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    // The first such link is the "New customer" button, not a customer.
    await page.locator('a[href^="/customers/"]:not([href$="/new"])').first().click()
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await page.waitForTimeout(1100)
    await shot(page, 'customer')

    const door = page.locator('a[href^="/doors/"]').first()
    if (await door.count()) {
      await door.click()
      await page.waitForURL(/\/doors\/[0-9a-f-]{36}/, { timeout: 30_000 })
      await page.waitForTimeout(1200)
      await shot(page, 'door-passport')
      await shot(page, 'door-passport-history', { scrollTo: 480 })
    } else {
      console.log('  (no door link on the customer page — skipped the passport)')
    }
  } finally {
    await phone.close()
  }

  // --- Desktop: the office ------------------------------------------------
  const desk = await browser.newContext(DESKTOP)
  const deskPage = await desk.newPage()
  try {
    await signIn(deskPage)
    for (const [path, name] of [
      ['/today', 'desktop-today'],
      ['/schedule', 'desktop-schedule'],
      ['/money', 'desktop-money'],
      ['/settings/price-book', 'desktop-price-book'],
    ]) {
      await deskPage.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await deskPage.waitForTimeout(1200)
      await assertClean(deskPage, path)
      await shot(deskPage, name)
    }
  } finally {
    await desk.close()
    await browser.close()
  }

  console.log(`\n  ${n} screens in ${OUT}/`)
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
