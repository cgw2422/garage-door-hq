/**
 * The whole product — a paid customer's whole life — driven through the real
 * UI in a real browser against a real database.
 *
 *   partner link → sign up → attribution → trial → onboarding → pricing →
 *   invite a technician → receive stock → customer → Door Passport →
 *   schedule → inspect → Good/Better/Best → email the estimate → the customer
 *   opens the emailed link on their own phone, chooses and signs → complete →
 *   inventory deducts → passport updates → invoice → email it → payment →
 *   PDFs → review request → trial expires → the account goes read-only →
 *   a signed Stripe webhook activates it → full access returns →
 *   platform admin shows the subscription and the attribution
 *
 * Usage:  node scripts/e2e-flow.mjs [baseUrl]
 *
 * Every run creates its own company, so it is repeatable without re-seeding
 * and never disturbs the demo data.
 *
 * Two legs are simulated rather than called against Stripe's servers, and the
 * simulation is the real code path in both cases:
 *
 * - Subscription activation is a genuine `customer.subscription.updated`
 *   event, signed with the deployment's own webhook secret and POSTed to the
 *   real endpoint. Signature verification, the replay guard and the state sync
 *   all run for real; only Stripe's outbound call is absent.
 * - Card payment on an invoice needs a connected Stripe account and a real
 *   test card, so it is skipped here and covered by tests/customer-payments.ts
 *   (15 tests) and tests/webhooks.ts (17 tests) instead. The script says so
 *   rather than pretending.
 *
 * Run it against a production build on this machine:
 *
 *   ALLOW_LOCAL_APP_URL=true npx next start -p 3210
 *   node scripts/e2e-flow.mjs http://127.0.0.1:3210
 *
 * That variable is needed because the app refuses to build a customer-facing
 * link from a localhost address in production — correct on a deployment, and
 * exactly wrong here, where localhost is the address.
 */
import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import { createHmac } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const SHOTS = 'e2e-screenshots'

const stamp = Date.now().toString().slice(-7)
const OWNER_EMAIL = `owner.${stamp}@e2e.test`
const TECH_EMAIL = `tech.${stamp}@e2e.test`
const PASSWORD = 'GarageDoorHQ2026!'
const COMPANY = `Summit Overhead Door ${stamp}`
const REFERRAL_CODE = `E2E${stamp}`
const CUSTOMER_EMAIL = `rachel.${stamp}@e2e.test`
// Platform staff come from the demo seed; `npm run db:seed` creates them.
const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@garagedoorhq.test'
const ADMIN_PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'

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

/**
 * Click something on a screen that has a sticky action bar.
 *
 * Playwright scrolls an element to the viewport edge, which on a phone layout
 * puts it under the fixed bar and then refuses to click. A person scrolls a
 * little further, so this centres it — and then *checks* that centring
 * actually cleared the overlays before dispatching, so a genuinely
 * unreachable button still fails the run rather than being clicked around.
 */
async function clickCentered(locator, label = 'button') {
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page0Wait(120)

  const reachable = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    if (y < 0 || y > window.innerHeight) return { ok: false, why: 'off screen' }
    const atPoint = document.elementFromPoint(x, y)
    if (!atPoint) return { ok: false, why: 'nothing at its centre' }
    // Covered by something that is not the button or its own contents.
    if (!element.contains(atPoint) && atPoint !== element) {
      return { ok: false, why: `covered by <${atPoint.tagName.toLowerCase()}>` }
    }
    return { ok: true }
  })

  if (!reachable.ok) fail(`"${label}" is not tappable: ${reachable.why}`)

  // Dispatch on the element itself: the reachability check above is the real
  // assertion, and Playwright's own re-scroll would undo the centring.
  await locator.evaluate((element) => element.click())
}

/** A small pause, used only by clickCentered. */
function page0Wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  await withPrisma((prisma) =>
    prisma.rateLimit.deleteMany({
      where: {
        OR: ['signup:', 'login:', 'portalToken:', 'invite:'].map((scope) => ({
          key: { startsWith: scope },
        })),
      },
    }),
  )
}

