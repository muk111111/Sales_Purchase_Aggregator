'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { fetchCompanies, FIELD_LABELS } from '@/lib/companies'
import { useAppRole } from '@/components/companies/companies-shell'

export default function CompaniesPage() {
  const role = useAppRole()
  const { data: companies = [], error, isLoading } = useSWR('companies', fetchCompanies)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#667078]">The legal entities that issue POs, invoices and credit notes.</p>
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

      <div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white">
        <div className="flex items-center justify-between border-b border-[#e0ddd5] px-5 py-4">
          <h2 className="font-heading text-lg font-bold">Companies</h2>
          <span className="text-xs text-[#667078]">{companies.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#faf9f6] text-xs tracking-[0.12em] text-[#8b9295] uppercase">
              <tr>
                {['Code', 'Legal name', 'Entity type', 'GSTIN', 'Status', 'Missing fields'].map(label => (
                  <th key={label} scope="col" className="px-5 py-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eeeae2]">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#667078]">
                    Loading companies…
                  </td>
                </tr>
              )}
              {!isLoading && companies.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#667078]">
                    No companies yet.
                  </td>
                </tr>
              )}
              {companies.map(company => {
                const missing = (company.company_missing_fields ?? []).filter(
                  field => !['gstin', 'pan', 'reg_address'].includes(field),
                )
                return (
                  <tr key={company.id} className="hover:bg-[#fcfbf8]">
                    <td className="px-5 py-4 font-mono text-xs">{company.code}</td>
                    <td className="px-5 py-4">
                      <Link href={`/companies/${company.id}`} className="font-semibold underline-offset-4 hover:underline">
                        {company.legal_name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {company.is_default && (
                          <span className="rounded-md bg-[#f2a541] px-2 py-0.5 text-xs font-bold text-[#0e1b2c]">Default</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#667078]">{company.entity_type ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#667078]">{company.gstin ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                          company.status === 'Active' ? 'bg-[#eaf5ee] text-[#23714a]' : 'border border-[#dedbd2] text-[#667078]'
                        }`}
                      >
                        {company.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-[#667078]">
                      {missing.length > 0 ? missing.map(field => FIELD_LABELS[field] ?? field).join(', ') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
