#!/usr/bin/env node
/**
 * Look for credentials in the working tree and, optionally, in every commit.
 *
 * A secret deleted from the current source is still in the history, still in
 * every clone, and still valid. So this reports *where* something matched and
 * never what it matched — printing the value would put it in a CI log, which
 * is another place it does not belong.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs            # working tree (tracked files)
 *   node scripts/scan-secrets.mjs --history  # every blob in every commit
 *
 * Exit 0 when nothing matched, 1 when something did.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Patterns for credentials that are actually issued, not for anything that
 * merely looks secret. Each one is a real provider's format, so a match is a
 * finding rather than a conversation about entropy.
 */
const PATTERNS = [
  { name: 'Stripe live secret key', re: /\bsk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe live restricted key', re: /\brk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe test secret key', re: /\bsk_test_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe webhook secret', re: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { name: 'AWS/R2 access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{20,}/ },
  { name: 'Postmark server token', re: /\bPOSTMARK_SERVER_TOKEN\s*=\s*["']?[0-9a-f-]{30,}/i },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  {
    name: 'Postgres URL with a password',
    // Ignores the well-known local ones, which are not credentials.
    re: /\bpostgres(?:ql)?:\/\/[^\s:'"]+:(?!postgres@|password@)[^\s@'"]{6,}@/,
  },
  {
    name: 'Generic assigned secret',
    re: /\b(AUTH_SECRET|NEXTAUTH_SECRET|DEMO_SEED_TOKEN|R2_SECRET_ACCESS_KEY|STRIPE_SECRET_KEY)\s*=\s*["']?(?!\s*$)(?!["']{2})(?!your-|replace-|changeme|xxx|<)[^\s"'#]{16,}/,
  },
]

/** Files that exist to show the shape of a secret, not to hold one. */
const IGNORED_PATHS = [
  /^\.env\.example$/,
  /^docs\//,
  /^README\.md$/,
  /^scripts\/scan-secrets\.mjs$/,
  /^package-lock\.json$/,
  /^tests\//,
  /^src\/lib\/environment\.ts$/,
  /^\.github\/workflows\//,
]

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|zip|gz)$/i

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

function scan(text, where, findings) {
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    // A long line is almost always minified or generated; scanning it produces
    // noise rather than findings.
    if (line.length > 2000) continue
    for (const pattern of PATTERNS) {
      if (pattern.re.test(line)) {
        findings.push({ where, line: index + 1, name: pattern.name })
      }
    }
  }
}

const history = process.argv.includes('--history')
const findings = []

if (history) {
  // Every blob that has ever been committed, by the path it was committed at.
  const objects = git(['rev-list', '--objects', '--all']).split('\n')
  let scanned = 0
  for (const entry of objects) {
    const space = entry.indexOf(' ')
    if (space < 0) continue
    const sha = entry.slice(0, space)
    const path = entry.slice(space + 1)
    if (!path || BINARY.test(path)) continue
    if (IGNORED_PATHS.some((rule) => rule.test(path))) continue

    let content
    try {
      content = git(['cat-file', '-p', sha])
    } catch {
      continue
    }
    if (content.length > 2_000_000) continue
    scanned += 1
    scan(content, `${path} (blob ${sha.slice(0, 8)})`, findings)
  }
  console.log(`Scanned ${scanned} historical file versions across every commit.`)
} else {
  const files = git(['ls-files']).split('\n').filter(Boolean)
  let scanned = 0
  for (const path of files) {
    if (BINARY.test(path)) continue
    if (IGNORED_PATHS.some((rule) => rule.test(path))) continue
    let content
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    scanned += 1
    scan(content, path, findings)
  }
  console.log(`Scanned ${scanned} tracked files in the working tree.`)
}

if (findings.length === 0) {
  console.log('No credentials found.')
  process.exit(0)
}

// Deliberately: what and where, never the value.
console.log(`\n${findings.length} possible credential${findings.length === 1 ? '' : 's'}:\n`)
for (const finding of findings) {
  console.log(`  ${finding.name}`)
  console.log(`    ${finding.where}:${finding.line}`)
}
console.log('')
console.log('A credential that was ever committed must be ROTATED, not just deleted —')
console.log('it is in every clone and every fork of this repository already.')
process.exit(1)
