/**
 * Walk the public site and fail on anything a visitor should never see.
 *
 * Run against a production build. It visits every route in
 * `src/lib/public-routes.ts` plus the 404, at phone, tablet and desktop
 * widths, and checks each one for the things that are easy to ship by
 * accident and embarrassing to ship at all:
 *
 *   - a page that does not render, or renders an error
 *   - an environment banner on what is supposed to be the public site
 *   - a stale price, a stale trial length, or an advertised price the
 *     pricing configuration no longer holds
 *   - a missing or duplicated `<h1>`
 *   - an image with no alt text
 *   - horizontal scroll on a phone, which is the single most common way a
 *     marketing page is broken on the device most people read it on
 *   - a product screenshot that failed to load
 *
 * It also screenshots every page at every width into `public-site/`, which is
 * what the walkthrough at the end of a redesign is actually looking at.
 *
 * Usage:
 *   npx next build && APP_ENV=production ALLOW_LOCAL_APP_URL=true npx next start -p 3210
 *   node scripts/public-site-check.mjs [baseUrl]
 */
import { launchChromium } from './browser.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3210'
const OUT = 'public-site'

/** Read the route list out of the TypeScript source rather than duplicating it. */
function publicRoutes() {
  const source = readFileSync('src/lib/public-routes.ts', 'utf8')
  const routes = [...source.matchAll(/\{ path: '([^']+)', label: '([^']+)'/g)].map(
    ([, path, label]) => ({ path, label }),
  )
  if (routes.length === 0) throw new Error('could not read PUBLIC_ROUTES')
  return routes
}

/** Read the live pricing configuration, so the checks cannot drift from it. */
function pricing() {
  const source = readFileSync('src/lib/pricing.ts', 'utf8')
  const number = (name) => {
    const match = source.match(new RegExp(`export const ${name} = ([0-9_]+)`))
    if (!match) throw new Error(`could not read ${name}`)
    return Number(match[1].replaceAll('_', ''))
  }
  const flag = (name) => /true/.test(source.match(new RegExp(`export const ${name} = (\\w+)`))[1])
  return {
    standardMonthly: number('STANDARD_MONTHLY_CENTS'),
    standardAnnual: number('STANDARD_ANNUAL_CENTS'),
    foundingAnnual: number('FOUNDING_ANNUAL_CENTS'),
    trialDays: number('TRIAL_DAYS'),
    foundingActive: flag('FOUNDING_OFFER_ACTIVE'),
  }
}

const WIDTHS = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'tablet', viewport: { width: 834, height: 1112 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]

const problems = []

function fail(where, message) {
  problems.push(`${where}: ${message}`)
  console.log(`  ✗ ${where}: ${message}`)
}

async function auditPage(page, route, width, price) {
  const where = `${route.path} @ ${width.name}`

  const facts = await page.evaluate(() => ({
    text: document.body.innerText,
    h1s: [...document.querySelectorAll('h1')].map((el) => el.textContent?.trim() ?? ''),
    imagesWithoutAlt: [...document.querySelectorAll('img')].filter(
      (img) => !img.getAttribute('alt')?.trim(),
    ).length,
    renderedImages: [...document.querySelectorAll('img')].filter(
      (img) => img.getClientRects().length > 0,
    ).length,
    // Every image that is actually rendered should have loaded by now: the
    // page has been scrolled end to end, so "not complete" means it never
    // arrived rather than "not reached yet".
    //
    // Images hidden at this width are skipped rather than failed. The second
    // phone in a layered pair is `hidden sm:block` on purpose — two
    // overlapping phones on a 390px screen are two unreadable phones — and an
    // image inside a `display: none` element never intersects the viewport, so
    // it is correctly never fetched.
    brokenImages: [...document.querySelectorAll('img')]
      .filter((img) => img.getClientRects().length > 0)
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src')),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    title: document.title,
    description:
      document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
  }))

  // --- Nothing broken, nothing internal -----------------------------------
  for (const phrase of [
    'Application error',
    'This page could not be loaded',
    'DEVELOPMENT',
    'STAGING',
    'Internal Server Error',
  ]) {
    if (facts.text.includes(phrase)) fail(where, `shows "${phrase}"`)
  }

  // --- Prices come from the configuration ---------------------------------
  const dollars = (cents) =>
    `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`

  if (/\$39\.99/.test(facts.text) && !price.foundingActive) {
    // Fine: with no offer running, $39.99 is the price.
  } else if (/\$39\.99/.test(facts.text)) {
    // With the offer running it may only appear struck through, which is
    // checked structurally below rather than by reading the text.
    const struck = await page.evaluate(() =>
      [...document.querySelectorAll('s, del, [class*="line-through"]')]
        .map((el) => el.textContent ?? '')
        .join(' '),
    )
    if (!struck.includes('$39.99')) {
      fail(where, '$39.99 appears without being struck through')
    }
  }

  if (price.foundingActive && /\$399\b/.test(facts.text)) {
    const struck = await page.evaluate(() =>
      [...document.querySelectorAll('s, del, [class*="line-through"]')]
        .map((el) => el.textContent ?? '')
        .join(' '),
    )
    if (!struck.includes('$399')) fail(where, '$399 appears without being struck through')
  }

  if (/\b14[- ]day\b/i.test(facts.text) || /\b14 days\b/i.test(facts.text)) {
    fail(where, 'mentions a 14-day trial')
  }

  if (
    ['/', '/pricing'].includes(route.path) &&
    price.foundingActive &&
    !facts.text.includes(dollars(price.foundingAnnual))
  ) {
    fail(where, `does not show the founding price ${dollars(price.foundingAnnual)}`)
  }

  // --- Structure ----------------------------------------------------------
  if (facts.h1s.length === 0) fail(where, 'has no <h1>')
  if (facts.h1s.length > 1) fail(where, `has ${facts.h1s.length} <h1> elements`)
  if (facts.imagesWithoutAlt > 0) fail(where, `${facts.imagesWithoutAlt} image(s) with no alt text`)
  for (const src of facts.brokenImages) fail(where, `image failed to load: ${src}`)

  // --- Layout -------------------------------------------------------------
  if (facts.scrollWidth > facts.clientWidth + 1) {
    fail(where, `scrolls horizontally (${facts.scrollWidth} > ${facts.clientWidth})`)
  }

  // --- SEO, once per route -------------------------------------------------
  if (width.name === 'desktop') {
    if (!facts.title) fail(where, 'has no <title>')
    if (facts.title.includes('· Garage Door HQ · Garage Door HQ')) {
      fail(where, 'title has a doubled suffix')
    }
    // The 404 is deliberately noindex and carries neither a description nor a
    // canonical: a canonical on a page that does not exist points a crawler at
    // a URL that does not exist.
    if (route.label !== '404') {
      if (!facts.description) fail(where, 'has no meta description')
      if (!facts.canonical) fail(where, 'has no canonical URL')
    }
  }
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const routes = publicRoutes()
  const price = pricing()
  const browser = await launchChromium()

  console.log(`\nChecking ${routes.length + 1} pages at ${WIDTHS.length} widths\n`)

  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: width.viewport,
        deviceScaleFactor: 2,
        isMobile: width.isMobile ?? false,
        hasTouch: width.hasTouch ?? false,
      })
      const page = await context.newPage()

      for (const route of [...routes, { path: '/this-page-does-not-exist', label: '404' }]) {
        const response = await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' })
        const status = response?.status() ?? 0
        const expected = route.label === '404' ? 404 : 200
        if (status !== expected) {
          fail(`${route.path} @ ${width.name}`, `HTTP ${status}, expected ${expected}`)
        }

        // Walk the page so every lazy image loads. Without this a full-page
        // screenshot is accurate about the layout and wrong about the
        // content: each screenshot below the fold is a white rectangle,
        // because it never entered a viewport.
        await page.evaluate(async () => {
          const step = window.innerHeight * 0.8
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y)
            await new Promise((resolve) => setTimeout(resolve, 120))
          }
          window.scrollTo(0, 0)
        })
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(600)

        await auditPage(page, route, width, price)

        const slug = route.path === '/' ? 'home' : route.path.replace(/\//g, '-').slice(1)
        await page.screenshot({
          path: `${OUT}/${width.name}-${slug}.png`,
          fullPage: width.name === 'desktop',
        })
        console.log(`  ${width.name.padEnd(7)} ${route.label}`)
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log()
  if (problems.length > 0) {
    console.log(`${problems.length} problem(s):`)
    for (const problem of problems) console.log(`  - ${problem}`)
    process.exit(1)
  }
  console.log(`No problems. Screenshots in ${OUT}/`)
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
