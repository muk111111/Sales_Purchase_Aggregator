'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { fetchCompanies, FIELD_LABELS } from '@/lib/companies'
import { useAppRole } from '@/components/companies/companies-shell'

export default function CompaniesPage() {
  const role = useAppRole()
  const { data: companies, error, isLoading } = useSWR('companies', fetchCompanies)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-balance">Our companies</h1>
          <p className="mt-1 text-sm leading-relaxed text-[#667078]">
            The legal entities that issue POs, invoices and credit notes.
          </p>
        </div>
        {role === 'OWNER' && (
          <Link
            href="/companies/new"
            className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]"
          >
            <Plus size={17} aria-hidden="true" /> Add company
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
          Could not load companies: {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-[#667078]">Loading companies…</p>}

      <ul className="flex flex-col gap-3">
        {companies?.map(company => {
          const blockers = company.company_document_blockers ?? []
          const missing = (company.company_missing_fields ?? []).filter(field => !['gstin', 'pan', 'reg_address'].includes(field))
          return (
            <li key={company.id}>
              <Link
                href={`/companies/${company.id}`}
                className="flex flex-col gap-3 rounded-xl border border-[#dedbd2] bg-white p-5 transition-colors hover:border-[#142033] sm:flex-row sm:items-center"
              >
                <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-[#142033] font-mono text-lg font-semibold text-white">
                  {company.abbr}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{company.legal_name}</span>
                    {company.is_default && (
                      <span className="rounded-md bg-[#f2a541] px-2 py-0.5 text-xs font-bold text-[#0e1b2c]">Default</span>
                    )}
                    {company.status === 'Inactive' && (
                      <span className="rounded-md border border-[#dedbd2] px-2 py-0.5 text-xs text-[#667078]">Inactive</span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-[#667078]">
                    {company.code} · {company.entity_type ?? 'Add entity type'} · GSTIN {company.gstin ?? '—'}
                  </span>
                </span>
                <span className="flex flex-col gap-1 text-xs sm:max-w-xs sm:text-right">
                  {blockers.length > 0 ? (
                    <span className="font-semibold text-[#a33b2b]">Can&apos;t issue PO / PI / SI — add {blockers.join(', ')}</span>
                  ) : (
                    <span className="font-semibold text-[#23714a]">Ready for documents</span>
                  )}
                  {missing.length > 0 && (
                    <span className="text-[#667078]">Also missing: {missing.map(field => FIELD_LABELS[field] ?? field).join(', ')}</span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
