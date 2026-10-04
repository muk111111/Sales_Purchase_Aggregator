'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft } from 'lucide-react'
import { fetchSession, type AppRole } from '@/lib/companies'

const RoleContext = createContext<AppRole>('VIEWER')
export const useAppRole = () => useContext(RoleContext)

export function CompaniesShell({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useSWR('session', fetchSession, { revalidateOnFocus: false })

  useEffect(() => {
    if (!isLoading && session === null) window.location.replace('/login')
  }, [isLoading, session])

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f4ee] text-sm text-[#667078]" role="status">
        Checking your access…
      </div>
    )
  }

  return (
    <RoleContext.Provider value={session.role}>
      <div className="min-h-screen bg-[#f6f4ee] font-sans text-[#142033]">
        <header className="border-b border-[#dedbd2] bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#667078] hover:text-[#142033]">
              <ArrowLeft size={16} aria-hidden="true" /> Back to desk
            </Link>
            <div className="text-right text-sm">
              <span className="font-semibold">{session.name}</span>
              <span className="ml-2 rounded-md bg-[#142033] px-2 py-0.5 font-mono text-xs text-white">{session.role}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</main>
      </div>
    </RoleContext.Provider>
  )
}
