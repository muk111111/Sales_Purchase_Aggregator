'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Bell,
  Boxes,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type RolePermission = { role: string; module: string; can_view: boolean }
type NavItem = { label: string; icon: typeof LayoutDashboard; href: string; indent?: boolean }

const section = (label: string) => `/?section=${encodeURIComponent(label)}`

export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ label: 'Dashboards', icon: LayoutDashboard, href: section('Dashboards') }] },
  { label: 'CRM', items: [{ label: 'Leads', icon: Users, href: section('Leads') }] },
  {
    label: 'Buy',
    items: [
      { label: 'Vendor Comparison', icon: CircleDollarSign, href: section('Vendor Comparison') },
      { label: 'Purchase Orders', icon: FileText, href: '/purchases/po' },
      { label: 'Purchase Invoices', icon: FileText, href: '/purchases/po' },
    ],
  },
  { label: 'Sell', items: [{ label: 'Sales & Invoices', icon: FileText, href: section('Sales & Invoices') }] },
  {
    label: 'Money',
    items: [
      { label: 'Commissions & Cuts', icon: CircleDollarSign, href: section('Commissions & Cuts') },
      { label: 'Stock & Expenses', icon: WalletCards, href: section('Stock & Expenses') },
    ],
  },
  {
    label: 'Master',
    items: [
      { label: 'Vendor Master', icon: Truck, href: section('Vendor Master') },
      { label: 'Customer Master', icon: Users, href: section('Customer Master') },
      { label: 'SKU Master', icon: Boxes, href: section('SKU Master') },
      { label: 'SKU Configuration', icon: Boxes, href: section('SKU Configuration'), indent: true },
    ],
  },
  {
    label: 'Business Entity',
    items: [
      { label: 'Companies', icon: Users, href: '/companies' },
      { label: 'Employees', icon: Users, href: section('Employees') },
      { label: 'Role & Module Access', icon: ShieldCheck, href: section('Role & Module Access') },
    ],
  },
]

export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [employeeName, setEmployeeName] = useState('Employee')
  const [employeeRole, setEmployeeRole] = useState('Employee')
  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const checkEmployee = async () => {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }
      const { data: employee } = await supabase.from('employees').select('full_name,role,is_active').eq('id', session.user.id).maybeSingle()
      if (!employee?.is_active) {
        await supabase.auth.signOut()
        window.location.replace('/login')
        return
      }
      const { data: permissionData } = await supabase.rpc('list_role_module_permissions')
      if (active) {
        setEmployeeName(employee.full_name)
        setEmployeeRole(employee.role as string)
        setPermissions((permissionData ?? []) as RolePermission[])
        setReady(true)
      }
    }
    checkEmployee()
    return () => {
      active = false
    }
  }, [])

  const canView = (label: string) => {
    if (employeeRole === 'Admin') return true
    if (label === 'Role & Module Access') return false
    return permissions.some(
      permission =>
        permission.role === employeeRole &&
        (permission.module === label || (label === 'SKU Configuration' && permission.module === 'SKU Master')) &&
        permission.can_view,
    )
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f2ed] text-sm text-[#667078]">Checking employee access…</div>
  }

  return (
    <div className="min-h-screen bg-[#f4f2ed] text-[#0e1b2c]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#0e1b2c] px-5 py-6 text-white transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <div>
            <div className="font-heading text-[25px] font-bold tracking-[-0.04em]">
              Supply<span className="text-[#f2a541]">360</span>
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/45">Trading desk</div>
          </div>
          <button aria-label="Close navigation" className="rounded-lg p-2 text-white/50 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X />
          </button>
        </div>
        <div className="mt-8 flex-1 overflow-y-auto">
          {navGroups.map(group => {
            const visibleItems = group.items.filter(item => canView(item.label))
            if (!visibleItems.length) return null
            return (
              <div key={group.label} className="mb-6">
                <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</div>
                <div className="flex flex-col gap-1">
                  {visibleItems.map(item => {
                    const Icon = item.icon
                    const isActive = item.label === active
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] ${
                          item.indent ? 'ml-6 w-[calc(100%-1.5rem)] border-l border-white/20 pl-4 text-xs' : ''
                        } ${isActive ? 'bg-[#f2a541] font-semibold text-[#0e1b2c]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
                      >
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#f2a541] text-sm font-bold text-[#0e1b2c]">
              {employeeName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold">{employeeName}</div>
              <div className="text-xs text-white/45">{employeeRole}</div>
            </div>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await createClient().auth.signOut()
                window.location.replace('/login')
              }}
              className="ml-auto rounded-lg p-1.5 text-[#e56b5d] hover:bg-[#b23a22]/20 hover:text-[#ff9a8d]"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#dedbd2] bg-[#f4f2ed]/95 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" className="rounded-lg p-2 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <h1 className="font-heading text-[25px] font-bold tracking-[-0.035em]">{active}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-[#b7d6c5] bg-[#eaf5ee] px-2.5 py-1.5 text-[11px] text-[#23714a] sm:block">
              Supabase connected
            </div>
            <button aria-label="Search" className="rounded-lg border border-[#dedbd2] bg-white p-2.5">
              <Search size={17} />
            </button>
            <button aria-label="Notifications" className="rounded-lg border border-[#dedbd2] bg-white p-2.5">
              <Bell size={17} />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>
      {sidebarOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-[#0e1b2c]/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
