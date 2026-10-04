import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CompaniesShell } from '@/components/companies/companies-shell'

export const metadata: Metadata = {
  title: 'Purchase orders — Supply360',
  description: 'Create, track and cancel purchase orders across companies.',
}

export default function PurchasesLayout({ children }: { children: ReactNode }) {
  return <CompaniesShell>{children}</CompaniesShell>
}
