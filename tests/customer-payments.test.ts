import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  PaymentError,
  applyRefund,
  payableInvoice,
  recordStripePayment,
} from '@/server/billing/customer-payments'
import { createTestCompany, createTestDoor, uniqueNumber } from './helpers'

/**
 * Customer card payments.
 *
 * The property this file exists for: **a webhook delivered twice must not
 * take a customer's money twice, or mark an invoice overpaid.** Stripe
 * delivers at least once and retries on any non-2xx, so duplicates are normal
 * traffic rather than an edge case.
 */

async function invoiceFor(session: AppSession, totalCents = 42700) {
  const { customer, property } = await createTestDoor(session)

  const job = await prisma.job.create({
    data: {
      organizationId: session.organizationId,
      number: uniqueNumber(),
      displayNumber: `J-${uniqueNumber()}`,
      customerId: customer.id,
      propertyId: property.id,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })

  const number = uniqueNumber()
  return prisma.invoice.create({
    data: {
      organizationId: session.organizationId,
      number,
      displayNumber: `INV-${number}`,
      customerId: customer.id,
      jobId: job.id,
      status: 'SENT',
      subtotalCents: totalCents,
      taxCents: 0,
      totalCents,
      paidCents: 0,
      balanceCents: totalCents,
      issuedAt: new Date(),
    },
  })
}

async function connectAccount(session: AppSession, options?: { chargesEnabled?: boolean }) {
  return prisma.paymentAccount.create({
    data: {
      organizationId: session.organizationId,
      provider: 'stripe',
      providerAccountId: `acct_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      chargesEnabled: options?.chargesEnabled ?? true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      connectedAt: new Date(),
    },
  })
}

describe('whether an invoice can be paid by card', () => {
  it('is no when the company has not connected Stripe', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
    const { session } = await createTestCompany()
    const invoice = await invoiceFor(session)

    expect(await payableInvoice(invoice.id)).toBeNull()
  })

  it('is no while Stripe onboarding is unfinished', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
    const { session } = await createTestCompany()
    await connectAccount(session, { chargesEnabled: false })
    const invoice = await invoiceFor(session)

    // A half-onboarded account must never be offered to a customer: they would
    // hit an error at the worst possible moment.
    expect(await payableInvoice(invoice.id)).toBeNull()
  })

  it('is no once the balance is settled', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
    const { session } = await createTestCompany()
    await connectAccount(session)
    const invoice = await invoiceFor(session)

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', paidCents: invoice.totalCents, balanceCents: 0 },
    })

    expect(await payableInvoice(invoice.id)).toBeNull()
  })

  it('is yes for a live account with a balance owing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)

    const payable = await payableInvoice(invoice.id)
    expect(payable).not.toBeNull()
    expect(payable!.balanceCents).toBe(42700)
    // The charge is created on their account, not the platform's.
    expect(payable!.connectedAccountId).toBe(account.providerAccountId)
  })
})

describe('recording a confirmed payment', () => {
  it('settles the invoice', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)

    const result = await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: `ch_${randomUUID()}`,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
      feeCents: 1268,
      cardBrand: 'visa',
      cardLast4: '4242',
    })

    expect(result.duplicate).toBe(false)
    expect(result.invoicePaid).toBe(true)

    const settled = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(settled.paidCents).toBe(42700)
    expect(settled.balanceCents).toBe(0)
    expect(settled.status).toBe('PAID')
    expect(settled.paidAt).not.toBeNull()
  })

  it('records the same webhook twice as one payment', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)
    const intentId = `pi_${randomUUID()}`

    const input = {
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: intentId,
      providerChargeId: `ch_${randomUUID()}`,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
    }

    const first = await recordStripePayment(input)
    const second = await recordStripePayment(input)

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.paymentId).toBe(first.paymentId)

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } })
    expect(payments).toHaveLength(1)

    // And the balance moved exactly once.
    const settled = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(settled.paidCents).toBe(42700)
    expect(settled.balanceCents).toBe(0)
  })

  it('survives two deliveries arriving at the same moment', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)
    const intentId = `pi_${randomUUID()}`

    const input = {
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: intentId,
      providerChargeId: `ch_${randomUUID()}`,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
    }

    const [a, b] = await Promise.all([
      recordStripePayment(input),
      recordStripePayment(input),
    ])

    // The unique index on (providerName, providerIntentId) decides; one of
    // them recorded, the other found the row.
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1)
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1)

    const settled = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(settled.paidCents).toBe(42700)
  })

  it('handles two genuinely different payments on one invoice', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session, 50000)

    await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: `ch_${randomUUID()}`,
      providerAccountId: account.providerAccountId,
      amountCents: 20000,
    })
    await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: `ch_${randomUUID()}`,
      providerAccountId: account.providerAccountId,
      amountCents: 30000,
    })

    const settled = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(settled.paidCents).toBe(50000)
    expect(settled.balanceCents).toBe(0)
    expect(settled.status).toBe('PAID')
  })

  it('refuses a payment aimed at another company’s invoice', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const accountA = await connectAccount(a)
    const theirInvoice = await invoiceFor(b)

    await expect(
      recordStripePayment({
        organizationId: a.organizationId,
        invoiceId: theirInvoice.id,
        providerIntentId: `pi_${randomUUID()}`,
        providerChargeId: `ch_${randomUUID()}`,
        providerAccountId: accountA.providerAccountId,
        amountCents: 42700,
      }),
    ).rejects.toThrow(PaymentError)

    const untouched = await prisma.invoice.findUniqueOrThrow({ where: { id: theirInvoice.id } })
    expect(untouched.paidCents).toBe(0)
  })

  it('refuses an invoice that no longer exists, and writes nothing', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)

    await expect(
      recordStripePayment({
        organizationId: session.organizationId,
        invoiceId: randomUUID(),
        providerIntentId: `pi_${randomUUID()}`,
        providerChargeId: `ch_${randomUUID()}`,
        providerAccountId: account.providerAccountId,
        amountCents: 1000,
      }),
    ).rejects.toThrow(PaymentError)

    expect(
      await prisma.payment.count({ where: { organizationId: session.organizationId } }),
    ).toBe(0)
  })

  it('keeps the card summary and nothing more', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)

    const result = await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: `ch_${randomUUID()}`,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
      cardBrand: 'mastercard',
      cardLast4: '5454',
    })

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: result.paymentId } })
    expect(payment.cardBrand).toBe('mastercard')
    expect(payment.cardLast4).toBe('5454')
    // Four digits and a brand name. Nothing that could be used to charge.
    expect(JSON.stringify(payment)).not.toMatch(/\d{13,}/)
  })
})

describe('refunds', () => {
  it('puts the balance back', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)
    const chargeId = `ch_${randomUUID()}`

    await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: chargeId,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
    })

    await applyRefund({
      organizationId: session.organizationId,
      providerChargeId: chargeId,
      refundedCents: 42700,
    })

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(invoiceAfter.paidCents).toBe(0)
    expect(invoiceAfter.balanceCents).toBe(42700)
    expect(invoiceAfter.status).not.toBe('PAID')

    const payment = await prisma.payment.findFirstOrThrow({
      where: { providerPaymentId: chargeId },
    })
    expect(payment.status).toBe('REFUNDED')
  })

  it('handles a partial refund', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)
    const chargeId = `ch_${randomUUID()}`

    await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: chargeId,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
    })

    await applyRefund({
      organizationId: session.organizationId,
      providerChargeId: chargeId,
      refundedCents: 10000,
    })

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(invoiceAfter.paidCents).toBe(32700)
    expect(invoiceAfter.balanceCents).toBe(10000)

    const payment = await prisma.payment.findFirstOrThrow({
      where: { providerPaymentId: chargeId },
    })
    expect(payment.status).toBe('PARTIALLY_REFUNDED')
  })

  it('is idempotent, because Stripe reports a cumulative total', async () => {
    const { session } = await createTestCompany()
    const account = await connectAccount(session)
    const invoice = await invoiceFor(session)
    const chargeId = `ch_${randomUUID()}`

    await recordStripePayment({
      organizationId: session.organizationId,
      invoiceId: invoice.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: chargeId,
      providerAccountId: account.providerAccountId,
      amountCents: 42700,
    })

    for (let i = 0; i < 3; i += 1) {
      await applyRefund({
        organizationId: session.organizationId,
        providerChargeId: chargeId,
        refundedCents: 10000,
      })
    }

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(invoiceAfter.paidCents).toBe(32700)
  })

  it('ignores a refund for a charge from another company', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const accountB = await connectAccount(b)
    const invoiceB = await invoiceFor(b)
    const chargeId = `ch_${randomUUID()}`

    await recordStripePayment({
      organizationId: b.organizationId,
      invoiceId: invoiceB.id,
      providerIntentId: `pi_${randomUUID()}`,
      providerChargeId: chargeId,
      providerAccountId: accountB.providerAccountId,
      amountCents: 42700,
    })

    const result = await applyRefund({
      organizationId: a.organizationId,
      providerChargeId: chargeId,
      refundedCents: 42700,
    })

    expect(result).toBeNull()
    const untouched = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } })
    expect(untouched.paidCents).toBe(42700)
  })
})
