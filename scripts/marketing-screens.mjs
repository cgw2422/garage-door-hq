/**
 * The product screens the public website is built from.
 *
 * Every image on the marketing site comes out of here, which means every image
 * on the marketing site is the real application rendering real seeded data. No
 * mockups, no retouched dashboards, no invented numbers. If a screen looks
 * good on the website it is because the screen looks good.
 *
 * Three things keep it honest:
 *
 *   1. `APP_ENV=production`, so no environment banner.
 *   2. `ad-prep.ts` has dismissed the setup checklist and dropped the "— DEMO"
 *      suffix, both of which an established company would have done months ago.
 *   3. `assertSafe()` refuses to write a file whose page contains an
 *      environment badge, an unfinished-setup prompt, a crash, or anything that
 *      looks like a key or a connection string. A marketing site is the worst
 *      possible place to discover either.
 *
 * Output is WebP, because these are large screenshots on a page whose Core Web
 * Vitals matter, and PNG screenshots of a UI are three to five times the size
 * for no visible gain.
 *
 * Usage:
 *   ALLOW_SEED_RESET=true npm run db:seed
 *   npx tsx scripts/ad-prep.ts
 *   APP_ENV=production ALLOW_LOCAL_APP_URL=true npx next dev -p 3210
 *   node scripts/marketing-screens.mjs [baseUrl]
 */
import { launchChromium } from './browser.mjs'
import { mkdir, rm, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3210'
const OUT = 'public/marketing'
const EMAIL = process.env.DEMO_EMAIL ?? 'mike@precisiongaragedoor.test'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'

/**
 * Captured at 2x the width they are displayed at, which is what a retina
 * screen asks for and the most a marketing page can justify carrying.
 */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
}
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

const manifest = []

/** Anything on a screen that must never reach an advertisement. */
const FORBIDDEN = [
  'DEVELOPMENT',
  'STAGING',
  'Finish setting up',
  '— DEMO',
  'Application error',
  'This page could not be loaded',
]

/** Shapes that mean a credential leaked onto a screen. */
const SECRET_SHAPES = [
  /sk_(live|test)_[A-Za-z0-9]/,
  /whsec_[A-Za-z0-9]/,
  /postgres(ql)?:\/\//i,
  /BEGIN [A-Z ]*PRIVATE KEY/,
]

async function assertSafe(page, where) {
  const text = await page.evaluate(() => document.body.innerText)
  for (const phrase of FORBIDDEN) {
    if (text.includes(phrase)) {
      throw new Error(`"${phrase}" is visible on ${where} — not usable on the public site`)
    }
  }
  for (const shape of SECRET_SHAPES) {
    if (shape.test(text)) {
      throw new Error(`something shaped like a credential is visible on ${where}`)
    }
  }
}

/**
 * One screen, saved as WebP.
 *
 * `clip` crops in CSS pixels before the device scale is applied, which is how
 * a composition gets the part of a screen that carries the story rather than
 * the whole viewport with the interesting part a tenth of it.
 */
async function shot(page, name, { scrollTo, full = false, clip, settle = 700 } = {}) {
  const file = path.join(OUT, `${name}.webp`)
  // Only move the page when a position is asked for. Defaulting this to 0 once
  // silently undid every `scrollIntoViewIfNeeded` before it, and produced a
  // screenshot of a form where the answer below it was the whole point.
  if (scrollTo !== undefined) await page.evaluate((y) => window.scrollTo(0, y), scrollTo)
  await page.waitForTimeout(settle)

  const png = await page.screenshot({ fullPage: full, ...(clip ? { clip } : {}) })
  const image = sharp(png)
  const meta = await image.metadata()
  await image.webp({ quality: 88, effort: 5 }).toFile(file)

  manifest.push({ name, file, width: meta.width, height: meta.height })
  console.log(`  ${file}  ${meta.width}x${meta.height}`)
}

/**
 * Put an element at the top of the viewport rather than merely inside it.
 *
 * `scrollIntoViewIfNeeded` stops as soon as the element is visible, which
 * usually means visible at the very bottom with the content that matters still
 * below the fold. For a screenshot, the thing being photographed has to be at
 * the top with the page below it.
 */
async function scrollToTopOf(page, locator, offset = 72) {
  const box = await locator.boundingBox()
  if (!box) return
  const current = await page.evaluate(() => window.scrollY)
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, current + box.y - offset))
  await page.waitForTimeout(700)
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/today/, { timeout: 60_000 })
  await page.waitForTimeout(1500)
}

