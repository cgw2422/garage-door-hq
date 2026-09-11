/**
 * End-to-end walkthrough of the Phase 1a field workflow, driven through the
 * real UI in a real browser against a real database.
 *
 *   new customer → property → Door Passport → job → inspection →
 *   Good/Better/Best estimate → customer signature → repair →
 *   inventory deduction → invoice → payment → Door Passport history
 *
 * Usage:  npm run db:seed && node scripts/e2e-flow.mjs [baseUrl]
 *
 * Re-seed before each run: the flow consumes real stock from the demo truck,
 * and a second run against the same data will (correctly) be refused for
 * insufficient inventory.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const EMAIL = process.env.DEMO_EMAIL ?? 'mike@precisiongaragedoor.test'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'
const SHOTS = 'e2e-screenshots'

const steps = []
let stepNumber = 0

function log(message) {
  stepNumber += 1
  const line = `${String(stepNumber).padStart(2, '0')}. ${message}`
  steps.push(line)
  console.log(`  ${line}`)
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`)
  process.exitCode = 1
  throw new Error(message)
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

/**
 * Rendered page text, lowercased. innerText reflects CSS, so section headings
 * styled `text-transform: uppercase` come back uppercased; assertions compare
 * case-insensitively rather than depending on styling.
 */
async function bodyText(page) {
  return (await page.locator('body').innerText()).toLowerCase()
}

function contains(haystack, needle) {
  return haystack.includes(needle.toLowerCase())
}

/** Draw a signature on the capture canvas with real pointer movement. */
async function sign(page) {
  const canvas = page.locator('canvas')
  await canvas.waitFor({ state: 'visible' })
  // page.mouse works in viewport coordinates, so the pad has to be on screen
  // before its box is measured.
  await canvas.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box = await canvas.boundingBox()
  if (!box) fail('Signature canvas was not visible')

  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 30, y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + 30 + i * 18, y + Math.sin(i) * 22)
  }
  await page.mouse.up()
  await page.waitForTimeout(150)
}

/**
 * Playwright's bundled browser, wherever this environment put it. Falls back to
 * Playwright's own resolution when nothing is pre-installed.
 */
