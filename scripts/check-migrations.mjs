#!/usr/bin/env node
/**
 * Read every migration and say which ones can lose data.
 *
 * Prisma's `migrate deploy` is the right command for production — it never
 * resets, never pushes a diff it invented, and never asks a question it will
 * answer itself. What it will happily do is run a `DROP COLUMN` somebody
 * generated three weeks ago, because that is what the file says.
 *
 * So the safety here is not "stop the migration". It is "nobody gets to be
 * surprised": destructive statements are named, with their file and their
 * line, before the release is promoted. A column drop that everyone has seen
 * and agreed to is fine. The same drop discovered from a support ticket is
 * not.
 *
 * Exit codes:
 *   0  nothing destructive, or `--allow-destructive` was passed
 *   1  destructive statements found and not acknowledged
 *   2  the migrations directory is malformed
 *
 * Usage:
 *   node scripts/check-migrations.mjs
 *   node scripts/check-migrations.mjs --since 20260101_something
 *   node scripts/check-migrations.mjs --only 20260101_a,20260102_b
 *   node scripts/check-migrations.mjs --allow-destructive
 *
 * In CI the interesting set is "what this release adds", which git already
 * knows:
 *
 *   node scripts/check-migrations.mjs --only "$(git diff --name-only \
 *     origin/production...HEAD -- prisma/migrations |
 *     cut -d/ -f3 | sort -u | paste -sd,)"
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'prisma/migrations'

/**
 * Statements that can destroy data that already exists.
 *
 * `NOT NULL` on an existing column and a new `UNIQUE` index are in here for a
 * different reason from the drops: they do not delete anything, they fail the
 * whole deployment if the data does not already satisfy them. On production
 * that is an outage rather than a loss, which still belongs in a review.
 */
const RULES = [
  { pattern: /\bDROP\s+TABLE\b/i, label: 'drops a table', severity: 'destructive' },
  { pattern: /\bDROP\s+COLUMN\b/i, label: 'drops a column', severity: 'destructive' },
  { pattern: /\bDROP\s+SCHEMA\b/i, label: 'drops a schema', severity: 'destructive' },
  { pattern: /\bDROP\s+DATABASE\b/i, label: 'drops a database', severity: 'destructive' },
  { pattern: /\bTRUNCATE\b/i, label: 'truncates a table', severity: 'destructive' },
  { pattern: /\bDELETE\s+FROM\b/i, label: 'deletes rows', severity: 'destructive' },
  {
    pattern: /\bALTER\s+COLUMN\b[\s\S]{0,80}?\bTYPE\b/i,
    label: 'changes a column type (can fail or truncate)',
    severity: 'destructive',
  },
  {
    pattern: /\bDROP\s+(CONSTRAINT|INDEX)\b/i,
    label: 'drops a constraint or index',
    severity: 'review',
  },
  {
    pattern: /\bSET\s+NOT\s+NULL\b/i,
    label: 'makes a column required (fails if any row is null)',
    severity: 'review',
  },
  {
    pattern: /\bCREATE\s+UNIQUE\s+INDEX\b/i,
    label: 'adds a unique index (fails on existing duplicates)',
    severity: 'review',
  },
  { pattern: /\bRENAME\s+(TO|COLUMN)\b/i, label: 'renames (old name stops working)', severity: 'review' },
]

/** Strip comments so a rule cannot fire on an explanation of itself. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '')
}

function migrationDirectories() {
  let entries
  try {
    entries = readdirSync(MIGRATIONS_DIR)
  } catch {
    console.error(`No ${MIGRATIONS_DIR} directory. Run this from the repository root.`)
    process.exit(2)
  }
  return entries
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .sort()
}

function findingsFor(name) {
  const path = join(MIGRATIONS_DIR, name, 'migration.sql')
  let sql
  try {
    sql = readFileSync(path, 'utf8')
  } catch {
    return [{ line: 0, label: 'has no migration.sql', severity: 'review', text: '' }]
  }

  const lines = stripComments(sql).split('\n')
  const findings = []
  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          line: index + 1,
          label: rule.label,
          severity: rule.severity,
          text: line.trim().slice(0, 120),
        })
      }
    }
  }
  return findings
}

const args = process.argv.slice(2)
const allowDestructive = args.includes('--allow-destructive')
const sinceIndex = args.indexOf('--since')
const since = sinceIndex >= 0 ? args[sinceIndex + 1] : null
const onlyIndex = args.indexOf('--only')
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] ?? '') : null

let names = migrationDirectories()

if (only !== null) {
  const wanted = new Set(
    only
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  // An empty --only is the normal case for a release with no schema change,
  // not an error.
  names = names.filter((name) => wanted.has(name))
} else if (since) {
  const start = names.indexOf(since)
  if (start < 0) {
    console.error(`--since ${since} is not a migration directory.`)
    process.exit(2)
  }
  names = names.slice(start + 1)
}

// Migration directories are applied in lexical order, so a name that sorts
// before one already applied would be skipped silently on a deployed database.
const outOfOrder = names.filter((name, index) => index > 0 && name < names[index - 1])
if (outOfOrder.length > 0) {
  console.error('Migration directories do not sort in the order they were written:')
  for (const name of outOfOrder) console.error(`  ${name}`)
  process.exit(2)
}

let destructive = 0
let review = 0

console.log(`Checked ${names.length} migration${names.length === 1 ? '' : 's'}.\n`)

for (const name of names) {
  const findings = findingsFor(name)
  if (findings.length === 0) continue

  console.log(name)
  for (const finding of findings) {
    const mark = finding.severity === 'destructive' ? 'DESTRUCTIVE' : 'REVIEW     '
    console.log(`  ${mark} line ${finding.line}: ${finding.label}`)
    if (finding.text) console.log(`              ${finding.text}`)
    if (finding.severity === 'destructive') destructive += 1
    else review += 1
  }
  console.log('')
}

if (destructive === 0 && review === 0) {
  console.log('Nothing that can lose or block data. Safe to deploy.')
  process.exit(0)
}

console.log(`${destructive} destructive, ${review} worth a look.`)

if (destructive > 0 && !allowDestructive) {
  console.log('')
  console.log('A destructive migration must be acknowledged before it reaches production.')
  console.log('Take a backup, confirm the column or table really is unused, then re-run with')
  console.log('--allow-destructive (or set ALLOW_DESTRUCTIVE_MIGRATION=true on the release).')
  process.exit(1)
}

process.exit(0)
