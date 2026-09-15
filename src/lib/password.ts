import bcrypt from 'bcryptjs'

/**
 * bcrypt with a work factor of 12. Hashing happens only in the Node runtime -
 * never in middleware or an edge function.
 */
const WORK_FACTOR = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, WORK_FACTOR)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** Re-exported for server code; the browser imports it from password-policy. */
export { PASSWORD_MIN_LENGTH } from './password-policy'

/**
 * A real hash of a value nobody knows, for the "no such account" path.
 *
 * Login has to spend the same time whether or not the address exists,
 * otherwise the response time answers "is this person a customer?" for
 * anyone with a stopwatch. Comparing against a *syntactically invalid* hash
 * does not achieve that: bcrypt rejects it immediately, so a missing account
 * answers in well under a millisecond while a real one takes ~300ms. That is
 * not a subtle signal — it is a reliable oracle from a single request.
 *
 * So the decoy is a genuine bcrypt hash at the same work factor, computed
 * once when the module loads. Verifying against it costs exactly what
 * verifying a real account costs, because it is the same work.
 */
const DECOY_HASH = bcrypt.hashSync(
  `decoy-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  WORK_FACTOR,
)

/** Spend a password verification's worth of time, and always fail. */
export async function verifyAgainstDecoy(plain: string): Promise<false> {
  await bcrypt.compare(plain, DECOY_HASH)
  return false
}
