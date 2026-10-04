import { createClient } from '@/lib/supabase/client'
import type { Company } from '@/lib/companies'

export type PoStatus = 'CREATED' | 'PI_CREATED' | 'CANCELLED'
export type PurchaseType = 'STOCK' | 'BILL_TO_SHIP_TO'
export type GstMode = 'CGST_SGST' | 'IGST'
export type PaymentBasis = 'DELIVERY' | 'PO_DATE' | 'INVOICE_DATE' | 'ADVANCE_BALANCE' | 'FULL_ADVANCE' | 'AGAINST_DELIVERY' | 'CUSTOM'

export type ShipTo = {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  state_code?: string
  pin: string
  contact_name: string
  contact_phone: string
  gstin?: string
}

export type Vendor = {
  id: string
  vendor_code: string | null
  vendor_name: string
  display_name: string | null
  gstin: string | null
  address: string | null
  city_state: string | null
  state_code: string | null
  status: string
  contact_person: string | null
  phone: string | null
}

export type Sku = {
  id: string
  code: string
  name: string
  hsn: string | null
  gst_pct: number | null
  uom: string | null
  std_purchase_rate: number | null
  status: string
}

export type Partner = { id: string; full_name: string }

export type TermsTemplate = { id: string; name: string; heading: string; terms: string[]; is_default: boolean }

export type PoListRow = {
  id: string
  company_id: string
  company_abbr: string
  number: string
  po_date: string
  vendor_id: string
  vendor_name: string
  partner_id: string | null
  partner_name: string | null
  ship_to: ShipTo
  item_count: number
  sku_search: string | null
  taxable_total: number
  tax_total: number
  grand_total: number
  status: PoStatus
  pi_id: string | null
  pi_number: string | null
  created_at: string
}

export type PoLine = {
  line_no: number
  sku_id: string
  sku_code: string
  item_name: string
  description: string | null
  hsn: string
  qty: number
  unit: string
  rate: number
  discount_pct: number
  taxable: number
  gst_pct: number
  gst_amount: number
  line_total: number
}

export type PoDetail = PoListRow & {
  vendor_quotation_ref: string | null
  purchase_type: PurchaseType
  linked_sales_invoice_no: string | null
  subject: string
  intro_text: string | null
  internal_notes: string | null
  ship_to_location_id: string | null
  payment_basis: PaymentBasis
  payment_days: number
  advance_pct: number | null
  payment_terms_text: string
  delivery_days: number
  annexure_enabled: boolean
  annexure_heading: string
  annexure_terms: string[]
  round_off_enabled: boolean
  gst_mode: GstMode
  cgst_total: number
  sgst_total: number
  igst_total: number
  round_off: number
  cancel_reason: string | null
  cancelled_at: string | null
  vendor_snapshot: Vendor & Record<string, unknown>
  company_snapshot: Company & { bank?: Record<string, string | null> | null }
  lines: PoLine[]
}

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  CREATED: 'Created',
  PI_CREATED: 'PI created',
  CANCELLED: 'Cancelled',
}

export const PAYMENT_BASIS_OPTIONS: { value: PaymentBasis; label: string }[] = [
  { value: 'DELIVERY', label: 'Days from date of delivery' },
  { value: 'PO_DATE', label: 'Days from PO date' },
  { value: 'INVOICE_DATE', label: 'Days from invoice date' },
  { value: 'ADVANCE_BALANCE', label: 'Advance % + balance after delivery' },
  { value: 'FULL_ADVANCE', label: '100% advance' },
  { value: 'AGAINST_DELIVERY', label: 'Against delivery' },
  { value: 'CUSTOM', label: 'Custom text' },
]

export const GST_RATES = [0, 5, 12, 18, 28] as const

const throwOn = <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => {
  if (error) throw new Error(error.message)
  return data as T
}

const toNumber = (value: unknown) => Number(value ?? 0)

const LIST_COLUMNS =
  'id,company_id,company_abbr,number,po_date,vendor_id,vendor_name,partner_id,partner_name,ship_to,item_count,sku_search,taxable_total,tax_total,grand_total,status,pi_id,pi_number,created_at'

