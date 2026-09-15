import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { escapeHtml, renderEmailHtml, safeUrl } from '@/server/email/templates/layout'
import { sniffImageType, typesAgree } from '@/server/storage/sniff'
import { buildStorageKey } from '@/server/storage'
import { storageNamespace } from '@/lib/environment'

/**
 * The web surface: what happens to text somebody typed.
 *
 * A garage door company types their own name, a technician types a note, a
 * homeowner types the name they sign with. All of it is stored and later
 * rendered — on a screen, in a PDF, in an email that lands in someone else's
 * inbox. The question this file asks is whether any of it can stop being text
 * and start being code.
 */

/** Things that stop being text if anything forgets to escape them. */
const MARKUP_PAYLOADS = [
  '<script>alert(document.cookie)</script>',
  '"><img src=x onerror=alert(1)>',
  '<iframe src="javascript:alert(1)">',
  '<svg onload=alert(1)>',
  "'; DROP TABLE \"Customer\"; --",
  '</title><script>alert(1)</script>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
]

/**
 * Things that are only dangerous somewhere else. A path traversal in a
 * customer's name is a perfectly ordinary string in an email — it must render
 * as itself, and it must not reach a filesystem. The storage tests below are
 * where that second half is checked.
 */
const INERT_PAYLOADS = ['../../../../etc/passwd', '%2e%2e%2f', String.raw`C:\Windows\system32`]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(path)) out.push(path)
  }
  return out
}

const SOURCES = walk('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }))

describe('nothing renders raw HTML', () => {
  it('never uses dangerouslySetInnerHTML', () => {
    // React escapes everything in JSX. This is the one escape hatch, and the
    // product has no use for it: no rich text, no user-authored markup, so any
    // appearance of it is a regression rather than a judgement call.
    const offenders = SOURCES.filter((file) => file.text.includes('dangerouslySetInnerHTML'))
    expect(offenders.map((file) => file.path)).toEqual([])
  })

  it('never writes to innerHTML or document.write', () => {
    const offenders = SOURCES.filter(
      (file) => /\.innerHTML\s*=/.test(file.text) || file.text.includes('document.write('),
    )
    expect(offenders.map((file) => file.path)).toEqual([])
  })

  it('never evaluates a string', () => {
    const offenders = SOURCES.filter((file) =>
      /\beval\s*\(|new Function\s*\(/.test(file.text),
    )
    expect(offenders.map((file) => file.path)).toEqual([])
  })
})

describe('SQL', () => {
  it('parameterizes everything a user can influence', () => {
    // Tagged-template `$queryRaw` binds its interpolations. The `Unsafe`
    // variants do not, so each one has to be justified individually.
    const unsafe = SOURCES.filter((file) =>
      /\$(query|execute)RawUnsafe/.test(file.text),
    ).map((file) => file.path)

    // Both remaining uses interpolate a table name read from Postgres's own
    // catalog — never from a request — and bind the tenant id as a parameter.
    expect(unsafe.sort()).toEqual(
      ['src/server/demo/data.ts', 'src/server/demo/install.ts'].sort(),
    )
  })

  it('binds the value in the one place a caller-supplied id reaches raw SQL', () => {
    const install = readFileSync('src/server/demo/install.ts', 'utf8')
    expect(install).toContain('WHERE "organizationId" = $1')
    expect(install).not.toMatch(/WHERE "organizationId" = '\$\{/)
  })
})

describe('text stays text in an email', () => {
  const branding = {
    companyName: 'Precision Garage Door',
    logoUrl: null,
    replyToEmail: null,
    companyPhone: null,
    companyWebsite: null,
    addressLines: [] as string[],
  }

  it('escapes every markup payload wherever it lands', () => {
    for (const payload of MARKUP_PAYLOADS) {
      const html = renderEmailHtml(
        { ...branding, companyName: payload },
        {
          headline: payload,
          paragraphs: [payload],
          action: { label: payload, url: `https://example.test/${payload}` },
          facts: [{ label: payload, value: payload }],
          footnote: payload,
        },
      )

      // The payload must not survive as itself anywhere in the output. An
      // escaped copy is fine and expected — `&lt;script&gt;` is text — so the
      // check is for the raw thing, plus the absence of any tag the template
      // does not emit on its own.
      expect(html, `payload survived unescaped: ${payload}`).not.toContain(payload)
      expect(html).not.toContain('<script')
      expect(html).not.toContain('<iframe')
      expect(html).not.toContain('<img')
    }
  })

  it('renders an ordinary-looking string as itself, without inventing a problem', () => {
    for (const payload of INERT_PAYLOADS) {
      const html = renderEmailHtml(branding, { headline: payload, paragraphs: [payload] })
      // Nothing to escape, so it survives — as text in a paragraph, which is
      // exactly what a customer named after a Windows path should look like.
      expect(html).toContain(payload)
      expect(html).not.toContain('<script')
    }
  })

  /**
   * Escaping keeps a value inside its attribute. It says nothing about what
   * the value means once it is there, and `javascript:alert(1)` is a perfectly
   * well-formed URL that a company can type into their own settings.
   */
  it('refuses a scheme that is not a link', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'not a url at all',
    ]) {
      expect(safeUrl(hostile), hostile).toBe('#')
    }
  })

  it('leaves a real link alone', () => {
    for (const fine of [
      'https://g.page/r/abc/review',
      'http://example.test/x?y=1&z=2',
      'mailto:someone@example.test',
      'tel:+15551234567',
    ]) {
      expect(safeUrl(fine)).toBe(fine)
    }
  })

  it('escapes the characters that end an attribute or a tag', () => {
    expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;')
    // Ampersand first, so an escaped sequence is not escaped twice.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('uploads', () => {
  it('recognises only formats a camera produces', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffImageType(jpeg)).toBe('image/jpeg')
    expect(sniffImageType(png)).toBe('image/png')
  })

  it('rejects an SVG, which is a script container wearing an image extension', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    expect(sniffImageType(svg)).toBeNull()
  })

  it('rejects HTML, a PDF and a shell script whatever they claim to be', () => {
    for (const content of [
      '<!DOCTYPE html><html><script>alert(1)</script>',
      '%PDF-1.7',
      '#!/bin/sh\nrm -rf /',
      'GIF87a', // too short to be a real GIF header plus payload
    ]) {
      const bytes = new TextEncoder().encode(content.padEnd(4, ' '))
      const sniffed = sniffImageType(bytes)
      expect(sniffed === null || sniffed === 'image/gif').toBe(true)
    }
  })

  it('will not let a declared type override what the bytes say', () => {
    expect(typesAgree('image/png', 'image/jpeg')).toBe(false)
    expect(typesAgree('image/jpeg', 'image/jpeg')).toBe(true)
    // HEIC and HEIF are the same container; disagreeing about which is not a lie.
    expect(typesAgree('image/heic', 'image/heif')).toBe(true)
  })

  it('cannot be made to write outside its own prefix', () => {
    // The organization id comes from the session, never a request — but the
    // key builder should still be incapable of producing a traversal.
    for (const organizationId of ['../../etc', '..%2f..%2f', 'org/../../other']) {
      const key = buildStorageKey({
        organizationId,
        folder: 'photos',
        contentType: 'image/jpeg',
      })
      expect(key.startsWith(`${storageNamespace()}/org/`)).toBe(true)
      // Whatever the id contained, the filename is ours and the extension is
      // taken from a fixed table rather than from the request.
      expect(key).toMatch(/\.jpg$/)
    }
  })
})

