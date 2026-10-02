'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Boxes, ChevronDown, CircleDollarSign, FileText, LayoutDashboard, Menu, Plus, Search, Settings2, Truck, Users, WalletCards, X } from 'lucide-react'

type Lead = {
  id: string
  customer_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  source: string
  product: string
  qty: number
  uom: string
  business_type: string
  stage: string
  partner_name: string | null
  target_rate: number
  buy_rate: number
  expected_vendor: string | null
  expected_close_date: string | null
  next_follow_up: string | null
  notes: string | null
  created_at: string
}

const stages = ['New', 'Contacted', 'Quote Sent', 'Negotiation', 'Won', 'Lost']
const navGroups = [
  { label: 'Overview', items: [{ label: 'Dashboards', icon: LayoutDashboard }] },
  { label: 'CRM', items: [{ label: 'Leads', icon: Users }] },
  { label: 'Buy', items: [{ label: 'Vendor Comparison', icon: CircleDollarSign }, { label: 'Purchases & PIs', icon: FileText }] },
  { label: 'Sell', items: [{ label: 'Sales & Invoices', icon: FileText }] },
  { label: 'Money', items: [{ label: 'Commissions & Cuts', icon: CircleDollarSign }, { label: 'Stock & Expenses', icon: WalletCards }] },
  { label: 'Master', items: [{ label: 'Vendor Master', icon: Truck }, { label: 'Customer Master', icon: Users }, { label: 'SKU Master', icon: Boxes }] },
  { label: 'Business Entity', items: [{ label: 'Companies', icon: Users }, { label: 'Employees', icon: Users }] },
]

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [section, setSection] = useState<'Dashboards' | 'Leads'>('Dashboards')
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const loadLeads = async () => {
    setLoading(true)
    const { data, error: queryError } = await createClient().from('leads').select('id,customer_name,contact_person,phone,email,source,product,qty,uom,business_type,stage,partner_name,target_rate,buy_rate,expected_vendor,expected_close_date,next_follow_up,notes,created_at').order('created_at', { ascending: false })
    if (queryError) setError(`Could not load leads: ${queryError.message}`)
    else setLeads((data ?? []) as Lead[])
    setLoading(false)
  }

  useEffect(() => { if (section === 'Leads') loadLeads() }, [section])

  const createLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const { error: insertError } = await createClient().from('leads').insert({
      customer_name: values.customer_name,
      contact_person: values.contact_person || null,
      phone: values.phone || null,
      email: values.email || null,
      source: values.source,
      product: values.product,
      qty: Number(values.qty || 0),
      uom: values.uom,
      business_type: values.business_type,
      stage: values.stage,
      partner_name: values.partner_name || null,
      target_rate: Number(values.target_rate || 0),
      buy_rate: Number(values.buy_rate || 0),
      expected_vendor: values.expected_vendor || null,
      next_follow_up: values.next_follow_up || null,
      notes: values.notes || null,
    })
    if (insertError) { setError(`Could not save lead: ${insertError.message}`); return }
    setShowForm(false)
    await loadLeads()
  }

  return <div className="min-h-screen bg-[#f4f2ed] text-[#0e1b2c]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#0e1b2c] px-5 py-6 text-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2"><div><div className="font-heading text-[25px] font-bold tracking-[-0.04em]">Supply<span className="text-[#f2a541]">360</span></div><div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/45">Trading desk</div></div><button aria-label="Close navigation" className="rounded-lg p-2 text-white/50 lg:hidden" onClick={() => setSidebarOpen(false)}><X /></button></div>
      <div className="mt-8 flex-1 overflow-y-auto">{navGroups.map(group => <div key={group.label} className="mb-6"><div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</div><div className="flex flex-col gap-1">{group.items.map(item => { const Icon = item.icon; const active = item.label === section; return <button key={item.label} onClick={() => { if (item.label === 'Leads' || item.label === 'Dashboards') setSection(item.label as 'Leads' | 'Dashboards'); setSidebarOpen(false) }} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] ${active ? 'bg-[#f2a541] font-semibold text-[#0e1b2c]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><Icon size={16} /><span>{item.label}</span></button> })}</div></div>)}</div>
      <div className="border-t border-white/10 pt-4"><div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3"><div className="flex size-9 items-center justify-center rounded-full bg-[#f2a541] text-sm font-bold text-[#0e1b2c]">MV</div><div><div className="text-sm font-semibold">Mukul Verma</div><div className="text-xs text-white/45">Owner</div></div><Settings2 size={15} className="ml-auto text-white/40" /></div></div>
    </aside>
    <div className="lg:pl-[252px]"><header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#dedbd2] bg-[#f4f2ed]/95 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button aria-label="Open navigation" className="rounded-lg p-2 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div><h1 className="font-heading text-[25px] font-bold tracking-[-0.035em]">{section}</h1><p className="mt-1 hidden text-xs text-[#8b9295] sm:block">{section === 'Leads' ? 'Every enquiry from first call to won or lost.' : 'Trading performance at a glance.'}</p></div></div><div className="flex items-center gap-2"><div className="hidden rounded-full border border-[#b7d6c5] bg-[#eaf5ee] px-2.5 py-1.5 text-[11px] text-[#23714a] sm:block">Supabase connected</div><button aria-label="Search" className="rounded-lg border border-[#dedbd2] bg-white p-2.5"><Search size={17} /></button><button aria-label="Notifications" className="rounded-lg border border-[#dedbd2] bg-white p-2.5"><Bell size={17} /></button></div></header>
      <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 lg:px-10">{section === 'Leads' ? <LeadsView leads={leads} loading={loading} error={error} onNew={() => setShowForm(true)} /> : <DashboardView />}</main></div>
    {sidebarOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-[#0e1b2c]/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    {showForm && <LeadForm onClose={() => setShowForm(false)} onSubmit={createLead} />}
  </div>
}

function DashboardView() { return <div className="rounded-2xl border border-[#e0ddd5] bg-white p-8"><h2 className="font-heading text-2xl font-bold">Dashboard overview</h2><p className="mt-2 text-sm text-[#667078]">Select Leads from the left navigation to manage your sales pipeline.</p></div> }

function LeadsView({ leads, loading, error, onNew }: { leads: Lead[]; loading: boolean; error: string; onNew: () => void }) {
  const open = leads.filter(lead => !['Won', 'Lost'].includes(lead.stage))
  const pipeline = open.reduce((sum, lead) => sum + Number(lead.qty) * Number(lead.target_rate), 0)
  const margin = open.reduce((sum, lead) => sum + Number(lead.qty) * (Number(lead.target_rate) - Number(lead.buy_rate)), 0)
  return <><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#667078]">Every enquiry from first call to won or lost.</p></div><button onClick={onNew} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]"><Plus size={17} /> New lead</button></div><div className="mb-6 grid gap-4 sm:grid-cols-3"><Kpi label="Open leads" value={String(open.length)} /><Kpi label="Pipeline value" value={money(pipeline)} /><Kpi label="Expected margin" value={money(margin)} /></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}{loading ? <div className="rounded-2xl bg-white p-8 text-sm text-[#667078]">Loading leads...</div> : leads.length === 0 ? <div className="rounded-2xl border border-dashed border-[#cfcac0] bg-white p-12 text-center"><Users className="mx-auto text-[#8b9295]" /><h2 className="mt-4 font-heading text-xl font-bold">No leads yet</h2><p className="mt-2 text-sm text-[#667078]">Add the first enquiry and assign it to a partner.</p><button onClick={onNew} className="mt-5 rounded-lg bg-[#0e1b2c] px-4 py-3 text-sm font-semibold text-white">New lead</button></div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{stages.map(stage => <div key={stage} className="min-h-[220px] rounded-2xl border border-[#e0ddd5] bg-[#faf9f6] p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-heading font-bold">{stage}</h2><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">{leads.filter(lead => lead.stage === stage).length}</span></div><div className="space-y-3">{leads.filter(lead => lead.stage === stage).map(lead => <div key={lead.id} className="rounded-xl border border-[#e0ddd5] bg-white p-4 shadow-sm"><div className="flex justify-between gap-2"><div className="font-semibold">{lead.customer_name}</div><span className="text-xs text-[#667078]">{lead.partner_name || 'Unassigned'}</span></div><div className="mt-2 text-sm text-[#667078]">{lead.product} · {lead.qty} {lead.uom}</div><div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-[#e7f1f2] px-2.5 py-1 text-[10px] font-bold text-[#2b6f78]">{lead.business_type}</span><span className="text-xs font-semibold text-[#23714a]">Margin {money(Number(lead.qty) * (Number(lead.target_rate) - Number(lead.buy_rate)))}</span></div></div>)}</div></div>)}</div>}</>
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[#e0ddd5] bg-white p-5"><div className="text-xs text-[#667078]">{label}</div><div className="mt-3 font-heading text-2xl font-bold">{value}</div></div> }

function LeadForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">New lead</h2><p className="mt-1 text-xs text-[#667078]">Capture an enquiry and add it to the pipeline.</p></div><button type="button" aria-label="Close form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Customer" name="customer_name" required /><Field label="Contact person" name="contact_person" /><Field label="Phone" name="phone" type="tel" /><Field label="Email" name="email" type="email" /><Field label="Product or service" name="product" required /><Field label="Quantity" name="qty" type="number" defaultValue="1" /><Field label="Unit" name="uom" defaultValue="Units" /><Field label="Owner" name="partner_name" defaultValue="Sunil" /><Field label="Target selling rate" name="target_rate" type="number" defaultValue="0" /><Field label="Expected buy rate" name="buy_rate" type="number" defaultValue="0" /><Field label="Expected vendor" name="expected_vendor" /><Field label="Next follow-up" name="next_follow_up" type="date" /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Source<select name="source" defaultValue="Other" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Referral</option><option>Partner network</option><option>Website</option><option>Cold call</option><option>Existing customer</option><option>Other</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Business type<select name="business_type" defaultValue="Direct Sale" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Direct Sale</option><option>Bill-to-Ship-to</option><option>Commission</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Stage<select name="stage" defaultValue="New" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal">{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label><label className="sm:col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Notes<textarea name="notes" rows={3} className="rounded-lg border border-[#dedbd2] p-3 text-sm font-normal" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-3 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[#f2a541] px-5 py-3 text-sm font-bold text-[#0e1b2c]">Save lead</button></div></form></div> }

function Field({ label, name, type = 'text', defaultValue, required }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">{label}{required && ' *'}<input required={required} name={name} type={type} defaultValue={defaultValue} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label> }
