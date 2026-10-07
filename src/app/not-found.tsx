import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = {
  title: { absolute: 'Page not found — Garage Door HQ' },
  robots: { index: false, follow: true },
}

/**
 * The 404.
 *
 * It lives at the application root rather than inside the marketing route
 * group, because a missing page can be anywhere — a mistyped `/jobs/` URL, an
 * old link from an email, a bookmark to a screen that moved. So it carries its
 * own header and footer rather than inheriting the marketing chrome, and the
 * links are the two places a lost person actually wants: the public site, or
 * their own account.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-navy-950 text-white">
      <header className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Garage Door HQ home">
          <Logo tone="dark" />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-16 text-center sm:px-8">
        <p className="num text-6xl font-bold leading-none text-brand-500 sm:text-7xl">404</p>
        <h1 className="mt-6 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Looks like this door doesn&rsquo;t open.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-pretty text-base leading-relaxed text-navy-200">
          The page you were after has moved, or never existed. Nothing is broken on your account.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <ButtonLink href="/" size="lg" className="w-full sm:w-auto">
            Go to Homepage
          </ButtonLink>
          <ButtonLink
            href="/login"
            size="lg"
            variant="secondary"
            className="w-full border-navy-700 bg-navy-800 text-white hover:bg-navy-700 sm:w-auto"
          >
            Sign In
          </ButtonLink>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-center text-sm text-navy-400 sm:px-8">
        <p>
          Looking for something specific?{' '}
          <Link href="/features" className="font-semibold text-brand-300 hover:text-brand-200">
            Features
          </Link>
          {' · '}
          <Link href="/pricing" className="font-semibold text-brand-300 hover:text-brand-200">
            Pricing
          </Link>
          {' · '}
          <Link href="/contact" className="font-semibold text-brand-300 hover:text-brand-200">
            Contact
          </Link>
        </p>
      </footer>
    </div>
  )
}
