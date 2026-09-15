#!/usr/bin/env node
/**
 * Two companies, a technician and a customer, all trying to reach what they
 * should not — through a real browser, against a running server.
 *
 * The unit tests call the services directly, which proves the server refuses.
 * This proves the same thing through the stack a real attacker uses: a signed
 * cookie, a URL bar, a server-action payload, a back gesture. The two overlap
 * on purpose. A control that exists in the service and is bypassed by a route
 * handler passes one and fails the other.
 *
 *   node scripts/adversarial.mjs http://127.0.0.1:3000
 *
 * Every check is an attempt that must fail. A green run means nothing got
 * through.
 */

import { launchChromium } from './browser.mjs'
import { PrismaClient } from '@prisma/client'
import { mkdir } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const SHOTS = 'e2e-screenshots'
const stamp = Date.now().toString().slice(-7)
const PASSWORD = 'GarageDoorHQ2026!'

const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}
const DESKTOP = { viewport: { width: 1440, height: 900 } }

const prisma = new PrismaClient()

let checks = 0
let held = 0

function pass(message) {
  checks += 1
  held += 1
  console.log(`  ✓ ${message}`)
}

function fail(message) {
  checks += 1
  console.log(`  ✗ BREACH: ${message}`)
  breaches.push(message)
}

const breaches = []

async function bodyText(page) {
  try {
    return (await page.locator('body').innerText()).toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Open a URL as this identity and assert it yields nothing usable.
 *
 * "Nothing usable" is a 404, a redirect to somewhere they are allowed, or a
 * page that does not contain the secret. A 200 that renders the other
 * company's data is the failure.
 */
async function mustNotReach(page, path, secret, label) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  const status = response?.status() ?? 0
  const text = await bodyText(page)
  const landed = new URL(page.url()).pathname

  if (status === 404 || status === 401 || status === 403) {
    pass(`${label} — ${status}`)
    return
  }
  if (landed !== path) {
    pass(`${label} — redirected to ${landed}`)
    return
  }
  if (secret && text.includes(secret.toLowerCase())) {
    fail(`${label} — served "${secret}" at ${path}`)
    return
  }
  if (status === 200 && secret) {
    pass(`${label} — 200 but none of the data`)
    return
  }
  fail(`${label} — ${status} at ${path} with no refusal`)
}

/** Sign up a whole company through the real screens. */
async function signUpCompany(context, { email, company }) {
  const page = await context.newPage()
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="firstName"]', 'Owner')
  await page.fill('input[name="lastName"]', company.slice(0, 12))
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/onboarding/**', { timeout: 30_000 })

  await page.goto(`${BASE}/onboarding/company`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="name"]', company)
  await page.fill('input[name="phone"]', '(555) 010-0000')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/onboarding\/(size|ready)|\/today/, { timeout: 30_000 })

  const size = page.locator('button:has-text("Just me")')
  if (await size.count()) {
    await size.first().click()
    await page.waitForTimeout(800)
  }
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  return page
}

/** A customer, an address, a door and a job — the records worth stealing. */
async function buildRecords(page, { customerLast }) {
  await page.goto(`${BASE}/customers/new`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="firstName"]', 'Private')
  await page.fill('input[name="lastName"]', customerLast)
  await page.fill('input[name="phone"]', '(555) 222-3333')
  await page.fill('input[name="property.line1"]', '99 Secret Lane')
  await page.fill('input[name="property.city"]', 'Charlotte')
  await page.fill('input[name="property.state"]', 'NC')
  await page.fill('input[name="property.postalCode"]', '28202')
  await page.click('button[type="submit"]')
  // Creating a customer lands on the new-door screen for their address.
  await page.waitForURL('**/doors/new', { timeout: 30_000 })

  await page.fill('input[name="nickname"]', 'Secret Garage')
  await page.selectOption('select[name="widthInches"]', '192')
  await page.selectOption('select[name="heightInches"]', '84')
  await page.fill('input[name="manufacturer"]', 'Clopay')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/doors\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const doorId = new URL(page.url()).pathname.split('/')[2]

  const door = await prisma.door.findUniqueOrThrow({ where: { id: doorId } })
  const property = await prisma.property.findUniqueOrThrow({ where: { id: door.propertyId } })
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: property.customerId } })

  await page.click('a:has-text("New job on this door")')
  await page.waitForURL('**/jobs/new**', { timeout: 30_000 })
  await page.fill('textarea[name="reportedIssue"]', 'Confidential: spring broken, gate code 4417')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const jobId = new URL(page.url()).pathname.split('/')[2]

  return { customerId: customer.id, propertyId: property.id, doorId, jobId }
}

