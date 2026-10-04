'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { fetchSession, type AppRole } from '@/lib/companies'
import { AppShell } from '@/components/app-shell'

const RoleContext = createContext<AppRole>('VIEWER')
export const useAppRole = () => useContext(RoleContext)

const sectionForPath = (pathname: string) => {
  if (pathname.startsWith('/purchases')) return 'Purchase Orders'
  return 'Companies'
}

export function CompaniesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { data: session, isLoading } = useSWR('session', fetchSession, { revalidateOnFocus: false })

  useEffect(() => {
    if (!isLoading && session === null) window.location.replace('/login')
  }, [isLoading, session])

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f2ed] text-sm text-[#667078]" role="status">
        Checking your access…
      </div>
    )
  }

  return (
    <RoleContext.Provider value={session.role}>
      <AppShell active={sectionForPath(pathname)}>{children}</AppShell>
    </RoleContext.Provider>
  )
}
