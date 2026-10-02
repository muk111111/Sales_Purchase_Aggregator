'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Boxes, CircleDollarSign, FileText, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Truck, Users, WalletCards, X, Pencil, Plus } from 'lucide-react'

type Lead = {
  id: string; customer_name: string; customer_id: string | null; owner_id: string | null; working_person_id: string | null; contact_person: string | null; phone: string | null; email: string | null; source: string; product: string; qty: number; uom: string; business_type: string; stage: string; partner_name: string | null; target_rate: number; buy_rate: number; expected_vendor: string | null; expected_close_date: string | null; next_follow_up: string | null; notes: string | null; created_at: string
}

type Employee = {
  id: string; full_name: string; email: string; role: string; is_active: boolean; created_at: string
}

type RolePermission = { role: string; module: string; can_view: boolean }
type Customer = { id: string; customer_code: string; customer_name: string; gstin: string | null; contact_person: string | null; phone: string | null; city_state: string | null; credit_days: number; status: 'Active' | 'Inactive'; created_at: string }

const stages = ['New', 'Contacted', 'Quote Sent', 'Negotiation', 'Won', 'Lost']
const navGroups = [
  { label: 'Overview', items: [{ label: 'Dashboards', icon: LayoutDashboard }] },
  { label: 'CRM', items: [{ label: 'Leads', icon: Users }] },
  { label: 'Buy', items: [{ label: 'Vendor Comparison', icon: CircleDollarSign }, { label: 'Purchases & PIs', icon: FileText }] },
  { label: 'Sell', items: [{ label: 'Sales & Invoices', icon: FileText }] },
  { label: 'Money', items: [{ label: 'Commissions & Cuts', icon: CircleDollarSign }, { label: 'Stock & Expenses', icon: WalletCards }] },
  { label: 'Master', items: [{ label: 'Vendor Master', icon: Truck }, { label: 'Customer Master', icon: Users }, { label: 'SKU Master', icon: Boxes }] },
  { label: 'Business Entity', items: [{ label: 'Companies', icon: Users }, { label: 'Employees', icon: Users }, { label: 'Role & Module Access', icon: ShieldCheck }] },
]
const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [section, setSection] = useState<'Dashboards' | 'Leads' | 'Customer Master' | 'Employees' | 'Role & Module Access'>('Dashboards')
  const [leads, setLeads] = useState<Lead[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [employeeRoles, setEmployeeRoles] = useState<string[]>([])
  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [authChecking, setAuthChecking] = useState(true)
  const [employeeName, setEmployeeName] = useState('Employee')
  const [employeeRole, setEmployeeRole] = useState<Employee['role']>('Employee')

  useEffect(() => {
    let active = true
    const checkEmployee = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }
      const { data: employee } = await supabase.from('employees').select('full_name,role,is_active').eq('id', session.user.id).maybeSingle()
      if (!employee?.is_active) { await supabase.auth.signOut(); window.location.replace('/login'); return }
      if (active) { setEmployeeName(employee.full_name); setEmployeeRole(employee.role as Employee['role']); const [{ data: roleData }, { data: permissionData }] = await Promise.all([supabase.rpc('list_employee_roles'), supabase.rpc('list_role_module_permissions')]); setEmployeeRoles((roleData ?? []).map((item: { role: string }) => item.role)); setPermissions((permissionData ?? []) as RolePermission[]); setAuthChecking(false) }
    }
    checkEmployee()
    return () => { active = false }
  }, [])

  const loadCustomers = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await createClient().from('customers').select('id,customer_code,customer_name,gstin,contact_person,phone,city_state,credit_days,status,created_at').order('customer_name')
    if (queryError) setError(`Could not load customers: ${queryError.message}`)
    else setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }
  useEffect(() => { if (section === 'Customer Master') loadCustomers() }, [section])

  const saveCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const { error: saveError } = await createClient().from('customers').insert({ customer_name: values.customer_name, gstin: values.gstin || null, contact_person: values.contact_person || null, phone: values.phone || null, city_state: values.city_state || null, credit_days: Number(values.credit_days || 0), status: values.status })
    if (saveError) { setError(`Could not save customer: ${saveError.message}`); return }
    setShowCustomerForm(false); setSaveMessage('Customer saved successfully.'); await loadCustomers()
  }

  const loadLeads = async () => {
    setLoading(true)
    const { data, error: queryError } = await createClient().from('leads').select('id,customer_name,customer_id,owner_id,working_person_id,contact_person,phone,email,source,product,qty,uom,business_type,stage,partner_name,target_rate,buy_rate,expected_vendor,expected_close_date,next_follow_up,notes,created_at').order('created_at', { ascending: false })
    if (queryError) setError(`Could not load leads: ${queryError.message}`)
    else setLeads((data ?? []) as Lead[])
    setLoading(false)
  }
  const loadActiveEmployees = async () => {
    const { data } = await createClient().rpc('list_active_employees')
    setEmployees((data ?? []) as Employee[])
  }
  useEffect(() => { if (section === 'Leads') { loadLeads(); if (!customers.length) loadCustomers(); if (!employees.length) loadActiveEmployees() } }, [section])

  const loadEmployees = async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const [{ data, error: queryError }, { data: roleData, error: roleError }] = await Promise.all([
      supabase.rpc('list_employees_for_admin'),
      supabase.rpc('list_employee_roles'),
    ])
    if (queryError) setError(`Could not load employees: ${queryError.message}`)
    else setEmployees((data ?? []) as Employee[])
    if (!roleError) setEmployeeRoles((roleData ?? []).map((item: { role: string }) => item.role))
    setLoading(false)
  }

  const createEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const session = (await createClient().auth.getSession()).data.session
    const response = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ full_name: values.full_name, email: values.email, password: values.password, role: values.role }) })
    const result = await response.json()
    if (!response.ok) { setError(result.error || 'Could not create employee.'); return }
    setShowEmployeeForm(false)
    setSaveMessage('Employee saved successfully.')
    await loadEmployees()
  }
  const loadPermissions = async () => {
    const { data } = await createClient().rpc('list_role_module_permissions')
    setPermissions((data ?? []) as RolePermission[])
  }
  const updatePermission = async (role: string, module: string, allowed: boolean) => {
    const { error: permissionError } = await createClient().rpc('set_role_module_permission', { target_role: role, target_module: module, allowed })
    if (permissionError) setError(permissionError.message)
    else { setPermissions(current => current.map(item => item.role === role && item.module === module ? { ...item, can_view: allowed } : item)); setSaveMessage(`${role} access updated for ${module}.`) }
  }
  useEffect(() => { if (section === 'Employees') loadEmployees(); if (section === 'Role & Module Access') { loadPermissions(); if (!employeeRoles.length) loadEmployees() } }, [section])

  const saveLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData.entries())
    const files = (formData.getAll('attachments') as File[]).filter(file => file.size > 0)
    const selectedCustomer = customers.find(customer => customer.id === values.customer_id)
    const session = (await createClient().auth.getSession()).data.session
    const payload = { customer_id: values.customer_id, customer_name: selectedCustomer?.customer_name || '', owner_id: editingLead?.owner_id || session?.user.id, working_person_id: values.working_person_id || null, contact_person: values.contact_person || null, phone: values.phone || null, email: values.email || null, source: values.source, product: values.product, qty: Number(values.qty || 0), uom: values.uom, business_type: values.business_type, stage: values.stage, partner_name: values.partner_name || null, target_rate: Number(values.target_rate || 0), buy_rate: Number(values.buy_rate || 0), expected_vendor: values.expected_vendor || null, next_follow_up: values.next_follow_up || null, notes: values.notes || null }
    const supabase = createClient()
    const { data: savedLead, error: saveError } = editingLead ? await supabase.from('leads').update(payload).eq('id', editingLead.id).select('id').single() : await supabase.from('leads').insert(payload).select('id').single()
    if (saveError || !savedLead) { setError(`Could not save lead: ${saveError?.message || 'Unknown error'}`); return }
    for (const file of files) { const uploadData = new FormData(); uploadData.append('file', file); uploadData.append('lead_id', savedLead.id); const response = await fetch('/api/leads/attachments', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` }, body: uploadData }); if (!response.ok) { setError('Lead saved, but one or more attachments could not be uploaded.'); break } }
    setShowForm(false); setEditingLead(null); setSaveMessage(editingLead ? 'Lead updated successfully.' : 'Lead saved successfully.'); await loadLeads()
  }

  const openEditor = (lead: Lead) => { setEditingLead(lead); setShowForm(true) }
  if (authChecking) return <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] text-sm text-[#667078]">Checking employee access…</main>

  return <div className="min-h-screen bg-[#f4f2ed] text-[#0e1b2c]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#0e1b2c] px-5 py-6 text-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2"><div><div className="font-heading text-[25px] font-bold tracking-[-0.04em]">Supply<span className="text-[#f2a541]">360</span></div><div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/45">Trading desk</div></div><button aria-label="Close navigation" className="rounded-lg p-2 text-white/50 lg:hidden" onClick={() => setSidebarOpen(false)}><X /></button></div>
      <div className="mt-8 flex-1 overflow-y-auto">{navGroups.map(group => { const visibleItems = group.items.filter(item => {
        if (employeeRole === 'Admin') return true
        if (item.label === 'Role & Module Access') return false
        return permissions.some(permission => permission.role === employeeRole && permission.module === item.label && permission.can_view)
      }); if (!visibleItems.length) return null; return <div key={group.label} className="mb-6"><div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</div><div className="flex flex-col gap-1">{visibleItems.map(item => { const Icon = item.icon; const active = item.label === section; return <button key={item.label} onClick={() => { if (['Leads', 'Dashboards', 'Customer Master', 'Employees', 'Role & Module Access'].includes(item.label)) setSection(item.label as 'Leads' | 'Dashboards' | 'Customer Master' | 'Employees' | 'Role & Module Access'); setSidebarOpen(false) }} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] ${active ? 'bg-[#f2a541] font-semibold text-[#0e1b2c]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><Icon size={16} /><span>{item.label}</span></button> })}</div></div> })}</div>
      <div className="border-t border-white/10 pt-4"><div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3"><div className="flex size-9 items-center justify-center rounded-full bg-[#f2a541] text-sm font-bold text-[#0e1b2c]">MV</div><div><div className="text-sm font-semibold">{employeeName}</div><div className="text-xs text-white/45">{employeeRole}</div></div><button aria-label="Sign out" onClick={async () => { await createClient().auth.signOut(); window.location.replace('/login') }} className="ml-auto rounded-lg p-1.5 text-[#e56b5d] hover:bg-[#b23a22]/20 hover:text-[#ff9a8d]"><LogOut size={15} /></button></div></div>
    </aside>
    <div className="lg:pl-[252px]"><header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#dedbd2] bg-[#f4f2ed]/95 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button aria-label="Open navigation" className="rounded-lg p-2 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div><h1 className="font-heading text-[25px] font-bold tracking-[-0.035em]">{section}</h1><p className="mt-1 hidden text-xs text-[#8b9295] sm:block">{section === 'Leads' ? 'Manage, filter, and update every enquiry.' : 'Trading performance at a glance.'}</p></div></div><div className="flex items-center gap-2"><div className="hidden rounded-full border border-[#b7d6c5] bg-[#eaf5ee] px-2.5 py-1.5 text-[11px] text-[#23714a] sm:block">Supabase connected</div><button aria-label="Search" className="rounded-lg border border-[#dedbd2] bg-white p-2.5"><Search size={17} /></button><button aria-label="Notifications" className="rounded-lg border border-[#dedbd2] bg-white p-2.5"><Bell size={17} /></button></div></header>
      <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 lg:px-10">{saveMessage && <div role="status" className="mb-5 flex items-center justify-between rounded-xl border border-[#b7d6c5] bg-[#eaf5ee] px-4 py-3 text-sm font-semibold text-[#23714a]"><span>{saveMessage}</span><button type="button" aria-label="Dismiss confirmation" onClick={() => setSaveMessage('')} className="ml-4 text-[#23714a]">×</button></div>}{section === 'Customer Master' ? <CustomersView customers={customers} loading={loading} error={error} onRefresh={loadCustomers} onNew={() => { setError(''); setShowCustomerForm(true) }} /> : section === 'Leads' ? <LeadsView leads={leads} loading={loading} error={error} onNew={() => { setEditingLead(null); setShowForm(true) }} onEdit={openEditor} /> : section === 'Employees' ? <EmployeesView employees={employees} loading={loading} error={error} onRefresh={loadEmployees} canCreate={employeeRole === 'Admin'} onNew={() => { setError(''); setShowEmployeeForm(true) }} /> : section === 'Role & Module Access' ? <RoleModuleAccessView roles={employeeRoles} permissions={permissions} error={error} onToggle={updatePermission} /> : <DashboardView />}</main></div>
    {sidebarOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-[#0e1b2c]/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    {showCustomerForm && <CustomerForm onClose={() => setShowCustomerForm(false)} onSubmit={saveCustomer} />}
    {showForm && <LeadForm lead={editingLead} customers={customers} employees={employees} onClose={() => { setShowForm(false); setEditingLead(null) }} onSubmit={saveLead} />}
    {showEmployeeForm && <EmployeeForm roles={employeeRoles} onClose={() => setShowEmployeeForm(false)} onSubmit={createEmployee} />}
  </div>
}

function DashboardView() { return <div className="rounded-2xl border border-[#e0ddd5] bg-white p-8"><h2 className="font-heading text-2xl font-bold">Dashboard overview</h2><p className="mt-2 text-sm text-[#667078]">Select Leads from the left navigation to manage your sales pipeline.</p></div> }
function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[#e0ddd5] bg-white p-5"><div className="text-xs text-[#667078]">{label}</div><div className="mt-3 font-heading text-2xl font-bold">{value}</div></div> }

function LeadsView({ leads, loading, error, onNew, onEdit }: { leads: Lead[]; loading: boolean; error: string; onNew: () => void; onEdit: (lead: Lead) => void }) {
  const [search, setSearch] = useState(''); const [stage, setStage] = useState('All'); const [source, setSource] = useState('All')
  const filtered = useMemo(() => leads.filter(lead => `${lead.customer_name} ${lead.product} ${lead.partner_name || ''}`.toLowerCase().includes(search.toLowerCase()) && (stage === 'All' || lead.stage === stage) && (source === 'All' || lead.source === source)), [leads, search, stage, source])
  const open = leads.filter(lead => !['Won', 'Lost'].includes(lead.stage)); const pipeline = open.reduce((sum, lead) => sum + Number(lead.qty) * Number(lead.target_rate), 0); const margin = open.reduce((sum, lead) => sum + Number(lead.qty) * (Number(lead.target_rate) - Number(lead.buy_rate)), 0)
  return <><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#667078]">Every enquiry from first call to won or lost.</p></div><button onClick={onNew} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]"><Plus size={17} /> New lead</button></div><div className="mb-6 grid gap-4 sm:grid-cols-3"><Kpi label="Open leads" value={String(open.length)} /><Kpi label="Pipeline value" value={money(pipeline)} /><Kpi label="Expected margin" value={money(margin)} /></div><div className="mb-5 rounded-2xl border border-[#e0ddd5] bg-white p-4"><div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]"><label className="relative"><span className="sr-only">Search leads</span><Search className="absolute left-3 top-3 text-[#8b9295]" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, product, owner" className="h-11 w-full rounded-lg border border-[#dedbd2] pl-10 pr-3 text-sm outline-none focus:border-[#f2a541]" /></label><select value={stage} onChange={event => setStage(event.target.value)} aria-label="Filter by stage" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option>{stages.map(item => <option key={item}>{item}</option>)}</select><select value={source} onChange={event => setSource(event.target.value)} aria-label="Filter by source" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option>{['Referral', 'Partner network', 'Website', 'Cold call', 'Existing customer', 'Other'].map(item => <option key={item}>{item}</option>)}</select><button onClick={() => { setSearch(''); setStage('All'); setSource('All') }} className="h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold hover:bg-[#f4f2ed]">Clear</button></div></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}{loading ? <div className="rounded-2xl bg-white p-8 text-sm text-[#667078]">Loading leads...</div> : <div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.08em] text-[#667078]"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Product</th><th className="px-5 py-4">Owner</th><th className="px-5 py-4">Stage</th><th className="px-5 py-4">Source</th><th className="px-5 py-4">Value</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#eeeae2]">{filtered.map(lead => <tr key={lead.id} className="hover:bg-[#fffdf8]"><td className="px-5 py-4"><div className="font-semibold">{lead.customer_name}</div><div className="mt-1 text-xs text-[#8b9295]">{lead.contact_person || lead.email || 'No contact details'}</div></td><td className="px-5 py-4">{lead.product}<div className="mt-1 text-xs text-[#8b9295]">{lead.qty} {lead.uom}</div></td><td className="px-5 py-4">{lead.partner_name || '—'}</td><td className="px-5 py-4"><span className="rounded-full bg-[#f4f2ed] px-2.5 py-1 text-xs font-semibold">{lead.stage}</span></td><td className="px-5 py-4 text-[#667078]">{lead.source}</td><td className="px-5 py-4 font-semibold">{money(Number(lead.qty) * Number(lead.target_rate))}</td><td className="px-5 py-4 text-right"><button onClick={() => onEdit(lead)} aria-label={`Edit ${lead.customer_name}`} className="inline-flex items-center gap-2 rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-bold hover:border-[#f2a541] hover:bg-[#fff8eb]"><Pencil size={14} /> Edit</button></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="p-10 text-center text-sm text-[#667078]">No leads match these filters.</div>}</div>}</>
}

function CustomersView({ customers, loading, error, onRefresh, onNew }: { customers: Customer[]; loading: boolean; error: string; onRefresh: () => void; onNew: () => void }) {
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><p className="text-sm text-[#667078]">Manage customer contacts, tax details, and payment terms.</p><div className="flex gap-2"><button onClick={onRefresh} className="min-h-11 rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Refresh list</button><button onClick={onNew} className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">Create customer</button></div></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}<div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="flex items-center justify-between border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">Customer Master</h2><span className="text-xs text-[#667078]">{customers.length} total</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr>{['Code','Customer name','GSTIN','Contact person','Phone','City / state','Credit days','Status'].map(label => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#eeeae2]">{loading ? <tr><td colSpan={8} className="px-5 py-10 text-center text-[#667078]">Loading customers…</td></tr> : customers.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-[#667078]">No customers found.</td></tr> : customers.map(customer => <tr key={customer.id} className="hover:bg-[#fcfbf8]"><td className="px-5 py-4 font-semibold">{customer.customer_code}</td><td className="px-5 py-4 font-semibold">{customer.customer_name}</td><td className="px-5 py-4 text-[#667078]">{customer.gstin || '—'}</td><td className="px-5 py-4 text-[#667078]">{customer.contact_person || '—'}</td><td className="px-5 py-4 text-[#667078]">{customer.phone || '—'}</td><td className="px-5 py-4 text-[#667078]">{customer.city_state || '—'}</td><td className="px-5 py-4">{customer.credit_days}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${customer.status === 'Active' ? 'bg-[#eaf5ee] text-[#23714a]' : 'bg-[#f1f0ed] text-[#8b9295]'}`}>{customer.status}</span></td></tr>)}</tbody></table></div></div></div>
}

function CustomerForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">Create customer</h2><p className="mt-1 text-xs text-[#667078]">Customer code is generated automatically.</p></div><button type="button" aria-label="Close customer form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Customer name" name="customer_name" required /></div><Field label="GSTIN" name="gstin" /><Field label="Contact person" name="contact_person" /><Field label="Phone" name="phone" /><Field label="City / state" name="city_state" /><Field label="Credit days" name="credit_days" type="number" defaultValue="0" required /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Status<select name="status" defaultValue="Active" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Active</option><option>Inactive</option></select></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[#f2a541] px-4 py-2.5 text-sm font-bold text-[#0e1b2c]">Create customer</button></div></form></div>
}

function RoleModuleAccessView({ roles, permissions, error, onToggle }: { roles: string[]; permissions: RolePermission[]; error: string; onToggle: (role: string, module: string, allowed: boolean) => void }) {
  const modules = navGroups.flatMap(group => group.items.map(item => ({ group: group.label, module: item.label }))).filter(item => item.module !== 'Role & Module Access')
  const allowed = (role: string, module: string) => permissions.find(item => item.role === role && item.module === module)?.can_view ?? false
  return <div><div className="mb-7"><p className="text-sm text-[#667078]">Admin controls which roles can access each Supply360 module.</p></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}<div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">Roles &amp; responsibilities</h2><p className="mt-1 text-xs text-[#667078]">Toggle access by role. Ops Lead remains hidden until Admin grants a module.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr><th className="px-5 py-3 font-semibold">Module</th>{roles.map(role => <th key={role} className="px-5 py-3 text-center font-semibold">{role}</th>)}</tr></thead><tbody className="divide-y divide-[#eeeae2]">{modules.map(item => <tr key={item.module} className="hover:bg-[#fcfbf8]"><td className="px-5 py-4"><div className="font-semibold">{item.module}</div><div className="mt-0.5 text-xs text-[#8b9295]">{item.group}</div></td>{roles.map(role => { const isAllowed = allowed(role, item.module); return <td key={`${item.module}-${role}`} className="px-5 py-4 text-center"><button type="button" onClick={() => onToggle(role, item.module, !isAllowed)} className={`inline-flex min-w-[82px] justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${isAllowed ? 'bg-[#eaf5ee] text-[#23714a]' : 'bg-[#f1f0ed] text-[#8b9295]'}`}>{isAllowed ? 'Allowed' : 'No access'}</button></td> })}</tr>)}</tbody></table></div></div></div>
}