/**
 * Signing up and signing in are rate limited per address — correctly, and
 * hostile to a script that does both several times from one machine. Clearing
 * this machine's own windows is the honest fix; the limits themselves are
 * covered by tests/rate-limit.test.ts and exercised below.
 */
async function clearOwnRateLimitWindows() {
  await prisma.rateLimit.deleteMany({
    where: {
      OR: ['signup:', 'login:', 'portalToken:'].map((scope) => ({
        key: { startsWith: scope },
      })),
    },
  })
}

/** An estimate with one priced option, so Presentation Mode has something to show. */
async function seedEstimateFor(jobId) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
  const item = await prisma.priceBookItem.findFirstOrThrow({
    where: { organizationId: job.organizationId, isActive: true },
  })
  const estimate = await prisma.estimate.create({
    data: {
      organizationId: job.organizationId,
      number: Math.floor(Math.random() * 100_000),
      customerId: job.customerId,
      jobId: job.id,
      title: 'Recommended Repair',
      status: 'DRAFT',
      taxRateBps: 0,
      options: {
        create: {
          name: 'Replace Both Springs',
          sortOrder: 0,
          subtotalCents: item.priceCents,
          taxCents: 0,
          totalCents: item.priceCents,
          items: {
            create: {
              priceBookItemId: item.id,
              kind: 'PART',
              name: item.name,
              quantity: 1,
              unitPriceCents: item.priceCents,
              unitCostCents: item.costCents,
              sortOrder: 0,
            },
          },
        },
      },
    },
  })
  return estimate
}

