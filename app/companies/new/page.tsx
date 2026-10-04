'use client'

import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { CompanyForm } from '@/components/companies/company-form'
import { useAppRole } from '@/components/companies/companies-shell'

export default function NewCompanyPage() {
  const router = useRouter()
  const role = useAppRole()
  const { mutate } = useSWRConfig()

  if (role !== 'OWNER') {
    return <p className="text-sm text-[#667078]">Only owners can add companies.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Add company</h1>
        <p className="mt-1 text-sm leading-relaxed text-[#667078]">
          Five document series (PO, PI, SO, SI, CN) start at 91010 when the company is created. Bank accounts and dispatch
          locations are added on the next screen.
        </p>
      </div>
      <CompanyForm
        company={null}
        readOnly={false}
        onSaved={id => {
          mutate('companies')
          router.push(`/companies/${id}`)
        }}
      />
    </div>
  )
}