const normaliseRow = <T extends PoListRow>(row: T): T => ({
  ...row,
  item_count: toNumber(row.item_count),
  taxable_total: toNumber(row.taxable_total),
  tax_total: toNumber(row.tax_total),
  grand_total: toNumber(row.grand_total),
})

export async function fetchPoList() {
  const rows = throwOn<PoListRow[]>(
    await createClient().from('purchase_order_overview').select(LIST_COLUMNS).order('po_date', { ascending: false }).order('created_at', { ascending: false }),
  )
  return rows.map(normaliseRow)
}

export async function fetchPo(id: string): Promise<PoDetail> {
  const supabase = createClient()
  const [header, lines] = await Promise.all([
    supabase.from('purchase_order_overview').select('*').eq('id', id).single(),
    supabase
      .from('purchase_order_lines')
      .select('line_no,sku_id,sku_code,item_name,description,hsn,qty,unit,rate,discount_pct,taxable,gst_pct,gst_amount,line_total')
      .eq('po_id', id)
      .order('line_no'),
  ])
  const po = throwOn<PoDetail>(header)
  const poLines = throwOn<PoLine[]>(lines)
  return {
    ...normaliseRow(po),
    cgst_total: toNumber(po.cgst_total),
    sgst_total: toNumber(po.sgst_total),
    igst_total: toNumber(po.igst_total),
    round_off: toNumber(po.round_off),
    advance_pct: po.advance_pct === null ? null : toNumber(po.advance_pct),
    annexure_terms: Array.isArray(po.annexure_terms) ? po.annexure_terms : [],
    lines: poLines.map(line => ({
      ...line,
      qty: toNumber(line.qty),
      rate: toNumber(line.rate),
      discount_pct: toNumber(line.discount_pct),
      taxable: toNumber(line.taxable),
      gst_pct: toNumber(line.gst_pct),
      gst_amount: toNumber(line.gst_amount),
      line_total: toNumber(line.line_total),
    })),
  }
}

export async function fetchVendors() {
  return throwOn<Vendor[]>(
    await createClient()
      .from('vendors')
      .select('id,vendor_code,vendor_name,display_name,gstin,address,city_state,state_code,status,contact_person,phone')
      .order('vendor_name'),
  )
}

export async function fetchSkus() {
  const rows = throwOn<Sku[]>(
    await createClient().from('skus').select('id,code,name,hsn,gst_pct,uom,std_purchase_rate,status').order('code'),
  )
  return rows.map(sku => ({
    ...sku,
    gst_pct: sku.gst_pct === null ? null : toNumber(sku.gst_pct),
    std_purchase_rate: sku.std_purchase_rate === null ? null : toNumber(sku.std_purchase_rate),
  }))
}

export async function fetchPartners() {
  return throwOn<Partner[]>(await createClient().rpc('popi_partner_options'))
}

export async function fetchTermsTemplates(companyId: string) {
  const rows = throwOn<(TermsTemplate & { company_id: string | null })[]>(
    await createClient()
      .from('terms_templates')
      .select('id,company_id,name,heading,terms,is_default')
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order('name'),
  )
  return rows.map(row => ({ ...row, terms: Array.isArray(row.terms) ? row.terms : [] }))
}

export type PoPayload = Record<string, unknown>

export async function createPo(payload: PoPayload) {
  return throwOn<{ id: string; number: string }>(await createClient().rpc('create_po', { p_payload: payload }))
}

export async function updatePo(id: string, payload: PoPayload) {
  return throwOn<{ id: string; number: string }>(await createClient().rpc('update_po', { p_po_id: id, p_payload: payload }))
}

export async function cancelPo(id: string, reason: string) {
  return throwOn<{ id: string; number: string }>(await createClient().rpc('cancel_po', { p_po_id: id, p_reason: reason }))
}

// ---------------------------------------------------------------- tax math (mirrors private.popi_lines / popi_totals)
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function computeLine(qty: number, rate: number, discountPct: number, gstPct: number) {
  const taxable = round2(qty * rate * (1 - discountPct / 100))
  const gstAmount = round2((taxable * gstPct) / 100)
  return { taxable, gstAmount, lineTotal: round2(taxable + gstAmount) }
}

