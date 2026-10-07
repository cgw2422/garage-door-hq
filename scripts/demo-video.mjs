/**
 * The product, recorded end to end: a job on today's schedule, the inspection
 * that finds the work, the customer signing on the technician's own phone, and
 * the invoice settling.
 *
 * Runs against the demo company on a local server, on a phone viewport,
 * because that is the device this is used on. Nothing is mocked — every screen
 * is the real application talking to a real database, which is the only kind of
 * demo worth showing anyone.
 *
 * Usage:  npm run db:seed && node scripts/demo-video.mjs [baseUrl]
 * Output: video/walkthrough.webm
 */
import { launchChromium } from './browser.mjs'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3210'
const OUT = 'video'
const EMAIL = process.env.DEMO_EMAIL ?? 'mike@precisiongaragedoor.test'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'

const SIZE = { width: 390, height: 844 }

/** Long enough to read a screen, short enough to keep moving. */
const BEAT = 1400
const READ = 2600

function log(message) {
  console.log(`  ${message}`)
}

/**
 * A caption strip, injected into the page.
 *
 * The recording has no sound, so without this it is a phone being operated by
 * nobody for no stated reason. `pointer-events: none` so it can never swallow
 * a tap meant for the app underneath, and it is re-applied after every
 * navigation because the document is replaced each time.
 */
async function caption(page, text) {
  await page.evaluate((message) => {
    let strip = document.getElementById('gdhq-caption')
    if (!strip) {
      strip = document.createElement('div')
      strip.id = 'gdhq-caption'
      strip.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
        'padding:14px 18px calc(14px + env(safe-area-inset-bottom))',
        'background:rgba(9,14,26,0.92)', 'color:#fff',
        'font:600 15px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif',
        'letter-spacing:0.01em', 'pointer-events:none',
        'box-shadow:0 -8px 24px rgba(0,0,0,0.25)',
      ].join(';')
      document.body.appendChild(strip)
    }
    strip.textContent = message
  }, text)
}

async function beat(page, text, ms = BEAT) {
  if (text) {
    await caption(page, text)
    log(text)
  }
  await page.waitForTimeout(ms)
}

