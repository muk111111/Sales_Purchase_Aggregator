'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Menu,
  PackageCheck,
  PanelLeft,
  Search,
  Settings2,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react'

const navGroups = [
  { label: 'Overview', items: [{ label: 'Dashboards', icon: LayoutDashboard }] },
  { label: 'CRM', items: [{ label: 'Leads', icon: Users }] },
  {
    label: 'Buy',
    items: [
      { label: 'Vendor Comparison', icon: BarChart3 },
      { label: 'Purchases & PIs', icon: FileText, badge: 3 },
    ],
  },
  {
    label: 'Sell',
    items: [
      { label: 'Sales & Invoices', icon: FileText },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Commissions & Cuts', icon: CircleDollarSign },
      { label: 'Stock & Expenses', icon: WalletCards, badge: 5 },
    ],
  },
  {
    label: 'Master',
    items: [
      { label: 'Vendor Master', icon: Truck },
      { label: 'Customer Master', icon: Users },
      { label: 'SKU Master', icon: Boxes },
      { label: 'Our Companies', icon: Settings2 },
    ],
  },
]

const kpis = [
  { label: 'Net sales', value: '₹3,82,060', change: '+12.8%', tone: 'teal', note: 'vs last month' },
  { label: 'Gross trading margin', value: '₹68,155', change: '17.8%', tone: 'amber', note: 'healthy margin' },
  { label: 'Cut on sales earned', value: '₹7,680', change: '+8.4%', tone: 'blue', note: 'this financial year' },
  { label: 'Net profit', value: '−₹568.79', change: 'Needs focus', tone: 'red', note: 'after expenses' },
]

const receivables = [
  { label: 'Not yet due', value: '₹2,14,820', width: '72%', tone: 'bg-[#2b6f78]' },
  { label: '1–30 days', value: '₹86,420', width: '42%', tone: 'bg-[#f2a541]' },
  { label: '31–60 days', value: '₹34,293', width: '22%', tone: 'bg-[#c9832d]' },
  { label: '90+ days', value: '₹17,680', width: '14%', tone: 'bg-[#b23a22]' },
]

