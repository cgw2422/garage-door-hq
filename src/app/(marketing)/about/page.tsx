import type { Metadata } from 'next'
import { AboutBody } from '@/components/marketing/proof'
import { pageMetadata } from '@/lib/seo'
import { platformBranding } from '@/server/email/branding'

export const metadata: Metadata = pageMetadata({
  path: '/about',
  title: 'About — who is behind Garage Door HQ',
  description:
    'Who builds Garage Door HQ, why it models the door rather than just the appointment, and where your subscription and your customers’ payments actually go.',
})

/**
 * `/about` used to be a 404.
 *
 * That is a trust problem on its own: a trade buyer checking who is behind a
 * subscription tries the obvious URL first, and an error page is the answer
 * they get. The page now exists whether or not the founder block is filled
 * in, because the company-level answer is true today.
 */
export default function AboutPage() {
  return <AboutBody supportEmail={platformBranding().supportEmail} />
}
