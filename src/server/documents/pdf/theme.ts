import { StyleSheet } from '@react-pdf/renderer'

/**
 * Print styling, matched to the product's brand.
 *
 * Only the built-in Helvetica family is used: registering a webfont would mean
 * a network fetch at render time, and a PDF that fails to generate because a
 * font CDN is slow is worse than one set in Helvetica.
 */
export const BRAND = {
  ink: '#0f172a',
  inkMuted: '#55637a',
  inkSubtle: '#7b8798',
  brand: '#1b8cf0',
  brandDark: '#0c3f6e',
  navy: '#0c1622',
  hairline: '#e4e9f1',
  sunken: '#f4f6fa',
  success: '#12833b',
  danger: '#b71f1f',
  warning: '#b87205',
} as const

export const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: BRAND.ink,
    lineHeight: 1.45,
  },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 120, maxHeight: 46, objectFit: 'contain', marginBottom: 6 },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: BRAND.navy },
  companyLine: { color: BRAND.inkMuted, fontSize: 8.5 },

  docType: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.brand,
    textAlign: 'right',
    letterSpacing: 1,
  },
  docNumber: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta: { fontSize: 8.5, color: BRAND.inkMuted, textAlign: 'right' },

  rule: { height: 1, backgroundColor: BRAND.hairline, marginVertical: 14 },

  partiesRow: { flexDirection: 'row', gap: 24 },
  party: { flex: 1 },
  label: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.inkSubtle,
    letterSpacing: 1,
    marginBottom: 3,
  },
  partyName: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  partyLine: { color: BRAND.inkMuted, fontSize: 8.5 },

  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.inkSubtle,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
  },

  optionCard: {
    borderWidth: 1,
    borderColor: BRAND.hairline,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  optionCardSelected: { borderColor: BRAND.brand, borderWidth: 2, backgroundColor: '#f6fbff' },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  optionTier: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.inkSubtle,
    letterSpacing: 1,
  },
  optionName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  optionTotal: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  optionDescription: { color: BRAND.inkMuted, fontSize: 8.5, marginTop: 3 },

  badge: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    backgroundColor: BRAND.brand,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    letterSpacing: 0.6,
  },
  badgeSelected: { backgroundColor: BRAND.success },
  badgeDraft: { backgroundColor: BRAND.warning },

  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.hairline,
    paddingBottom: 4,
    marginTop: 8,
  },
  tableHeadCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.inkSubtle,
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f5f9',
  },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 42, textAlign: 'right' },
  colUnit: { width: 66, textAlign: 'right' },
  colAmount: { width: 70, textAlign: 'right' },
  lineName: { fontSize: 9 },
  lineMeta: { fontSize: 7.5, color: BRAND.inkSubtle },

  totals: { marginTop: 8, alignSelf: 'flex-end', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { color: BRAND.inkMuted },
  totalValue: { fontFamily: 'Helvetica-Bold' },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BRAND.hairline,
    paddingTop: 4,
    marginTop: 3,
  },
  grandLabel: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  grandValue: { fontFamily: 'Helvetica-Bold', fontSize: 13 },

  signatureBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: BRAND.hairline,
    borderRadius: 6,
    padding: 12,
  },
  signatureImage: { height: 46, objectFit: 'contain', alignSelf: 'flex-start' },
  hash: { fontSize: 6.5, color: BRAND.inkSubtle, marginTop: 4 },

  terms: { marginTop: 14, fontSize: 7.5, color: BRAND.inkMuted, lineHeight: 1.5 },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BRAND.hairline,
    paddingTop: 6,
    fontSize: 7.5,
    color: BRAND.inkSubtle,
  },

  statusPill: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    color: '#ffffff',
  },
})