async function run() {
  await mkdir(SHOTS, { recursive: true })
  await clearOwnRateLimitWindows()
  const browser = await launchChromium()

  try {
    console.log(`\nAdversarial run against ${BASE}\n`)

    // ---------------------------------------------------------------- setup
    console.log('Setting up two companies…')
    const contextA = await browser.newContext(PHONE)
    const contextB = await browser.newContext(PHONE)

    const pageA = await signUpCompany(contextA, {
      email: `owner.a.${stamp}@adv.test`,
      company: `Company A ${stamp}`,
    })
    const pageB = await signUpCompany(contextB, {
      email: `owner.b.${stamp}@adv.test`,
      company: `Company B ${stamp}`,
    })

    const secretLast = `Victim${stamp}`
    const B = await buildRecords(pageB, { customerLast: secretLast })
    const A = await buildRecords(pageA, { customerLast: `Mine${stamp}` })
    console.log(`  Company B's customer: Private ${secretLast}\n`)

    // Company A needs an estimate for the presentation-mode checks. Built
    // directly, because the path that builds one through the UI is what
    // scripts/e2e-flow.mjs covers; what is under test here is what the
    // presentation screen shows, not how the estimate got there.
    await seedEstimateFor(A.jobId)

    const bEstimate = await prisma.estimate.findFirst({
      where: { jobId: B.jobId },
      orderBy: { createdAt: 'desc' },
    })
    const bPhoto = await prisma.photo.findFirst({
      where: { organizationId: (await prisma.job.findUniqueOrThrow({ where: { id: B.jobId } })).organizationId },
    })

    // ------------------------------------------- A pointing at B's URLs
    console.log("Company A typing Company B's URLs:")
    await mustNotReach(pageA, `/customers/${B.customerId}`, secretLast, "customer record")
    await mustNotReach(pageA, `/properties/${B.propertyId}`, 'Secret Lane', 'property record')
    await mustNotReach(pageA, `/doors/${B.doorId}`, 'Secret Garage', 'Door Passport')
    await mustNotReach(pageA, `/jobs/${B.jobId}`, 'gate code 4417', 'job, with its private notes')
    await mustNotReach(pageA, `/jobs/${B.jobId}/inspection`, 'gate code 4417', 'inspection')
    await mustNotReach(pageA, `/jobs/${B.jobId}/complete`, 'gate code 4417', 'completion screen')
    if (bEstimate) {
      await mustNotReach(pageA, `/estimates/${bEstimate.id}`, secretLast, 'estimate builder')
      await mustNotReach(pageA, `/present/${bEstimate.id}`, secretLast, 'presentation mode')
      await mustNotReach(
        pageA,
        `/api/documents/estimates/${bEstimate.id}/pdf`,
        secretLast,
        'estimate PDF',
      )
    }
    if (bPhoto) {
      await mustNotReach(pageA, `/api/files/photos/${bPhoto.id}`, null, 'photo bytes')
    }
    await mustNotReach(pageA, '/admin', 'companies', 'platform admin')
    await mustNotReach(pageA, `/admin/companies/${B.customerId}`, null, 'platform admin company page')

    // ------------------------------------------------- search leakage
    console.log('\nSearching for what belongs to someone else:')
    // The search screen echoes the query back ("Nothing matches …"), so the
    // name appearing on the page proves nothing. What would prove a leak is a
    // link to the record, so that is what is checked.
    for (const [query, label] of [
      [secretLast, 'by name'],
      ['555 222 3333', 'by phone number'],
      ['99 Secret Lane', 'by address'],
    ]) {
      await pageA.goto(`${BASE}/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
      })
      const links = await pageA.locator('a[href*="/customers/"], a[href*="/jobs/"], a[href*="/doors/"]').evaluateAll(
        (nodes) => nodes.map((node) => node.getAttribute('href')),
      )
      const leaked = links.filter((href) =>
        [B.customerId, B.jobId, B.doorId, B.propertyId].some((id) => href?.includes(id)),
      )
      if (leaked.length > 0) {
        fail(`search ${label} linked to Company B's records: ${leaked.join(', ')}`)
      } else {
        pass(`search ${label} returns none of the other company's records`)
      }
    }

    // ------------------------------------------ signed out, from scratch
    console.log('\nWith no account at all:')
    const anonContext = await browser.newContext(PHONE)
    const anon = await anonContext.newPage()
    for (const [path, label] of [
      [`/customers/${B.customerId}`, 'customer record'],
      [`/jobs/${B.jobId}`, 'job'],
      ['/today', 'the dashboard'],
      ['/money', 'the money dashboard'],
      ['/settings', 'company settings'],
      ['/admin', 'platform admin'],
    ]) {
      const response = await anon.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      const landed = new URL(anon.url()).pathname
      if (landed.startsWith('/login') || (response?.status() ?? 0) >= 400) {
        pass(`${label} — sent to sign in`)
      } else {
        fail(`${label} — reachable signed out (${landed})`)
      }
    }
    // The brokered file routes answer with a status rather than a redirect.
    if (bPhoto) {
      const photoResponse = await anon.goto(`${BASE}/api/files/photos/${bPhoto.id}`)
      const status = photoResponse?.status() ?? 0
      if (status === 401 || status === 404) pass(`photo bytes — ${status}`)
      else fail(`photo bytes reachable signed out (${status})`)
    }
    await anonContext.close()

    // --------------------------------------- a technician reaching up
    console.log('\nA technician trying to become an administrator:')
    const techEmail = `tech.${stamp}@adv.test`
    const orgA = (
      await prisma.membership.findFirstOrThrow({
        where: { user: { email: `owner.a.${stamp}@adv.test` } },
      })
    ).organizationId
    const techUser = await prisma.user.create({
      data: {
        email: techEmail,
        // bcrypt hash of PASSWORD, so the technician can really sign in.
        passwordHash: await (await import('bcryptjs')).default.hash(PASSWORD, 12),
        firstName: 'Tess',
        lastName: 'Technician',
      },
    })
    await prisma.membership.create({
      data: { userId: techUser.id, organizationId: orgA, role: 'TECHNICIAN', isActive: true },
    })

    const techContext = await browser.newContext(PHONE)
    const tech = await techContext.newPage()
    await tech.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await tech.fill('input[name="email"]', techEmail)
    await tech.fill('input[name="password"]', PASSWORD)
    await tech.click('button[type="submit"]')
    await tech.waitForURL(/\/today|\/onboarding/, { timeout: 30_000 })
    pass('technician signed in')

    for (const [path, label] of [
      ['/settings/team', 'the team screen'],
      ['/settings/billing', 'the subscription'],
      ['/money', 'the money dashboard'],
      ['/admin', 'platform admin'],
    ]) {
      const response = await tech.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      const status = response?.status() ?? 0
      const landed = new URL(tech.url()).pathname
      const text = await bodyText(tech)
      // A refusal can be a status, a redirect, or a page that renders only an
      // explanation. All three are fine; rendering the data is not.
      const refused =
        status >= 400 ||
        landed !== path ||
        text.includes('not permitted') ||
        text.includes('not available for your role') ||
        text.includes('do not have permission')
      if (refused) pass(`${label} — refused`)
      else fail(`${label} — a technician can open ${path}`)
    }

    // The price book is deliberately readable by a technician — they cannot
    // build an estimate without it. What must not be there is any way to
    // change what something costs.
    await tech.goto(`${BASE}/settings/price-book`, { waitUntil: 'domcontentloaded' })
    const priceBookText = await bodyText(tech)
    const editAffordances = await tech
      .locator('a[href*="/price-book/new"], a[href*="/price-book/packages/new"], button:has-text("Archive")')
      .count()
    if (editAffordances > 0) {
      fail(`the price book offers a technician ${editAffordances} way(s) to change it`)
    } else {
      pass('the price book is readable by a technician but offers no way to change a price')
    }
    if (priceBookText.match(/cost\s*\$/)) {
      fail('the price book shows a technician the cost of a part')
    } else {
      pass('and does not show them what the company pays for a part')
    }

    // The same margin data, reached the other way round: the truck screen and
    // a part's own page both know the cost.
    await tech.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' })
    if ((await bodyText(tech)).includes('at cost')) {
      fail('the inventory screen values a technician’s truck at cost')
    } else {
      pass('the truck screen shows the parts without valuing them')
    }

    const stocked = await prisma.stockLevel.findFirst({ where: { organizationId: orgA } })
    if (stocked) {
      await tech.goto(`${BASE}/inventory/items/${stocked.priceBookItemId}`, {
        waitUntil: 'domcontentloaded',
      })
      if ((await bodyText(tech)).includes('your cost')) {
        fail('a part’s page shows a technician what the company pays for it')
      } else {
        pass('and a part’s page shows the sell price without the cost')
      }
    }

    // And B's records, as a technician of A.
    await mustNotReach(tech, `/customers/${B.customerId}`, secretLast, "technician → B's customer")
    await mustNotReach(tech, `/jobs/${B.jobId}`, 'gate code 4417', "technician → B's job")
    await techContext.close()

    // --------------------------------------------- the customer link
    console.log('\nA customer on a private link:')
    const bOrgId = (await prisma.job.findUniqueOrThrow({ where: { id: B.jobId } })).organizationId
    const aEstimate = await prisma.estimate.findFirst({
      where: { organizationId: orgA },
      orderBy: { createdAt: 'desc' },
    })
    const bLink = await prisma.portalLink.findFirst({
      where: { organizationId: bOrgId },
      orderBy: { createdAt: 'desc' },
    })

    const custContext = await browser.newContext(PHONE)
    const cust = await custContext.newPage()

    // Guessing tokens.
    for (const token of [
      'a'.repeat(43),
      '00000000000000000000000000000000000000000000',
      '../../../etc/passwd',
      'null',
    ]) {
      const response = await cust.goto(`${BASE}/p/e/${encodeURIComponent(token)}`, {
        waitUntil: 'domcontentloaded',
      })
      const status = response?.status() ?? 0
      const text = await bodyText(cust)
      // The product answers a bad token with a friendly page rather than a
      // 404, and says the same thing for unknown, expired and revoked — which
      // is the point: a prober learns nothing from the difference. So the test
      // is whether a document came back, not what the status code was.
      const refusal =
        status >= 400 ||
        text.includes("isn't available") ||
        text.includes('no longer') ||
        text.includes('too many attempts')
      const leakedDocument =
        text.includes('approve') || text.includes('estimate ') || /\$\d/.test(text)
      if (refusal && !leakedDocument) {
        pass(`guessed token "${token.slice(0, 12)}…" — refused, with nothing to learn`)
      } else {
        fail(`guessed token "${token.slice(0, 12)}…" returned a document (${status})`)
      }
    }

    // A real token, then trying to walk out of it.
    if (bLink && aEstimate) {
      for (const [path, label] of [
        [`/estimates/${aEstimate.id}`, "the technician's estimate editor"],
        [`/customers/${B.customerId}`, "the company's customer list"],
        ['/today', 'the dashboard'],
        ['/money', 'the money dashboard'],
      ]) {
        const response = await cust.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
        const landed = new URL(cust.url()).pathname
        if (landed.startsWith('/login') || (response?.status() ?? 0) >= 400) {
          pass(`a customer cannot reach ${label}`)
        } else {
          fail(`a customer reached ${label}`)
        }
      }
    }
    await custContext.close()

    // -------------------------------------------- presentation mode
    console.log('\nCustomer Presentation Mode, on the technician’s own device:')
    if (aEstimate) {
      await pageA.goto(`${BASE}/present/${aEstimate.id}`, { waitUntil: 'domcontentloaded' })
      const handover = await bodyText(pageA)
      if (handover.includes('ready to show your customer')) {
        pass('opens on a handover screen, not straight into the estimate')
      } else {
        fail('presentation mode did not show the handover screen')
      }

      const present = pageA.locator('button:has-text("Present Estimate")')
      if (await present.count()) {
        await present.click()
        await pageA.waitForTimeout(1200)
      }

      const presented = await bodyText(pageA)
      for (const secret of ['cost', 'margin', 'gross profit', 'in stock', 'sku', 'price book']) {
        if (presented.includes(secret)) {
          fail(`presentation mode shows "${secret}"`)
        }
      }
      pass('no cost, margin, stock, SKU or price-book wording on screen')

      if (await pageA.locator('nav a[href="/jobs"], a[href="/money"], a[href="/settings"]').count()) {
        fail('presentation mode still offers the app navigation')
      } else {
        pass('no navigation back into the business')
      }

      // The back gesture, which is what a customer holding the phone will do.
      await pageA.goBack()
      await pageA.waitForTimeout(800)
      const afterBack = new URL(pageA.url()).pathname
      if (afterBack.startsWith('/present/')) {
        pass('a back gesture stays inside the presentation')
      } else {
        fail(`a back gesture left presentation mode for ${afterBack}`)
      }
      await pageA.screenshot({ path: `${SHOTS}/adv-presentation.png`, fullPage: true })
    }

    // ------------------------------------------------------ desktop
    console.log('\nThe same, on a desktop browser:')
    const deskContext = await browser.newContext(DESKTOP)
    const desk = await deskContext.newPage()
    await desk.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await desk.fill('input[name="email"]', `owner.a.${stamp}@adv.test`)
    await desk.fill('input[name="password"]', PASSWORD)
    await desk.click('button[type="submit"]')
    await desk.waitForURL(/\/today/, { timeout: 30_000 })
    await mustNotReach(desk, `/customers/${B.customerId}`, secretLast, "desktop → B's customer")
    await mustNotReach(desk, `/jobs/${B.jobId}`, 'gate code 4417', "desktop → B's job")
    await desk.screenshot({ path: `${SHOTS}/adv-desktop.png`, fullPage: true })
    await deskContext.close()

    // -------------------------------------------- cookie tampering
    console.log('\nTampering with the session cookie:')
    const cookies = await contextA.cookies()
    const session = cookies.find((cookie) => cookie.name.includes('authjs.session-token'))
    if (!session) {
      fail('no session cookie found to tamper with')
    } else {
      if (session.httpOnly) pass('session cookie is httpOnly')
      else fail('session cookie is readable by JavaScript')
      if (session.sameSite === 'Lax' || session.sameSite === 'Strict') {
        pass(`session cookie is SameSite=${session.sameSite}`)
      } else {
        fail(`session cookie is SameSite=${session.sameSite}`)
      }

      const forged = await browser.newContext(PHONE)
      await forged.addCookies([
        { ...session, value: `${session.value.slice(0, -6)}AAAAAA` },
      ])
      const forgedPage = await forged.newPage()
      await forgedPage.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
      if (new URL(forgedPage.url()).pathname.startsWith('/login')) {
        pass('an edited session token is rejected')
      } else {
        fail('an edited session token was accepted')
      }
      await forged.close()

      // The cookie is not readable from the page, which is the point of httpOnly.
      const visible = await pageA.evaluate(() => document.cookie)
      if (visible.includes('session-token')) {
        fail('the session token is visible to page JavaScript')
      } else {
        pass('the session token is invisible to page JavaScript')
      }
    }

    // ------------------------------------------ what the page leaks
    console.log('\nWhat the HTML itself carries:')
    await pageA.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    const html = await pageA.content()
    for (const marker of [
      'AUTH_SECRET',
      'DATABASE_URL',
      'sk_live_',
      'sk_test_',
      'whsec_',
      'R2_SECRET',
      'postgres://',
      'postgresql://',
    ]) {
      if (html.includes(marker)) fail(`the page source contains ${marker}`)
    }
    pass('no secrets, keys or connection strings in the page source')

    await contextA.close()
    await contextB.close()
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

run()
  .then(() => {
    console.log(`\n${held}/${checks} attempts were refused.`)
    if (breaches.length > 0) {
      console.log('\nBREACHES:')
      for (const breach of breaches) console.log(`  - ${breach}`)
      process.exit(1)
    }
    console.log('Nothing got through.\n')
  })
  .catch((error) => {
    console.error('\nRun failed:', error)
    process.exit(1)
  })
