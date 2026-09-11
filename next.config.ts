import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server Actions are the primary mutation path; keep the payload cap
    // generous enough for a field photo but not unbounded.
    serverActions: { bodySizeLimit: '8mb' },
  },
  async headers() {
    /**
     * Content Security Policy.
     *
     * Next injects inline bootstrap scripts and Tailwind v4 emits inline
     * styles, so 'unsafe-inline' is unavoidable without a nonce pipeline on
     * every route. Everything else is closed: no third-party script origins, no
     * framing, no plugins, and form submissions cannot be redirected off-site.
     * Images allow blob: and data: because the signature canvas and camera
     * previews produce them locally.
     */
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // R2 presigned PUTs go straight from the browser to the bucket.
      "connect-src 'self' https://*.r2.cloudflarestorage.com",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(self), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
      {
        // Documents and customer links must never sit in a shared cache.
        source: '/api/files/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ]
  },
}

export default nextConfig
