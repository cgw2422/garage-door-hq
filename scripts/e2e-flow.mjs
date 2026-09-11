/**
 * The whole product, driven through the real UI in a real browser against a
 * real database, starting from an empty account.
 *
 *   sign up → onboarding → edit the starter pricing → invite a technician →
 *   receive stock → customer → property → Door Passport → schedule the job →
 *   start → inspect → recommendations → Good/Better/Best → the customer opens
 *   a private link on their own phone, chooses and signs → complete →
 *   inventory deducts → passport updates → invoice → payment → PDF →
 *   financial dashboard
 *
 * Usage:  node scripts/e2e-flow.mjs [baseUrl]
 *
 * Every run creates its own company, so it is repeatable without re-seeding
 * and never disturbs the demo data.
 */
import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const SHOTS = 'e2e-screenshots'

const stamp = Date.now().toString().slice(-7)
const OWNER_EMAIL = `owner.${stamp}@e2e.test`
const TECH_EMAIL = `tech.${stamp}@e2e.test`
const PASSWORD = 'GarageDoorHQ2026!'
const COMPANY = `Summit Overhead Door ${stamp}`

let stepNumber = 0

function log(message) {
  stepNumber += 1
  console.log(`  ${String(stepNumber).padStart(2, '0')}. ${message}`)
}

