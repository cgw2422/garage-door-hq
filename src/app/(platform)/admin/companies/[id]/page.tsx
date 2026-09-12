import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/session";
import { formatCents } from "@/lib/money";
import { ROLE_LABELS } from "@/lib/roles";
import { companyOverview } from "@/server/platform/service";
import {
  Card,
  CardHeader,
  Divider,
  EmptyState,
  SectionHeading,
} from "@/components/ui/card";
import { DataGrid, DataPoint, StatTile } from "@/components/ui/stat";
import { Chip } from "@/components/ui/status";
import { STATUS_TONE } from "../../page";
import { SubscriptionControls } from "./controls";

export const metadata: Metadata = { title: "Company" };
export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  return date
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
    : "—";
}

export default async function PlatformCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformStaff();
  const { id } = await params;

  const overview = await companyOverview(id);
  if (!overview) notFound();

  const {
    organization,
    paymentVolumeCents,
    paymentCount,
    lastActivityAt,
    auditLog,
  } = overview;
  const subscription = organization.subscription;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin"
          className="text-[0.8125rem] font-semibold text-brand-600"
        >
          ← All companies
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">
          {organization.name}
        </h1>
        <p className="text-sm text-ink-muted">
          {organization.slug} · created {formatDate(organization.createdAt)} ·
          last activity {formatDate(lastActivityAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile value={organization._count.jobs} label="Jobs" />
        <StatTile value={organization._count.customers} label="Customers" />
        <StatTile value={organization._count.doors} label="Doors" />
        <StatTile value={organization._count.invoices} label="Invoices" />
      </div>

      <Card>
        <CardHeader
          title="Subscription"
          action={
            subscription ? (
              <Chip tone={STATUS_TONE[subscription.status]}>
                {subscription.status.replace("_", " ").toLowerCase()}
              </Chip>
            ) : null
          }
        />
        {subscription ? (
          <>
            <DataGrid>
              <DataPoint label="Plan" value={subscription.planCode} />
              <DataPoint
                label="Price"
                value={formatCents(subscription.priceCents, {
                  currency: subscription.currency,
                })}
              />
              <DataPoint
                label="Trial ends"
                value={formatDate(subscription.trialEndsAt)}
              />
              <DataPoint
                label="Period ends"
                value={formatDate(subscription.currentPeriodEnd)}
              />
              <DataPoint
                label="Complimentary until"
                value={formatDate(subscription.complimentaryUntil)}
              />
              <DataPoint
                label="Subscribed since"
                value={formatDate(subscription.startedAt)}
              />
              <DataPoint
                label="Cancelled"
                value={formatDate(subscription.cancelledAt)}
              />
              <DataPoint
                label="Cancels at period end"
                value={subscription.cancelAtPeriodEnd ? "Yes" : "No"}
              />
              <DataPoint
                label="Past due since"
                value={formatDate(subscription.pastDueSince)}
              />
              <DataPoint
                label="MRR"
                value={
                  subscription.status === "ACTIVE" ||
                  subscription.status === "PAST_DUE"
                    ? formatCents(
                        Math.round(
                          subscription.priceCents *
                            ((100 - (subscription.discountPercent ?? 0)) / 100),
                        ),
                        { currency: subscription.currency },
                      )
                    : formatCents(0, { currency: subscription.currency })
                }
              />
              <DataPoint
                label="Payment method"
                value={
                  subscription.cardLast4
                    ? `${subscription.cardBrand ?? "Card"} ···· ${subscription.cardLast4}`
                    : "—"
                }
              />
              {/* Stripe's own identifiers, so support can jump straight to the
                right object in the Stripe dashboard. */}
              <DataPoint
                label="Stripe customer"
                value={subscription.providerCustomerId ?? "—"}
                mono
              />
              <DataPoint
                label="Stripe subscription"
                value={subscription.providerSubscriptionId ?? "—"}
                mono
              />
            </DataGrid>

            {subscription.providerSubscriptionId ? (
              <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
                Stripe is the source of truth for this subscription. Trials and
                complimentary access are set here; anything Stripe manages is
                changed in Stripe and arrives back through the webhook.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-muted">No subscription record.</p>
        )}
      </Card>

      {subscription ? (
        <SubscriptionControls
          organizationId={organization.id}
          status={subscription.status}
        />
      ) : null}

      <Card>
        <CardHeader title="Contact & referral" />
        <DataGrid>
          <DataPoint label="Email" value={organization.email ?? "—"} />
          <DataPoint label="Phone" value={organization.phone ?? "—"} />
          <DataPoint label="Timezone" value={organization.timezone} />
          <DataPoint
            label="Company size"
            value={organization.companySize.replace("_", " ")}
          />
          <DataPoint
            label="Referred by"
            value={
              organization.referral
                ? `${organization.referral.affiliate.name} (${organization.referral.code})`
                : "Direct"
            }
          />
          <DataPoint
            label="Payments recorded"
            value={`${formatCents(paymentVolumeCents)} · ${paymentCount}`}
          />
        </DataGrid>
      </Card>

      <div>
        <SectionHeading>
          Users ({organization.memberships.length})
        </SectionHeading>
        <Card padded={false}>
          {organization.memberships.map((membership, index) => (
            <div key={membership.id}>
              {index > 0 ? <Divider className="ml-4" /> : null}
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] font-semibold text-ink">
                    {membership.user.firstName} {membership.user.lastName}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {membership.user.email}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    Joined {formatDate(membership.createdAt)} · last signed in{" "}
                    {formatDate(membership.user.lastLoginAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Chip
                    tone={membership.role === "OWNER" ? "brand" : "neutral"}
                  >
                    {ROLE_LABELS[membership.role]}
                  </Chip>
                  {!membership.isActive ? (
                    <Chip tone="danger">inactive</Chip>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionHeading>Audit History</SectionHeading>
        <Card padded={false}>
          {auditLog.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            auditLog.map((entry, index) => (
              <div key={entry.id}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <div className="px-4 py-2.5">
                  <p className="text-sm font-medium text-ink">{entry.action}</p>
                  <p className="text-xs text-ink-subtle">
                    {entry.entityType}
                    {entry.entityId
                      ? ` · ${entry.entityId.slice(0, 8)}`
                      : ""} · {entry.actor ? entry.actor.email : "system"} ·{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(entry.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