export type TaxRow = { rate: number; taxable: number; cgst: number; sgst: number; igst: number }

export function computeTotals(
  lines: { taxable: number; gstAmount: number; gstPct: number }[],
  gstMode: GstMode,
  roundOffEnabled: boolean,
) {
  const byRate = new Map<number, { taxable: number; gst: number }>()
  for (const line of lines) {
    const bucket = byRate.get(line.gstPct) ?? { taxable: 0, gst: 0 }
    bucket.taxable = round2(bucket.taxable + line.taxable)
    bucket.gst = round2(bucket.gst + line.gstAmount)
    byRate.set(line.gstPct, bucket)
  }
  const rows: TaxRow[] = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, { taxable, gst }]) => {
      const half = round2(gst / 2)
      return gstMode === 'CGST_SGST'
        ? { rate, taxable, cgst: half, sgst: round2(gst - half), igst: 0 }
        : { rate, taxable, cgst: 0, sgst: 0, igst: gst }
    })
  const taxable = round2(lines.reduce((sum, line) => sum + line.taxable, 0))
  const tax = round2(lines.reduce((sum, line) => sum + line.gstAmount, 0))
  const cgst = round2(rows.reduce((sum, row) => sum + row.cgst, 0))
  const sgst = gstMode === 'CGST_SGST' ? round2(tax - cgst) : 0
  const igst = gstMode === 'IGST' ? tax : 0
  const gross = round2(taxable + tax)
  const roundOff = roundOffEnabled ? round2(Math.round(gross) - gross) : 0
  return { rows, taxable, cgst, sgst, igst, tax, roundOff, grandTotal: round2(gross + roundOff) }
}

export const gstModeFor = (companyStateCode: string | null | undefined, vendor: Pick<Vendor, 'state_code' | 'gstin'> | null | undefined): GstMode => {
  const vendorState = vendor?.state_code || vendor?.gstin?.slice(0, 2) || null
  return companyStateCode && companyStateCode === vendorState ? 'CGST_SGST' : 'IGST'
}

export function paymentTermsText(basis: PaymentBasis, days: number, advancePct: number | null, custom: string) {
  switch (basis) {
    case 'DELIVERY':
      return `Payment will be done ${days} days from the date of delivery`
    case 'PO_DATE':
      return `Payment will be done ${days} days from the PO date`
    case 'INVOICE_DATE':
      return `Payment will be done ${days} days from the invoice date`
    case 'ADVANCE_BALANCE':
      return `${Math.round(advancePct ?? 0)}% advance with PO, balance ${days} days from the date of delivery`
    case 'FULL_ADVANCE':
      return '100% advance payment'
    case 'AGAINST_DELIVERY':
      return 'Payment against delivery'
    default:
      return custom.trim() || 'As agreed'
  }
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`
}

function belowThousand(n: number) {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ')
}

export function numberToIndianWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10_000_000)
  n %= 10_000_000
  const lakh = Math.floor(n / 100_000)
  n %= 100_000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (n) parts.push(belowThousand(n))
  return parts.join(' ')
}

export function amountInWords(amount: number) {
  const rupees = Math.floor(Math.abs(amount))
  const paise = Math.round((Math.abs(amount) - rupees) * 100)
  const words = `Rupees ${numberToIndianWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`
  return amount < 0 ? `Minus ${words}` : words
}

export const deliveryPeriodText = (days: number) => `Within ${numberToIndianWords(days)} (${String(days).padStart(2, '0')}) days`

export function defaultAnnexureTerms(deliveryDays: number, termsText: string) {
  return [
    'Vendor will supply above quantity as agreed at total cost mentioned on Purchase Order- (inclusive of all taxes)',
    `Delivery Period: ${deliveryPeriodText(deliveryDays)} from the date of this PO, at the Ship to (delivery location) address mentioned above.`,
    `Payment Terms: ${termsText}.`,
  ]
}

export const hsnLooksValid = (hsn: string) => /^\d{4,8}$/.test(hsn)

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatInr = (value: number) => inr.format(value)
export const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
