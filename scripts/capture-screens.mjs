/**
 * A guided tour of the product, captured as screenshots.
 *
 * Runs against the demo seed rather than a fresh signup, because the demo
 * company has fourteen months of history behind it — a Today screen with real
 * jobs on it says more about the product than an empty one does.
 *
 * Usage:  npm run db:seed && node scripts/capture-screens.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3210'
const OUT = 'screens'
const EMAIL = process.env.DEMO_EMAIL ?? 'mike@precisiongaragedoor.test'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'
const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@garagedoorhq.test'

const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
}
const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }

let n = 0
function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!root || !existsSync(root)) return undefined
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium-')) continue
    const candidate = join(root, entry, 'chrome-linux', 'chrome')
    if (existsSync(candidate)) return candidate
  }
}

/**
 * Capture what a person actually sees.
 *
 * Viewport rather than full-page on purpose: the bottom tab bar and the sticky
 * action bar are fixed, and a full-page capture stamps them wherever the
 * viewport happened to be — through the middle of the content. A phone screen
 * is the honest frame for a mobile-first product anyway.
 */
async function shot(page, name, options) {
  n += 1
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`
  if (options?.scrollTo !== undefined) {
    await page.evaluate((y) => window.scrollTo(0, y), options.scrollTo)
  }
  // Let fonts settle and any entrance transition finish.
  await page.waitForTimeout(450)
  await page.screenshot({ path: file })
  console.log(`  ${file}`)
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(today|admin)/, { timeout: 20_000 })
}

async function withPrisma(fn) {
  const prisma = new PrismaClient()
  try {
    return await fn(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Pick the record with the most to show.
 *
 * The newest row is usually the emptiest — a warehouse door nobody has worked
 * on yet says nothing about a Door Passport. These pick the one with history.
 */
async function richestDoorId() {
  const rows = await withPrisma((prisma) =>
    prisma.door.findMany({
      select: { id: true, _count: { select: { events: true, springSystems: true, jobs: true } } },
    }),
  )
  const best = rows
    .map((row) => ({
      id: row.id,
      score: row._count.events * 3 + row._count.springSystems * 2 + row._count.jobs,
    }))
    .sort((a, b) => b.score - a.score)[0]
  return best?.id ?? null
}

async function richestCustomerId() {
  const rows = await withPrisma((prisma) =>
    prisma.customer.findMany({
      select: { id: true, _count: { select: { invoices: true, jobs: true, estimates: true } } },
    }),
  )
  const best = rows
    .map((row) => ({
      id: row.id,
      score: row._count.invoices * 2 + row._count.jobs + row._count.estimates,
    }))
    .sort((a, b) => b.score - a.score)[0]
  return best?.id ?? null
}

async function richestJobId() {
  const row = await withPrisma((prisma) =>
    prisma.job.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    }),
  )
  return row?.id ?? null
}

const run = async () => {
  await mkdir(OUT, { recursive: true })

  // Repeated runs would otherwise trip the login limit, which is doing its job.
  await withPrisma((prisma) =>
    prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'login:' } } }),
  )
  const browser = await chromium.launch({ executablePath: findChromium() })

  // ---------------------------------------------------------------- phone
  const phone = await browser.newContext(PHONE)
  const page = await phone.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'sign-in')

  await page.goto(`${BASE}/forgot`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'forgot-password')

  await signIn(page, EMAIL)
  await shot(page, 'today')

  await page.goto(`${BASE}/schedule`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'schedule')

  await page.goto(`${BASE}/search?q=${encodeURIComponent('.225 2 27')}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(900)
  await shot(page, 'search-spring')

  await page.goto(`${BASE}/search?q=${encodeURIComponent('704')}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(900)
  await shot(page, 'search-phone')

  const jobId = await richestJobId()
  if (jobId) {
    await page.goto(`${BASE}/jobs/${jobId}`, { waitUntil: 'domcontentloaded' })
    await shot(page, 'job')
  }

  const doorId = await richestDoorId()
  if (doorId) {
    await page.goto(`${BASE}/doors/${doorId}`, { waitUntil: 'domcontentloaded' })
    await shot(page, 'door-passport')
    await shot(page, 'door-passport-history', { scrollTo: 760 })
  }

  const customerId = await richestCustomerId()
  if (customerId) {
    await page.goto(`${BASE}/customers/${customerId}`, { waitUntil: 'domcontentloaded' })
    await shot(page, 'customer')
    await shot(page, 'customer-timeline', { scrollTo: 1400 })
  }

  await page.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'inventory')

  await page.goto(`${BASE}/tools/spring-calculator`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'spring-calculator')

  await page.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'money')

  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'settings')

  await page.goto(`${BASE}/settings/billing`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'billing')

  await page.goto(`${BASE}/settings/payments`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'customer-payments')

  await page.goto(`${BASE}/settings/team`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'team')

  await page.goto(`${BASE}/settings/price-book`, { waitUntil: 'domcontentloaded' })
  await shot(page, 'price-book')
  await shot(page, 'price-book-items', { scrollTo: 520 })

  // ------------------------------------------------- what the customer sees
  //
  // Sending an estimate issues a private link and composes the email. No
  // provider is configured here, so the link is read back out of the
  // communication log — which is exactly what the customer would have got.
  const estimateId = await withPrisma((prisma) =>
    prisma.estimate
      .findFirst({ where: { status: { in: ['SENT', 'ACCEPTED'] } }, orderBy: { createdAt: 'desc' } })
      .then((row) => row?.id ?? null),
  )

  if (estimateId) {
    await page.goto(`${BASE}/estimates/${estimateId}`, { waitUntil: 'domcontentloaded' })
    const send = page.locator('button:has-text("Send estimate")')
    if (await send.count()) {
      await send.evaluate((element) => element.click())
      await page.waitForTimeout(2500)
    }

    const log = await withPrisma((prisma) =>
      prisma.communicationLog.findFirst({
        where: { messageType: 'ESTIMATE_LINK' },
        orderBy: { createdAt: 'desc' },
      }),
    )
    const link = log?.body?.match(/https?:\/\/[^\s]+\/p\/e\/[A-Za-z0-9_-]{20,}/)?.[0]

    if (link) {
      const customer = await browser.newContext(PHONE)
      const customerPage = await customer.newPage()
      const url = link.replace(/^https?:\/\/[^/]+/, BASE)
      await customerPage.goto(url, { waitUntil: 'domcontentloaded' })
      await shot(customerPage, 'customer-estimate')
      await shot(customerPage, 'customer-options', { scrollTo: 700 })
      await shot(customerPage, 'customer-signature', { scrollTo: 2600 })
      await customer.close()
    }
  }

  // -------------------------------------------------- the lifecycle states
  //
  // The trial end date is moved and put back, so the demo company is left
  // exactly as it was found.
  const subscription = await withPrisma((prisma) =>
    prisma.subscription.findFirst({ orderBy: { createdAt: 'asc' } }),
  )
  if (subscription) {
    try {
      await withPrisma((prisma) =>
        prisma.subscription.update({
          where: { organizationId: subscription.organizationId },
          data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() - 86_400_000) },
        }),
      )
      await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
      await shot(page, 'trial-ended')

      await page.goto(`${BASE}/customers/new`, { waitUntil: 'domcontentloaded' })
      await shot(page, 'read-only')
    } finally {
      await withPrisma((prisma) =>
        prisma.subscription.update({
          where: { organizationId: subscription.organizationId },
          data: {
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
          },
        }),
      )
    }
  }

  await phone.close()

  // -------------------------------------------------------------- desktop
  const desktop = await browser.newContext(DESKTOP)
  const wide = await desktop.newPage()
  await signIn(wide, EMAIL)
  await shot(wide, 'desktop-today')

  await wide.goto(`${BASE}/schedule?view=week`, { waitUntil: 'domcontentloaded' })
  await shot(wide, 'desktop-schedule')

  await wide.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' })
  await shot(wide, 'desktop-money')
  await desktop.close()

  // ---------------------------------------------------------------- admin
  const adminContext = await browser.newContext(DESKTOP)
  const admin = await adminContext.newPage()
  await signIn(admin, ADMIN_EMAIL)
  await shot(admin, 'platform-admin')

  await admin.goto(`${BASE}/admin/affiliates`, { waitUntil: 'domcontentloaded' })
  await shot(admin, 'platform-affiliates')
  await adminContext.close()

  await browser.close()
  console.log(`\n  ${n} screens in ${OUT}/\n`)
}

run().catch((error) => {
  console.error(`\n  ✗ ${error.message}\n`)
  process.exit(1)
})
