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

/** Deliberately modest: length beats character-class theatre. */
export const PASSWORD_MIN_LENGTH = 10
