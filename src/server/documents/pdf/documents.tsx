import React from 'react'
import { Document, Image, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { formatBps, formatCents } from '@/lib/money'
import type {
  DocumentLine,
  DocumentParty,
  EstimateDocument,
  InvoiceDocument,
} from '../model'
import { BRAND, styles } from './theme'

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

function Header({
  company,
  logoDataUri,
  docType,
  number,
  meta,
}: {
  company: DocumentParty
  logoDataUri: string | null
  docType: string
  number: string
  meta: Array<[string, string]>
}) {
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1, paddingRight: 20 }}>
        {logoDataUri ? <Image src={logoDataUri} style={styles.logo} /> : null}
        <Text style={styles.companyName}>{company.name}</Text>
        {company.lines.map((line) => (
          <Text key={line} style={styles.companyLine}>
            {line}
          </Text>
        ))}
        {company.phone ? <Text style={styles.companyLine}>{company.phone}</Text> : null}
        {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
        {company.website ? <Text style={styles.companyLine}>{company.website}</Text> : null}
      </View>

      <View style={{ width: 190 }}>
        <Text style={styles.docType}>{docType}</Text>
        <Text style={styles.docNumber}>{number}</Text>
        {meta.map(([label, value]) => (
          <Text key={label} style={styles.docMeta}>
            {label}: {value}
          </Text>
        ))}
      </View>
    </View>
  )
}

function Parties({
  customer,
  serviceAddress,
  doorLine,
  references,
}: {
  customer: DocumentParty
  serviceAddress: string[] | null
  doorLine: string | null
  references: Array<[string, string]>
}) {
  return (
    <View style={styles.partiesRow}>
      <View style={styles.party}>
        <Text style={styles.label}>CUSTOMER</Text>
        <Text style={styles.partyName}>{customer.name}</Text>
        {customer.phone ? <Text style={styles.partyLine}>{customer.phone}</Text> : null}
        {customer.email ? <Text style={styles.partyLine}>{customer.email}</Text> : null}
      </View>

      <View style={styles.party}>
        <Text style={styles.label}>SERVICE ADDRESS</Text>
        {serviceAddress && serviceAddress.length > 0 ? (
          serviceAddress.map((line) => (
            <Text key={line} style={styles.partyLine}>
              {line}
            </Text>
          ))
        ) : (
          <Text style={styles.partyLine}>—</Text>
        )}
        {doorLine ? (
          <>
            <Text style={[styles.label, { marginTop: 6 }]}>DOOR</Text>
            <Text style={styles.partyLine}>{doorLine}</Text>
          </>
        ) : null}
      </View>

      <View style={{ width: 120 }}>
        {references.length > 0 ? <Text style={styles.label}>REFERENCE</Text> : null}
        {references.map(([label, value]) => (
          <Text key={label} style={styles.partyLine}>
            {label} {value}
          </Text>
        ))}
      </View>
    </View>
  )
}