function EmployeesView({ employees, loading, error, onRefresh, canCreate, onNew }: { employees: Employee[]; loading: boolean; error: string; onRefresh: () => void; canCreate: boolean; onNew: () => void }) {
  return <div>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-[#667078]">Manage the employees who can access Supply360.</p></div>
      <div className="flex gap-2"><button onClick={onRefresh} className="min-h-11 rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold hover:bg-[#f4f2ed]">Refresh list</button>{canCreate && <button onClick={onNew} className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">Create employee</button>}</div>
    </div>
    {error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}
    <div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white">
      <div className="flex items-center justify-between border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">Employees</h2><span className="text-xs text-[#667078]">{employees.length} total</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr><th className="px-5 py-3 font-semibold">Name</th><th className="px-5 py-3 font-semibold">Email</th><th className="px-5 py-3 font-semibold">Role</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Created</th></tr></thead><tbody className="divide-y divide-[#eeeae2]">{loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[#667078]">Loading employees…</td></tr> : employees.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[#667078]">No employees found.</td></tr> : employees.map(employee => <tr key={employee.id} className="hover:bg-[#fcfbf8]"><td className="px-5 py-4 font-semibold">{employee.full_name}</td><td className="px-5 py-4 text-[#667078]">{employee.email}</td><td className="px-5 py-4"><span className="rounded-full bg-[#eef1f5] px-2.5 py-1 text-xs font-semibold">{employee.role}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${employee.is_active ? 'bg-[#eaf5ee] text-[#23714a]' : 'bg-[#fff1ed] text-[#b23a22]'}`}>{employee.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4 text-[#667078]">{new Date(employee.created_at).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table></div>
    </div>
  </div>
}

function EmployeeForm({ roles, onClose, onSubmit }: { roles: string[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">Create employee</h2><p className="mt-1 text-xs text-[#667078]">Create the login first, then add the employee profile.</p></div><button type="button" aria-label="Close employee form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div><div className="grid gap-4"><Field label="Full name" name="full_name" required /><Field label="Email" name="email" type="email" required /><Field label="Temporary password" name="password" type="password" required /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Role<select name="role" required defaultValue="Employee" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal outline-none focus:border-[#f2a541]">{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[#f2a541] px-4 py-2.5 text-sm font-bold text-[#0e1b2c]">Create employee</button></div></form></div>
}

function LeadForm({ lead, customers, employees, onClose, onSubmit }: { lead: Lead | null; customers: Customer[]; employees: Employee[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">{lead ? 'Edit lead' : 'New lead'}</h2><p className="mt-1 text-xs text-[#667078]">{lead ? 'Update the current lead details.' : 'Capture an enquiry and add it to the pipeline.'}</p></div><button type="button" aria-label="Close form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a] sm:col-span-2">Customer *<select name="customer_id" required defaultValue={lead?.customer_id || ''} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option value="">Select customer</option>{customers.filter(customer => customer.status === 'Active').map(customer => <option key={customer.id} value={customer.id}>{customer.customer_code} — {customer.customer_name}</option>)}</select><span className="text-[11px] font-normal text-[#8b9295]">Can&apos;t find a customer? Create one in Customer Master first.</span></label><Field label="Contact person" name="contact_person" defaultValue={lead?.contact_person || ''} /><Field label="Phone" name="phone" type="tel" defaultValue={lead?.phone || ''} /><Field label="Email" name="email" type="email" defaultValue={lead?.email || ''} /><Field label="Product or service" name="product" defaultValue={lead?.product} required /><Field label="Quantity" name="qty" type="number" defaultValue={String(lead?.qty ?? 1)} /><Field label="Unit" name="uom" defaultValue={lead?.uom || 'Units'} /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Owner<span className="flex h-11 items-center rounded-lg border border-[#dedbd2] bg-[#f7f6f2] px-3 text-sm font-normal">{lead?.owner_id ? employees.find(employee => employee.id === lead.owner_id)?.full_name || 'Current owner' : 'You (creator)'}</span></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Working person<select name="working_person_id" defaultValue={lead?.working_person_id || ''} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option value="">Select employee</option>{employees.filter(employee => employee.is_active).map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><Field label="Partner name" name="partner_name" defaultValue={lead?.partner_name || ''} /><Field label="Target selling rate" name="target_rate" type="number" defaultValue={String(lead?.target_rate ?? 0)} /><Field label="Expected buy rate" name="buy_rate" type="number" defaultValue={String(lead?.buy_rate ?? 0)} /><Field label="Expected vendor" name="expected_vendor" defaultValue={lead?.expected_vendor || ''} /><Field label="Next follow-up" name="next_follow_up" type="date" defaultValue={lead?.next_follow_up || ''} /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Source<select name="source" defaultValue={lead?.source || 'Other'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Referral</option><option>Partner network</option><option>Website</option><option>Cold call</option><option>Existing customer</option><option>Other</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Business type<select name="business_type" defaultValue={lead?.business_type || 'Direct Sale'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Direct Sale</option><option>Bill-to-Ship-to</option><option>Commission</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Stage<select name="stage" defaultValue={lead?.stage || 'New'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal">{stages.map(item => <option key={item}>{item}</option>)}</select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a] sm:col-span-2">Notes<label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Attachments<input name="attachments" type="file" multiple className="rounded-lg border border-[#dedbd2] bg-white p-2 text-sm font-normal" /><span className="text-[11px] font-normal text-[#8b9295]">Private files, up to 10 MB each.</span></label><textarea name="notes" defaultValue={lead?.notes || ''} className="min-h-24 rounded-lg border border-[#dedbd2] p-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[#0e1b2c] px-4 py-2.5 text-sm font-bold text-white">{lead ? 'Save changes' : 'Create lead'}</button></div></form></div> }
function Field({ label, name, type = 'text', defaultValue, required }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">{label}{required && ' *'}<input required={required} name={name} type={type} defaultValue={defaultValue} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label> }
