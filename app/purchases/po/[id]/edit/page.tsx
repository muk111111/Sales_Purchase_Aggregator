'use client'

import { use } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useAppRole } from '@/components/companies/companies-shell'
import { PoForm } from '@/components/purchases/po-form'
import { fetchPo, PO_STATUS_LABELS } from '@/lib/purchases'

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const role = useAppRole()
  const { data: po, error, isLoading } = useSWR(['po', id], () => fetchPo(id))

  if (role !== 'OWNER' && role !== 'PARTNER') {
    return <p className="rounded-xl border border-[#dedbd2] bg-white p-6 text-sm">Only owners and partners can edit purchase orders.</p>
  }
  if (isLoading) return <p className="text-sm text-[#667078]">Loading purchase order…</p>
  if (error || !po) {
    return (
      <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
        {error?.message ?? 'Purchase order not found.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/purchases/po/${po.id}`} className="w-fit font-mono text-xs tracking-widest text-[#667078] uppercase hover:underline">
          {po.number}
        </Link>
        <h1 className="font-heading text-3xl font-bold text-balance">Edit purchase order</h1>
      </div>
      {po.status === 'CREATED' ? (
        <PoForm source={po} mode="edit" />
      ) : (
        <p className="rounded-xl border border-[#dedbd2] bg-white p-6 text-sm leading-relaxed">
          {po.number} is {PO_STATUS_LABELS[po.status].toLowerCase()} and can&apos;t be edited.
          {po.pi_number && ` Cancel ${po.pi_number} first (only if unpaid).`}
        </p>
      )}
    </div>
  )
}
