'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus, Search } from 'lucide-react'
import { useAppRole } from '@/components/companies/companies-shell'
import { PoStatusBadge } from '@/components/purchases/po-status-badge'
import { CancelPoDialog } from '@/components/purchases/cancel-po-dialog'
import { fetchPoList, formatDate, formatInr, PO_STATUS_LABELS, type PoListRow, type PoStatus } from '@/lib/purchases'

const TABS: ('ALL' | PoStatus)[] = ['ALL', 'CREATED', 'PI_CREATED', 'CANCELLED']
const filterClass = 'min-h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm text-[#142033]'

const unique = (rows: PoListRow[], pick: (row: PoListRow) => [string, string] | null) =>
  [...new Map(rows.map(pick).filter((entry): entry is [string, string] => entry !== null)).entries()].sort((a, b) => a[1].localeCompare(b[1]))

export default function PurchaseOrdersPage() {
  const role = useAppRole()
  const canWrite = role === 'OWNER' || role === 'PARTNER'
  const { data: rows = [], error, isLoading, mutate } = useSWR('po-list', fetchPoList)
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL')
  const [query, setQuery] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cancelling, setCancelling] = useState<{ id: string; number: string } | null>(null)

  const options = useMemo(
    () => ({
      companies: unique(rows, row => [row.company_id, row.company_abbr]),
      vendors: unique(rows, row => [row.vendor_id, row.vendor_name]),
      partners: unique(rows, row => (row.partner_id ? [row.partner_id, row.partner_name ?? '—'] : null)),
      shipTos: unique(rows, row => (row.ship_to?.name ? [row.ship_to.name, row.ship_to.name] : null)),
    }),
    [rows],
  )

  const filtered = rows.filter(row => {
    const needle = query.trim().toLowerCase()
    return (
      (!companyId || row.company_id === companyId) &&
      (!vendorId || row.vendor_id === vendorId) &&
      (!partnerId || row.partner_id === partnerId) &&
      (!shipTo || row.ship_to?.name === shipTo) &&
      (!from || row.po_date >= from) &&
      (!to || row.po_date <= to) &&
      (!needle || `${row.number} ${row.vendor_name} ${row.sku_search ?? ''}`.toLowerCase().includes(needle))
    )
  })
  const counts = Object.fromEntries(TABS.map(item => [item, item === 'ALL' ? filtered.length : filtered.filter(row => row.status === item).length]))
  const visible = tab === 'ALL' ? filtered : filtered.filter(row => row.status === tab)
  const hasFilters = Boolean(query || companyId || vendorId || partnerId || shipTo || from || to)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs tracking-widest text-[#667078] uppercase">Purchases</p>
          <h1 className="font-heading text-3xl font-bold text-balance">Purchase orders</h1>
        </div>
        {canWrite && (
          <Link href="/purchases/po/new" className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f2a541] px-5 text-sm font-bold text-[#0e1b2c]">
            <Plus size={16} aria-hidden="true" /> New PO
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="PO status" className="flex flex-wrap gap-1 border-b border-[#dedbd2]">
        {TABS.map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${
              tab === item ? 'border-[#142033] text-[#142033]' : 'border-transparent text-[#667078]'
            }`}
          >
            {item === 'ALL' ? 'All' : PO_STATUS_LABELS[item]}
            <span className="rounded-full bg-[#eeeae1] px-2 font-mono text-xs">{counts[item]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#dedbd2] bg-white p-4">
        <label className="relative">
          <span className="sr-only">Search PO number, vendor or SKU</span>
          <Search size={16} aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-[#667078]" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search PO no., vendor or SKU"
            className={`${filterClass} w-full pl-9`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Company', value: companyId, set: setCompanyId, list: options.companies },
            { label: 'Vendor', value: vendorId, set: setVendorId, list: options.vendors },
            { label: 'Partner', value: partnerId, set: setPartnerId, list: options.partners },
            { label: 'Ship to', value: shipTo, set: setShipTo, list: options.shipTos },
          ].map(filter => (
            <label key={filter.label} className="flex flex-col gap-1 text-xs font-semibold text-[#667078]">
              {filter.label}
              <select value={filter.value} onChange={event => filter.set(event.target.value)} className={filterClass}>
                <option value="">All</option>
                {filter.list.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#667078]">
            From
            <input type="date" value={from} onChange={event => setFrom(event.target.value)} className={filterClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#667078]">
            To
            <input type="date" value={to} onChange={event => setTo(event.target.value)} className={filterClass} />
          </label>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setCompanyId('')
              setVendorId('')
              setPartnerId('')
              setShipTo('')
              setFrom('')
              setTo('')
            }}
            className="w-fit text-sm font-semibold text-[#142033] underline underline-offset-4"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
          Could not load purchase orders: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#dedbd2] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-[#dedbd2] bg-[#f6f4ee] font-mono text-xs tracking-wide text-[#667078] uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">PO no.</th>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3">Vendor</th>
              <th scope="col" className="px-4 py-3">Ship to</th>
              <th scope="col" className="px-4 py-3 text-right">Items</th>
              <th scope="col" className="px-4 py-3 text-right">Taxable</th>
              <th scope="col" className="px-4 py-3 text-right">GST</th>
              <th scope="col" className="px-4 py-3 text-right">Total</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Linked PI</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-[#667078]">Loading purchase orders…</td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center">
                  <p className="font-semibold">{rows.length === 0 ? 'No purchase orders yet' : 'No POs match these filters'}</p>
                  {rows.length === 0 && canWrite && (
                    <Link href="/purchases/po/new" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">
                      Create the first PO
                    </Link>
                  )}
                </td>
              </tr>
            )}
            {visible.map(row => (
              <tr key={row.id} className="border-b border-[#eeeae1] last:border-0 hover:bg-[#fbfaf7]">
                <td className="px-4 py-3">
                  <Link href={`/purchases/po/${row.id}`} className="font-mono font-semibold underline-offset-4 hover:underline">
                    {row.number}
                  </Link>
                  <span className="block text-xs text-[#667078]">{row.company_abbr}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.po_date)}</td>
                <td className="px-4 py-3">{row.vendor_name}</td>
                <td className="px-4 py-3">
                  {row.ship_to?.name}
                  <span className="block text-xs text-[#667078]">{row.ship_to?.city}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{row.item_count}</td>
                <td className="px-4 py-3 text-right font-mono">{formatInr(row.taxable_total)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatInr(row.tax_total)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{formatInr(row.grand_total)}</td>
                <td className="px-4 py-3"><PoStatusBadge status={row.status} /></td>
                <td className="px-4 py-3 font-mono text-xs">{row.pi_number ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="flex justify-end gap-3 text-sm font-semibold whitespace-nowrap">
                    <Link href={`/purchases/po/${row.id}`} className="underline-offset-4 hover:underline">View</Link>
                    {canWrite && row.status === 'CREATED' && (
                      <Link href={`/purchases/po/${row.id}/edit`} className="underline-offset-4 hover:underline">Edit</Link>
                    )}
                    {canWrite && (
                      <Link href={`/purchases/po/new?from=${row.id}`} className="underline-offset-4 hover:underline">Duplicate</Link>
                    )}
                    {canWrite && row.status === 'CREATED' && (
                      <button type="button" onClick={() => setCancelling({ id: row.id, number: row.number })} className="font-semibold text-[#a33b2b] underline-offset-4 hover:underline">
                        Cancel
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CancelPoDialog
        po={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={() => {
          setCancelling(null)
          mutate()
        }}
      />
    </div>
  )
}
