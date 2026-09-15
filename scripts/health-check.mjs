#!/usr/bin/env node
/**
 * Ask a deployment whether it is actually up, and whether it is the one we meant.
 *
 * Run after every deploy. The second half matters as much as the first: a
 * green health check on the wrong environment is how a production release gets
 * signed off from a staging URL.
 *
 * Usage:
 *   node scripts/health-check.mjs https://app.garagedoorhq.com --expect production
 *   node scripts/health-check.mjs https://staging.garagedoorhq.com --expect staging
 *
 * Exit 0 when the deployment is ready and is the expected environment.
 */

const [url, ...rest] = process.argv.slice(2)
if (!url) {
  console.error('Usage: node scripts/health-check.mjs <base-url> [--expect production|staging]')
  process.exit(2)
}

const expectIndex = rest.indexOf('--expect')
const expected = expectIndex >= 0 ? rest[expectIndex + 1] : null
const attempts = Number(process.env.HEALTH_CHECK_ATTEMPTS ?? 10)
const delayMs = Number(process.env.HEALTH_CHECK_DELAY_MS ?? 6000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function once() {
  const response = await fetch(new URL('/api/health', url), {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json()
  return { status: response.status, body }
}

let last = null
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    last = await once()
    if (last.status === 200 && last.body?.ok) break
    console.log(`attempt ${attempt}/${attempts}: not ready yet (${last.status})`)
  } catch (error) {
    console.log(`attempt ${attempt}/${attempts}: ${error instanceof Error ? error.message : error}`)
  }
  if (attempt < attempts) await sleep(delayMs)
}

if (!last || last.status !== 200 || !last.body?.ok) {
  console.error('\nDeployment is not healthy.')
  console.error(JSON.stringify(last?.body ?? {}, null, 2))
  process.exit(1)
}

const { environment, required, optional } = last.body
console.log(`\n${url} is up.`)
console.log(`  environment : ${environment?.name ?? 'unknown'}${environment?.declared ? '' : ' (INFERRED — APP_ENV is not set)'}`)
console.log(`  database    : ${required.database}`)
console.log(`  auth secret : ${required.authSecret}`)
console.log(`  app url     : ${required.appUrl}`)
console.log(`  storage     : ${optional.storage}`)
console.log(`  email       : ${optional.email}`)
console.log(`  stripe      : ${optional.stripe}`)

if (expected && environment?.name !== expected) {
  console.error(
    `\nThis is the ${environment?.name} deployment, not ${expected}. ` +
      'Check the URL and the service that was deployed before going any further.',
  )
  process.exit(1)
}

if (expected === 'production') {
  // Production must have said what it is. An inferred environment means the
  // outbound-email guard is holding real customer mail back.
  if (!environment?.declared) {
    console.error('\nAPP_ENV is not set on production. Outbound email is being held back.')
    process.exit(1)
  }
  if (optional.storage !== 'r2') {
    console.error('\nProduction is using local disk for uploads. Photos will not survive a redeploy.')
    process.exit(1)
  }
  if (optional.email !== 'ok') {
    console.error('\nProduction has no email provider. Customers will not receive their documents.')
    process.exit(1)
  }
}

console.log('\nHealthy.')