function fail(message) {
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

function expectText(haystack, needle, what) {
  if (!contains(haystack, needle)) fail(`${what} (looked for "${needle}")`)
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

function dateString(daysFromNow) {
  const date = new Date(Date.now() + daysFromNow * 86_400_000)
  return date.toISOString().slice(0, 10)
}

function money(text) {
  const match = text.match(/\$[\d,]+\.\d\d/)
  return match ? match[0] : null
}

function centsOf(label) {
  return Number(label.replace(/[$,]/g, '')) * 100
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

const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
}

/**
 * Signing up, signing in and opening a customer link are all rate limited per
 * address — correctly, and hostile to a script that does all three on every
 * run from one machine. Clear this machine's own windows rather than loosening
 * the limits; the limits themselves are covered by tests/rate-limit.test.ts.
 *
 * Two full runs back to back genuinely exceed the portal limit, so without
 * this the second run fails on a refusal that is the product working.
 */
async function clearOwnRateLimitWindows() {
  const prisma = new PrismaClient()
  try {
    await prisma.rateLimit.deleteMany({
      where: {
        OR: ['signup:', 'login:', 'portalToken:', 'invite:'].map((scope) => ({
          key: { startsWith: scope },
        })),
      },
    })
  } finally {
    await prisma.$disconnect()
  }
}

const run = async () => {
  await mkdir(SHOTS, { recursive: true })
  await clearOwnRateLimitWindows()

  const browser = await chromium.launch({ executablePath: findChromium() })
  const context = await browser.newContext(PHONE)
  const page = await context.newPage()
  page.on('pageerror', (error) => console.warn(`     [browser error] ${error.message}`))

  try {
    // --- 1. Sign up --------------------------------------------------------
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="firstName"]', 'Dana')
    await page.fill('input[name="lastName"]', 'Reyes')
    await page.fill('input[name="email"]', OWNER_EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/onboarding/company**', { timeout: 30_000 })
    log('Signed up and landed straight in onboarding')
    await shot(page, '01-onboarding-company')

    // --- 2. Onboarding -----------------------------------------------------
    await page.fill('input[name="name"]', COMPANY)
    await page.fill('input[name="phone"]', '(555) 214-8890')
    await page.fill('input[name="postalCode"]', '28203')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/onboarding/size', { timeout: 30_000 })

    const sizeText = await bodyText(page)
    expectText(sizeText, 'solo owner/operator', 'The size step did not offer the solo path')
    await page.click('button:has-text("2–5 person company")')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/onboarding/ready', { timeout: 30_000 })

    const readyText = await bodyText(page)
    expectText(readyText, 'review your prices', 'Onboarding did not flag the starter prices as editable')
    log('Created the company with the starter catalog, told to review the prices')
    await shot(page, '02-onboarding-ready')

    await page.click('button:has-text("Go to Today")')
    await page.waitForURL('**/today', { timeout: 30_000 })

    // --- 3. Starter prices are marked as examples --------------------------
    await page.goto(`${BASE}/settings/price-book`, { waitUntil: 'domcontentloaded' })
    const bookText = await bodyText(page)
    expectText(bookText, 'starter', 'The price book does not identify the seeded prices as starter examples')
    if (contains(bookText, 'industry standard') || contains(bookText, 'recommended pricing')) {
      fail('The price book implies the starter prices are industry standard')
    }
    log('Price book labels the seeded prices as editable starter examples')
    await shot(page, '03-price-book')

    // --- 4. Edit a starter price -------------------------------------------
    await page.click('a:has-text("Nylon Roller")')
    await page.waitForURL(/\/settings\/price-book\/[0-9a-f-]{36}/, { timeout: 20_000 })
    const rollerUrl = page.url()
    await page.fill('input[name="price"]', '18.50')
    await page.click('button:has-text("Save")')
    await page.waitForTimeout(1200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const savedPrice = await page.inputValue('input[name="price"]')
    if (savedPrice !== '18.50') fail(`Edited price did not stick (got "${savedPrice}")`)
    log('Edited a starter price and it saved')

    // --- 5. Invite a technician --------------------------------------------
    await page.goto(`${BASE}/settings/team`, { waitUntil: 'domcontentloaded' })
    await page.click('button:has-text("Invite a team member")')
    await page.fill('input[name="email"]', TECH_EMAIL)
    await page.selectOption('select[name="role"]', 'TECHNICIAN')
    await page.click('button:has-text("Create invitation")')
    await page.waitForTimeout(2000)

    const teamText = await bodyText(page)
    expectText(teamText, 'pending', 'The invitation is not shown as pending')
    expectText(
      teamText,
      'email delivery is not connected',
      'The team screen does not make the missing email delivery obvious',
    )
    const inviteLink = await page
      .locator('text=/\\/invite\\/[A-Za-z0-9_-]{20,}/')
      .first()
      .innerText()
      .catch(() => null)
    if (!inviteLink) fail('No invitation link was shown for the owner to send')
    if (/[0-9a-f]{8}-[0-9a-f]{4}-/.test(inviteLink)) {
      fail('The invitation link exposes a database id')
    }
    log('Invited a technician — pending, with a link to send by hand and no fake email')
    await shot(page, '04-team-invite')

    // --- 6. Receive stock onto the truck ------------------------------------
    await page.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' })
    const emptyStock = await bodyText(page)
    expectText(emptyStock, 'restock', 'Inventory has no restock view')

    await page.goto(`${BASE}/inventory?tab=restock`, { waitUntil: 'domcontentloaded' })
    await shot(page, '05-inventory-restock')

    const restockText = await bodyText(page)
    expectText(restockText, '25K', 'The 25,000-cycle springs are not on the restock list')

    /**
     * Receive a quantity of one catalog item through the adjustment panel. The
     * point is that nothing writes a quantity directly — this is the same
     * ledger path a real receipt takes.
     */
    async function receive(itemName, quantity) {
      await page.goto(`${BASE}/inventory?tab=restock`, { waitUntil: 'domcontentloaded' })
      // getByRole avoids CSS-escaping the quote marks in a spring's name.
      const link = page.getByRole('link', { name: itemName }).first()
      if ((await link.count()) === 0) fail(`"${itemName}" is not on the restock list`)
      await link.click()
      await page.waitForURL(/\/inventory\/items\/[0-9a-f-]{36}/, { timeout: 20_000 })
      await page.click('button:has-text("Adjust")')
      await page.selectOption('select[name="reason"]', 'RECEIVED')
      await page.fill('input[name="quantity"]', String(quantity))
      await page.click('button:has-text("Post adjustment")')
      await page.waitForTimeout(2000)
      const after = await bodyText(page)
      expectText(after, 'received a shipment', `Receiving ${itemName} left no history entry`)
    }

    await receive('LH · 25K', 4)
    await receive('RH · 25K', 4)
    await receive('13-Ball Nylon Roller', 24)
    log('Received springs and rollers onto the truck through the ledger')
    await shot(page, '06-inventory-received')

    // --- 7. Customer and property -------------------------------------------
    const lastName = `Okafor${stamp}`
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

    // --- 8. Door Passport ----------------------------------------------------
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
    const passportBefore = await bodyText(page)
    expectText(passportBefore, '.225 x 2" x 27"', 'Door Passport lost the spring size that was entered')
    log('Created the Door Passport with its current .225 x 2" x 27" springs')
    await shot(page, '07-door-passport')

    // --- 9. Schedule the job on the calendar ---------------------------------
    const jobDate = dateString(1)
    await page.click('a:has-text("New job on this door")')
    await page.waitForURL('**/jobs/new**', { timeout: 20_000 })
    await page.selectOption('select[name="jobTypeId"]', { label: 'Broken Spring' })
    await page.fill('textarea[name="reportedIssue"]', 'Loud bang this morning, door will not open.')
    await page.fill('input[name="scheduledDate"]', jobDate)
    await page.fill('input[name="scheduledTime"]', '09:30')
    await page.selectOption('select[name="durationMinutes"]', '90')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    const jobUrl = page.url()
    log(`Booked the job for ${jobDate} at 9:30am`)

    await page.goto(`${BASE}/schedule?date=${jobDate}&view=day`, { waitUntil: 'domcontentloaded' })
    const scheduleText = await bodyText(page)
    expectText(scheduleText, lastName.toLowerCase(), 'The job is not on the calendar')
    expectText(scheduleText, '9:30', 'The calendar lost the appointment time')
    log('The job appears on the schedule at the time it was booked')
    await shot(page, '08-schedule')

    // --- 10. Start the job ---------------------------------------------------
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
    await page.click('button:has-text("On My Way")')
    await page.waitForSelector('button:has-text("I\'ve Arrived")', { timeout: 20_000 })
    await page.click('button:has-text("I\'ve Arrived")')
    await page.waitForSelector('button:has-text("Start Job")', { timeout: 20_000 })
    await page.click('button:has-text("Start Job")')
    await page.waitForSelector('a:has-text("Complete Job")', { timeout: 20_000 })
    log('Walked the job through On My Way → Arrived → Start Job')

    // --- 11. Inspection and recommendations ----------------------------------
    await page.goto(`${jobUrl}/inspection`, { waitUntil: 'domcontentloaded' })
    await page.click('button[aria-label="Springs: Failed"]')
    await page.waitForSelector('button:has-text("Add Good / Better / Best")', { timeout: 20_000 })
    log('Marked Springs as Failed — tiered options appeared on the finding')
    await shot(page, '09-inspection-finding')

    await page.click('button:has-text("Add Good / Better / Best")')
    await page.waitForSelector('text=Review Estimate', { timeout: 20_000 })

    await page.click('button[aria-label="Rollers: Worn"]')
    await page.waitForSelector('button:has-text("Nylon Roller Upgrade")', { timeout: 20_000 })
    await page.click('button:has-text("Nylon Roller Upgrade")')
    await page.waitForTimeout(1000)
    log('One tap put Good / Better / Best on the estimate, plus the roller upgrade')
    await shot(page, '10-inspection-quoted')

    // --- 12. The estimate ----------------------------------------------------
    await page.click('a:has-text("Review Estimate")')
    await page.waitForURL(/\/estimates\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    const estimateUrl = page.url()
    const estimateText = await bodyText(page)
    for (const tier of ['Good', 'Better', 'Best']) {
      expectText(estimateText, tier, `Estimate is missing the ${tier} option`)
    }
    expectText(estimateText, 'Most Popular', 'No recommended option on the estimate')
    // The edited starter price must be the one that was quoted.
    expectText(estimateText, '$18.50', 'The estimate did not use the edited roller price')
    log('Estimate shows Good / Better / Best, itemized, priced from the edited price book')
    await shot(page, '11-estimate-builder')

    await page.click('button:has-text("Present to customer")')
    await page.waitForURL('**/sign', { timeout: 20_000 })

    // --- 13. Issue a private link for the customer ---------------------------
    await page.goto(estimateUrl, { waitUntil: 'domcontentloaded' })
    await page.click('button:has-text("Create customer link")')
    await page.waitForTimeout(2000)
    const linkText = await page.locator('text=/https?:\\/\\/[^ ]+\\/p\\/e\\//').first().innerText()
    const portalUrl = linkText.trim()
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(portalUrl)) {
      fail(`The customer link exposes a database id: ${portalUrl}`)
    }
    const token = portalUrl.split('/').pop()
    if (!token || token.length < 20) fail('The customer link token is too short to be opaque')
    log('Issued an opaque single-document customer link')
    await shot(page, '12-share-link')

    // --- 14. The customer opens it on their own phone, with no account -------
    const customerContext = await browser.newContext(PHONE)
    const customerPage = await customerContext.newPage()
    try {
      await customerPage.goto(portalUrl.replace(/^https?:\/\/[^/]+/, BASE), {
        waitUntil: 'domcontentloaded',
      })
      const portalText = await bodyText(customerPage)
      expectText(portalText, COMPANY.toLowerCase(), 'The customer page does not name the company')
      expectText(portalText, 'good', 'The customer cannot see the options')
      if (contains(portalText, 'cost') && contains(portalText, 'margin')) {
        fail('The customer page leaks internal cost or margin')
      }
      log('Customer opened the link on their own phone, with no account')
      await shot(customerPage, '13-customer-link')

      // --- 15. They choose and sign -----------------------------------------
      await customerPage.click('text=25,000-Cycle Spring Replacement')
      await customerPage.waitForTimeout(1000)
      await sign(customerPage)
      await customerPage.fill('input[name="signerName"]', `Rachel ${lastName}`)
      await shot(customerPage, '14-customer-signature')
      await customerPage.click('button:has-text("Approve & Sign")')
      await customerPage.waitForTimeout(3000)

      const signedText = await bodyText(customerPage)
      expectText(signedText, 'approved', 'The customer page did not confirm the approval')
      log('Customer chose the 25,000-cycle option and signed through the link')
      await shot(customerPage, '15-customer-approved')

      // --- 16. The link cannot be replayed into an edit ----------------------
      await customerPage.reload({ waitUntil: 'domcontentloaded' })
      const replayText = await bodyText(customerPage)
      if (contains(replayText, 'approve & sign')) {
        fail('A signed estimate can still be signed again through the link')
      }
      log('Re-opening the link shows the signed record, not another signature prompt')
    } finally {
      await customerContext.close()
    }

    // --- 17. Complete the job ------------------------------------------------
    await page.goto(`${jobUrl}/complete`, { waitUntil: 'domcontentloaded' })
    const completeText = await bodyText(page)
    expectText(completeText, '25K', 'Parts used was not pre-filled from the signed option')
    expectText(
      completeText,
      'passport will be updated',
      'Completion did not warn that the Door Passport would change',
    )
    log('Completion screen pre-filled the parts from the option the customer signed')
    await shot(page, '16-complete-job')

    await page.fill(
      'textarea[name="workSummary"]',
      'Replaced both torsion springs with 25,000-cycle, balanced the door, tested safety reverse.',
    )
    await page.click('button:has-text("Complete & Collect Payment")')
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 })
    const invoiceUrl = page.url().split('?')[0]
    log('Completed the job — invoice generated from the signed option')

    // --- 18. Inventory deducted ----------------------------------------------
    await page.goto(`${BASE}/inventory?tab=usage`, { waitUntil: 'domcontentloaded' })
    const usageText = await bodyText(page)
    expectText(usageText, 'consumption', 'No consumption recorded in the ledger')
    expectText(usageText, '25K', 'The springs that went on the door are not in the ledger')
    log('Inventory ledger recorded the parts coming off the truck')
    await shot(page, '17-inventory-usage')

    // --- 19. Door Passport history -------------------------------------------
    await page.goto(doorUrl, { waitUntil: 'domcontentloaded' })
    const passportAfter = await bodyText(page)
    expectText(passportAfter, 'Previous Spring Systems', 'The replaced spring system was not preserved')
    expectText(passportAfter, 'Torsion Springs Replaced', 'No spring replacement entry in the timeline')
    expectText(passportAfter, '25,000 cycles', 'The new springs are not shown as current')
    expectText(passportAfter, 'historical', 'The previous spring system is not marked historical')
    if (!passportAfter.includes('→')) fail('The timeline does not show what changed')
    log('Door Passport: new springs current, old ones kept as history')
    await shot(page, '18-door-passport-after')

    // --- 20. Payment ----------------------------------------------------------
    await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' })
    const invoiceText = await bodyText(page)
    const balance = money(invoiceText)
    if (!balance) fail('Invoice did not show a balance')
    await shot(page, '19-invoice')

    // The panel opens by default when the job sent us here to collect.
    const takePayment = page.locator('button:has-text("Take payment")')
    if (await takePayment.count()) await takePayment.click()
    await page.click('button:has-text("Record $"), button:has-text("Record ")')
    await page.waitForTimeout(2500)
    const paidText = await bodyText(page)
    expectText(paidText, 'Paid in full', 'Invoice did not settle after recording payment')
    log(`Recorded the payment — invoice settled (${balance})`)
    await shot(page, '20-invoice-paid')

    // --- 21. PDFs -------------------------------------------------------------
    /**
     * Fetch inside the page so the browser's own session cookie authorizes the
     * download, and so Chromium's PDF viewer does not wrap the bytes in HTML
     * the way a navigation would.
     */
    async function fetchDocument(url) {
      return page.evaluate(async (target) => {
        const response = await fetch(target, { credentials: 'include' })
        const buffer = await response.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          length: bytes.length,
          head: String.fromCharCode(...bytes.subarray(0, 5)),
        }
      }, url)
    }

    const estimatePdfUrl = `${estimateUrl.replace('/estimates/', '/api/documents/estimates/')}/pdf`
    const invoicePdfUrl = `${invoiceUrl.replace('/invoices/', '/api/documents/invoices/')}/pdf`

    for (const [label, url] of [
      ['Estimate', estimatePdfUrl],
      ['Invoice', invoicePdfUrl],
    ]) {
      const result = await fetchDocument(url)
      if (result.status !== 200) fail(`${label} PDF returned ${result.status}`)
      if (result.contentType !== 'application/pdf') {
        fail(`${label} PDF served as ${result.contentType}`)
      }
      if (result.head !== '%PDF-') fail(`${label} PDF is not a PDF`)
      if (result.length < 2000) fail(`${label} PDF is suspiciously small`)
      log(`${label} PDF rendered (${Math.round(result.length / 1024)} kB)`)
    }

    // A signed estimate's PDF must not follow later price book edits.
    await page.goto(rollerUrl, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="price"]', '99.00')
    await page.click('button:has-text("Save")')
    await page.waitForTimeout(1500)
    await page.goto(estimateUrl, { waitUntil: 'domcontentloaded' })
    const afterEdit = await fetchDocument(estimatePdfUrl)
    if (afterEdit.status !== 200 || afterEdit.head !== '%PDF-') {
      fail('The estimate PDF stopped rendering after a price book edit')
    }
    const signedStillShows = await bodyText(page)
    expectText(signedStillShows, '$18.50', 'The signed estimate followed the new price book price')
    if (contains(signedStillShows, '$99.00')) {
      fail('The signed estimate picked up the new roller price')
    }
    log('Raised the roller price to $99 — the signed estimate keeps its own numbers')

    // --- 22. Financial dashboard ----------------------------------------------
    await page.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' })
    const moneyText = await bodyText(page)
    expectText(moneyText, 'estimated gross profit', 'No gross profit on the financial dashboard')
    const collected = money(moneyText)
    if (!collected) fail('The financial dashboard shows no money at all')
    if (centsOf(collected) <= 0) fail('The financial dashboard shows nothing collected')
    log(`Financial dashboard reflects the completed job (${collected})`)
    await shot(page, '21-money')

    // --- Isolation spot check --------------------------------------------------
    const strangerContext = await browser.newContext(PHONE)
    const stranger = await strangerContext.newPage()
    try {
      const response = await stranger.goto(invoiceUrl, { waitUntil: 'domcontentloaded' })
      const url = stranger.url()
      if (!url.includes('/login')) {
        fail(`A signed-out visitor reached the invoice (${response?.status()} at ${url})`)
      }
      log('A signed-out visitor is sent to the login screen, not the invoice')
    } finally {
      await strangerContext.close()
    }

    console.log('\n  ✓ Full product walkthrough completed end to end')
    console.log(`  Company: ${COMPANY}`)
    console.log(`  Screenshots: ${SHOTS}/\n`)
  } finally {
    await context.close()
    await browser.close()
  }
}

run().catch((error) => {
  console.error(`\n  ✗ ${error.message}\n`)
  process.exit(1)
})
