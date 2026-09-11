/**
 * Content-type validation by magic bytes.
 *
 * A filename extension and a Content-Type header are both attacker-controlled.
 * Before an object is accepted as an image, its leading bytes are checked
 * against the formats a camera actually produces. An SVG is deliberately not
 * among them: it is a script container, and serving one from the same origin
 * as the app would be a stored-XSS hole.
 */

export type SniffedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'image/gif'

const starts = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte)

const ascii = (bytes: Uint8Array, text: string, offset = 0) =>
  [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0))

export function sniffImageType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length < 12) return null

  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (ascii(bytes, 'RIFF') && ascii(bytes, 'WEBP', 8)) return 'image/webp'

  // ISO base media: "ftyp" at offset 4, then a brand that says which flavour.
  if (ascii(bytes, 'ftyp', 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12))
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic'
    if (['mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'image/heif'
  }

  return null
}

/** HEIC and HEIF are the same container; a mismatch between them is not a lie. */
export function typesAgree(declared: string, sniffed: SniffedType): boolean {
  if (declared === sniffed) return true
  const heif = new Set(['image/heic', 'image/heif'])
  return heif.has(declared) && heif.has(sniffed)
}

export class ContentTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentTypeError'
  }
}

/**
 * Read enough of a stored object to identify it, and reject anything that is
 * not the image type it claimed to be.
 */
export function assertImageBytes(bytes: Uint8Array, declaredType: string): SniffedType {
  const sniffed = sniffImageType(bytes)
  if (!sniffed) {
    throw new ContentTypeError('That file is not an image we can read.')
  }
  if (!typesAgree(declaredType, sniffed)) {
    throw new ContentTypeError(
      `That file says it is ${declaredType} but its contents are ${sniffed}.`,
    )
  }
  return sniffed
}
