'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import { useAppRole } from '@/components/companies/companies-shell'
import { CancelPoDialog } from '@/components/purchases/cancel-po-dialog'
import { PoDocument } from '@/components/purchases/po-document'
import { PoStatusBadge } from '@/components/purchases/po-status-badge'
import { computeTotals, fetchPo, formatDate } from '@/lib/purchases'

export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const role = useAppRole()
  const canWrite = role === 'OWNER' || role === 'PARTNER'
  const { mutate: mutateGlobal } = useSWRConfig()
  const { data: po, error, isLoading, mutate } = useSWR(['po', id], () => fetchPo(id))
  const [cancelling, setCancelling] = useState(false)

  if (isLoading) return <p className="text-sm text-[#667078]">Loading purchase order…</p>
  if (error || !po) {
    return (
      <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/purchases/po" className="w-fit font-mono text-xs tracking-widest text-[#667078] uppercase hover:underline">
            Purchase orders
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-bold">{po.number}</h1>
            <PoStatusBadge status={po.status} />
          </div>
          <p className="text-sm text-[#667078]">
            {po.company_abbr} · {po.vendor_name} · {formatDate(po.po_date)}
            {po.partner_name ? ` · Partner ${po.partner_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && po.status === 'CREATED' && (
            <>
              <button type="button" onClick={() => setCancelling(true)} className="min-h-11 rounded-lg border border-[#f0c4bd] bg-white px-4 text-sm font-semibold text-[#a33b2b]">
                Cancel PO
              </button>
              <Link href={`/purchases/po/${po.id}/edit`} className="flex min-h-11 items-center rounded-lg bg-[#142033] px-5 text-sm font-bold text-white">
                Edit
              </Link>
            </>
          )}
          <Link
            href={`/po-print/${po.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold"
          >
            PDF
          </Link>
        </div>
      </div>

      {po.status === 'CANCELLED' && (
        <p className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
          Cancelled {po.cancelled_at ? new Date(po.cancelled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}: {po.cancel_reason}
        </p>
      )}
      {po.pi_number && (
        <p className="rounded-xl border border-[#b7d6c5] bg-[#eaf5ee] px-4 py-3 text-sm text-[#23714a]">
          Locked: purchase invoice <span className="font-mono font-semibold">{po.pi_number}</span> was created from this PO.
        </p>
      )}
      {po.internal_notes && (
        <div className="rounded-xl border border-[#dedbd2] bg-white px-4 py-3 text-sm">
          <span className="font-mono text-xs tracking-widest text-[#667078] uppercase">Internal notes</span>
          <p className="mt-1 leading-relaxed whitespace-pre-line">{po.internal_notes}</p>
        </div>
      )}

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

      <CancelPoDialog
        po={cancelling ? { id: po.id, number: po.number } : null}
        onClose={() => setCancelling(false)}
        onCancelled={() => {
          setCancelling(false)
          mutate()
          mutateGlobal('po-list')
        }}
      />
    </div>
  )
}