/**
 * Draw something that reads as a signature.
 *
 * Two earlier attempts failed in the same way for different reasons: eight
 * straight segments gave a zigzag, and a sine wave gave a smooth curve. Both
 * looked like line charts, which is a bad thing to put on a page selling
 * "the customer signs on your phone".
 *
 * Handwriting is recognisable by two properties neither had: the stroke
 * doubles back on itself, and it has corners. These control points describe a
 * looping capital, three sharp peaks and a trailing flourish; Catmull-Rom
 * interpolation between them keeps the corners while making the curves look
 * drawn rather than plotted.
 */
const SIGNATURE_PATH = [
  [0.10, 0.72], [0.15, 0.44], [0.11, 0.28], [0.06, 0.40], [0.09, 0.60],
  [0.16, 0.74], [0.21, 0.66], [0.24, 0.44],
  [0.28, 0.30], [0.31, 0.74], [0.35, 0.36], [0.39, 0.74], [0.43, 0.34],
  [0.47, 0.62], [0.51, 0.44], [0.55, 0.64], [0.59, 0.42], [0.63, 0.60],
  [0.68, 0.46], [0.74, 0.58], [0.82, 0.70], [0.90, 0.46],
]

/** Catmull-Rom through the control points, so the corners survive. */
function samplePath(points, perSegment = 14) {
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))]
  const out = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let step = 0; step < perSegment; step += 1) {
      const t = step / perSegment
      const t2 = t * t
      const t3 = t2 * t
      out.push([0, 1].map((axis) =>
        0.5 *
        (2 * p1[axis] +
          (-p0[axis] + p2[axis]) * t +
          (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
          (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3),
      ))
    }
  }
  out.push(points[points.length - 1])
  // Catmull-Rom overshoots around tight control points. A sample outside the
  // canvas takes the pointer off the pad, which ends the stroke early — or, as
  // happened on the first run of this version, leaves the pad empty.
  return out.map(([x, y]) => [Math.min(0.96, Math.max(0.04, x)), Math.min(0.92, Math.max(0.08, y))])
}

async function signOn(page) {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no signature canvas to sign on')

  const points = samplePath(SIGNATURE_PATH)
  await page.mouse.move(box.x + box.width * points[0][0], box.y + box.height * points[0][1])
  await page.mouse.down()
  for (const [px, py] of points.slice(1)) {
    await page.mouse.move(box.x + box.width * px, box.y + box.height * py)
  }
  await page.mouse.up()
  await page.waitForTimeout(600)
}