function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!root || !existsSync(root)) return undefined

  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium-')) continue
    const candidate = join(root, entry, 'chrome-linux', 'chrome')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const run = async () => {
  await mkdir(SHOTS, { recursive: true })

  const browser = await chromium.launch({ executablePath: findChromium() })
  const context = await browser.newContext({
    // A phone, because that is the primary product.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  page.on('pageerror', (error) => console.warn(`     [browser error] ${error.message}`))

  try {
    // --- Sign in -----------------------------------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/today', { timeout: 20_000 })
    log('Signed in and landed on Today')
    await shot(page, '01-today')

    // --- New customer with a service address -------------------------------
    const stamp = Date.now().toString().slice(-6)
    const lastName = `Kim${stamp}`
    await page.goto(`${BASE}/customers/new`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="firstName"]', 'Rachel')
    await page.fill('input[name="lastName"]', lastName)
    await page.fill('input[name="phone"]', '(555) 640-2277')
    await page.fill('input[name="property.line1"]', '410 Sycamore Ave')
    await page.fill('input[name="property.city"]', 'Charlotte')
    await page.fill('input[name="property.state"]', 'NC')
    await page.fill('input[name="property.postalCode"]', '28203')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/doors/new', { timeout: 20_000 })
    log(`Created customer Rachel ${lastName} with a service address`)

    // --- Door Passport ------------------------------------------------------
    await page.fill('input[name="nickname"]', 'Front Garage')
    await page.selectOption('select[name="widthInches"]', '192')
    await page.selectOption('select[name="heightInches"]', '84')
    await page.fill('input[name="manufacturer"]', 'Clopay')
    await page.fill('input[name="model"]', 'Premium 4050')
    await page.selectOption('select[name="material"]', 'STEEL')
    await page.fill('input[name="weightLbs"]', '178')

    await page.click('button:has-text("Add spring measurements")')
    await page.fill('input[name="spring.wireSizeInches"]', '0.225')
    await page.fill('input[name="spring.insideDiameterInches"]', '2')
    await page.fill('input[name="spring.lengthInches"]', '27')
    await page.fill('input[name="spring.cycleRating"]', '10000')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/doors\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    const doorUrl = page.url()
    log('Created the Door Passport with its current .225 x 2" x 27" springs')
    await shot(page, '02-door-passport')

    const passportBefore = await bodyText(page)
    if (!contains(passportBefore, '.225 x 2" x 27"')) {
      fail('Door Passport did not show the spring size that was entered')
    }

    // --- Job ---------------------------------------------------------------
    await page.click('a:has-text("New job on this door")')
    await page.waitForURL('**/jobs/new**', { timeout: 20_000 })
    await page.selectOption('select[name="jobTypeId"]', { label: 'Broken Spring' })
    await page.fill(
      'textarea[name="reportedIssue"]',
      'Loud bang this morning, door will not open.',
    )
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    const jobUrl = page.url()
    log('Scheduled a Broken Spring job on that door')

    // --- Move the job along -------------------------------------------------
    await page.click('button:has-text("On My Way")')
    await page.waitForSelector('button:has-text("I\'ve Arrived")', { timeout: 20_000 })
    await page.click('button:has-text("I\'ve Arrived")')
    await page.waitForSelector('button:has-text("Start Job")', { timeout: 20_000 })
    await page.click('button:has-text("Start Job")')
    await page.waitForSelector('a:has-text("Complete Job")', { timeout: 20_000 })
    log('Walked the job through On My Way → Arrived → Start Job')

    // --- Inspection ---------------------------------------------------------
    await page.goto(`${jobUrl}/inspection`, { waitUntil: 'domcontentloaded' })
    await page.click('button[aria-label="Springs: Failed"]')
    await page.waitForSelector('button:has-text("Add Good / Better / Best")', { timeout: 20_000 })
    log('Marked Springs as Failed — tiered options appeared on the finding')
    await shot(page, '03-inspection-finding')

    await page.click('button:has-text("Add Good / Better / Best")')
    await page.waitForSelector('text=Review Estimate', { timeout: 20_000 })
    log('One tap put Good, Better and Best on the estimate')

    await page.click('button[aria-label="Rollers: Worn"]')
    await page.waitForSelector('button:has-text("Nylon Roller Upgrade")', { timeout: 20_000 })
    await page.click('button:has-text("Nylon Roller Upgrade")')
    await page.waitForTimeout(800)
    log('Marked Rollers as Worn and added the roller upgrade')
    await shot(page, '04-inspection-quoted')

    // --- Estimate -----------------------------------------------------------
    await page.click('a:has-text("Review Estimate")')
    await page.waitForURL(/\/estimates\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    const estimateText = await bodyText(page)
    for (const tier of ['Good', 'Better', 'Best']) {
      if (!contains(estimateText, tier)) fail(`Estimate is missing the ${tier} option`)
    }
    if (!contains(estimateText, 'Most Popular')) fail('No recommended option on the estimate')
    log('Estimate shows Good / Better / Best, itemized, with a recommendation')
    await shot(page, '05-estimate-builder')

    await page.click('button:has-text("Present to customer")')
    await page.waitForURL('**/sign', { timeout: 20_000 })
    log('Presented the estimate to the customer')

    // --- Customer selects and signs ----------------------------------------
    await page.click('text=25,000-Cycle Spring Replacement')
    await page.waitForTimeout(800)
    await sign(page)
    await shot(page, '06-signature')
    await page.click('button:has-text("Approve & Sign")')
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    log('Customer chose the 25,000-cycle option and signed')

    // --- Complete the job ---------------------------------------------------
    await page.goto(`${jobUrl}/complete`, { waitUntil: 'domcontentloaded' })
    const completeText = await bodyText(page)
    if (!contains(completeText, '25K')) {
      fail('Parts used was not pre-filled from the signed option')
    }
    if (!contains(completeText, 'passport will be updated')) {
      fail('Completion did not warn that the Door Passport would change')
    }
    log('Completion screen pre-filled the parts from the signed option')
    await shot(page, '07-complete-job')

    await page.fill(
      'textarea[name="workSummary"]',
      'Replaced both torsion springs with 25,000-cycle, balanced the door, tested safety reverse.',
    )
    await page.click('button:has-text("Complete & Collect Payment")')
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 })
    log('Completed the job — invoice generated from the signed option')

    // --- Payment ------------------------------------------------------------
    const invoiceText = await bodyText(page)
    const balanceMatch = invoiceText.match(/\$[\d,]+\.\d\d/)
    if (!balanceMatch) fail('Invoice did not show a balance')
    await shot(page, '08-invoice')

    await page.click('button:has-text("Record")')
    await page.waitForURL(/\/invoices\//, { timeout: 20_000 })
    await page.waitForTimeout(1200)
    const paidText = await bodyText(page)
    if (!contains(paidText, 'Paid in full')) fail('Invoice did not settle after recording payment')
    log(`Recorded the payment — invoice settled (${balanceMatch[0]})`)
    await shot(page, '09-invoice-paid')

    // --- Door Passport history ---------------------------------------------
    await page.goto(doorUrl, { waitUntil: 'domcontentloaded' })
    const passportAfter = await bodyText(page)

    if (!contains(passportAfter, 'Previous Spring Systems')) {
      fail('The replaced spring system was not preserved as history')
    }
    if (!contains(passportAfter, 'Torsion Springs Replaced')) {
      fail('The passport timeline has no spring replacement entry')
    }
    if (!contains(passportAfter, '25,000 cycles')) {
      fail('The passport does not show the new 25,000-cycle springs as current')
    }
    if (!contains(passportAfter, 'historical')) {
      fail('The previous spring system is not marked as historical')
    }
    if (!passportAfter.includes('→')) {
      fail('The timeline does not show what changed')
    }
    log('Door Passport: new springs are current, old ones kept as history')
    await shot(page, '10-door-passport-after')

    // --- Inventory ----------------------------------------------------------
    await page.goto(`${BASE}/inventory?tab=usage`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h1', { timeout: 20_000 })
    const usageText = await bodyText(page)
    if (!contains(usageText, 'consumption')) fail('No consumption recorded in the ledger')
    log('Inventory ledger recorded the parts coming off the truck')
    await shot(page, '11-inventory-usage')

    console.log('\n  ✓ Full field workflow completed end to end\n')
    console.log(`  Screenshots: ${SHOTS}/\n`)
  } finally {
    await context.close()
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
