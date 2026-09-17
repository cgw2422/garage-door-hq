import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePlatformStaff } from '@/lib/session'
import { systemReadiness, type Check, type Health } from '@/server/platform/readiness'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, SectionHeading } from '@/components/ui/card'
import { Chip, type Tone } from '@/components/ui/status'

export const metadata: Metadata = { title: 'System Readiness' }
export const dynamic = 'force-dynamic'

/**
 * Is Garage Door HQ's own infrastructure plugged in?
 *
 * One screen, glanceable, for the question that otherwise takes ten minutes of
 * clicking through Railway, Cloudflare and Stripe: is this deployment actually
 * finished, or does it merely boot?
 *
 * It shows whether each thing is configured and never what it is configured
 * *to*. No key, no URL, no secret, no connection string — only the names of
 * the variables to go and set, which is the part that is useful anyway.
 */
const TONES: Record<Health, Tone> = {
  ok: 'success',
  missing: 'danger',
  wrong: 'danger',
  unknown: 'warning',
  'not applicable': 'neutral',
}

const WORDS: Record<Health, string> = {
  ok: 'Ready',
  missing: 'Not set',
  wrong: 'Wrong',
  unknown: 'Unknown',
  'not applicable': 'N/A',
}

export default async function SystemPage() {
  await requirePlatformStaff()
  const readiness = await systemReadiness()
  const { environment, release, checks, ready } = readiness

  return (
    <>
      <PageHeader
        title="System Readiness"
        subtitle="Garage Door HQ's own infrastructure"
        backHref="/admin"
        action={<Chip tone={ready ? 'success' : 'danger'}>{ready ? 'Ready' : 'Incomplete'}</Chip>}
      />

      <PageBody>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Environment
              </p>
              <p className="mt-1 text-2xl font-bold text-ink">{environment.name.toUpperCase()}</p>
            </div>
            <Chip tone={environment.isProductionLike ? 'brand' : 'warning'}>
              {environment.declared ? 'Declared' : 'Inferred'}
            </Chip>
          </div>

          {!environment.declared ? (
            <p className="mt-3 rounded-[--radius-control] bg-warning-50 px-3 py-2.5 text-sm leading-relaxed text-warning-700">
              <strong>APP_ENV is not set on this deployment.</strong> It is being treated as
              staging, which holds outbound email back. If this is production, set{' '}
              <code className="num">APP_ENV=production</code> and redeploy.
            </p>
          ) : null}
        </Card>

        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeading>External services</SectionHeading>
          </div>
          <ul className="divide-y divide-hairline">
            {checks.map((check) => (
              <CheckRow key={check.label} check={check} />
            ))}
          </ul>
        </Card>

        <Card>
          <SectionHeading>This build</SectionHeading>
          <dl className="mt-2 space-y-2 text-[0.9375rem]">
            <Fact label="Release" value={release.commit ?? 'Not reported by the platform'} />
            <Fact label="Built" value={release.builtAt ?? 'Not reported by the platform'} />
            <Fact
              label="Deployment"
              value={release.deploymentId ?? 'Not reported by the platform'}
            />
            <Fact label="Running since" value={new Date(release.startedAt).toLocaleString()} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Live health is at{' '}
            <Link href="/api/health" className="font-semibold text-brand-600">
              /api/health
            </Link>
            , which is unauthenticated and reports presence only — the promotion and rollback
            workflows poll it after every deploy.
          </p>
        </Card>

        <Card>
          <SectionHeading>What this page will not tell you</SectionHeading>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Whether a key is set is worth seeing. What it is, is not. Nothing here reads a
            value — no API keys, no database URL, no webhook secrets, no credentials — only
            whether each one is present and, for Stripe, whether the key is a live or a test
            one, which is the difference between taking money and not.
          </p>
        </Card>
      </PageBody>
    </>
  )
}

function CheckRow({ check }: { check: Check }) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-ink">{check.label}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{check.detail}</p>
          {check.variables && check.health !== 'ok' ? (
            <p className="num mt-1.5 text-xs text-ink-subtle">{check.variables.join(' · ')}</p>
          ) : null}
        </div>
        <Chip tone={TONES[check.health]}>{WORDS[check.health]}</Chip>
      </div>
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="num min-w-0 truncate text-right text-ink">{value}</dd>
    </div>
  )
}
