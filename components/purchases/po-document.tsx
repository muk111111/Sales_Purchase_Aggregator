import type { Company } from '@/lib/companies'
import {
  amountInWords,
  formatDate,
  formatInr,
  type computeTotals,
  type GstMode,
  type PurchaseType,
  type ShipTo,
  type Vendor,
} from '@/lib/purchases'

export type PoDocumentLine = {
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

export type PoDocumentData = {
  number: string | null
  po_date: string
  subject: string
  intro_text: string | null
  company: Partial<Company> | null
  vendor: Partial<Vendor> | null
  vendor_quotation_ref: string | null
  purchase_type: PurchaseType
  linked_sales_invoice_no: string | null
  ship_to: Partial<ShipTo>
  lines: PoDocumentLine[]
  totals: ReturnType<typeof computeTotals>
  gst_mode: GstMode
  payment_terms_text: string
  delivery_days: number
  annexure_enabled: boolean
  annexure_heading: string
  annexure_terms: string[]
  cancelled?: boolean
}

const qtyFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

function AddressBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1 border border-[#c9c5bb] p-3">
      <span className="text-[10px] font-bold tracking-widest text-[#667078] uppercase">{title}</span>
      {children}
    </div>
  )
}

export function PoDocument({ data }: { data: PoDocumentData }) {
  const { company, vendor, ship_to: shipTo, totals } = data
  const companyAddress = [company?.reg_address, [company?.city, company?.pin].filter(Boolean).join(' - '), company?.state_name]
    .filter(Boolean)
    .join(', ')
  const shipAddress = [shipTo.line1, shipTo.line2, [shipTo.city, shipTo.pin].filter(Boolean).join(' - '), shipTo.state].filter(Boolean).join(', ')
  const isIgst = data.gst_mode === 'IGST'

  return (
    <article
      aria-label={`Purchase order ${data.number ?? 'preview'}`}
      className="relative flex flex-col gap-4 overflow-hidden bg-white p-6 font-sans text-xs leading-relaxed text-[#142033] shadow-sm ring-1 ring-[#dedbd2] sm:p-8"
    >
      {data.cancelled && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 rounded-md border-4 border-[#a33b2b] px-6 py-2 font-heading text-4xl font-bold tracking-widest text-[#a33b2b] opacity-25"
        >
          CANCELLED
        </span>
      )}

      <header className="flex items-start justify-between gap-4 border-b-2 border-[#142033] pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {company?.logo_url && (
            <img src={company.logo_url} alt={`${company.legal_name ?? 'Company'} logo`} className="h-12 w-auto max-w-24 object-contain" />
          )}
          <div className="min-w-0">
            <p className="font-heading text-base font-bold">{company?.legal_name ?? 'Select a company'}</p>
            {companyAddress && <p className="text-pretty text-[#3b4654]">{companyAddress}</p>}
            <p className="font-mono text-[#3b4654]">
              {company?.gstin ? `GSTIN ${company.gstin}` : 'GSTIN —'}
              {company?.phone ? ` · ${company.phone}` : ''}
              {company?.email ? ` · ${company.email}` : ''}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-heading text-lg font-bold tracking-wide">PURCHASE ORDER</p>
          <dl className="mt-1 grid grid-cols-[auto_auto] justify-end gap-x-3 font-mono">
            <dt className="text-[#667078]">PO No.</dt>
            <dd className="font-semibold">{data.number ?? 'Assigned on save'}</dd>
            <dt className="text-[#667078]">Date</dt>
            <dd>{formatDate(data.po_date)}</dd>
            {data.vendor_quotation_ref && (
              <>
                <dt className="text-[#667078]">Quotation</dt>
                <dd>{data.vendor_quotation_ref}</dd>
              </>
            )}
            {data.purchase_type === 'BILL_TO_SHIP_TO' && data.linked_sales_invoice_no && (
              <>
                <dt className="text-[#667078]">Sales inv.</dt>
                <dd>{data.linked_sales_invoice_no}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <AddressBlock title="To">
          <p className="font-semibold">{vendor?.vendor_name ?? 'Select a vendor'}</p>
          {vendor?.address && <p className="text-pretty whitespace-pre-line text-[#3b4654]">{vendor.address}</p>}
          {vendor?.city_state && <p className="text-[#3b4654]">{vendor.city_state}</p>}
          <p className="font-mono text-[#3b4654]">GSTIN {vendor?.gstin ?? '—'}</p>
        </AddressBlock>
        <AddressBlock title="Ship to">
          <p className="font-semibold">{shipTo.name || 'Add a delivery location'}</p>
          {shipAddress && <p className="text-pretty text-[#3b4654]">{shipAddress}</p>}
          {(shipTo.contact_name || shipTo.contact_phone) && (
            <p className="text-[#3b4654]">
              Contact: {shipTo.contact_name} {shipTo.contact_phone && `· ${shipTo.contact_phone}`}
            </p>
          )}
          {shipTo.gstin && <p className="font-mono text-[#3b4654]">Consignee GSTIN {shipTo.gstin}</p>}
        </AddressBlock>
      </div>

      {data.intro_text && (
        <div className="flex flex-col gap-1">
          <p className="text-pretty whitespace-pre-line text-[#3b4654]">{data.intro_text}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="bg-[#142033] text-[10px] tracking-wide text-[#f6f4ee] uppercase">
              <th scope="col" className="px-2 py-1.5">#</th>
              <th scope="col" className="px-2 py-1.5">Item</th>
              <th scope="col" className="px-2 py-1.5">HSN</th>
              <th scope="col" className="px-2 py-1.5 text-right">Qty</th>
              <th scope="col" className="px-2 py-1.5 text-right">Unit/Rate</th>
              <th scope="col" className="px-2 py-1.5 text-right">Taxable Amount</th>
              <th scope="col" className="px-2 py-1.5 text-right">GST%</th>
              <th scope="col" className="px-2 py-1.5 text-right">GST Amount</th>
              <th scope="col" className="px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 && (
              <tr>
                <td colSpan={9} className="border-b border-[#dedbd2] px-2 py-4 text-center text-[#667078]">
                  Add a line item
                </td>
              </tr>
            )}
            {data.lines.map((line, index) => (
              <tr key={`${line.sku_code}-${index}`} className="border-b border-[#dedbd2] align-top">
                <td className="px-2 py-1.5 font-mono">{index + 1}</td>
                <td className="px-2 py-1.5">
                  <span className="block font-mono text-[10px] text-[#667078]">{line.sku_code}</span>
                  <span className="font-semibold">{line.description || line.item_name || '—'}</span>
                </td>
                <td className="px-2 py-1.5 font-mono">{line.hsn}</td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">{qtyFormat.format(line.qty)}</td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                  {line.unit} / {formatInr(line.rate)}
                  {line.discount_pct > 0 && <span className="block text-[10px] text-[#667078]">−{line.discount_pct}%</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{formatInr(line.taxable)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{line.gst_pct}%</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatInr(line.gst_amount)}</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">{formatInr(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xs font-semibold text-pretty">
          <span className="block text-[10px] font-bold tracking-widest text-[#667078] uppercase">Amount in words</span>
          {amountInWords(totals.grandTotal)}
        </p>
        <dl className="grid min-w-56 grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 font-mono">
          <dt className="text-[#3b4654]">Taxable value</dt>
          <dd className="text-right">{formatInr(totals.taxable)}</dd>
          {totals.rows
            .filter(row => row.rate > 0)
            .map(row =>
              isIgst ? (
                <div key={row.rate} className="contents">
                  <dt className="text-[#3b4654]">IGST @ {row.rate}%</dt>
                  <dd className="text-right">{formatInr(row.igst)}</dd>
                </div>
              ) : (
                <div key={row.rate} className="contents">
                  <dt className="text-[#3b4654]">CGST @ {row.rate / 2}%</dt>
                  <dd className="text-right">{formatInr(row.cgst)}</dd>
                  <dt className="text-[#3b4654]">SGST @ {row.rate / 2}%</dt>
                  <dd className="text-right">{formatInr(row.sgst)}</dd>
                </div>
              ),
            )}
          <dt className="text-[#3b4654]">Total tax</dt>
          <dd className="text-right">{formatInr(totals.tax)}</dd>
          {totals.roundOff !== 0 && (
            <>
              <dt className="text-[#3b4654]">Round off</dt>
              <dd className="text-right">{formatInr(totals.roundOff)}</dd>
            </>
          )}
          <dt className="mt-1 border-t-2 border-[#142033] pt-1 font-sans font-bold">Total with tax</dt>
          <dd className="mt-1 border-t-2 border-[#142033] pt-1 text-right font-bold">₹ {formatInr(totals.grandTotal)}</dd>
        </dl>
      </div>

      {data.annexure_enabled && data.annexure_terms.length > 0 && (
        <section aria-label={data.annexure_heading} className="flex flex-col gap-1.5">
          <h3 className="font-heading text-sm font-bold underline underline-offset-4">{data.annexure_heading}</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-pretty text-[#3b4654]">
            {data.annexure_terms.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ol>
        </section>
      )}

      <footer className="mt-4 flex items-end justify-between gap-4 border-t border-[#dedbd2] pt-4">
        <div className="hidden flex-1 sm:block" aria-hidden="true" />
        <div className="flex-1 text-center text-[#3b4654]">
          <span className="block text-[10px] font-bold tracking-widest text-[#667078] uppercase">Registered address &amp; contact</span>
          {companyAddress && <p className="text-pretty">{companyAddress}</p>}
          {(company?.phone || company?.email) && (
            <p className="font-mono">{[company?.phone, company?.email].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <div className="flex flex-1 justify-end">
          <p className="font-semibold">For {company?.legal_name ?? '—'}</p>
        </div>
      </footer>
    </article>
  )
}