describe('the response headers', () => {
  const config = readFileSync('next.config.ts', 'utf8')

  it('declares a content security policy that forbids the obvious', () => {
    expect(config).toContain("default-src 'self'")
    expect(config).toContain("object-src 'none'")
    expect(config).toContain("frame-ancestors 'none'")
    expect(config).toContain("base-uri 'self'")
    // A form that can post off-site is a credential exfiltration primitive.
    expect(config).toContain("form-action 'self'")
  })

  it('declares the rest of the standard set', () => {
    expect(config).toContain('X-Content-Type-Options')
    expect(config).toContain('X-Frame-Options')
    expect(config).toContain('Strict-Transport-Security')
    expect(config).toContain('Referrer-Policy')
    expect(config).toContain('Permissions-Policy')
    expect(config).toContain('poweredByHeader: false')
  })

  it('keeps files and documents out of shared caches', () => {
    expect(config).toContain("source: '/api/files/:path*'")
    expect(config).toContain('private, no-store')
  })

  it('caps the request body, so a payload cannot be used to exhaust memory', () => {
    expect(config).toMatch(/bodySizeLimit:\s*'\d+mb'/)
  })
})

describe('redirects', () => {
  it('never redirects to a location taken from a request', () => {
    // An open redirect is a phishing primitive: a link on the company's own
    // domain that lands somewhere else. Every redirect in the app is to a
    // path this codebase wrote, or to a URL an API we trust returned.
    const suspicious = SOURCES.filter((file) => {
      const calls = file.text.match(/redirect\(([^)]*)\)/g) ?? []
      return calls.some((call) => /redirect\((searchParams|params|formData|request)/.test(call))
    })
    expect(suspicious.map((file) => file.path)).toEqual([])
  })
})