/** One short-lived client per query; the script is not a long-running app. */
async function withPrisma(fn) {
  const prisma = new PrismaClient()
  try {
    return await fn(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

/** The partner whose link this run arrives through. */
async function ensureAffiliate() {
  return withPrisma((prisma) =>
    prisma.affiliate.upsert({
      where: { code: REFERRAL_CODE },
      update: {},
      create: {
        name: `E2E Partner ${stamp}`,
        email: `partner-${stamp}@e2e.test`,
        code: REFERRAL_CODE,
        commissionPercent: 20,
        notes: 'Created by the end-to-end walkthrough.',
      },
    }),
  )
}

/**
 * The link that was put in an email.
 *
 * Email delivery is not configured against a real provider here, so the
 * message is composed, logged and its body read back — which is exactly what
 * the customer would have received. The composition path is the real one.
 */
async function linkFromLastEmail(messageType) {
  const log = await withPrisma((prisma) =>
    prisma.communicationLog.findFirst({
      where: { messageType, toAddress: { endsWith: '@e2e.test' } },
      orderBy: { createdAt: 'desc' },
    }),
  )
  if (!log) fail(`No ${messageType} email was composed`)
  const match = /(https?:\/\/[^\s]+\/p\/[ei]\/[A-Za-z0-9_-]{20,})/.exec(log.body)
  if (!match) fail(`No customer link in the ${messageType} email`)
  return { url: match[1], log }
}

/**
 * Read one value out of `.env`.
 *
 * Node does not load it, and the deployment's own webhook secret is what makes
 * the activation leg a real test rather than a mock.
 */
function fromDotEnv(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env')) return null
  const match = new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?`, 'm').exec(
    readFileSync('.env', 'utf8'),
  )
  return match?.[1]?.trim() || null
}

/** Sign a webhook body the way Stripe signs one. */
function stripeSignature(body, secret) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

const run = async () => {
  await mkdir(SHOTS, { recursive: true })
  await clearOwnRateLimitWindows()
  await ensureAffiliate()

  const browser = await chromium.launch({ executablePath: findChromium() })
  const context = await browser.newContext(PHONE)
  const page = await context.newPage()
  page.on('pageerror', (error) => console.warn(`     [browser error] ${error.message}`))

  /** Filled in once the company exists; used by the later billing legs. */
  let organizationId = ''

  try {
    // --- 1. Arrive through a partner's link ---------------------------------
    //
    // The code is captured on first touch and has to survive reading the site
    // and then signing up, which a query parameter alone does not.
    await page.goto(`${BASE}/?ref=${REFERRAL_CODE}`, { waitUntil: 'domcontentloaded' })
    log(`Landed on the marketing page through ?ref=${REFERRAL_CODE}`)

    // Navigate the way a person would, losing the parameter on the way.
    await page.click('a[href="/signup"]')
    await page.waitForURL('**/signup', { timeout: 20_000 })

    // --- 2. Sign up --------------------------------------------------------
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

    // --- 3. Attribution survived the journey --------------------------------
    const referral = await withPrisma((prisma) =>
      prisma.referral.findFirst({
        where: { organization: { name: COMPANY } },
        include: { affiliate: true, organization: { select: { id: true } } },
      }),
    )
    if (!referral) fail('The partner link did not attribute this signup')
    if (referral.code !== REFERRAL_CODE) {
      fail(`Attributed to ${referral.code} rather than ${REFERRAL_CODE}`)
    }
    organizationId = referral.organization.id
    log(`Attributed to the partner (${referral.affiliate.name}, ${referral.affiliate.commissionPercent}%)`)

    // --- 4. The trial is running --------------------------------------------
    await page.goto(`${BASE}/settings/billing`, { waitUntil: 'domcontentloaded' })
    const billingText = await bodyText(page)
    expectText(billingText, 'free trial', 'The account is not on a trial')
    expectText(billingText, '$39.99', 'The billing page does not show the price')
    expectText(billingText, 'no per-user fee', 'The billing page does not state the promise')
    log('On a free trial, $39.99/month, everything included')
    await shot(page, '02-billing-trial')

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
    const emailField = page.locator('input[name="email"]')
    if (await emailField.count()) await emailField.fill(CUSTOMER_EMAIL)
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
    await page.waitForSelector('button:has-text("Build Options")', { timeout: 20_000 })
    log('Marked Springs as Failed — the priced options appeared on the finding')
    await shot(page, '09-inspection-finding')

    // The tiered set is a shortcut for companies that sell that way, offered
    // below the individual services rather than instead of them.
    await page.click('button:has-text("Build Options")')
    await page.waitForSelector('text=Review Estimate', { timeout: 20_000 })

    await page.click('button[aria-label="Rollers: Worn"]')
    await page.waitForSelector('button:has-text("Nylon Roller Upgrade")', { timeout: 20_000 })
    await page.click('button:has-text("Nylon Roller Upgrade")')
    await page.waitForTimeout(1000)
    log('One tap put Good / Better / Best on the estimate, plus the roller upgrade')

    // Each component offers the answers its own question takes. A balance test
    // passes or fails; lubrication is done or it is not; only parts wear.
    const answers = await page.evaluate(() => {
      const wanted = [
        'Door Balance',
        'Lubrication',
        'Noise / Vibration',
        'Springs',
        'Auto-Reverse Test',
        'Photo Eyes / Safety Sensors',
      ]
      const out = {}
      for (const button of document.querySelectorAll('button[aria-label]')) {
        const [component, answer] = button.getAttribute('aria-label').split(': ')
        if (!wanted.includes(component)) continue
        ;(out[component] ??= []).push(answer)
      }
      return out
    })
    for (const [component, expected] of [
      ['Door Balance', 'Balanced/Needs Adjustment/Unable to Test/N/A'],
      ['Lubrication', 'Complete/Needed/N/A'],
      ['Noise / Vibration', 'Normal/Excessive/N/A'],
      ['Springs', 'Good/Worn/Needs Attention/Failed/N/A'],
      ['Auto-Reverse Test', 'Pass/Fail/Unable to Test/N/A'],
      ['Photo Eyes / Safety Sensors', 'Working/Needs Adjustment/Failed/N/A'],
    ]) {
      const offered = answers[component]?.join('/')
      if (offered !== expected) fail(`${component} offered ${offered}, expected ${expected}`)
    }
    if (answers['Door Balance']?.includes('Worn')) fail('A balance test should never be describable as Worn')
    if (answers['Door Balance']?.includes('Pass')) fail('A door is balanced or it is not; it does not "pass"')
    log('Each item offers its own answers — no Worn balance test, no Good lubrication')

    // And a safety sensor that failed sells the repair, exactly like a failed
    // part, because severity is what the remedies match on.
    await page.click('button[aria-label="Photo Eyes / Safety Sensors: Failed"]')
    await page.waitForSelector('button:has-text("Safety Sensor")', { timeout: 20_000 })
    log('A photo eye that did not pass offered the sensor replacement')
    await shot(page, '10-inspection-quoted')

    // --- 12. The estimate ----------------------------------------------------
    await page.click('a:has-text("Review Estimate")')
    await page.waitForURL(/\/estimates\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    const estimateUrl = page.url()
    const estimateText = await bodyText(page)
    for (const tier of ['Good', 'Better', 'Best']) {
      expectText(estimateText, tier, `Estimate is missing the ${tier} option`)
    }
    expectText(estimateText, 'Recommended', 'No recommended option on the estimate')
    // The edited starter price must be the one that was quoted.
    expectText(estimateText, '$18.50', 'The estimate did not use the edited roller price')
    log('Estimate shows Good / Better / Best, itemized, priced from the edited price book')
    await shot(page, '11-estimate-builder')

    // --- 13. Customer Presentation Mode, on the technician's own device ------
    //
    // The primary way a repair is sold: the technician hands the phone over
    // and the homeowner sees the company's estimate with none of the
    // business's own numbers on it.
    await page.click('button:has-text("Present to Customer")')
    await page.waitForURL(/\/present\/[0-9a-f-]{36}$/, { timeout: 20_000 })

    const handoverText = await bodyText(page)
    expectText(handoverText, 'Ready to show your customer', 'No handover screen before presenting')
    await shot(page, '11b-presentation-handover')

    await page.click('button:has-text("Present Estimate")')
    await page.waitForSelector('text=/Choose (your option|one of)/', { timeout: 20_000 })

    const presentedText = await bodyText(page)
    for (const secret of ['Cost', 'Margin', 'Gross profit', 'In stock', 'SKU']) {
      if (contains(presentedText, secret)) {
        fail(`Presentation Mode leaked internal information: ${secret}`)
      }
    }
    expectText(presentedText, COMPANY, 'The presentation is not branded as the garage door company')
    if (contains(presentedText, 'Garage Door HQ')) {
      fail('The presentation shows our brand instead of the company’s')
    }
    // No app chrome for a customer to wander into.
    if (await page.locator('nav a[href="/jobs"]').count()) {
      fail('Presentation Mode still shows the technician’s navigation')
    }
    log('Presentation Mode: the company’s branding, no costs, no margins, no nav')
    await shot(page, '11c-presentation-options')

    // Leaving without signing, because this customer wants it emailed instead.
    // Presenting changes nothing about the document.
    // --- Email the estimate to the customer ---------------------------------
    await page.goto(estimateUrl, { waitUntil: 'domcontentloaded' })

    // The panel shows the stored address with a Change button; the field only
    // appears when there is no address on file.
    const shownAddress = await bodyText(page)
    expectText(shownAddress, CUSTOMER_EMAIL, 'The send panel does not show the customer address')

    await clickCentered(page.locator('button:has-text("Send estimate")'), 'Send estimate')
    await page.waitForTimeout(2500)

    const sendText = await bodyText(page)
    if (contains(sendText, 'estimate sent')) {
      log(`Emailed the estimate to ${CUSTOMER_EMAIL}`)
    } else if (contains(sendText, 'did not go out')) {
      log('Estimate email failed — the link is still offered to send by hand')
    } else {
      fail('The send panel reported neither a send nor a failure')
    }
    await shot(page, '12-send-estimate')

    // The message the customer would have received, read back from the log.
    const estimateEmail = await linkFromLastEmail('ESTIMATE_LINK')
    const portalUrl = estimateEmail.url

    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(portalUrl)) {
      fail(`The customer link exposes a database id: ${portalUrl}`)
    }
    if (estimateEmail.log.status === 'DELIVERED') {
      fail('A message was marked delivered without a provider delivery event')
    }
    if (!['SENT', 'FAILED'].includes(estimateEmail.log.status)) {
      fail(`Unexpected message status: ${estimateEmail.log.status}`)
    }
    // The company's name, not ours, is what the customer sees.
    if (!estimateEmail.log.subject?.includes(COMPANY)) {
      fail(`The estimate email is not branded as ${COMPANY}`)
    }
    log(`Estimate email composed and logged as ${estimateEmail.log.status}, branded as the company`)

    // --- The customer opens the emailed link, with no account ---------------
    const customerContext = await browser.newContext(PHONE)
    const customerPage = await customerContext.newPage()
    try {
      await customerPage.goto(portalUrl.replace(/^https?:\/\/[^/]+/, BASE), {
        waitUntil: 'domcontentloaded',
      })
      const portalText = await bodyText(customerPage)
      expectText(portalText, COMPANY.toLowerCase(), 'The customer page does not name the company')
      expectText(portalText, '25,000-cycle', 'The customer cannot see the options')
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

    // --- The technician's job screen answers the question ------------------
    //
    // Whichever channel approved it, the technician comes back to the job and
    // the first thing on screen is what was approved, for how much, with the
    // one thing to do about it.
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
    const approvedText = await bodyText(page)
    expectText(approvedText, 'approved', 'The job screen does not show the approval')
    expectText(approvedText, `signed by rachel ${lastName.toLowerCase()}`, 'The job screen does not name who signed')
    log('Back on the job: Approved, the amount, and who signed it')
    await shot(page, '16a-job-approved')

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

    // --- Email the invoice ----------------------------------------------------
    await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' })
    const invoiceSend = page.locator('button:has-text("Send invoice")')
    if (await invoiceSend.count()) {
      await clickCentered(invoiceSend, 'Send invoice')
      await page.waitForTimeout(2500)
      const invoiceEmail = await linkFromLastEmail('INVOICE_LINK')
      if (!invoiceEmail.log.subject?.includes(COMPANY)) {
        fail('The invoice email is not branded as the company')
      }
      log(`Invoice email composed and logged as ${invoiceEmail.log.status}`)
    } else {
      log('Invoice is settled, so there is nothing to send')
    }

    // --- Review request -------------------------------------------------------
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="url"]', 'https://g.page/r/e2e-example/review')
    await page.click('button:has-text("Save review")')
    await page.waitForTimeout(1500)

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
    const reviewButton = page.locator('button:has-text("Send review request")')
    if ((await reviewButton.count()) === 0) fail('No way to send a review request on a done job')
    await clickCentered(reviewButton, 'Send review request')
    await page.waitForTimeout(2500)

    // The panel replaces itself with the sent state, so either wording is a
    // success. The database is the assertion that matters.
    const reviewText = await bodyText(page)
    if (
      !contains(reviewText, 'review request sent') &&
      !contains(reviewText, 'sent to this customer')
    ) {
      fail('The review request did not send')
    }

    const reviewRow = await withPrisma((prisma) =>
      prisma.reviewRequest.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
    )
    if (reviewRow?.status !== 'SENT') fail('The review request was not recorded as sent')
    log('Review request sent, using the company’s own Google link')

    // Asking twice is the failure mode; the button must now refuse.
    await page.reload({ waitUntil: 'domcontentloaded' })
    const afterReview = await bodyText(page)
    if (contains(afterReview, 'send review request')) {
      fail('The review request can be sent a second time for the same job')
    }
    log('A second review request for the same job is refused')

    // --- Communication timeline ------------------------------------------------
    const customer = await withPrisma((prisma) =>
      prisma.customer.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    )
    await page.goto(`${BASE}/customers/${customer.id}`, { waitUntil: 'domcontentloaded' })
    const timelineText = await bodyText(page)
    for (const entry of ['created', 'signed', 'paid']) {
      expectText(timelineText, entry, `The customer timeline is missing "${entry}"`)
    }
    log('Customer timeline shows created, sent, signed and paid as separate events')
    await shot(page, '22-timeline')

    // --- Global search ---------------------------------------------------------
    await page.goto(`${BASE}/search?q=${encodeURIComponent('555-640-2277')}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(800)
    const searchText = await bodyText(page)
    expectText(searchText, lastName.toLowerCase(), 'Search by phone number found nothing')
    log('Search found the customer by phone number')

    await page.goto(`${BASE}/search?q=${encodeURIComponent('.225 2 27')}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(800)
    const springSearch = await bodyText(page)
    expectText(springSearch, 'spring measurements', 'Search did not read that as measurements')
    expectText(springSearch, 'torsion spring', 'Search by measurements found no springs')
    log('Search read ".225 2 27" as spring measurements and found matching stock')
    await shot(page, '23-search')

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

    // --- The trial runs out -----------------------------------------------------
    //
    // Moving the clock is the one thing a browser cannot do, so the trial end
    // date is moved instead. Everything after this is the real enforcement.
    await withPrisma((prisma) =>
      prisma.subscription.update({
        where: { organizationId },
        data: { trialEndsAt: new Date(Date.now() - 86_400_000) },
      }),
    )

    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    const expiredText = await bodyText(page)
    expectText(expiredText, 'your trial has ended', 'No notice that the trial ended')
    expectText(expiredText, 'your data is safe', 'The notice does not reassure them about data')
    expectText(expiredText, 'activate', 'No way to activate from the notice')
    log('Trial expired — the account is told its data is safe, with a way to activate')
    await shot(page, '24-trial-ended')

    // --- Read-only means read-only, not gone -------------------------------------
    await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
    const stillVisible = await bodyText(page)
    expectText(stillVisible, lastName.toLowerCase(), 'Existing customers are no longer visible')
    log('Existing customers, jobs and documents are all still readable')

    await page.goto(`${BASE}/customers/new`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="firstName"]', 'Should')
    await page.fill('input[name="lastName"]', 'NotExist')
    await page.fill('input[name="property.line1"]', '1 Blocked St')
    await page.fill('input[name="property.city"]', 'Charlotte')
    await page.fill('input[name="property.state"]', 'NC')
    await page.fill('input[name="property.postalCode"]', '28203')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const blockedText = await bodyText(page)
    expectText(blockedText, 'trial has ended', 'Creating a customer was not blocked')

    const leaked = await withPrisma((prisma) =>
      prisma.customer.count({ where: { organizationId, lastName: 'NotExist' } }),
    )
    if (leaked > 0) fail('A restricted account created a customer anyway')
    log('Creating new operational data is refused, server-side')
    await shot(page, '25-restricted')

    // --- Activation, through a genuinely signed webhook ---------------------------
    const webhookSecret = fromDotEnv('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) {
      log('STRIPE_WEBHOOK_SECRET is not set — skipping the activation leg')
    } else {
      const subscription = await withPrisma((prisma) =>
        prisma.subscription.update({
          where: { organizationId },
          data: { providerName: 'stripe', providerCustomerId: `cus_e2e_${stamp}` },
        }),
      )

      const seconds = Math.floor(Date.now() / 1000)
      const event = {
        id: `evt_e2e_${stamp}`,
        object: 'event',
        api_version: '2025-02-24.acacia',
        created: seconds,
        type: 'customer.subscription.updated',
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: {
          object: {
            id: `sub_e2e_${stamp}`,
            object: 'subscription',
            customer: subscription.providerCustomerId,
            status: 'active',
            cancel_at_period_end: false,
            canceled_at: null,
            current_period_start: seconds,
            current_period_end: seconds + 30 * 86_400,
            start_date: seconds,
            default_payment_method: null,
            metadata: { organizationId },
            items: {
              object: 'list',
              data: [
                {
                  id: `si_e2e_${stamp}`,
                  object: 'subscription_item',
                  price: {
                    id: 'price_e2e_standard',
                    object: 'price',
                    unit_amount: 3999,
                    currency: 'usd',
                  },
                },
              ],
            },
          },
        },
      }

      const body = JSON.stringify(event)

      // An unsigned delivery must be refused before anything is parsed.
      const unsigned = await page.request.post(`${BASE}/api/webhooks/stripe`, {
        headers: { 'Content-Type': 'application/json' },
        data: body,
      })
      if (unsigned.status() !== 400) {
        fail(`An unsigned webhook returned ${unsigned.status()} instead of 400`)
      }
      log('An unsigned webhook is refused')

      const signed = await page.request.post(`${BASE}/api/webhooks/stripe`, {
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': stripeSignature(body, webhookSecret),
        },
        data: body,
      })
      if (!signed.ok()) fail(`The signed webhook returned ${signed.status()}`)
      log('A correctly signed webhook is accepted')

      // Delivered twice, as Stripe routinely does.
      const replay = await page.request.post(`${BASE}/api/webhooks/stripe`, {
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': stripeSignature(body, webhookSecret),
        },
        data: body,
      })
      const replayBody = await replay.json()
      if (!replayBody.duplicate) fail('A replayed webhook was processed a second time')
      log('A replayed webhook is recognised and does nothing')

      const activated = await withPrisma((prisma) =>
        prisma.subscription.findUniqueOrThrow({ where: { organizationId } }),
      )
      if (activated.status !== 'ACTIVE') {
        fail(`The webhook did not activate the account (status ${activated.status})`)
      }
      log('The account is active — from the webhook, not from a redirect')

      // --- Full access returns ------------------------------------------------
      await page.goto(`${BASE}/customers/new`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[name="firstName"]', 'Now')
      await page.fill('input[name="lastName"]', `Allowed${stamp}`)
      await page.fill('input[name="property.line1"]', '2 Restored Way')
      await page.fill('input[name="property.city"]', 'Charlotte')
      await page.fill('input[name="property.state"]', 'NC')
      await page.fill('input[name="property.postalCode"]', '28203')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/doors/new', { timeout: 20_000 })
      log('Full access is back — a new customer saves again')
      await shot(page, '26-reactivated')

      await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
      const activeText = await bodyText(page)
      if (contains(activeText, 'your trial has ended')) {
        fail('The restriction notice is still showing on an active account')
      }
      log('The restriction notice is gone')
    }

    // --- Platform admin -------------------------------------------------------
    const adminContext = await browser.newContext(PHONE)
    const adminPage = await adminContext.newPage()
    try {
      await adminPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await adminPage.fill('input[name="email"]', ADMIN_EMAIL)
      await adminPage.fill('input[name="password"]', ADMIN_PASSWORD)
      await adminPage.click('button[type="submit"]')
      await adminPage.waitForURL('**/admin**', { timeout: 20_000 })

      await adminPage.goto(`${BASE}/admin/companies/${organizationId}`, {
        waitUntil: 'domcontentloaded',
      })
      const adminText = await bodyText(adminPage)
      expectText(adminText, COMPANY.toLowerCase(), 'Admin does not show the company')
      expectText(adminText, REFERRAL_CODE.toLowerCase(), 'Admin does not show the attribution')
      if (webhookSecret) {
        expectText(adminText, 'active', 'Admin does not reflect the subscription')
        expectText(adminText, 'stripe subscription', 'Admin does not show the Stripe ids')
      }
      log('Platform admin shows the subscription and the affiliate attribution')
      await shot(adminPage, '27-admin-company')

      await adminPage.goto(`${BASE}/admin/affiliates`, { waitUntil: 'domcontentloaded' })
      const affiliatesText = await bodyText(adminPage)
      expectText(affiliatesText, REFERRAL_CODE.toLowerCase(), 'The partner is not listed')
      expectText(affiliatesText, '20% recurring', 'The commission rate is not shown')
      log('Affiliate ledger shows the partner, their companies and what they are owed')
      await shot(adminPage, '28-admin-affiliates')
    } finally {
      await adminContext.close()
    }

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