function LineTable({ lines, currency }: { lines: DocumentLine[]; currency: string }) {
  return (
    <View>
      <View style={styles.tableHead}>
        <Text style={[styles.tableHeadCell, styles.colName]}>DESCRIPTION</Text>
        <Text style={[styles.tableHeadCell, styles.colQty]}>QTY</Text>
        <Text style={[styles.tableHeadCell, styles.colUnit]}>UNIT</Text>
        <Text style={[styles.tableHeadCell, styles.colAmount]}>AMOUNT</Text>
      </View>

      {lines.map((line, index) => (
        <View key={`${line.name}-${index}`} style={styles.row} wrap={false}>
          <View style={styles.colName}>
            <Text style={styles.lineName}>{line.name}</Text>
            {line.description ? <Text style={styles.lineMeta}>{line.description}</Text> : null}
            {line.sku || !line.taxable ? (
              <Text style={styles.lineMeta}>
                {[line.sku, line.taxable ? null : 'not taxed'].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <Text style={styles.colQty}>{line.quantity}</Text>
          <Text style={styles.colUnit}>{formatCents(line.unitPriceCents, { currency })}</Text>
          <Text style={[styles.colAmount, { fontFamily: 'Helvetica-Bold' }]}>
            {formatCents(line.lineCents, { currency })}
          </Text>
        </View>
      ))}
    </View>
  )
}

function Totals({
  currency,
  subtotalCents,
  discountCents,
  taxCents,
  taxRateBps,
  totalCents,
  extra,
}: {
  currency: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  taxRateBps: number
  totalCents: number
  extra?: Array<[string, string, boolean?]>
}) {
  return (
    <View style={styles.totals}>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Subtotal</Text>
        <Text style={styles.totalValue}>{formatCents(subtotalCents, { currency })}</Text>
      </View>
      {discountCents > 0 ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Discount</Text>
          <Text style={styles.totalValue}>−{formatCents(discountCents, { currency })}</Text>
        </View>
      ) : null}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Tax {formatBps(taxRateBps)}</Text>
        <Text style={styles.totalValue}>{formatCents(taxCents, { currency })}</Text>
      </View>
      <View style={styles.grandRow}>
        <Text style={styles.grandLabel}>Total</Text>
        <Text style={styles.grandValue}>{formatCents(totalCents, { currency })}</Text>
      </View>
      {extra?.map(([label, value, strong]) => (
        <View key={label} style={styles.totalRow}>
          <Text style={strong ? styles.grandLabel : styles.totalLabel}>{label}</Text>
          <Text style={strong ? styles.grandValue : styles.totalValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

function Footer({ note }: { note: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{note}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

export function EstimatePdf({ doc }: { doc: EstimateDocument }) {
  const selected = doc.options.find((option) => option.isSelected) ?? null

  return (
    <Document
      title={`${doc.number} — ${doc.company.name}`}
      author={doc.company.name}
      subject={doc.title}
    >
      <Page size="LETTER" style={styles.page}>
        <Header
          company={doc.company}
          logoDataUri={doc.logoDataUri}
          docType="ESTIMATE"
          number={doc.number}
          meta={[
            ['Date', formatDate(doc.issuedAt)],
            ...(doc.expiresAt ? ([['Valid until', formatDate(doc.expiresAt)]] as Array<[string, string]>) : []),
            ...(doc.versionNumber !== null
              ? ([['Version', String(doc.versionNumber)]] as Array<[string, string]>)
              : []),
          ]}
        />

        {doc.isDraft ? (
          <View style={{ marginTop: 10, flexDirection: 'row' }}>
            <Text style={[styles.badge, styles.badgeDraft]}>
              DRAFT — NOT YET PRESENTED TO THE CUSTOMER
            </Text>
          </View>
        ) : null}

        <View style={styles.rule} />

        <Parties
          customer={doc.customer}
          serviceAddress={doc.serviceAddress}
          doorLine={doc.doorLine}
          references={[
            ...(doc.jobReference ? ([['Job', doc.jobReference]] as Array<[string, string]>) : []),
          ]}
        />

        {doc.customerMessage ? (
          <>
            <Text style={styles.sectionTitle}>ABOUT THIS WORK</Text>
            <Text style={{ color: BRAND.inkMuted }}>{doc.customerMessage}</Text>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>
          {doc.options.length > 1 ? 'YOUR OPTIONS' : 'PROPOSED WORK'}
        </Text>

        {doc.options.map((option) => (
          <View
            key={`${option.tier}-${option.name}`}
            style={[styles.optionCard, option.isSelected ? styles.optionCardSelected : {}]}
            wrap={false}
          >
            <View style={styles.optionHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.optionTier}>{option.tier}</Text>
                <Text style={styles.optionName}>{option.name}</Text>
                {option.description ? (
                  <Text style={styles.optionDescription}>{option.description}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 5 }}>
                  {option.isRecommended ? <Text style={styles.badge}>MOST POPULAR</Text> : null}
                  {option.isSelected ? (
                    <Text style={[styles.badge, styles.badgeSelected]}>SELECTED</Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.optionTotal}>
                {formatCents(option.totalCents, { currency: doc.currency })}
              </Text>
            </View>

            <LineTable lines={option.lines} currency={doc.currency} />

            <View style={{ marginTop: 6, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 8, color: BRAND.inkMuted }}>
                Subtotal {formatCents(option.subtotalCents, { currency: doc.currency })} · Tax{' '}
                {formatCents(option.taxCents, { currency: doc.currency })} ·{' '}
                <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND.ink }}>
                  Total {formatCents(option.totalCents, { currency: doc.currency })}
                </Text>
              </Text>
            </View>
          </View>
        ))}

        {doc.signature ? (
          <View style={styles.signatureBox} wrap={false}>
            <Text style={styles.label}>APPROVED BY THE CUSTOMER</Text>
            {doc.signature.imageDataUri ? (
              <Image src={doc.signature.imageDataUri} style={styles.signatureImage} />
            ) : null}
            <Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 4 }}>
              {doc.signature.signerName}
            </Text>
            <Text style={styles.lineMeta}>
              Signed {formatDateTime(doc.signature.signedAt)}
              {selected ? ` · ${selected.name}` : ''}
              {doc.signature.versionNumber !== null
                ? ` · version ${doc.signature.versionNumber}`
                : ''}
            </Text>
            {doc.signature.documentHash ? (
              <Text style={styles.hash}>
                Document integrity hash (SHA-256): {doc.signature.documentHash}
              </Text>
            ) : null}
          </View>
        ) : null}

        {doc.termsText ? (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>TERMS</Text>
            <Text style={styles.terms}>{doc.termsText}</Text>
          </View>
        ) : null}

        <Footer
          note={
            doc.signature
              ? `${doc.number} · approved ${formatDate(doc.signature.signedAt)}`
              : `${doc.number} · ${doc.company.name}`
          }
        />
      </Page>
    </Document>
  )
}

export function InvoicePdf({ doc }: { doc: InvoiceDocument }) {
  const statusColor =
    doc.status === 'PAID'
      ? BRAND.success
      : doc.status === 'PAST_DUE'
        ? BRAND.danger
        : doc.status === 'PARTIAL'
          ? BRAND.warning
          : BRAND.brand

  return (
    <Document
      title={`${doc.number} — ${doc.company.name}`}
      author={doc.company.name}
      subject="Invoice"
    >
      <Page size="LETTER" style={styles.page}>
        <Header
          company={doc.company}
          logoDataUri={doc.logoDataUri}
          docType="INVOICE"
          number={doc.number}
          meta={[
            ['Date', formatDate(doc.issuedAt)],
            ...(doc.dueAt ? ([['Due', formatDate(doc.dueAt)]] as Array<[string, string]>) : []),
          ]}
        />

        <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Text style={[styles.statusPill, { backgroundColor: statusColor }]}>
            {doc.status.replace('_', ' ')}
          </Text>
        </View>

        <View style={styles.rule} />

        <Parties
          customer={doc.customer}
          serviceAddress={doc.serviceAddress}
          doorLine={doc.doorLine}
          references={[
            ...(doc.jobReference ? ([['Job', doc.jobReference]] as Array<[string, string]>) : []),
            ...(doc.estimateReference
              ? ([['Estimate', doc.estimateReference]] as Array<[string, string]>)
              : []),
          ]}
        />

        <Text style={styles.sectionTitle}>WORK PERFORMED</Text>
        <LineTable lines={doc.lines} currency={doc.currency} />

        <Totals
          currency={doc.currency}
          subtotalCents={doc.subtotalCents}
          discountCents={doc.discountCents}
          taxCents={doc.taxCents}
          taxRateBps={doc.taxRateBps}
          totalCents={doc.totalCents}
          extra={[
            ['Amount paid', `−${formatCents(doc.paidCents, { currency: doc.currency })}`],
            ['Balance due', formatCents(doc.balanceCents, { currency: doc.currency }), true],
          ]}
        />

        {doc.payments.length > 0 ? (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>PAYMENTS RECEIVED</Text>
            {doc.payments.map((payment, index) => (
              <View key={index} style={styles.row}>
                <Text style={styles.colName}>
                  {payment.method.charAt(0) + payment.method.slice(1).toLowerCase()}
                  {payment.reference ? ` · ${payment.reference}` : ''}
                </Text>
                <Text style={{ flex: 1, color: BRAND.inkMuted }}>
                  {formatDate(payment.receivedAt)}
                </Text>
                <Text style={[styles.colAmount, { fontFamily: 'Helvetica-Bold' }]}>
                  {formatCents(payment.amountCents, { currency: doc.currency })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {doc.notesToCustomer ? (
          <>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={{ color: BRAND.inkMuted }}>{doc.notesToCustomer}</Text>
          </>
        ) : null}

        {doc.termsText ? (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>TERMS</Text>
            <Text style={styles.terms}>{doc.termsText}</Text>
          </View>
        ) : null}

        <Footer
          note={
            doc.balanceCents > 0
              ? `${doc.number} · ${formatCents(doc.balanceCents, { currency: doc.currency })} due`
              : `${doc.number} · paid in full — thank you`
          }
        />
      </Page>
    </Document>
  )
}

export async function renderEstimatePdf(doc: EstimateDocument): Promise<Buffer> {
  return renderToBuffer(<EstimatePdf doc={doc} />)
}

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf doc={doc} />)
}