async function phoneScreens(browser) {
  const context = await browser.newContext(PHONE)
  const page = await context.newPage()
  try {
    await signIn(page)
    await assertSafe(page, 'Today')

    // --- Run the day -----------------------------------------------------
    await shot(page, 'today')
    await shot(page, 'today-money', { scrollTo: 980 })

    await page.goto(`${BASE}/schedule`, { waitUntil: 'domcontentloaded' })
    await assertSafe(page, '/schedule')
    await shot(page, 'schedule', { settle: 1100 })

    await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
    await assertSafe(page, '/jobs')
    await shot(page, 'jobs', { settle: 1100 })

    // --- One job, all the way through ------------------------------------
    // Picked from Today rather than from the jobs list: Today shows what is
    // scheduled now, and the jobs list is sorted so its first row is often a
    // completed job with no inspection left to run.
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const jobHref = await page.locator('a[href^="/jobs/"]').first().getAttribute('href')
    const jobUrl = `${BASE}${jobHref}`
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
    await assertSafe(page, 'job')
    await shot(page, 'job', { settle: 1000 })

    await page.goto(`${jobUrl}/inspection`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1400)
    await assertSafe(page, 'inspection')
    await shot(page, 'inspection')

    await page.click('button[aria-label="Springs: Failed"]')
    await page.waitForSelector('button:has-text("Build Options")', { timeout: 40_000 })
    await shot(page, 'inspection-finding')

    await page.click('button:has-text("Build Options")')
    await page.waitForSelector('button:has-text("Added ·")', { timeout: 40_000 })
    await shot(page, 'inspection-to-estimate')

    await page
      .locator('button:has-text("Finish inspection"), a:has-text("Finish inspection")')
      .first()
      .click()
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}/, { timeout: 40_000 })
    await page.waitForTimeout(1200)

    await page.locator('a[href^="/estimates/"]').first().click()
    await page.waitForURL(/\/estimates\/[0-9a-f-]{36}/, { timeout: 40_000 })
    await page.waitForTimeout(1400)
    await assertSafe(page, 'estimate')
    await shot(page, 'estimate')
    await shot(page, 'estimate-options', { scrollTo: 540 })

    // --- Presentation Mode: what the homeowner is handed -----------------
    await page.click('button:has-text("Present to Customer")')
    await page.waitForURL(/\/present$/, { timeout: 40_000 })
    await page.waitForTimeout(1000)
    await shot(page, 'presentation-handover')

    await page.click('button:has-text("Present Estimate")')
    await page.waitForSelector('text=/Choose (your option|one of)/', { timeout: 40_000 })
    await page.waitForTimeout(1000)
    await assertSafe(page, 'presentation')
    await shot(page, 'presentation-customer')
    await shot(page, 'presentation-options', { scrollTo: 480 })

    await page.locator('button:has-text("Double Spring Change")').first().click()
    await page.waitForTimeout(900)
    await page.locator('button:has-text("Approve")').last().click()
    await page.waitForTimeout(1400)

    if (await page.locator('canvas').count()) {
      // Frame first, then sign. Scrolling after drawing resizes the canvas,
      // and the pad clears itself on resize — which produced an empty pad and
      // a disabled Approve button on a run that otherwise looked fine.
      await scrollToTopOf(page, page.locator('text=/YOUR NAME|Your name/i').first(), 150)
      await signOn(page)
      await shot(page, 'presentation-signature', { settle: 500 })
    } else {
      console.log('  (no signature canvas appeared — skipped)')
    }

    // Back to the technician without completing the signature, so a later run
    // finds the estimate in the same state this one did.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    await page.locator('button:has-text("Technician")').first().click()
    await page.waitForTimeout(800)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button:has-text("Unlock")')
    await page.waitForURL((url) => !url.pathname.startsWith('/present'), { timeout: 40_000 })

    // --- The door, and the parts that fit it -----------------------------
    await page.goto(`${BASE}/tools/spring-calculator`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await assertSafe(page, 'spring lookup')
    await shot(page, 'spring-lookup-empty')

    // The spring on the demo door: .225 x 2" x 27".
    for (const [selector, value] of [
      ['input[name="wireSizeInches"]', '0.225'],
      ['input[name="insideDiameterInches"]', '2'],
      ['input[name="lengthInches"]', '27'],
    ]) {
      const field = page.locator(selector)
      if (await field.count()) await field.fill(value)
    }
    const search = page.locator('button:has-text("Find Matching Springs")').first()
    await search.scrollIntoViewIfNeeded()
    await search.click()

    // The results heading is what proves the search ran. Waiting for it rather
    // than for a timeout is the difference between a screenshot of an answer
    // and a screenshot of a form.
    const results = page.locator('text=/Matching Springs|No Matches/').first()
    await results.waitFor({ timeout: 40_000 })
    await assertSafe(page, 'spring lookup results')
    await shot(page, 'spring-lookup')

    // The measurements are the question; the matching SKUs and what is on the
    // truck are the answer, and on a phone the answer is below the fold.
    await scrollToTopOf(page, results)
    await shot(page, 'spring-lookup-matches', { settle: 600 })

    await page.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1300)
    await assertSafe(page, '/inventory')
    await shot(page, 'truck-inventory')

    // --- The customer, and their doors -----------------------------------
    await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await assertSafe(page, '/customers')
    await shot(page, 'customers')

    // Sarah Wilson by name, not whichever customer sorts first: hers is the
    // 16x7 Clopay with the LiftMaster opener and the .225 x 2" x 27" torsion
    // pair that the differentiator section describes in words. The screenshot
    // and the sentence beside it have to be the same door.
    const named = page.locator('a[href^="/customers/"]:has-text("Sarah Wilson")').first()
    const anyCustomer = page.locator('a[href^="/customers/"]:not([href$="/new"])').first()
    await ((await named.count()) ? named : anyCustomer).click()
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}/, { timeout: 40_000 })
    await page.waitForTimeout(1300)
    await assertSafe(page, 'customer')
    await shot(page, 'customer')

    const door = page.locator('a[href^="/doors/"]').first()
    if (await door.count()) {
      await door.click()
      await page.waitForURL(/\/doors\/[0-9a-f-]{36}/, { timeout: 40_000 })
      await page.waitForTimeout(1400)
      await assertSafe(page, 'door passport')
      await shot(page, 'door-passport')
      await shot(page, 'door-passport-history', { scrollTo: 620 })
      await shot(page, 'door-passport-equipment', { scrollTo: 300 })
    }

    // --- Money -----------------------------------------------------------
    await page.goto(`${BASE}/invoices`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await assertSafe(page, '/invoices')
    await shot(page, 'invoices')

    const invoice = page.locator('a[href^="/invoices/"]:not([href$="/new"])').first()
    if (await invoice.count()) {
      await invoice.click()
      await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 40_000 })
      await page.waitForTimeout(1300)
      await assertSafe(page, 'invoice')
      await shot(page, 'invoice')
    }

    await page.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1300)
    await assertSafe(page, '/money')
    await shot(page, 'money')
  } finally {
    await context.close()
  }
}

