'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { fetchCompany, FIELD_LABELS } from '@/lib/companies'
import { useAppRole } from '@/components/companies/companies-shell'
import { CompanyForm } from '@/components/companies/company-form'
import { BankAccounts } from '@/components/companies/bank-accounts'
import { DispatchLocations } from '@/components/companies/dispatch-locations'
import { DocumentSeriesPanel } from '@/components/companies/document-series'

export default function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const role = useAppRole()
  const isOwner = role === 'OWNER'
  const { mutate: mutateGlobal } = useSWRConfig()
  const { data: company, error, mutate } = useSWR(['company', id], () => fetchCompany(id))
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const refresh = async () => {
    await mutate()
    mutateGlobal('companies')
  }

  const makeDefault = async () => {
    setActionError('')
    const { error: updateError } = await createClient().from('companies').update({ is_default: true }).eq('id', id)
    if (updateError) setActionError(updateError.message)
    else {
      setMessage('Default company updated.')
      await refresh()
    }
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-[#a33b2b]">
        Could not load company: {error.message}. <Link href="/companies" className="underline">Back to companies</Link>
      </p>
    )
  }
  if (!company) return <p className="text-sm text-[#667078]">Loading company…</p>

  const blockers = company.company_document_blockers ?? []
  const missing = company.company_missing_fields ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-16 items-center justify-center rounded-lg bg-[#142033] font-mono text-xl font-semibold text-white">
            {company.abbr}
          </span>
          <div>
            <Link href="/companies" className="text-xs font-semibold text-[#667078] hover:text-[#142033]">
              Our companies
            </Link>
            <h1 className="font-heading text-2xl font-bold text-balance sm:text-3xl">{company.legal_name}</h1>
          </div>
        </div>
        {company.is_default ? (
          <span className="rounded-md bg-[#f2a541] px-3 py-1 text-sm font-bold text-[#0e1b2c]">Default company</span>
        ) : (
          isOwner &&
          company.status === 'Active' && (
            <button type="button" onClick={makeDefault} className="min-h-10 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-semibold">
              Make default
            </button>
          )
        )}
      </div>

      {blockers.length > 0 && (
        <div role="status" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm leading-relaxed text-[#a33b2b]">
          <strong>POs, purchase invoices and sales invoices are blocked</strong> until you add: {blockers.join(', ')}.
        </div>
      )}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#667078]">Incomplete:</span>
          {missing.map(field => (
            <span key={field} className="rounded-md border border-dashed border-[#c9c4b6] px-2 py-0.5 text-xs">
              Add {FIELD_LABELS[field] ?? field}
            </span>
          ))}
        </div>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-[#b7d6c5] bg-[#eaf5ee] px-4 py-3 text-sm font-semibold text-[#23714a]">
          {message}
        </p>
      )}
      {actionError && <p role="alert" className="text-sm text-[#a33b2b]">{actionError}</p>}
      {!isOwner && <p className="text-sm text-[#667078]">You have read-only access to company setup.</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <CompanyForm
          key={company.id}
          company={company}
          readOnly={!isOwner}
          onSaved={async () => {
            setMessage('Company saved.')
            await refresh()
          }}
        />
        <div className="flex flex-col gap-6">
          <DocumentSeriesPanel companyId={company.id} />
          <BankAccounts companyId={company.id} canEdit={isOwner} onChange={refresh} />
          <DispatchLocations companyId={company.id} canAdd={role === 'OWNER' || role === 'PARTNER'} canEdit={isOwner} />
        </div>
      </div>
    </div>
  )
}
