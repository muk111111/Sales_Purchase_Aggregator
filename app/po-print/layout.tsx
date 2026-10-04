import type { ReactNode } from 'react'

export default function PoPrintLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#f6f4ee]">{children}</div>
}
