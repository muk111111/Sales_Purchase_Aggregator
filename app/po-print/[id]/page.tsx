'use client'

import { use, useEffect, useState } from 'react'
import useSWR from 'swr'
import { Printer } from 'lucide-react'
import { PoDocument } from '@/components/purchases/po-document'
import { computeTotals, fetchPo } from '@/lib/purchases'

export default function PoPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: po, error, isLoading } = useSWR(['po', id], () => fetchPo(id))
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    if (!po || printed) return
    setPrinted(true)
    const timer = window.setTimeout(() => window.print(), 300)
    return () => window.clearTimeout(timer)
  }, [po, printed])

  if (isLoading) return <p className="p-8 text-sm text-[#667078]">Loading purchase order…</p>
  if (error || !po) {
    return (
      <p role="alert" className="m-8 rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
        {error?.message ?? 'Purchase order not found.'}
      </p>
    )
  }

  const totals = computeTotals(
    po.lines.map(line => ({ taxable: line.taxable, gstAmount: line.gst_amount, gstPct: line.gst_pct })),
    po.gst_mode,
    po.round_off_enabled,
  )

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between print:hidden">
        <p className="font-mono text-xs tracking-widest text-[#667078] uppercase">PO {po.number}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-[#142033] px-4 text-sm font-bold text-white"
        >
          <Printer size={16} aria-hidden="true" /> Print / Save as PDF
        </button>
      </div>
      <div className="mx-auto w-full max-w-4xl">
        <PoDocument
          data={{
            number: po.number,
            po_date: po.po_date,
            subject: po.subject,
            intro_text: po.intro_text,
            company: po.company_snapshot,
            vendor: po.vendor_snapshot,
            vendor_quotation_ref: po.vendor_quotation_ref,
            purchase_type: po.purchase_type,
            linked_sales_invoice_no: po.linked_sales_invoice_no,
            ship_to: po.ship_to,
            lines: po.lines,
            totals,
            gst_mode: po.gst_mode,
            payment_terms_text: po.payment_terms_text,
            delivery_days: po.delivery_days,
            annexure_enabled: po.annexure_enabled,
            annexure_heading: po.annexure_heading,
            annexure_terms: po.annexure_terms,
            cancelled: po.status === 'CANCELLED',
          }}
        />
      </div>
    </div>
  )
}
