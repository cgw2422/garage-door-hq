import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Garage Door HQ',
    template: '%s · Garage Door HQ',
  },
  description:
    'Run your entire garage door business from one place. Scheduling, door history, spring lookups, estimates, invoices, payments and truck inventory — built for garage door pros.',
  applicationName: 'Garage Door HQ',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Garage Door HQ',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg' }],
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
      <body>{children}</body>
    </html>
  )
}