/** Draw something that looks like a signature across the pad. */
async function sign(page) {
  const canvas = page.locator('canvas')
  await canvas.waitFor({ state: 'visible' })
  await canvas.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signature canvas was not visible')

  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 30, y)
  await page.mouse.down()
  // Slowly, so the stroke is visible as it is drawn rather than appearing.
  for (let i = 1; i <= 14; i += 1) {
    await page.mouse.move(box.x + 30 + i * 17, y + Math.sin(i) * 20)
    await page.waitForTimeout(35)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const browser = await launchChromium()
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: OUT, size: SIZE },
  })
  const page = await context.newPage()

  try {
    // --- Signing in --------------------------------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await beat(page, 'Precision Garage Door — the owner signs in on his phone', READ)
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await beat(page, null, 700)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/today/, { timeout: 40_000 })
    await page.waitForTimeout(1200)

    // --- Today -------------------------------------------------------------
    await beat(page, "Today — what's on, who it's for, and what it's worth", READ)
    await page.evaluate(() => window.scrollTo(0, 260))
    await beat(page, null, 1600)
    await page.evaluate(() => window.scrollTo(0, 0))
    await beat(page, null, 600)

    // --- The upcoming job --------------------------------------------------
    const firstJob = page.locator('a[href^="/jobs/"]').first()
    await firstJob.click()
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 })
    const jobUrl = page.url().split('?')[0]
    await page.waitForTimeout(900)
    await beat(page, 'The next job: the customer, the door, and what they reported', READ)
    await page.evaluate(() => window.scrollTo(0, 320))
    await beat(page, null, 1800)
    await page.evaluate(() => window.scrollTo(0, 0))
    await beat(page, null, 500)

    // --- On the way, arrived, started --------------------------------------
    await beat(page, 'On My Way — the customer gets a message, not a phone call', BEAT)
    await page.click('button:has-text("On My Way")')
    await page.waitForSelector('button:has-text("I\'ve Arrived")', { timeout: 30_000 })
    await beat(page, null, 1100)
    await page.click('button:has-text("I\'ve Arrived")')
    await page.waitForSelector('button:has-text("Start Job")', { timeout: 30_000 })
    await beat(page, 'Arrived', 1100)
    await page.click('button:has-text("Start Job")')
    await page.waitForSelector('a:has-text("Complete Job")', { timeout: 30_000 })
    await beat(page, 'Work started — the timeline records each step as it happens', READ)

    // --- Inspection --------------------------------------------------------
    await page.goto(`${jobUrl}/inspection`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await beat(page, 'The inspection — every component, in the words a tech uses', READ)
    await page.evaluate(() => window.scrollTo(0, 400))
    await beat(page, 'Each item offers only the answers its own question takes', READ)
    await page.evaluate(() => window.scrollTo(0, 0))
    await beat(page, null, 500)

    await page.click('button[aria-label="Springs: Failed"]')
    await page.waitForSelector('button:has-text("Build Options")', { timeout: 30_000 })
    await beat(page, 'Springs marked Failed — the priced work appears on the finding', READ)

    await page.click('button:has-text("Build Options")')
    await page.waitForSelector('button:has-text("Added ·")', { timeout: 30_000 })
    await beat(page, 'One tap builds the options — no separate quoting screen', READ)

    const rollers = page.locator('button[aria-label="Rollers: Worn"]')
    await rollers.scrollIntoViewIfNeeded()
    await rollers.click()
    const rollerRemedy = page.locator('button:has-text("Roller Swap")').first()
    await rollerRemedy.waitFor({ state: 'visible', timeout: 30_000 })
    await beat(page, 'A second finding, priced from the same price book', BEAT)
    await rollerRemedy.click()
    await beat(page, 'Added to the same estimate — one service, however it was reached', READ)

    // --- The estimate ------------------------------------------------------
    // Finishing the inspection returns to the job, where the estimate it built
    // is waiting — which is the order the work actually happens in.
    await page.locator('button:has-text("Finish inspection"), a:has-text("Finish inspection")')
      .first()
      .click()
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await page.waitForTimeout(1200)
    await beat(page, 'Back on the job, with the estimate the inspection built', READ)
    await page.locator('a[href^="/estimates/"]').first().click()
    await page.waitForURL(/\/estimates\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await page.waitForTimeout(1200)
    await beat(page, 'The estimate: itemised, priced from the price book', READ)
    await page.evaluate(() => window.scrollTo(0, 500))
    await beat(page, null, 2000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await beat(page, null, 600)

    // --- Presentation Mode -------------------------------------------------
    await page.click('button:has-text("Present to Customer")')
    await page.waitForURL(/\/present$/, { timeout: 30_000 })
    await page.waitForTimeout(900)
    await beat(page, 'Presenting on this device — about to hand the phone over', READ)
    await page.click('button:has-text("Present Estimate")')
    await page.waitForSelector('text=/Choose (your option|one of)/', { timeout: 30_000 })
    await page.waitForTimeout(900)
    await beat(page, "What the homeowner sees: the company's brand, no costs, no margins", READ)
    await page.evaluate(() => window.scrollTo(0, 450))
    await beat(page, 'No navigation, no other customers, nothing else to wander into', READ)

    // --- The customer chooses and signs ------------------------------------
    //
    // Three stages, and each is the customer's own action: pick one, read what
    // it includes, then sign for it.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)
    await page.locator('button:has-text("Double Spring Change")').first().click()
    await page.waitForTimeout(1000)
    await beat(page, 'They pick the one they want', READ)

    const proceed = page.locator('button:has-text("Approve")').last()
    await proceed.waitFor({ state: 'visible', timeout: 20_000 })
    await proceed.click()
    await page.waitForTimeout(1200)
    await beat(page, 'Exactly what is included, and the total they are agreeing to', READ)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(800)
    await sign(page)
    await beat(page, 'And they sign, on the technician’s own phone', READ)

    const approve = page.locator('button:has-text("Approve $")').last()
    await approve.click()
    await page.waitForTimeout(3500)
    await beat(page, 'Approved — and please hand the device back', READ)

    // --- Back to work ------------------------------------------------------
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    await page.locator('button:has-text("Technician")').first().click()
    await page.waitForTimeout(700)
    await beat(page, 'Only the technician’s password ends Presentation Mode', READ)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button:has-text("Unlock")')
    await page.waitForURL((url) => !url.pathname.startsWith('/present'), { timeout: 30_000 })
    await page.waitForTimeout(1000)

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await beat(page, 'Back on the job: approved, for how much, signed by whom', READ)

    // --- Completion --------------------------------------------------------
    await page.goto(`${jobUrl}/complete`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await beat(page, 'Completion — parts already filled in from what they signed', READ)
    await page.fill(
      'textarea[name="workSummary"]',
      'Replaced both torsion springs with 25,000-cycle, balanced the door, tested safety reverse.',
    )
    await beat(page, null, 1200)
    await page.click('button:has-text("Complete & Collect Payment")')
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 40_000 })
    await page.waitForTimeout(1400)

    // --- Getting paid ------------------------------------------------------
    await beat(page, 'The invoice, generated from the option they signed', READ)
    const takePayment = page.locator('button:has-text("Take payment")')
    if (await takePayment.count()) {
      await takePayment.click()
      await page.waitForTimeout(900)
    }
    await beat(page, 'Card, cash, cheque — or a link they pay from their own phone', READ)
    await page.click('button:has-text("Record $"), button:has-text("Record ")')
    await page.waitForTimeout(3000)
    await beat(page, 'Paid in full — before leaving the driveway', READ + 900)

    await page.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await beat(page, 'And it is already in the day’s numbers', READ + 600)
  } finally {
    await context.close()
    await browser.close()
  }

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.webm'))
  if (files.length === 1) {
    await rename(join(OUT, files[0]), join(OUT, 'walkthrough.webm'))
    console.log(`\n  ${OUT}/walkthrough.webm`)
  } else {
    console.log(`\n  ${files.length} video files in ${OUT}/`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
