import type { MetadataRoute } from 'next'

/**
 * Installable from the first release. Technicians add it to the home screen
 * and it behaves like an app: standalone display, portrait, brand splash.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Garage Door HQ',
    short_name: 'GDHQ',
    description: 'Run your garage door business from one place.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c1622',
    theme_color: '#0c1622',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: "Today", url: '/today' },
      { name: 'Spring Calculator', url: '/tools/spring-calculator' },
      { name: 'My Truck', url: '/inventory' },
    ],
  }
}