const alerts = [
  { title: 'Thin margin', value: '8 SKUs', detail: 'Below 8% margin', icon: BarChart3, tone: 'amber' },
  { title: 'Out of stock', value: '4 SKUs', detail: 'Needs replenishment', icon: Boxes, tone: 'red' },
  { title: 'Overdue lines', value: '₹17,680', detail: '90+ days overdue', icon: Bell, tone: 'red' },
]

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ error }) => setConnected(!error))
  }, [])

  return (
    <div className="min-h-screen bg-[#f4f2ed] text-[#0e1b2c]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#0e1b2c] px-5 py-6 text-white transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2">
          <div>
            <div className="font-heading text-[25px] font-bold tracking-[-0.04em]">Supply<span className="text-[#f2a541]">360</span></div>
            <div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/45">Trading desk</div>
          </div>
          <button aria-label="Close navigation" className="rounded-lg p-2 text-white/50 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(false)}><X /></button>
        </div>
        <div className="mt-8 flex-1 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-6">
              <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</div>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = item.label === 'Dashboards'
                  return <button key={item.label} className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors ${active ? 'bg-[#f2a541] font-semibold text-[#0e1b2c]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><Icon size={16} /><span className="flex-1">{item.label}</span>{item.badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-[#0e1b2c] text-[#f2a541]' : 'bg-[#b23a22] text-white'}`}>{item.badge}</span>}</button>
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#f2a541] text-sm font-bold text-[#0e1b2c]">MV</div>
            <div className="min-w-0"><div className="truncate text-sm font-semibold">Mukul Verma</div><div className="text-xs text-white/45">Owner</div></div>
            <Settings2 size={15} className="ml-auto text-white/40" />
          </div>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#dedbd2] bg-[#f4f2ed]/95 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button aria-label="Open navigation" className="rounded-lg p-2 hover:bg-white lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div><h1 className="font-heading text-[25px] font-bold tracking-[-0.035em]">Dashboards</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-3"><div className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] sm:flex ${connected ? 'border-[#b7d6c5] bg-[#eaf5ee] text-[#23714a]' : 'border-[#e8c2b9] bg-[#fff1ed] text-[#b23a22]'}`}><span className={`size-1.5 rounded-full ${connected ? 'bg-[#23714a]' : 'bg-[#b23a22]'}`} />{connected ? 'Supabase connected' : 'Supabase needs setup'}</div><button aria-label="Search" className="rounded-lg border border-[#dedbd2] bg-white p-2.5 text-[#52606a] hover:border-[#b8b3a8]"><Search size={17} /></button><button aria-label="Notifications" className="relative rounded-lg border border-[#dedbd2] bg-white p-2.5 text-[#52606a] hover:border-[#b8b3a8]"><Bell size={17} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#b23a22]" /></button></div>
        </header>

        <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs text-[#667078]"><button className="flex items-center gap-1.5 rounded-lg border border-[#dedbd2] bg-white px-3 py-2 font-medium text-[#0e1b2c]">All companies <ChevronDown size={14} /></button><button className="flex items-center gap-1.5 rounded-lg border border-[#dedbd2] bg-white px-3 py-2 font-medium text-[#0e1b2c]">All partners <ChevronDown size={14} /></button><span className="hidden text-[#a3a09a] sm:inline">Updated just now</span></div><button className="flex items-center gap-2 text-xs font-semibold text-[#2b6f78] hover:text-[#0e1b2c]"><ArrowDownToLine size={15} /> Export report</button></div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((kpi) => <div key={kpi.label} className="rounded-2xl border border-[#e0ddd5] bg-white p-5 shadow-[0_2px_10px_rgba(14,27,44,0.03)]"><div className="mb-5 flex items-start justify-between"><span className="text-xs font-medium text-[#667078]">{kpi.label}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${kpi.tone === 'red' ? 'bg-[#fff0ed] text-[#b23a22]' : kpi.tone === 'amber' ? 'bg-[#fff5df] text-[#9a620c]' : kpi.tone === 'blue' ? 'bg-[#e7f1f2] text-[#2b6f78]' : 'bg-[#eaf5ee] text-[#23714a]'}`}>{kpi.change}</span></div><div className="font-heading text-[26px] font-bold tracking-[-0.04em] tabular-nums">{kpi.value}</div><div className="mt-1 text-[11px] text-[#8b9295]">{kpi.note}</div></div>)}</section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border border-[#e0ddd5] bg-white p-5 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="font-heading text-lg font-bold">Trading performance</h2><p className="mt-1 text-xs text-[#8b9295]">Financial year 2026–27 · GST excluded</p></div><button className="rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-medium text-[#52606a]">This year <ChevronDown size={13} className="ml-1 inline" /></button></div><div className="mt-7 flex h-[180px] items-end gap-3 border-b border-l border-[#e8e5de] px-3 pb-0 sm:gap-6"><div className="flex h-full flex-1 flex-col justify-end gap-2"><div className="h-[76%] rounded-t-lg bg-[#2b6f78]" /><span className="-mb-6 text-center text-[10px] text-[#8b9295]">Apr</span></div><div className="flex h-full flex-1 flex-col justify-end gap-2"><div className="h-[58%] rounded-t-lg bg-[#2b6f78]" /><span className="-mb-6 text-center text-[10px] text-[#8b9295]">May</span></div><div className="flex h-full flex-1 flex-col justify-end gap-2"><div className="h-[88%] rounded-t-lg bg-[#f2a541]" /><span className="-mb-6 text-center text-[10px] text-[#8b9295]">Jun</span></div><div className="flex h-full flex-1 flex-col justify-end gap-2"><div className="h-[68%] rounded-t-lg bg-[#2b6f78]" /><span className="-mb-6 text-center text-[10px] text-[#8b9295]">Jul</span></div><div className="flex h-full flex-1 flex-col justify-end gap-2"><div className="h-[80%] rounded-t-lg bg-[#2b6f78]" /><span className="-mb-6 text-center text-[10px] text-[#8b9295]">Aug</span></div><div className="flex h-full flex-1 flex-col justify-end gap-2"><div className="h-[94%] rounded-t-lg bg-[#f2a541]" /><span className="-mb-6 text-center text-[10px] text-[#8b9295]">Sep</span></div></div><div className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#667078]"><span><i className="mr-1.5 inline-block size-2 rounded-sm bg-[#2b6f78]" />Net sales</span><span><i className="mr-1.5 inline-block size-2 rounded-sm bg-[#f2a541]" />Gross margin</span></div></div>
            <div className="rounded-2xl border border-[#e0ddd5] bg-[#0e1b2c] p-5 text-white sm:p-6"><div className="flex items-start justify-between"><div><h2 className="font-heading text-lg font-bold">Cash position</h2><p className="mt-1 text-xs text-white/45">What needs attention today</p></div><WalletCards size={19} className="text-[#f2a541]" /></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/[0.07] p-4"><div className="text-[11px] text-white/45">Receivable</div><div className="mt-2 font-heading text-xl font-bold">₹3,53,213</div><div className="mt-1 text-[10px] text-[#88c9b0]">+₹24,820 this month</div></div><div className="rounded-xl bg-white/[0.07] p-4"><div className="text-[11px] text-white/45">Payable</div><div className="mt-2 font-heading text-xl font-bold">₹4,16,574</div><div className="mt-1 text-[10px] text-[#f6c675]">₹2,80,368 on hold</div></div></div><div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-xs text-white/50">Net working capital</span><span className="font-heading text-lg font-bold text-[#f4a493]">−₹80,867</span></div></div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-2xl border border-[#e0ddd5] bg-white p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-lg font-bold">Receivables ageing</h2><p className="mt-1 text-xs text-[#8b9295]">Outstanding by due date</p></div><ArrowUpRight size={18} className="text-[#8b9295]" /></div><div className="flex flex-col gap-4">{receivables.map((item) => <div key={item.label}><div className="mb-1.5 flex justify-between text-xs"><span className="text-[#667078]">{item.label}</span><span className="font-semibold tabular-nums">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f0eee9]"><div className={`h-full rounded-full ${item.tone}`} style={{ width: item.width }} /></div></div>)}</div><div className="mt-6 border-t border-[#eeeae2] pt-4 text-xs text-[#667078]">Total outstanding <strong className="float-right text-[#0e1b2c]">₹3,53,213.20</strong></div></div>
            <div className="rounded-2xl border border-[#e0ddd5] bg-white p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-lg font-bold">Rate & stock health</h2><p className="mt-1 text-xs text-[#8b9295]">Alerts that need your attention</p></div><button className="text-xs font-semibold text-[#2b6f78]">View all <ArrowUpRight size={13} className="ml-1 inline" /></button></div><div className="grid gap-3 sm:grid-cols-3">{alerts.map((alert) => { const Icon = alert.icon; return <button key={alert.title} className="rounded-xl border border-[#eeeae2] p-4 text-left transition-shadow hover:shadow-md"><div className={`mb-4 flex size-8 items-center justify-center rounded-lg ${alert.tone === 'red' ? 'bg-[#fff0ed] text-[#b23a22]' : 'bg-[#fff5df] text-[#9a620c]'}`}><Icon size={15} /></div><div className="font-heading text-lg font-bold">{alert.value}</div><div className="mt-1 text-xs font-semibold">{alert.title}</div><div className="mt-1 text-[10px] text-[#8b9295]">{alert.detail}</div></button> })}</div><div className="mt-5 rounded-xl bg-[#f8f7f3] px-4 py-3 text-xs text-[#667078]"><PackageCheck size={15} className="mr-2 inline text-[#23714a]" />12 purchase rates expire within 30 days.</div></div>
          </section>

          <section className="mt-5 rounded-2xl border border-[#e0ddd5] bg-white p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-bold">Vendor payment gate</h2><p className="mt-1 text-xs text-[#8b9295]">Bill-to-ship-to payments waiting on client collection</p></div><button className="rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-semibold text-[#52606a]">Open register <ArrowUpRight size={13} className="ml-1 inline" /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-[#eeeae2] text-[10px] uppercase tracking-[0.12em] text-[#8b9295]"><th className="pb-3 font-semibold">Purchase order</th><th className="pb-3 font-semibold">Vendor</th><th className="pb-3 font-semibold">Linked invoice</th><th className="pb-3 font-semibold">Amount</th><th className="pb-3 font-semibold">Status</th></tr></thead><tbody><tr className="border-b border-[#f2f0eb]"><td className="py-4 font-mono font-semibold">PO-2603</td><td className="py-4">Packwell Industries</td><td className="py-4 font-mono text-[#667078]">INV-2608</td><td className="py-4 font-semibold tabular-nums">₹1,62,000</td><td className="py-4"><span className="rounded-full bg-[#fff5df] px-2.5 py-1 text-[10px] font-bold text-[#9a620c]">Client not paid</span></td></tr><tr><td className="py-4 font-mono font-semibold">PO-2604</td><td className="py-4">Medline Supplies</td><td className="py-4 font-mono text-[#667078]">INV-2610</td><td className="py-4 font-semibold tabular-nums">₹1,18,368</td><td className="py-4"><span className="rounded-full bg-[#fff0ed] px-2.5 py-1 text-[10px] font-bold text-[#b23a22]">Client part paid</span></td></tr></tbody></table></div></section>
        </main>
      </div>
      {sidebarOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-[#0e1b2c]/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <button aria-label="Open quick actions" className="fixed bottom-5 right-5 flex size-12 items-center justify-center rounded-full bg-[#f2a541] text-[#0e1b2c] shadow-lg hover:bg-[#ffc265] sm:hidden"><PanelLeft size={19} /></button>
    </div>
  )
}

