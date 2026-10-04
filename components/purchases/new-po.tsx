'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useAppRole } from '@/components/companies/companies-shell'
import { PoForm } from '@/components/purchases/po-form'
import { fetchPo } from '@/lib/purchases'

export function NewPo({ fromId }: { fromId: string | null }) {
  const role = useAppRole()
  const { data: source, error, isLoading } = useSWR(fromId ? ['po', fromId] : null, () => fetchPo(fromId as string))

  if (role !== 'OWNER' && role !== 'PARTNER') {
    return <p className="rounded-xl border border-[#dedbd2] bg-white p-6 text-sm">Only owners and partners can create purchase orders.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/purchases/po" className="w-fit font-mono text-xs tracking-widest text-[#667078] uppercase hover:underline">
          Purchase orders
        </Link>
        <h1 className="font-heading text-3xl font-bold text-balance">{source ? `Duplicate ${source.number}` : 'New purchase order'}</h1>
        <p className="text-sm leading-relaxed text-[#667078]">The PO number is issued when you save. Unsaved changes are kept on this device.</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">{error.message}</p>}
      {fromId && isLoading ? (
        <p className="text-sm text-[#667078]">Loading the PO to duplicate…</p>
      ) : (
        <PoForm key={source?.id ?? 'new'} source={source ?? null} mode={source ? 'duplicate' : 'new'} />
      )}
    </div>
  )
}
