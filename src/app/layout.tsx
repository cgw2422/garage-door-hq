import type { Metadata, Viewport } from 'next'
import { environment, titleSuffix } from '@/lib/environment'
import { EnvironmentBanner } from '@/components/app/environment-banner'
import './globals.css'

/**
 * The tab, the home-screen icon and the banner all say which app this is.
 *
 * A phone shows very little of a title, so the environment goes at the end
 * where it survives truncation least well — but the icon does not truncate at
 * all, which is why staging gets its own amber one. Between the two, a glance
 * at a locked phone is enough.
 */
const SUFFIX = titleSuffix()
const STAGING_ICON = environment().isProduction ? '/icon.svg' : '/icon-staging.svg'

export const metadata: Metadata = {
  title: {
    default: `Garage Door HQ${SUFFIX}`,
    template: `%s · Garage Door HQ${SUFFIX}`,
  },
  description:
    'Run your entire garage door business from one place. Scheduling, door history, spring lookups, estimates, invoices, payments and truck inventory — built for garage door pros.',
  applicationName: 'Garage Door HQ',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: `Garage Door HQ${SUFFIX}`,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: STAGING_ICON, type: 'image/svg+xml' }],
    apple: [{ url: STAGING_ICON }],
  },
  formatDetection: { telephone: true, address: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app is a tool, not a document: pinch-zoom stays enabled for
  // accessibility, but the layout never depends on it.
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1622' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <EnvironmentBanner />
        {children}
      </body>
    </html>
  )
}
