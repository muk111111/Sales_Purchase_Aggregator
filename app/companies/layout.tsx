import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CompaniesShell } from '@/components/companies/companies-shell'

export const metadata: Metadata = {
  title: 'Our companies — Supply360',
  description: 'Legal entities, bank accounts, dispatch locations and document numbering.',
}

export default function CompaniesLayout({ children }: { children: ReactNode }) {
  return <CompaniesShell>{children}</CompaniesShell>
}