async function desktopScreens(browser) {
  const context = await browser.newContext(DESKTOP)
  const page = await context.newPage()
  try {
    await signIn(page)

    // --- Fixed routes ------------------------------------------------------
    for (const [route, name] of [
      ['/today', 'desktop-today'],
      ['/schedule', 'desktop-schedule'],
      ['/jobs', 'desktop-jobs'],
      ['/customers', 'desktop-customers'],
      ['/inventory', 'desktop-inventory'],
      ['/money', 'desktop-money'],
      ['/settings/price-book', 'desktop-price-book'],
      ['/invoices', 'desktop-invoices'],
    ]) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1400)
      await assertSafe(page, route)
      await shot(page, name)
    }

    // --- The screens the big showcases are built on ------------------------
    //
    // These only existed as phone captures, which is fine beside a paragraph
    // and useless at full width: a 390px screen stretched across 1100px is a
    // blurry column with empty space either side. The sections that carry the
    // most weight get the desktop rendering of the same screen.

    // Sarah Wilson's door, by name — the 16x7 Clopay the copy describes.
    await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const named = page.locator('a[href^="/customers/"]:has-text("Sarah Wilson")').first()
    const anyCustomer = page.locator('a[href^="/customers/"]:not([href$="/new"])').first()
    await ((await named.count()) ? named : anyCustomer).click()
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}/, { timeout: 40_000 })
    await page.waitForTimeout(1300)
    await assertSafe(page, 'desktop customer')
    await shot(page, 'desktop-customer')

    const door = page.locator('a[href^="/doors/"]').first()
    if (await door.count()) {
      await door.click()
      await page.waitForURL(/\/doors\/[0-9a-f-]{36}/, { timeout: 40_000 })
      await page.waitForTimeout(1400)
      await assertSafe(page, 'desktop door passport')
      await shot(page, 'desktop-door-passport')
    }

    // The inspection, mid-flight: the failed spring is already answered by the
    // phone pass above, so this is the checklist as it stands afterwards.
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const jobHref = await page.locator('a[href^="/jobs/"]').first().getAttribute('href')
    if (jobHref) {
      await page.goto(`${BASE}${jobHref}/inspection`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1600)
      await assertSafe(page, 'desktop inspection')
      await shot(page, 'desktop-inspection')
    }

    await page.goto(`${BASE}/estimates`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1300)
    const estimate = page.locator('a[href^="/estimates/"]').first()
    if (await estimate.count()) {
      await estimate.click()
      await page.waitForURL(/\/estimates\/[0-9a-f-]{36}/, { timeout: 40_000 })
      await page.waitForTimeout(1500)
      await assertSafe(page, 'desktop estimate')
      await shot(page, 'desktop-estimate')
    }

    const anyInvoice = page.locator('a[href^="/invoices/"]:not([href$="/new"])')
    await page.goto(`${BASE}/invoices`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1300)
    if (await anyInvoice.count()) {
      await anyInvoice.first().click()
      await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 40_000 })
      await page.waitForTimeout(1400)
      await assertSafe(page, 'desktop invoice')
      await shot(page, 'desktop-invoice')
    }

    // Spring lookup, with the answer on screen rather than the empty form.
    await page.goto(`${BASE}/tools/spring-calculator`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1300)
    for (const [selector, value] of [
      ['input[name="wireSizeInches"]', '0.225'],
      ['input[name="insideDiameterInches"]', '2'],
      ['input[name="lengthInches"]', '27'],
    ]) {
      const field = page.locator(selector)
      if (await field.count()) await field.fill(value)
    }
    const find = page.locator('button:has-text("Find Matching Springs")').first()
    await find.scrollIntoViewIfNeeded()
    await find.click()
    const results = page.locator('text=/Matching Springs|No Matches/').first()
    await results.waitFor({ timeout: 40_000 })
    await assertSafe(page, 'desktop spring lookup')
    await scrollToTopOf(page, results, 120)
    await shot(page, 'desktop-spring-lookup', { settle: 600 })
  } finally {
    await context.close()
  }
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const browser = await launchChromium()
  try {
    await phoneScreens(browser)
    await desktopScreens(browser)
  } finally {
    await browser.close()
  }

  const files = await readdir(OUT)
  let bytes = 0
  for (const file of files) bytes += (await stat(path.join(OUT, file))).size

  console.log(`\n  ${manifest.length} screens in ${OUT}/  (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
  console.log('\n  // widths and heights for next/image:')
  for (const entry of manifest) {
    console.log(`  '${entry.name}': { width: ${entry.width}, height: ${entry.height} },`)
  }
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
