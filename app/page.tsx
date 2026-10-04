'use client'

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Boxes, CircleDollarSign, Download, FileText, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Truck, Users, WalletCards, X, Pencil, Plus } from 'lucide-react'

type Lead = {
  id: string; customer_name: string; customer_id: string | null; owner_id: string | null; working_person_id: string | null; contact_person: string | null; phone: string | null; email: string | null; source: string; product: string; qty: number; uom: string; business_type: string; stage: string; partner_name: string | null; target_rate: number; buy_rate: number; expected_vendor: string | null; expected_close_date: string | null; next_follow_up: string | null; notes: string | null; created_at: string
}

type Employee = {
  id: string; full_name: string; email: string; role: string; is_active: boolean; created_at: string
}

type RolePermission = { role: string; module: string; can_view: boolean }
type Customer = { id: string; customer_code: string; customer_name: string; gstin: string | null; contact_person: string | null; phone: string | null; city_state: string | null; credit_days: number; status: 'Active' | 'Inactive'; created_at: string }
type Vendor = { id: string; vendor_code: string; vendor_name: string; display_name: string | null; business_line: string; vendor_type: string; gstin: string | null; contact_person: string; phone: string; city_state: string; credit_days: number; payment_terms: string | null; billing_emails: string[]; status: 'Active' | 'On hold' | 'Blacklisted' | 'Inactive'; notes: string | null }
type SKU = { id: string; code: string; name: string; category: string; sub_category: string | null; business_line: string; brand: string | null; model: string | null; status: 'Active' | 'Discontinued'; spec: string | null; size: string | null; gsm: string | null; colour: string | null; weight_kg: number | null; barcode: string | null; uom: string; pack_qty: number; hsn: string; gst_pct: number; cess_pct: number; std_purchase_rate: number | null; std_selling_rate: number | null; min_margin_pct: number; mrp: number | null; opening_qty: number; opening_rate: number; opening_date: string | null; reorder_level: number | null; reorder_qty: number | null; location: string | null; notes: string | null }
type SkuMasterType = 'Category' | 'Business line' | 'Sub-category' | 'Brand' | 'Model' | 'Specification' | 'Colour' | 'GSM'
type SkuMasterValue = { id: string; master_type: SkuMasterType; value: string; is_active: boolean }
const LEGACY_PO_NOTE = 'Payment Terms: Payment will be done 45 days from the date of delivery.'
const DEFAULT_PO_TERMS = '1. Vendor will supply above quantity as agreed at total cost mentioned on Purchase Order (inclusive of all taxes).\n2. Delivery Period: Within Five (05) days from the date of this PO, at the Ship to (delivery location) address mentioned above.\n3. Payment Terms: Payment will be done 45 days from the date of delivery.'
const poTerms = (notes: string | null | undefined) => {
  const text = (notes || '').trim()
  if (!text || text === LEGACY_PO_NOTE) return DEFAULT_PO_TERMS
  if (text.includes('1. Vendor will supply')) return text
  const extra = text.replace(LEGACY_PO_NOTE, '').trim()
  return extra ? `${DEFAULT_PO_TERMS}\n${extra}` : DEFAULT_PO_TERMS
}
type Company = { id: string; code: string; legal_name: string; trade_name: string | null; entity_type: string; logo_url: string | null; gstin: string | null; pan: string | null; state_name: string | null; state_code: string | null; reg_address: string | null; city: string | null; pin: string | null; phone: string | null; email: string | null; fy: string; status: 'Active' | 'Inactive'; sells: boolean; buys: boolean; is_default: boolean }
  type PurchaseDoc = { id: string; number: string | null; po_number: string | null; pi_number: string | null; status: string; doc_date: string; po_date: string | null; pi_date: string | null; expected_date: string | null; vendor_id: string | null; company_id: string; purchase_type: string; vendor_invoice_no: string | null; vendor_invoice_date: string | null; ship_to: Record<string, string> | null; payment_basis: string; payment_days: number; delivery_days: number; charges_amount: number; charges_gst_pct: number; annexure_enabled: boolean; notes: string | null; cancel_reason: string | null; created_at: string }
  type PurchaseLine = { id?: string; sku_id: string | null; product_name?: string; product_code?: string; hsn?: string; description: string; qty: number; unit?: string; unit_price: number; discount_pct?: number; tax_pct: number; taxable?: number; gst_amount?: number; line_total?: number }
type Section = 'Dashboards' | 'Leads' | 'Vendor Comparison' | 'Purchase Orders' | 'Purchase Invoices' | 'Sales & Invoices' | 'Commissions & Cuts' | 'Stock & Expenses' | 'Vendor Master' | 'Customer Master' | 'SKU Master' | 'SKU Configuration' | 'Companies' | 'Employees' | 'Role & Module Access'
type UploadStatus = { fileName: string; progress: number; state: 'uploading' | 'complete' | 'error'; error?: string }

const stages = ['New', 'Contacted', 'Quote Sent', 'Negotiation', 'Won', 'Lost']
const navGroups = [
  { label: 'Overview', items: [{ label: 'Dashboards', icon: LayoutDashboard }] },
  { label: 'CRM', items: [{ label: 'Leads', icon: Users }] },
  { label: 'Buy', items: [{ label: 'Vendor Comparison', icon: CircleDollarSign }, { label: 'Purchase Orders', icon: FileText }, { label: 'Purchase Invoices', icon: FileText }] },
  { label: 'Sell', items: [{ label: 'Sales & Invoices', icon: FileText }] },
  { label: 'Money', items: [{ label: 'Commissions & Cuts', icon: CircleDollarSign }, { label: 'Stock & Expenses', icon: WalletCards }] },
  { label: 'Master', items: [{ label: 'Vendor Master', icon: Truck }, { label: 'Customer Master', icon: Users }, { label: 'SKU Master', icon: Boxes }, { label: 'SKU Configuration', icon: Boxes }] },
  { label: 'Business Entity', items: [{ label: 'Companies', icon: Users }, { label: 'Employees', icon: Users }, { label: 'Role & Module Access', icon: ShieldCheck }] },
]
const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [section, setSection] = useState<Section>('Dashboards')
  const [leads, setLeads] = useState<Lead[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [purchaseDocs, setPurchaseDocs] = useState<PurchaseDoc[]>([])
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [editingPurchaseDoc, setEditingPurchaseDoc] = useState<PurchaseDoc | null>(null)
  const [editingPurchaseLines, setEditingPurchaseLines] = useState<PurchaseLine[]>([])
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [skus, setSkus] = useState<SKU[]>([])
  const [showSkuForm, setShowSkuForm] = useState(false)
  const [editingSku, setEditingSku] = useState<SKU | null>(null)
  const [skuMasterValues, setSkuMasterValues] = useState<SkuMasterValue[]>([])
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
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([])
  const canEditSkuMasters = employeeRole === 'Admin' || employeeRole === 'Director'

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

  const loadSkus = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await createClient().from('skus').select('*').order('name')
    if (queryError) setError(`Could not load SKUs: ${queryError.message}`)
    else setSkus((data ?? []) as SKU[])
    setLoading(false)
  }
  const loadSkuMasters = async () => {
    const { data, error: queryError } = await createClient().from('sku_master_values').select('id,master_type,value,is_active').eq('is_active', true).neq('master_type', 'Packaging Material').order('value')
    if (queryError) setError(`Could not load SKU masters: ${queryError.message}`); else setSkuMasterValues((data ?? []) as SkuMasterValue[])
  }
  useEffect(() => { if (section === 'SKU Master' || section === 'SKU Configuration') { loadSkus(); loadSkuMasters() } }, [section])
  const saveSkuMaster = async (master_type: SkuMasterType, value: string) => {
    const { data: sessionData } = await createClient().auth.getSession()
    const { error: saveError } = await createClient().from('sku_master_values').insert({ master_type, value: value.trim(), created_by: sessionData.session?.user.id })
    if (saveError) { setError(`Could not save ${master_type}: ${saveError.message}`); throw new Error(saveError.message) }
  setSaveMessage(`${master_type} saved successfully.`); await loadSkuMasters()
  }
  const editSkuMaster = async (id: string, value: string) => {
    const nextValue = window.prompt('Update master value', value)?.trim()
    if (!nextValue || nextValue === value) return
    const { error: updateError } = await createClient().from('sku_master_values').update({ value: nextValue, updated_at: new Date().toISOString() }).eq('id', id)
    if (updateError) setError(`Could not update master: ${updateError.message}`); else { setSaveMessage('SKU master updated successfully.'); await loadSkuMasters() }
  }

  const openSkuEdit = async (sku: SKU) => {
    setError(''); setSaveMessage('')
    const { data, error: fetchError } = await createClient().from('skus').select('*').eq('id', sku.id).maybeSingle()
    if (fetchError || !data) { setError(`Could not load SKU ${sku.code}: ${fetchError?.message ?? 'record not found'}`); return }
    setEditingSku(data as SKU); setShowSkuForm(true)
  }

  const saveSku = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const { data: sessionData } = await createClient().auth.getSession()
    const numeric = (key: string) => values[key] === '' || values[key] === undefined ? null : Number(values[key])
    const hsn = String(values.hsn ?? '').trim()
    if (!/^\d{4,8}$/.test(hsn)) { setError('HSN must contain only 4 to 8 digits.'); return }
    const payload = { code: values.code, name: values.name, category: values.category, sub_category: values.sub_category || null, business_line: values.business_line, brand: values.brand || null, model: values.model || null, status: values.status, spec: values.spec || null, size: values.size || null, gsm: values.gsm || null, colour: values.colour || null, weight_kg: numeric('weight_kg'), barcode: values.barcode || null, uom: values.uom, pack_qty: Number(values.pack_qty || 1), hsn, gst_pct: Number(values.gst_pct), cess_pct: Number(values.cess_pct || 0), std_purchase_rate: numeric('std_purchase_rate'), std_selling_rate: numeric('std_selling_rate'), min_margin_pct: Number(values.min_margin_pct || 8), mrp: numeric('mrp'), opening_qty: Number(values.opening_qty || 0), opening_rate: Number(values.opening_rate || 0), opening_date: values.opening_date || null, reorder_level: numeric('reorder_level'), reorder_qty: numeric('reorder_qty'), location: values.location || null, notes: values.notes || null, created_by: sessionData.session?.user.id, updated_by: sessionData.session?.user.id }
    const supabase = createClient()
    if (editingSku) {
      const { created_by: _createdBy, ...updatePayload } = payload
      const { data: updated, error: updateError } = await supabase.from('skus').update({ ...updatePayload, updated_at: new Date().toISOString() }).eq('id', editingSku.id).select('id')
      if (updateError) { setError(`Could not update SKU: ${updateError.message}`); return }
      if (!updated?.length) { setError('SKU was not updated. You may not have permission to edit this SKU.'); return }
    } else {
      const { error: insertError } = await supabase.from('skus').insert(payload)
      if (insertError) { setError(`Could not save SKU: ${insertError.message}`); return }
    }
    setShowSkuForm(false); setEditingSku(null); setSaveMessage(editingSku ? 'SKU updated successfully.' : 'SKU saved successfully.'); await loadSkus()
  }

  const loadCustomers = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await createClient().from('customers').select('id,customer_code,customer_name,gstin,contact_person,phone,city_state,credit_days,status,created_at').order('customer_name')
    if (queryError) setError(`Could not load customers: ${queryError.message}`)
    else setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }
  useEffect(() => { if (section === 'Customer Master') loadCustomers() }, [section])
  const loadCompanies = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await createClient().from('companies').select('id,code,legal_name,trade_name,entity_type,logo_url,gstin,pan,state_name,state_code,reg_address,city,pin,phone,email,fy,status,sells,buys,is_default').order('legal_name')
    if (queryError) setError(`Could not load companies: ${queryError.message}`); else setCompanies((data ?? []) as Company[])
    setLoading(false)
  }
  useEffect(() => { if (section === 'Companies') window.location.assign('/companies') }, [section])
  useEffect(() => { if (section === 'Purchase Orders' || section === 'Purchase Invoices') window.location.assign('/purchases/po') }, [section])
  const loadPurchaseDocs = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await createClient().from('purchase_docs').select('id,number,po_number,pi_number,status,doc_date,po_date,pi_date,expected_date,vendor_id,company_id,purchase_type,vendor_invoice_no,vendor_invoice_date,ship_to,payment_basis,payment_days,delivery_days,charges_amount,charges_gst_pct,annexure_enabled,notes,cancel_reason,created_at').order('created_at', { ascending: false })
    if (queryError) setError(`Could not load purchase documents: ${queryError.message}`); else setPurchaseDocs((data ?? []) as PurchaseDoc[])
    setLoading(false)
  }
  const downloadPurchasePdf = async (doc: PurchaseDoc) => {
  setError('')
  const popup = window.open('', '_blank')
  if (!popup) { setError('Your browser blocked the PO PDF window. Please allow pop-ups for this site, then click PDF again.'); return }
  popup.opener = null
  const supabase = createClient()
    const [{ data: lineData, error: lineError }] = await Promise.all([
      supabase.from('purchase_doc_lines').select('sku_id,product_name,product_code,hsn,description,qty,unit,unit_price,discount_pct,tax_pct,taxable,gst_amount,line_total').eq('purchase_doc_id', doc.id).order('id'),
    ])
    if (lineError) { setError(`Could not prepare PO PDF: ${lineError.message}`); return }
    const company = companies.find(item => item.id === doc.company_id)
    const vendor = vendors.find(item => item.id === doc.vendor_id)
    const lines = (lineData ?? []) as PurchaseLine[]
    const esc = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
    const address = (value: string | null | undefined) => esc(value || '—')
    const rows = lines.map((line, index) => { const sku = skus.find(item => item.id === line.sku_id); return `<tr><td>${index + 1}</td><td>${esc(line.product_code || sku?.code)}</td><td><strong>${esc(line.product_name || sku?.name || line.description)}</strong><br><span>${esc(line.description)}</span></td><td>${esc(line.hsn || sku?.hsn)}</td><td>${esc(line.qty)} ${esc(line.unit)}</td><td>${money(Number(line.unit_price || 0))}</td><td>${money(Number(line.taxable || 0))}</td><td>${esc(line.tax_pct)}%</td><td>${money(Number(line.gst_amount || 0))}</td><td>${money(Number(line.line_total || 0))}</td></tr>` }).join('')
    popup.document.write(`<!doctype html><html><head><title>${esc(doc.po_number || doc.number || 'Purchase Order')}</title><style>body{font:12px Arial,sans-serif;color:#142033;margin:36px}header{display:flex;justify-content:space-between;border-bottom:3px solid #142033;padding-bottom:18px}img{max-height:64px;max-width:180px;object-fit:contain}.muted{color:#667078}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}.box{border:1px solid #d9dde2;border-radius:8px;padding:14px}.box h3{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#667078;margin:0 0 8px}table{border-collapse:collapse;width:100%;margin-top:22px}th{background:#142033;color:#fff;text-align:left;font-size:10px;text-transform:uppercase}th,td{border:1px solid #d9dde2;padding:8px;vertical-align:top}td:nth-child(1),td:nth-child(2),td:nth-child(4),td:nth-child(5),td:nth-child(6),td:nth-child(7),td:nth-child(8),td:nth-child(9),td:nth-child(10){white-space:nowrap}footer.company{margin-top:28px;border-top:2px solid #142033;padding-top:10px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:10px;color:#52606a}.signoff{margin-top:28px}.total{font-size:15px;font-weight:bold}@media print{body{margin:18px}button{display:none}}</style></head><body><header><div>${company?.logo_url ? `<img src="${esc(company.logo_url)}" alt="Company logo">` : ''}<h1>${esc(company?.legal_name || 'Company')}</h1><div class="muted">${esc(company?.trade_name)} · ${address(company?.reg_address)}, ${address(company?.city)} ${address(company?.pin)}<br>GSTIN: ${address(company?.gstin)} · PAN: ${address(company?.pan)}<br>${address(company?.phone)} · ${address(company?.email)}</div></div><div style="text-align:right"><h2>PURCHASE ORDER</h2><strong>${esc(doc.po_number || doc.number)}</strong><br>PO Date: ${esc(doc.po_date)}</div></header><div class="grid"><section class="box"><h3>Vendor / Supplier</h3><strong>${esc(vendor?.vendor_name || '—')}</strong><br>Code: ${esc(vendor?.vendor_code)}<br>GSTIN: ${esc(vendor?.gstin)}<br>Contact: ${esc(vendor?.contact_person)}<br>${esc(vendor?.phone)}<br>${esc(vendor?.city_state)}</section><section class="box"><h3>Ship to</h3>${doc.ship_to && Object.keys(doc.ship_to).length ? ([['address_1', 'Address 1'], ['address_2', 'Address 2'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'], ['country', 'Country'], ['contact_person_name', 'Contact Person'], ['contact_person_mobile', 'Contact Mobile']] as const).filter(([key]) => doc.ship_to?.[key]).map(([key, label]) => `<div><strong>${label}:</strong> ${esc(doc.ship_to?.[key])}</div>`).join('') : '—'}<br><strong>Expected delivery:</strong> ${esc(doc.expected_date)}</section></div><table><thead><tr><th>#</th><th>SKU Code</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Taxable Value</th><th>GST %</th><th>GST Amount</th><th>Total (inc Tax)</th></tr></thead><tbody>${rows || '<tr><td colspan="10">No line items</td></tr>'}</tbody></table><div class="total" style="text-align:right;margin-top:14px">Grand Total: ${money(lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0) + Number(doc.charges_amount || 0))}</div><section class="box" style="margin-top:22px"><h3>Annexure A &amp; Payment Term — Terms and Conditions Governing Our Purchase Order</h3><div style="line-height:1.6">${esc(poTerms(doc.notes)).replace(/\n/g, '<br>')}</div></section><div class="signoff"><strong>For Vensun Group</strong><br><span class="muted">This is a computer-generated document. No signature is required.</span></div><footer class="company">${[['Company', company?.legal_name], ['Trade name', company?.trade_name], ['Code', company?.code], ['Entity type', company?.entity_type], ['GSTIN', company?.gstin], ['PAN', company?.pan], ['State', company?.state_name ? `${company.state_name}${company.state_code ? ` (${company.state_code})` : ''}` : null], ['Registered address', [company?.reg_address, company?.city, company?.pin].filter(Boolean).join(', ')], ['Phone', company?.phone], ['Email', company?.email], ['FY', company?.fy]].filter(([, value]) => value).map(([label, value]) => `<span><strong>${label}:</strong> ${esc(value)}</span>`).join('')}</footer><button onclick="window.print()">Print / Save as PDF</button><script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  const savePurchaseDoc = async (event: FormEvent<HTMLFormElement>, lines: PurchaseLine[]) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    if (!lines.length) { setError('Add at least one SKU line.'); return }
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const supabase = createClient(); const session = (await supabase.auth.getSession()).data.session
    const docPayload = { company_id: values.company_id, vendor_id: values.vendor_id, doc_date: values.doc_date, po_date: values.doc_date, expected_date: values.expected_date || null, purchase_type: values.purchase_type || 'STOCK', vendor_invoice_no: values.vendor_invoice_no || null, vendor_invoice_date: values.vendor_invoice_date || null, payment_basis: values.payment_basis || 'Days from date of delivery', payment_days: Number(values.payment_days || 45), delivery_days: Number(values.delivery_days || 5), charges_amount: Number(values.charges_amount || 0), charges_gst_pct: Number(values.charges_gst_pct || 0), annexure_enabled: true, notes: String(values.notes || '').trim() || DEFAULT_PO_TERMS, ship_to: (() => { const shipTo = Object.fromEntries((['address_1', 'address_2', 'pincode', 'city', 'state', 'country', 'contact_person_name', 'contact_person_mobile'] as const).map(key => [key, String(values[`ship_${key}`] || '').trim()]).filter(([, value]) => value)); return Object.keys(shipTo).length ? shipTo : null })() }
    const buildLinePayload = (line: PurchaseLine) => { const qty = Number(line.qty || 0); const unitPrice = Number(line.unit_price || 0); const discountPct = Number(line.discount_pct || 0); const taxPct = Number(line.tax_pct || 0); const taxable = qty * unitPrice * (1 - discountPct / 100); return { sku_id: line.sku_id || null, product_name: line.product_name || line.description, product_code: line.product_code || null, hsn: line.hsn || null, description: line.description, qty, unit: line.unit || null, unit_price: unitPrice, discount_pct: discountPct, tax_pct: taxPct, taxable, gst_amount: taxable * taxPct / 100, line_total: taxable * (1 + taxPct / 100) } }
    const documentId = editingPurchaseDoc?.id
    let savedDocumentId = documentId

    if (editingPurchaseDoc) {
      // Keep the UPDATE separate from its verification query. Requesting a
      // representation from PostgREST can fail with PGRST116 when RLS or a
      // trigger changes the returned row shape, even when the update succeeds.
      const { data: updatedRows, error: updateError } = await supabase
        .from('purchase_docs')
        .update(docPayload)
        .eq('id', editingPurchaseDoc.id)
        .eq('status', 'DRAFT')
        .select('id')
      if (updateError) {
        setError(`Could not update purchase document: ${updateError.message}`)
        return
      }
      if (!updatedRows?.length) {
        setError('Could not update purchase document: you do not have permission to edit this draft, or it is no longer a draft.')
        return
      }
      const { data: updatedDoc, error: verifyError } = await supabase
        .from('purchase_docs')
        .select('id,status')
        .eq('id', editingPurchaseDoc.id)
        .maybeSingle()
      if (verifyError || !updatedDoc || updatedDoc.status !== 'DRAFT') {
        setError(`Could not update purchase document: ${verifyError?.message || 'The draft was not found or is no longer editable.'}`)
        return
      }
      savedDocumentId = updatedDoc.id
    } else {
      const { data: insertedDoc, error: insertError } = await supabase
        .from('purchase_docs')
        .insert({ ...docPayload, created_by: session?.user.id })
        .select('id')
        .single()
      if (insertError || !insertedDoc) {
        setError(`Could not save purchase document: ${insertError?.message || 'Unknown error'}`)
        return
      }
      savedDocumentId = insertedDoc.id
    }

    if (!savedDocumentId) {
      setError('Could not save purchase document: no document id was returned.')
      return
    }

    const keptLineIds = new Set(lines.map(line => line.id).filter(Boolean) as string[])
    const removedLineIds = editingPurchaseLines.map(line => line.id).filter((id): id is string => !!id && !keptLineIds.has(id))
    if (removedLineIds.length) {
      const { error: deleteError } = await supabase.from('purchase_doc_lines').delete().in('id', removedLineIds)
      if (deleteError) { setError(`Purchase document saved, but a removed line could not be deleted: ${deleteError.message}`); return }
    }
    const newLines = lines.filter(line => !line.id)
    const existingLines = lines.filter(line => line.id)
    if (newLines.length) {
      const { error: insertLinesError } = await supabase.from('purchase_doc_lines').insert(newLines.map(line => ({ purchase_doc_id: savedDocumentId, ...buildLinePayload(line) })))
      if (insertLinesError) { setError(`Purchase document saved, but a line could not be added: ${insertLinesError.message}`); return }
    }
    for (const line of existingLines) {
      const { error: updateLineError } = await supabase.from('purchase_doc_lines').update(buildLinePayload(line)).eq('id', line.id || '')
      if (updateLineError) { setError(`Purchase document saved, but a line could not be updated: ${updateLineError.message}`); return }
    }
    setShowPurchaseForm(false); setEditingPurchaseDoc(null); setEditingPurchaseLines([]); setSaveMessage(editingPurchaseDoc ? 'Purchase order updated.' : 'Purchase order created.'); await loadPurchaseDocs()
  }
  const submitPurchaseDoc = async (id: string) => {
    const { error: submitError } = await createClient().rpc('submit_purchase_doc', { p_doc_id: id })
    if (submitError) setError(`Could not submit purchase order: ${submitError.message}`)
    else { setSaveMessage('Purchase order submitted and numbered.'); await loadPurchaseDocs() }
  }
  const editPurchaseDoc = async (doc: PurchaseDoc) => { if (doc.status !== 'DRAFT') return; setError(''); const { data: lines, error: lineError } = await createClient().from('purchase_doc_lines').select('id,sku_id,product_name,product_code,hsn,description,qty,unit,unit_price,discount_pct,tax_pct,taxable,gst_amount,line_total').eq('purchase_doc_id', doc.id).order('id'); if (lineError || !lines?.length) { setError(`Could not open purchase order for editing: ${lineError?.message || 'No lines found.'}`); return } setEditingPurchaseDoc(doc); setEditingPurchaseLines(lines as PurchaseLine[]); setShowPurchaseForm(true) }
  const cancelPurchaseDoc = async (id: string) => { const reason = window.prompt('Cancel reason:\n1. Vendor unavailable\n2. Price changed\n3. Duplicate PO\n4. Requirement withdrawn\n5. Other\n\nEnter a reason or number:'); if (!reason?.trim()) return; const reasons: Record<string, string> = { '1': 'Vendor unavailable', '2': 'Price changed', '3': 'Duplicate PO', '4': 'Requirement withdrawn' }; const cancelReason = reasons[reason.trim()] || reason.trim(); const { error: cancelError } = await createClient().rpc('cancel_purchase_doc', { p_doc_id: id, p_reason: cancelReason }); if (cancelError) setError(`Could not cancel purchase order: ${cancelError.message}`); else { setSaveMessage('Purchase order cancelled.'); setShowPurchaseForm(false); setEditingPurchaseDoc(null); setEditingPurchaseLines([]); await loadPurchaseDocs() } }
  const saveCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData.entries())
    let logoUrl = String(values.logo_url || '')
    const logoFile = formData.get('logo_file')
    if (logoFile instanceof File && logoFile.size > 0) {
      const uploadData = new FormData(); uploadData.append('file', logoFile)
      try {
        const uploadResponse = await fetch('/api/company-logo', { method: 'POST', body: uploadData })
        const uploadResult = await uploadResponse.json().catch(() => ({}))
        if (!uploadResponse.ok) { setError(uploadResult.error || `Could not upload company logo (${uploadResponse.status}).`); return }
        if (!uploadResult.url) { setError('Could not upload company logo: no file URL was returned.'); return }
        logoUrl = uploadResult.url
      } catch {
        setError('Could not reach the logo upload service. Please check your connection and try again.')
        return
      }
    }
    const payload = { code: values.code, legal_name: values.legal_name, trade_name: values.trade_name || null, entity_type: values.entity_type, logo_url: logoUrl || null, gstin: values.gstin || null, pan: values.pan || null, state_name: values.state_name || null, state_code: values.state_code || null, reg_address: values.reg_address || null, city: values.city || null, pin: values.pin || null, phone: values.phone || null, email: values.email || null, fy: values.fy || '2026-27', status: values.status, sells: values.sells === 'on', buys: values.buys === 'on', is_default: values.is_default === 'on' }
    const supabase = createClient()
    const { error: saveError } = editingCompany ? await supabase.from('companies').update(payload).eq('id', editingCompany.id) : await supabase.from('companies').insert(payload)
    if (saveError) { setError(`Could not ${editingCompany ? 'update' : 'save'} company: ${saveError.message}`); return }
    setShowCompanyForm(false); setEditingCompany(null); setSaveMessage(editingCompany ? 'Company updated successfully.' : 'Company saved successfully.'); await loadCompanies()
  }
  const loadVendors = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await createClient().from('vendors').select('id,vendor_code,vendor_name,display_name,business_line,vendor_type,gstin,contact_person,phone,city_state,credit_days,payment_terms,billing_emails,status,notes').order('vendor_name')
    if (queryError) setError(`Could not load vendors: ${queryError.message}`); else setVendors((data ?? []) as Vendor[])
    setLoading(false)
  }
  useEffect(() => { if (section === 'Vendor Master') loadVendors() }, [section])
  const saveVendor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const { error: saveError } = await createClient().from('vendors').insert({ vendor_code: values.vendor_code, vendor_name: values.vendor_name, display_name: values.display_name || null, business_line: values.business_line, vendor_type: values.vendor_type, gstin: values.gstin || null, contact_person: values.contact_person, phone: values.phone, city_state: values.city_state, credit_days: Number(values.credit_days || 30), payment_terms: values.payment_terms || null, billing_emails: String(values.billing_emails || '').split(',').map(email => email.trim()).filter(Boolean), status: values.status, notes: values.notes || null })
    if (saveError) { setError(`Could not save vendor: ${saveError.message}`); return }
    setShowVendorForm(false); setSaveMessage('Vendor saved successfully.'); await loadVendors()
  }

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

  const uploadAttachment = (file: File, leadId: string, accessToken: string, index: number) => new Promise<void>((resolve, reject) => {
    const markFailed = (message: string) => {
      setUploadStatuses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, state: 'error', error: message } : item))
      reject(new Error(message))
    }
    if (!accessToken) { markFailed('Your session expired. Please sign in again and retry the upload.'); return }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/leads/attachments')
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.upload.onprogress = event => { if (event.lengthComputable) setUploadStatuses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, progress: Math.round((event.loaded / event.total) * 100) } : item)) }
    xhr.onload = () => {
      let result: { error?: string } = {}
      try { result = JSON.parse(xhr.responseText) } catch { result = { error: 'The server returned an invalid response.' } }
      if (xhr.status >= 200 && xhr.status < 300) { setUploadStatuses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, progress: 100, state: 'complete' } : item)); resolve() }
      else markFailed(result.error || `Upload failed with status ${xhr.status}.`)
    }
    xhr.onerror = () => markFailed('Network error while uploading. Check your connection and try again.')
    xhr.ontimeout = () => markFailed('Upload timed out. Please try again.')
    xhr.timeout = 120000
    const uploadData = new FormData(); uploadData.append('file', file); uploadData.append('lead_id', leadId); xhr.send(uploadData)
  })

  const saveLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaveMessage('')
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData.entries())
    const files = (formData.getAll('attachments') as File[]).filter(file => file.size > 0)
    setUploadStatuses(files.map(file => ({ fileName: file.name, progress: 0, state: 'uploading' })))
    const selectedCustomer = customers.find(customer => customer.id === values.customer_id)
    const session = (await createClient().auth.getSession()).data.session
    const payload = { customer_id: values.customer_id, customer_name: selectedCustomer?.customer_name || '', owner_id: editingLead?.owner_id || session?.user.id, working_person_id: values.working_person_id || null, contact_person: values.contact_person || null, phone: values.phone || null, email: values.email || null, source: values.source, product: values.product, qty: Number(values.qty || 0), uom: values.uom, business_type: values.business_type, stage: values.stage, partner_name: values.partner_name || null, target_rate: Number(values.target_rate || 0), buy_rate: Number(values.buy_rate || 0), expected_vendor: values.expected_vendor || null, next_follow_up: values.next_follow_up || null, notes: values.notes || null }
    const supabase = createClient()
    const { data: savedLead, error: saveError } = editingLead ? await supabase.from('leads').update(payload).eq('id', editingLead.id).select('id').single() : await supabase.from('leads').insert(payload).select('id').single()
    if (saveError || !savedLead) { setUploadStatuses([]); setError(`Could not save lead: ${saveError?.message || 'Unknown error'}`); return }
    try { for (let index = 0; index < files.length; index += 1) await uploadAttachment(files[index], savedLead.id, session?.access_token || '', index) }
    catch (uploadError) { setError(`Lead saved, but an attachment could not be uploaded: ${uploadError instanceof Error ? uploadError.message : 'Unknown upload error'}`); return }
    setUploadStatuses([]); setShowForm(false); setEditingLead(null); setSaveMessage(editingLead ? 'Lead updated successfully.' : 'Lead saved successfully.'); await loadLeads()
  }

  const openEditor = (lead: Lead) => { setEditingLead(lead); setShowForm(true) }
  if (authChecking) return <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] text-sm text-[#667078]">Checking employee access…</main>

  return <div className="min-h-screen bg-[#f4f2ed] text-[#0e1b2c]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#0e1b2c] px-5 py-6 text-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2"><div><div className="font-heading text-[25px] font-bold tracking-[-0.04em]">Supply<span className="text-[#f2a541]">360</span></div><div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/45">Trading desk</div></div><button aria-label="Close navigation" className="rounded-lg p-2 text-white/50 lg:hidden" onClick={() => setSidebarOpen(false)}><X /></button></div>
      <div className="mt-8 flex-1 overflow-y-auto">{navGroups.map(group => { const visibleItems = group.items.filter(item => {
        if (employeeRole === 'Admin') return true
        if (item.label === 'Role & Module Access') return false
        return permissions.some(permission => permission.role === employeeRole && (permission.module === item.label || (item.label === 'SKU Configuration' && permission.module === 'SKU Master')) && permission.can_view)
      }); if (!visibleItems.length) return null; return <div key={group.label} className="mb-6"><div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</div><div className="flex flex-col gap-1">{visibleItems.map(item => { const Icon = item.icon; const active = item.label === section; return <button key={item.label} onClick={() => { setSection(item.label as Section); setSidebarOpen(false) }} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] ${item.label === 'SKU Configuration' ? 'ml-6 w-[calc(100%-1.5rem)] border-l border-white/20 pl-4 text-xs' : ''} ${active ? 'bg-[#f2a541] font-semibold text-[#0e1b2c]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><Icon size={16} /><span>{item.label}</span></button> })}</div></div> })}</div>
      <div className="border-t border-white/10 pt-4"><div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3"><div className="flex size-9 items-center justify-center rounded-full bg-[#f2a541] text-sm font-bold text-[#0e1b2c]">MV</div><div><div className="text-sm font-semibold">{employeeName}</div><div className="text-xs text-white/45">{employeeRole}</div></div><button aria-label="Sign out" onClick={async () => { await createClient().auth.signOut(); window.location.replace('/login') }} className="ml-auto rounded-lg p-1.5 text-[#e56b5d] hover:bg-[#b23a22]/20 hover:text-[#ff9a8d]"><LogOut size={15} /></button></div></div>
    </aside>
    <div className="lg:pl-[252px]"><header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#dedbd2] bg-[#f4f2ed]/95 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button aria-label="Open navigation" className="rounded-lg p-2 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div><h1 className="font-heading text-[25px] font-bold tracking-[-0.035em]">{section}</h1></div></div><div className="flex items-center gap-2"><div className="hidden rounded-full border border-[#b7d6c5] bg-[#eaf5ee] px-2.5 py-1.5 text-[11px] text-[#23714a] sm:block">Supabase connected</div><button aria-label="Search" className="rounded-lg border border-[#dedbd2] bg-white p-2.5"><Search size={17} /></button><button aria-label="Notifications" className="rounded-lg border border-[#dedbd2] bg-white p-2.5"><Bell size={17} /></button></div></header>
      <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 lg:px-10">{saveMessage && <div role="status" className="mb-5 flex items-center justify-between rounded-xl border border-[#b7d6c5] bg-[#eaf5ee] px-4 py-3 text-sm font-semibold text-[#23714a]"><span>{saveMessage}</span><button type="button" aria-label="Dismiss confirmation" onClick={() => setSaveMessage('')} className="ml-4 text-[#23714a]">×</button></div>}{uploadStatuses.length > 0 && <div className="mb-5 rounded-xl border border-[#dedbd2] bg-white p-4"><div className="mb-3 text-sm font-semibold">Uploading attachments</div><div className="flex flex-col gap-3">{uploadStatuses.map(status => <div key={status.fileName}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{status.fileName}</span><span>{status.state === 'error' ? 'Failed' : `${status.progress}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eeeae1]"><div className={`h-full transition-[width] ${status.state === 'error' ? 'bg-[#b23a22]' : 'bg-[#f2a541]'}`} style={{ width: `${status.progress}%` }} /></div>{status.error && <div className="mt-1 text-xs text-[#b23a22]">{status.error}</div>}</div>)}</div></div>}{section === 'Purchase Orders' || section === 'Purchase Invoices' ? <PurchasesView documents={purchaseDocs} vendors={vendors} companies={companies} skus={skus} loading={loading} error={error} onRefresh={loadPurchaseDocs} onNew={() => { setError(''); setEditingPurchaseDoc(null); setEditingPurchaseLines([]); setShowPurchaseForm(true) }} onEdit={editPurchaseDoc} onSubmit={submitPurchaseDoc} onCancel={cancelPurchaseDoc} onDownload={downloadPurchasePdf} showForm={showPurchaseForm} onCloseForm={() => { setShowPurchaseForm(false); setEditingPurchaseDoc(null); setEditingPurchaseLines([]) }} onCreate={savePurchaseDoc} editingDoc={editingPurchaseDoc} editingLines={editingPurchaseLines} /> : section === 'Companies' ? <CompaniesView companies={companies} loading={loading} error={error} onRefresh={loadCompanies} onNew={() => { setError(''); setEditingCompany(null); setShowCompanyForm(true) }} onEdit={(company) => { setError(''); setEditingCompany(company); setShowCompanyForm(true) }} /> : section === 'Vendor Master' ? <VendorsView vendors={vendors} loading={loading} error={error} onRefresh={loadVendors} onNew={() => { setError(''); setShowVendorForm(true) }} /> : section === 'SKU Configuration' ? <SKUsView onEditSku={openSkuEdit} key="sku-configuration" initialTab="masters" skus={skus} loading={loading} error={error} onRefresh={() => { loadSkus(); loadSkuMasters() }} onNew={() => { setError(''); setEditingSku(null); setShowSkuForm(true) }} masters={skuMasterValues} canEditMasters={canEditSkuMasters} onAddMaster={saveSkuMaster} onEditMaster={editSkuMaster} onImportResult={(message, importError) => { if (importError) setError(importError); else setSaveMessage(message) }} /> : section === 'SKU Master' ? <SKUsView onEditSku={openSkuEdit} key="sku-master" initialTab="skus" skus={skus} loading={loading} error={error} onRefresh={() => { loadSkus(); loadSkuMasters() }} onNew={() => { setError(''); setEditingSku(null); setShowSkuForm(true) }} masters={skuMasterValues} canEditMasters={canEditSkuMasters} onAddMaster={saveSkuMaster} onEditMaster={editSkuMaster} onImportResult={(message, importError) => { if (importError) setError(importError); else setSaveMessage(message) }} /> : section === 'Customer Master' ? <CustomersView customers={customers} loading={loading} error={error} onRefresh={loadCustomers} onNew={() => { setError(''); setShowCustomerForm(true) }} /> : section === 'Leads' ? <LeadsView leads={leads} loading={loading} error={error} onNew={() => { setEditingLead(null); setShowForm(true) }} onEdit={openEditor} /> : section === 'Employees' ? <EmployeesView employees={employees} loading={loading} error={error} onRefresh={loadEmployees} canCreate={employeeRole === 'Admin'} onNew={() => { setError(''); setShowEmployeeForm(true) }} /> : section === 'Role & Module Access' ? <RoleModuleAccessView roles={employeeRoles} permissions={permissions} error={error} onToggle={updatePermission} /> : <DashboardView />}</main></div>
    {sidebarOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-[#0e1b2c]/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    {showCompanyForm && <CompanyForm company={editingCompany} onClose={() => { setShowCompanyForm(false); setEditingCompany(null) }} onSubmit={saveCompany} />}
    {showVendorForm && <VendorForm onClose={() => setShowVendorForm(false)} onSubmit={saveVendor} />}
    {showSkuForm && <SKUForm key={editingSku?.id ?? 'new-sku'} sku={editingSku} masters={skuMasterValues} skus={skus} onClose={() => { setShowSkuForm(false); setEditingSku(null) }} onSubmit={saveSku} />}
    {showCustomerForm && <CustomerForm onClose={() => setShowCustomerForm(false)} onSubmit={saveCustomer} />}
    {showForm && <LeadForm lead={editingLead} customers={customers} employees={employees} uploadStatuses={uploadStatuses} onClose={() => { setShowForm(false); setEditingLead(null); setUploadStatuses([]) }} onSubmit={saveLead} />}
    {showEmployeeForm && <EmployeeForm roles={employeeRoles} onClose={() => setShowEmployeeForm(false)} onSubmit={createEmployee} />}
  </div>
}

function CompaniesView({ companies, loading, error, onRefresh, onNew, onEdit }: { companies: Company[]; loading: boolean; error: string; onRefresh: () => void; onNew: () => void; onEdit: (company: Company) => void }) {
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#667078]">Your own legal entities for purchases, sales, invoices, and POs.</p></div><div className="flex gap-2"><button onClick={onRefresh} className="min-h-11 rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Refresh</button><button onClick={onNew} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]"><Plus size={17} /> Add company</button></div></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}{loading ? <div className="rounded-2xl border border-[#e0ddd5] bg-white p-8 text-sm text-[#667078]">Loading companies…</div> : companies.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8c59f] bg-white p-10 text-center"><h2 className="font-heading text-xl font-bold">No companies yet</h2><p className="mt-2 text-sm text-[#667078]">Add each legal entity you buy or sell through.</p><button onClick={onNew} className="mt-5 min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold">Add company</button></div> : <div className="grid gap-5 xl:grid-cols-2">{companies.map(company => <article key={company.id} className={`rounded-2xl border bg-white p-6 ${company.is_default ? 'border-2 border-[#0e1b2c]' : 'border-[#e0ddd5]'}`}><div className="mb-4 flex justify-end"><button type="button" onClick={() => onEdit(company)} className="flex items-center gap-2 rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-semibold hover:bg-[#f4f2ed]"><Pencil size={14} /> Edit</button></div><div className="flex items-start gap-4"><div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0e1b2c] font-heading text-lg font-bold text-[#f2a541]">{company.logo_url ? <img src={company.logo_url} alt={`${company.legal_name} logo`} className="size-full object-contain" /> : company.code}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-xl font-bold">{company.legal_name}</h2>{company.is_default && <span className="rounded-full bg-[#eaf5ee] px-2 py-1 text-[11px] font-semibold text-[#23714a]">Default</span>}</div><p className="mt-1 text-sm text-[#667078]">{company.trade_name || company.entity_type} · FY {company.fy}</p></div></div><div className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><div><div className="text-xs text-[#8b9295]">GSTIN</div><div className="mt-1 font-mono">{company.gstin || <span className="font-sans text-[#8f5300]">Add GSTIN</span>}</div></div><div><div className="text-xs text-[#8b9295]">PAN</div><div className="mt-1 font-mono">{company.pan || <span className="font-sans text-[#8f5300]">Add PAN</span>}</div></div><div><div className="text-xs text-[#8b9295]">State</div><div className="mt-1">{company.state_name ? `${company.state_name} (${company.state_code || '—'})` : 'Add state'}</div></div><div><div className="text-xs text-[#8b9295]">Contact</div><div className="mt-1 truncate">{company.email || company.phone || 'Add contact details'}</div></div></div><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full bg-[#f4f2ed] px-2.5 py-1 text-xs">{company.status}</span>{company.sells && <span className="rounded-full bg-[#fff4dc] px-2.5 py-1 text-xs text-[#8f5300]">Sells</span>}{company.buys && <span className="rounded-full bg-[#eef3f8] px-2.5 py-1 text-xs text-[#31516d]">Buys</span>}</div></article>)}</div>}</div>
}

function CompanyForm({ company, onClose, onSubmit }: { company: Company | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/45 p-4"><form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><h2 className="font-heading text-2xl font-bold">{company ? 'Edit company' : 'Add company'}</h2><p className="mt-1 text-sm text-[#667078]">Details used on invoices, purchase orders, and document headers.</p></div><button type="button" aria-label="Close company form" onClick={onClose} className="rounded-lg p-2 text-[#667078]"><X size={20} /></button></div><div className="mt-7 grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Company code*<input required name="code" defaultValue={company?.code || ''} placeholder="CO1" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-mono font-normal" /></label><label className="text-sm font-semibold">Legal name*<input required name="legal_name" defaultValue={company?.legal_name || ''} placeholder="Supply360 Solution" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Trade / brand name<input name="trade_name" defaultValue={company?.trade_name || ''} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Entity type<select name="entity_type" defaultValue="Proprietorship" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 font-normal"><option>Proprietorship</option><option>Partnership</option><option>LLP</option><option>Private Limited</option><option>OPC</option><option>Other</option></select></label><label className="text-sm font-semibold">Company logo<input name="logo_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-[#dedbd2] px-3 py-2 text-sm font-normal" /><span className="mt-1 block text-xs font-normal text-[#667078]">PNG, JPG, WEBP, or SVG up to 2 MB. This logo appears on customer purchase orders.</span></label><label className="text-sm font-semibold">Status<select name="status" defaultValue="Active" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 font-normal"><option>Active</option><option>Inactive</option></select></label><label className="text-sm font-semibold">GSTIN<input name="gstin" maxLength={15} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-mono font-normal uppercase" /></label><label className="text-sm font-semibold">PAN<input name="pan" maxLength={10} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-mono font-normal uppercase" /></label><label className="text-sm font-semibold">State name<input name="state_name" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">State code<input name="state_code" maxLength={2} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-mono font-normal" /></label><label className="text-sm font-semibold sm:col-span-2">Registered address<input name="reg_address" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">City<input name="city" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">PIN<input name="pin" maxLength={6} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-mono font-normal" /></label><label className="text-sm font-semibold">Phone<input name="phone" type="tel" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Email<input name="email" type="email" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Financial year<input name="fy" defaultValue="2026-27" className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-mono font-normal" /></label><div className="flex flex-wrap items-end gap-5 pb-2 text-sm font-semibold"><label className="flex items-center gap-2"><input name="sells" type="checkbox" defaultChecked /> Sells</label><label className="flex items-center gap-2"><input name="buys" type="checkbox" defaultChecked /> Buys</label><label className="flex items-center gap-2"><input name="is_default" type="checkbox" /> Default company</label></div></div><div className="mt-8 flex justify-end gap-3 border-t border-[#e0ddd5] pt-5"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">Cancel</button><button type="submit" className="min-h-11 rounded-lg bg-[#f2a541] px-5 text-sm font-bold text-[#0e1b2c]">Save company</button></div></form></div>
}

function PurchasesView({ documents, vendors, companies, skus, loading, error, onRefresh, onNew, onEdit, onSubmit, onCancel, onDownload, showForm, onCloseForm, onCreate, editingDoc, editingLines }: { documents: PurchaseDoc[]; vendors: Vendor[]; companies: Company[]; skus: SKU[]; loading: boolean; error: string; onRefresh: () => void; onNew: () => void; onEdit: (doc: PurchaseDoc) => void; onSubmit: (id: string) => void; onCancel: (id: string) => void; onDownload: (doc: PurchaseDoc) => void; showForm: boolean; onCloseForm: () => void; onCreate: (event: FormEvent<HTMLFormElement>, lines: PurchaseLine[]) => void; editingDoc: PurchaseDoc | null; editingLines: PurchaseLine[] }) {
  const statusLabel = (status: string) => status === 'DRAFT' ? 'Created' : status === 'SUBMITTED' ? 'Invoiced' : status === 'CANCELLED' ? 'Cancelled' : status
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#667078]">Created POs stay editable until you create the purchase invoice. Invoiced PIs are read-only.</p></div><div className="flex gap-2"><button onClick={onRefresh} className="min-h-11 rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Refresh</button><button onClick={onNew} className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">New purchase order</button></div></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}{loading ? <div className="rounded-2xl border border-[#e0ddd5] bg-white p-8 text-sm text-[#667078]">Loading purchase orders…</div> : <div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#f8f7f3] text-xs uppercase tracking-wider text-[#667078]"><tr><th className="px-5 py-4">Number</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Actions</th></tr></thead><tbody>{documents.map(doc => <tr key={doc.id} className="border-t border-[#eeeae1]"><td className="px-5 py-4 font-semibold">{doc.po_number || doc.number || 'P0300419'}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${doc.status === 'CANCELLED' ? 'bg-[#fff1ed] text-[#b23a22]' : doc.status === 'SUBMITTED' ? 'bg-[#eaf5ee] text-[#23714a]' : 'bg-[#f4f2ed] text-[#52606a]'}`}>{statusLabel(doc.status)}</span></td><td className="px-5 py-4">{doc.doc_date}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button onClick={() => onDownload(doc)} className="flex items-center gap-1 rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-semibold"><Download size={13} /> PDF</button>{doc.status === 'DRAFT' && <><button onClick={() => onEdit(doc)} className="flex items-center gap-1 rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-semibold"><Pencil size={13} /> Edit</button><button onClick={() => onCancel(doc.id)} className="rounded-lg border border-[#e8c2b9] px-3 py-2 text-xs font-semibold text-[#b23a22]">Cancel</button><button onClick={() => onSubmit(doc.id)} className="rounded-lg bg-[#0e1b2c] px-3 py-2 text-xs font-semibold text-white">Create PI</button></>}</div></td></tr>)}{!documents.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-[#667078]">No purchase documents yet.</td></tr>}</tbody></table></div>}{showForm && <PurchaseForm vendors={vendors} companies={companies} skus={skus} doc={editingDoc} lines={editingLines} onClose={onCloseForm} onSubmit={onCreate} />}</div>
}

function PurchaseForm({ vendors, companies, skus, doc, lines, onClose, onSubmit }: { vendors: Vendor[]; companies: Company[]; skus: SKU[]; doc: PurchaseDoc | null; lines: PurchaseLine[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>, lines: PurchaseLine[]) => void }) {
  const emptyLine = (): PurchaseLine => ({ sku_id: '', description: '', qty: 0, unit_price: 0, tax_pct: 0 })
  const [items, setItems] = useState<PurchaseLine[]>(lines.length ? lines : [emptyLine()])
  const updateItem = (index: number, patch: Partial<PurchaseLine>) => setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const addItem = () => setItems(prev => [...prev, emptyLine()])
  const removeItem = (index: number) => setItems(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/45 p-4"><form onSubmit={event => onSubmit(event, items)} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="font-heading text-2xl font-bold">{doc ? 'Edit purchase order' : 'New purchase order'}</h2><p className="mt-1 text-sm text-[#667078]">PO drafts are editable until submission. Submit converts this PO into a read-only PI and assigns the PI number from the company series.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2"><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Company*<select required name="company_id" defaultValue={doc?.company_id || ''} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 font-normal"><option value="">Select company</option>{companies.filter(item => item.buys).map(item => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select></label><label className="text-sm font-semibold">Vendor*<select required name="vendor_id" defaultValue={doc?.vendor_id || ''} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 font-normal"><option value="">Select vendor</option>{vendors.map(item => <option key={item.id} value={item.id}>{item.vendor_name}</option>)}</select></label><label className="text-sm font-semibold">PO date*<input required type="date" name="doc_date" defaultValue={doc?.doc_date || new Date().toISOString().slice(0,10)} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Expected delivery<input type="date" name="expected_date" defaultValue={doc?.expected_date || ''} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><fieldset className="grid gap-4 rounded-lg border border-[#dedbd2] p-4 sm:col-span-2 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Ship to</legend>{([['ship_address_1', 'address_1', 'Address line 1'], ['ship_address_2', 'address_2', 'Address line 2'], ['ship_pincode', 'pincode', 'Pincode'], ['ship_city', 'city', 'City'], ['ship_state', 'state', 'State'], ['ship_country', 'country', 'Country'], ['ship_contact_person_name', 'contact_person_name', 'Contact person name'], ['ship_contact_person_mobile', 'contact_person_mobile', 'Contact person mobile no']] as const).map(([field, key, label]) => <label key={field} className="text-sm font-semibold">{label}<input name={field} inputMode={key === 'pincode' ? 'numeric' : undefined} defaultValue={doc?.ship_to?.[key] ?? (key === 'country' ? 'India' : '')} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label>)}</fieldset><fieldset className="grid gap-3 rounded-lg border border-[#dedbd2] p-4 sm:col-span-2"><legend className="px-1 text-sm font-semibold">SKU lines*</legend>{items.map((item, index) => <div key={index} className="grid gap-3 rounded-lg border border-[#dedbd2] p-3 sm:grid-cols-6"><label className="text-sm font-semibold sm:col-span-2">SKU*<select required value={item.sku_id || ''} onChange={e => { const sku = skus.find(s => s.id === e.target.value); updateItem(index, { sku_id: e.target.value, product_code: sku?.code, product_name: sku?.name, description: item.description || sku?.name || '', hsn: sku?.hsn, unit: sku?.uom, tax_pct: item.tax_pct || sku?.gst_pct || 0 }) }} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 font-normal"><option value="">Select SKU</option>{skus.map(sku => <option key={sku.id} value={sku.id}>{sku.code} — {sku.name}</option>)}</select></label><label className="text-sm font-semibold sm:col-span-2">Description*<input required value={item.description} onChange={e => updateItem(index, { description: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Quantity*<input required min="0.001" step="0.001" type="number" value={item.qty || ''} onChange={e => updateItem(index, { qty: Number(e.target.value) || 0 })} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Unit price*<input required min="0" step="0.001" type="number" value={item.unit_price || 0} onChange={e => updateItem(index, { unit_price: Number(e.target.value) || 0 })} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><label className="text-sm font-semibold">Tax %<input min="0" step="0.001" type="number" value={item.tax_pct ?? 0} onChange={e => updateItem(index, { tax_pct: Number(e.target.value) || 0 })} className="mt-2 h-11 w-full rounded-lg border border-[#dedbd2] px-3 font-normal" /></label><div className="flex items-end sm:col-span-6"><button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} className="rounded-lg border border-[#dedbd2] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Remove line</button></div></div>)}<button type="button" onClick={addItem} className="justify-self-start rounded-lg border border-dashed border-[#dedbd2] px-4 py-2 text-sm font-semibold text-[#667078]">+ Add SKU line</button></fieldset><label className="text-sm font-semibold sm:col-span-2">Annexure A &amp; Payment Term — Terms and Conditions Governing Our Purchase Order<textarea name="notes" rows={7} defaultValue={poTerms(doc?.notes)} className="mt-2 w-full rounded-lg border border-[#dedbd2] p-3 font-normal leading-relaxed" /><span className="mt-1 block text-xs font-normal text-[#667078]">Edit or add lines here. Everything in this box prints on the PO PDF exactly as written.</span></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-2 text-sm font-semibold">Cancel</button><button className="rounded-lg bg-[#f2a541] px-4 py-2 text-sm font-bold">Save draft</button></div></form></div>
}

function DashboardView() { return <div className="rounded-2xl border border-[#e0ddd5] bg-white p-8"><h2 className="font-heading text-2xl font-bold">Dashboard overview</h2><p className="mt-2 text-sm text-[#667078]">Select Leads from the left navigation to manage your sales pipeline.</p></div> }
function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[#e0ddd5] bg-white p-5"><div className="text-xs text-[#667078]">{label}</div><div className="mt-3 font-heading text-2xl font-bold">{value}</div></div> }

function LeadsView({ leads, loading, error, onNew, onEdit }: { leads: Lead[]; loading: boolean; error: string; onNew: () => void; onEdit: (lead: Lead) => void }) {
  const [search, setSearch] = useState(''); const [stage, setStage] = useState('All'); const [source, setSource] = useState('All')
  const filtered = useMemo(() => leads.filter(lead => `${lead.customer_name} ${lead.product} ${lead.partner_name || ''}`.toLowerCase().includes(search.toLowerCase()) && (stage === 'All' || lead.stage === stage) && (source === 'All' || lead.source === source)), [leads, search, stage, source])
  const open = leads.filter(lead => !['Won', 'Lost'].includes(lead.stage)); const pipeline = open.reduce((sum, lead) => sum + Number(lead.qty) * Number(lead.target_rate), 0); const margin = open.reduce((sum, lead) => sum + Number(lead.qty) * (Number(lead.target_rate) - Number(lead.buy_rate)), 0)
  return <><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#667078]">Every enquiry from first call to won or lost.</p></div><button onClick={onNew} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]"><Plus size={17} /> New lead</button></div><div className="mb-6 grid gap-4 sm:grid-cols-3"><Kpi label="Open leads" value={String(open.length)} /><Kpi label="Pipeline value" value={money(pipeline)} /><Kpi label="Expected margin" value={money(margin)} /></div><div className="mb-5 rounded-2xl border border-[#e0ddd5] bg-white p-4"><div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]"><label className="relative"><span className="sr-only">Search leads</span><Search className="absolute left-3 top-3 text-[#8b9295]" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, product, owner" className="h-11 w-full rounded-lg border border-[#dedbd2] pl-10 pr-3 text-sm outline-none focus:border-[#f2a541]" /></label><select value={stage} onChange={event => setStage(event.target.value)} aria-label="Filter by stage" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option>{stages.map(item => <option key={item}>{item}</option>)}</select><select value={source} onChange={event => setSource(event.target.value)} aria-label="Filter by source" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option>{['Referral', 'Partner network', 'Website', 'Cold call', 'Existing customer', 'Other'].map(item => <option key={item}>{item}</option>)}</select><button onClick={() => { setSearch(''); setStage('All'); setSource('All') }} className="h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold hover:bg-[#f4f2ed]">Clear</button></div></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}{loading ? <div className="rounded-2xl bg-white p-8 text-sm text-[#667078]">Loading leads...</div> : <div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.08em] text-[#667078]"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Product</th><th className="px-5 py-4">Owner</th><th className="px-5 py-4">Stage</th><th className="px-5 py-4">Source</th><th className="px-5 py-4">Value</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#eeeae2]">{filtered.map(lead => <tr key={lead.id} className="hover:bg-[#fffdf8]"><td className="px-5 py-4"><div className="font-semibold">{lead.customer_name}</div><div className="mt-1 text-xs text-[#8b9295]">{lead.contact_person || lead.email || 'No contact details'}</div></td><td className="px-5 py-4">{lead.product}<div className="mt-1 text-xs text-[#8b9295]">{lead.qty} {lead.uom}</div></td><td className="px-5 py-4">{lead.partner_name || '—'}</td><td className="px-5 py-4"><span className="rounded-full bg-[#f4f2ed] px-2.5 py-1 text-xs font-semibold">{lead.stage}</span></td><td className="px-5 py-4 text-[#667078]">{lead.source}</td><td className="px-5 py-4 font-semibold">{money(Number(lead.qty) * Number(lead.target_rate))}</td><td className="px-5 py-4 text-right"><button onClick={() => onEdit(lead)} aria-label={`Edit ${lead.customer_name}`} className="inline-flex items-center gap-2 rounded-lg border border-[#dedbd2] px-3 py-2 text-xs font-bold hover:border-[#f2a541] hover:bg-[#fff8eb]"><Pencil size={14} /> Edit</button></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="p-10 text-center text-sm text-[#667078]">No leads match these filters.</div>}</div>}</>
}

const SKU_CSV_COLUMNS = ['code','name','category','sub_category','business_line','brand','model','status','spec','size','gsm','colour','weight_kg','barcode','uom','pack_qty','purchase_uom','conversion','moq','hsn','gst_pct','cess_pct','std_purchase_rate','std_selling_rate','min_margin_pct','mrp','lead_time_days','opening_qty','opening_rate','opening_date','reorder_level','reorder_qty','location','notes']
const SKU_CSV_REQUIRED = new Set(['code','name','category','business_line','uom','hsn'])
const SKU_CSV_NUMERIC = new Set(['weight_kg','pack_qty','conversion','moq','gst_pct','cess_pct','std_purchase_rate','std_selling_rate','min_margin_pct','mrp','lead_time_days','opening_qty','opening_rate','reorder_level','reorder_qty'])

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++ } else inQuotes = false
      } else cell += char
    } else if (char === '"') inQuotes = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function SKUsView({ initialTab = 'skus', skus, loading, error, onRefresh, onNew, onEditSku, masters, canEditMasters, onAddMaster, onEditMaster, onImportResult }: { initialTab?: 'skus' | 'masters'; skus: SKU[]; loading: boolean; error: string; onRefresh: () => void; onNew: () => void; onEditSku?: (sku: SKU) => void; masters: SkuMasterValue[]; canEditMasters: boolean; onAddMaster: (type: SkuMasterType, value: string) => Promise<void>; onEditMaster: (id: string, value: string) => void; onImportResult: (message: string, importError?: string) => void }) {
  const [masterType, setMasterType] = useState<SkuMasterType>('Category')
  const [masterValue, setMasterValue] = useState('')
  const [tab, setTab] = useState<'skus' | 'masters'>(initialTab)
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('All'); const [category, setCategory] = useState('All')
  const categories = Array.from(new Set(skus.map(sku => sku.category))).sort()
  const filtered = skus.filter(sku => `${sku.code} ${sku.name} ${sku.brand || ''} ${sku.barcode || ''}`.toLowerCase().includes(search.toLowerCase()) && (status === 'All' || sku.status === status) && (category === 'All' || sku.category === category))
  const exportSkus = () => {
    const header = SKU_CSV_COLUMNS.map(column => SKU_CSV_REQUIRED.has(column) ? `${column}*` : column).join(',')
    const body = skus.map(sku => SKU_CSV_COLUMNS.map(column => csvCell((sku as unknown as Record<string, unknown>)[column])).join(','))
    const csv = '\uFEFF' + [header, ...body].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `sku-master-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const importSkus = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file || !canEditMasters) return
    try {
      const [headerRow, ...dataRows] = parseCsv((await file.text()).replace(/^\uFEFF/, ''))
      if (!headerRow) { onImportResult('', 'The CSV file is empty.'); return }
      const columns = headerRow.map(column => column.trim().replace(/\*$/, '').trim().toLowerCase())
      const missingRequired = [...SKU_CSV_REQUIRED].filter(column => !columns.includes(column))
      if (missingRequired.length) { onImportResult('', `CSV is missing required column(s): ${missingRequired.join(', ')}`); return }
      const problems: string[] = []
      const records: Record<string, string | number>[] = []
      dataRows.forEach((values, index) => {
        if (values.every(value => value.trim() === '')) return
        const rowNumber = index + 2
        const record: Record<string, string | number> = {}
        columns.forEach((column, columnIndex) => {
          if (!SKU_CSV_COLUMNS.includes(column)) return
          const value = (values[columnIndex] ?? '').trim()
          if (value === '') return
          if (SKU_CSV_NUMERIC.has(column)) {
            const numeric = Number(value.replace(/,/g, ''))
            if (Number.isNaN(numeric)) problems.push(`Row ${rowNumber}: ${column} "${value}" is not a number`)
            else record[column] = numeric
          } else record[column] = value
        })
        const missing = ['code', 'name', 'category', 'business_line', 'uom', 'hsn'].filter(column => record[column] === undefined)
        if (missing.length) { problems.push(`Row ${rowNumber}: missing ${missing.join(', ')}`); return }
        records.push(record)
      })
      if (problems.length) { onImportResult('', `Import stopped. Fix these rows and try again: ${problems.slice(0, 8).join('; ')}${problems.length > 8 ? ` (+${problems.length - 8} more)` : ''}`); return }
      if (!records.length) { onImportResult('', 'No SKU rows found in the CSV.'); return }
      const supabase = createClient()
      const existingByCode = new Map(skus.map(sku => [sku.code.trim().toLowerCase(), sku.id]))
      const toInsert = records.filter(record => !existingByCode.has(String(record.code).toLowerCase()))
      const toUpdate = records.filter(record => existingByCode.has(String(record.code).toLowerCase()))
      if (toInsert.length) {
        const { error: insertError } = await supabase.from('skus').insert(toInsert, { defaultToNull: false })
        if (insertError) { onImportResult('', `Could not import SKUs: ${insertError.message}`); return }
      }
      const updateErrors: string[] = []
      for (const record of toUpdate) {
        const id = existingByCode.get(String(record.code).toLowerCase())!
        const { code: _code, ...changes } = record
        const { error: updateError } = await supabase.from('skus').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
        if (updateError) updateErrors.push(`${record.code}: ${updateError.message}`)
      }
      onRefresh()
      if (updateErrors.length) onImportResult('', `Added ${toInsert.length}, updated ${toUpdate.length - updateErrors.length}. Failed: ${updateErrors.slice(0, 5).join('; ')}`)
      else onImportResult(`Import complete: ${toInsert.length} SKU${toInsert.length === 1 ? '' : 's'} added, ${toUpdate.length} updated.`)
    } catch (importError) {
      onImportResult('', `Could not read the CSV file: ${importError instanceof Error ? importError.message : String(importError)}`)
    } finally {
      input.value = ''
    }
  }
  if (tab === 'masters') return <div><SkuMastersView masters={masters} canEdit={canEditMasters} type={masterType} onTypeChange={setMasterType} value={masterValue} onValueChange={setMasterValue} onAdd={onAddMaster} onEditMaster={onEditMaster} /></div>
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#667078]">Manage products, pricing, tax, and stock settings.</p></div><div className="flex flex-wrap gap-2"><button onClick={exportSkus} className="min-h-11 rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Export CSV</button>{canEditMasters && <label className="flex min-h-11 cursor-pointer items-center rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Import CSV<input type="file" accept=".csv,text/csv" onChange={importSkus} className="sr-only" /></label>}<button onClick={onNew} className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">Create SKU</button></div></div><div className="mb-5 grid gap-3 rounded-2xl border border-[#e0ddd5] bg-white p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search code, name, brand, barcode" className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm outline-none focus:border-[#f2a541]" /><select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option><option>Active</option><option>Discontinued</option></select><button onClick={() => { setSearch(''); setCategory('All'); setStatus('All'); onRefresh() }} className="h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">Refresh</button></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}<div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="flex items-center justify-between border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">SKU Master</h2><span className="text-xs text-[#667078]">{filtered.length} of {skus.length}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr>{['Actions','Code','Name','Category','Business line','Brand / model','UOM','GST','Selling rate','Status'].map(label => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#eeeae2]">{loading ? <tr><td colSpan={10} className="px-5 py-10 text-center text-[#667078]">Loading SKUs…</td></tr> : filtered.length === 0 ? <tr><td colSpan={10} className="px-5 py-10 text-center text-[#667078]">No SKUs found.</td></tr> : filtered.map(sku => <tr key={sku.id} className="hover:bg-[#fcfbf8]"><td className="px-4 py-3">{onEditSku && <button type="button" onClick={() => onEditSku(sku)} className="font-semibold text-[#9b5e00] hover:underline">Edit</button>}</td><td className="px-5 py-4 font-semibold">{sku.code}</td><td className="px-5 py-4 font-semibold">{sku.name}</td><td className="px-5 py-4 text-[#667078]">{sku.category}</td><td className="px-5 py-4 text-[#667078]">{sku.business_line}</td><td className="px-5 py-4 text-[#667078]">{[sku.brand, sku.model].filter(Boolean).join(' / ') || '—'}</td><td className="px-5 py-4">{sku.uom}</td><td className="px-5 py-4">{sku.gst_pct}%</td><td className="px-5 py-4">{sku.std_selling_rate == null ? '—' : money(Number(sku.std_selling_rate))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sku.status === 'Active' ? 'bg-[#eaf5ee] text-[#23714a]' : 'bg-[#f1f0ed] text-[#8b9295]'}`}>{sku.status}</span></td></tr>)}</tbody></table></div></div></div>
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><p className="text-sm text-[#667078]">Manage products, pricing, tax, and stock settings.</p><button onClick={onNew} className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">Create SKU</button></div><div className="mb-5 grid gap-3 rounded-2xl border border-[#e0ddd5] bg-white p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search code, name, brand, barcode" className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm outline-none focus:border-[#f2a541]" /><select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm"><option>All</option><option>Active</option><option>Discontinued</option></select><button onClick={() => { setSearch(''); setCategory('All'); setStatus('All'); onRefresh() }} className="h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">Refresh</button></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}<div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="flex items-center justify-between border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">SKU Master</h2><span className="text-xs text-[#667078]">{filtered.length} of {skus.length}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr>{['Actions','Code','Name','Category','Business line','Brand / model','UOM','GST','Selling rate','Status'].map(label => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#eeeae2]">{loading ? <tr><td colSpan={10} className="px-5 py-10 text-center text-[#667078]">Loading SKUs…</td></tr> : filtered.length === 0 ? <tr><td colSpan={10} className="px-5 py-10 text-center text-[#667078]">No SKUs found.</td></tr> : filtered.map(sku => <tr key={sku.id} className="hover:bg-[#fcfbf8]"><td className="px-4 py-3">{onEditSku && <button type="button" onClick={() => onEditSku(sku)} className="font-semibold text-[#9b5e00] hover:underline">Edit</button>}</td><td className="px-5 py-4 font-semibold">{sku.code}</td><td className="px-5 py-4 font-semibold">{sku.name}</td><td className="px-5 py-4 text-[#667078]">{sku.category}</td><td className="px-5 py-4 text-[#667078]">{sku.business_line}</td><td className="px-5 py-4 text-[#667078]">{[sku.brand, sku.model].filter(Boolean).join(' / ') || '—'}</td><td className="px-5 py-4">{sku.uom}</td><td className="px-5 py-4">{sku.gst_pct}%</td><td className="px-5 py-4">{sku.std_selling_rate == null ? '—' : money(Number(sku.std_selling_rate))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sku.status === 'Active' ? 'bg-[#eaf5ee] text-[#23714a]' : 'bg-[#f1f0ed] text-[#8b9295]'}`}>{sku.status}</span></td></tr>)}</tbody></table></div></div></div>
}

function SkuMastersView({ masters, canEdit, type, onTypeChange, value, onValueChange, onAdd, onEditMaster }: { masters: SkuMasterValue[]; canEdit: boolean; type: SkuMasterType; onTypeChange: (type: SkuMasterType) => void; value: string; onValueChange: (value: string) => void; onAdd: (type: SkuMasterType, value: string) => Promise<void>; onEditMaster: (id: string, value: string) => void }) {
  const types: SkuMasterType[] = ['Category', 'Business line', 'Sub-category', 'Brand', 'Model', 'Specification', 'Colour', 'GSM']
  const values = Array.from(new Map(masters.filter(item => item.master_type === type && item.value.trim()).map(item => [item.value.trim().toLowerCase(), item])).values())
  const [importStatus, setImportStatus] = useState<UploadStatus | null>(null)
  const download = () => { const csv = 'master_type,value,is_active'; const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sku-masters.csv'; anchor.click(); URL.revokeObjectURL(url) }
  const importValues = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !canEdit) return
    setImportStatus({ fileName: file.name, progress: 5, state: 'uploading' })
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '')
      const lines = text.split(/\r?\n/).filter(line => line.trim())
      if (lines.length < 2) throw new Error('The CSV is empty or has no data rows.')
      const parse = (line: string) => { const cells: string[] = []; let cell = ''; let quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { cell += '"'; index += 1 } else quoted = !quoted } else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = '' } else cell += char }; cells.push(cell.trim()); return cells }
      const normalize = (value: string | undefined) => value?.replace(/^\uFEFF/, '').trim().toLowerCase() ?? ''
      const header = parse(lines[0]).map(normalize)
      const typeIndex = header.indexOf('master_type'); const valueIndex = header.indexOf('value')
      if (typeIndex < 0 || valueIndex < 0) throw new Error('CSV must contain master_type and value columns.')
      const rows = lines.slice(1).map(parse).filter(row => normalize(row[typeIndex]) !== 'master_type')
      const valid = rows.map(row => ({ type: row[typeIndex]?.trim() as SkuMasterType, value: row[valueIndex]?.trim() })).filter(row => types.includes(row.type) && row.value)
      if (valid.length === 0) throw new Error('No valid rows found. Use the SKU Configuration import with master_type and value columns.')
      if (!valid.length) throw new Error('No valid master rows found. Check the master_type values.')
      for (let index = 0; index < valid.length; index += 1) { await onAdd(valid[index].type, valid[index].value); setImportStatus({ fileName: file.name, progress: Math.round(((index + 1) / valid.length) * 100), state: 'uploading' }) }
      setImportStatus({ fileName: file.name, progress: 100, state: 'complete' })
    } catch (importError) { setImportStatus({ fileName: file.name, progress: 0, state: 'error', error: importError instanceof Error ? importError.message : 'Import failed.' }) }
  }
  return <div className="rounded-2xl border border-[#e0ddd5] bg-white"><div className="border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">SKU Configuration</h2><p className="mt-1 text-sm text-[#667078]">Manage the key and value options used when creating SKUs.</p></div><div className="flex flex-wrap items-center gap-3 border-b border-[#e0ddd5] p-4"><select value={type} onChange={event => onTypeChange(event.target.value as SkuMasterType)} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm">{types.map(item => <option key={item}>{item}</option>)}</select>{canEdit && <><input value={value} onChange={event => onValueChange(event.target.value)} placeholder={`Add ${type}`} className="h-11 min-w-56 rounded-lg border border-[#dedbd2] px-3 text-sm" /><button disabled={!value.trim()} onClick={async () => { await onAdd(type, value); onValueChange('') }} className="h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold disabled:opacity-50">Add value</button></>}<button onClick={download} className="h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">Export CSV</button>{canEdit && <label className="flex h-11 cursor-pointer items-center rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Import CSV<input type="file" accept=".csv,text/csv" onChange={importValues} className="sr-only" /></label>}</div><div className="overflow-x-auto border-b border-[#e0ddd5]"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr><th className="px-5 py-3 font-semibold">Key</th><th className="px-5 py-3 font-semibold">Value</th><th className="px-5 py-3 font-semibold">Action</th></tr></thead><tbody className="divide-y divide-[#eeeae1]">{values.length === 0 ? <tr><td colSpan={3} className="px-5 py-8 text-center text-[#667078]">No values configured for {type}.</td></tr> : values.map(item => <tr key={item.id} className="hover:bg-[#faf9f6]"><td className="px-5 py-3 font-medium text-[#52606a]">{item.master_type}</td><td className="px-5 py-3 font-semibold">{item.value}</td><td className="px-5 py-3">{canEdit ? <button type="button" onClick={() => onEditMaster(item.id, item.value)} className="font-semibold text-[#9b5e00] hover:underline">Edit</button> : <span className="text-[#8b9295]">View only</span>}</td></tr>)}</tbody></table></div>{importStatus && <div className={`mx-4 mt-4 rounded-xl border p-3 text-sm ${importStatus.state === 'error' ? 'border-[#e8c2b9] bg-[#fff1ed] text-[#b23a22]' : importStatus.state === 'complete' ? 'border-[#b7d6c5] bg-[#eaf5ee] text-[#23714a]' : 'border-[#dedbd2] bg-[#f8f7f3] text-[#667078]'}`}><div className="flex justify-between gap-3"><span>{importStatus.fileName}</span><span>{importStatus.state === 'error' ? importStatus.error : importStatus.state === 'complete' ? 'Imported successfully' : `Importing ${importStatus.progress}%`}</span></div>{importStatus.state !== 'error' && <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dedbd2]"><div className="h-full bg-[#f2a541] transition-all" style={{ width: `${importStatus.progress}%` }} /></div>}</div>}</div>
}

function SKUForm({ sku, masters, skus, onClose, onSubmit }: { sku: SKU | null; masters: SkuMasterValue[]; skus: SKU[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const options = (type: SkuMasterType) => Array.from(new Set(masters.filter(item => item.master_type === type && item.value.trim()).map(item => item.value.trim())))
  const fieldValue = (key: keyof SKU) => sku?.[key] == null ? undefined : String(sku[key])
  const nextSkuCode = sku?.code || `SV${Math.max(29768, ...skus.map(item => Number(item.code.match(/^SV(\d{5})$/)?.[1] || 0) + 1)).toString().padStart(5, '0')}`
  const MasterSelect = ({ label, name, type, required }: { label: string; name: string; type: SkuMasterType; required?: boolean }) => <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">{label}{required && ' *'}<select name={name} defaultValue={fieldValue(name as keyof SKU)} required={required} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option value="">Select {label.toLowerCase()}</option>{Array.from(new Set([...options(type), ...(fieldValue(name as keyof SKU) ? [fieldValue(name as keyof SKU) as string] : [])])).map(item => <option key={item}>{item}</option>)}</select></label>
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">{sku ? 'Edit SKU' : 'Create SKU'}</h2><p className="mt-1 text-xs text-[#667078]">{sku ? `Update ${sku.code} — values loaded from the database.` : 'Add a product to the master catalogue.'}</p></div><button type="button" aria-label="Close SKU form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-3"><Field label="SKU code" name="code" defaultValue={nextSkuCode} required readOnly={Boolean(sku)} /><Field label="SKU name" name="name" defaultValue={fieldValue('name')} required /><MasterSelect label="Category" name="category" type="Category" required /><MasterSelect label="Business line" name="business_line" type="Business line" required /><MasterSelect label="Sub-category" name="sub_category" type="Sub-category" /><MasterSelect label="Brand" name="brand" type="Brand" /><MasterSelect label="Model" name="model" type="Model" /><MasterSelect label="Specification" name="spec" type="Specification" /><Field label="Size" name="size" defaultValue={fieldValue('size')} /><MasterSelect label="GSM" name="gsm" type="GSM" /><MasterSelect label="Colour" name="colour" type="Colour" /><Field label="Weight (kg)" name="weight_kg" type="number" defaultValue={fieldValue('weight_kg')} /><Field label="Barcode" name="barcode" defaultValue={fieldValue('barcode')} /><Field label="UOM" name="uom" defaultValue={fieldValue('uom')} required /><Field label="Pack quantity" name="pack_qty" type="number" defaultValue={fieldValue('pack_qty') ?? '1'} required /><Field label="HSN (4–8 digits)" name="hsn" defaultValue={fieldValue('hsn')} inputMode="numeric" pattern="[0-9]{4,8}" required /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Status<select name="status" defaultValue={fieldValue('status') ?? 'Active'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Active</option><option>Discontinued</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">GST %<select name="gst_pct" defaultValue={fieldValue('gst_pct') ?? '18'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal">{Array.from(new Set([0,5,12,18,28, ...(sku ? [Number(sku.gst_pct)] : [])])).map(rate => <option key={rate} value={String(rate)}>{rate}</option>)}</select></label><Field label="Cess %" name="cess_pct" type="number" defaultValue={fieldValue('cess_pct') ?? '0'} /><Field label="Purchase rate" name="std_purchase_rate" type="number" defaultValue={fieldValue('std_purchase_rate')} /><Field label="Selling rate" name="std_selling_rate" type="number" defaultValue={fieldValue('std_selling_rate')} /><Field label="Minimum margin %" name="min_margin_pct" type="number" defaultValue={fieldValue('min_margin_pct') ?? '8'} /><Field label="MRP" name="mrp" type="number" defaultValue={fieldValue('mrp')} /><Field label="Opening quantity" name="opening_qty" type="number" defaultValue={fieldValue('opening_qty') ?? '0'} /><Field label="Opening rate" name="opening_rate" type="number" defaultValue={fieldValue('opening_rate') ?? '0'} /><Field label="Opening date" name="opening_date" type="date" defaultValue={fieldValue('opening_date')?.slice(0, 10)} /><Field label="Reorder level" name="reorder_level" type="number" defaultValue={fieldValue('reorder_level')} /><Field label="Reorder quantity" name="reorder_qty" type="number" defaultValue={fieldValue('reorder_qty')} /><Field label="Location" name="location" defaultValue={fieldValue('location')} /><div className="sm:col-span-3"><Field label="Notes" name="notes" defaultValue={fieldValue('notes')} /></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[#f2a541] px-4 py-2.5 text-sm font-bold text-[#0e1b2c]">{sku ? 'Update SKU' : 'Save SKU'}</button></div></form></div>
}

function VendorsView({ vendors, loading, error, onRefresh, onNew }: { vendors: Vendor[]; loading: boolean; error: string; onRefresh: () => void; onNew: () => void }) {
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><p className="text-sm text-[#667078]">Everyone you buy from: GST details, contacts, credit days and agreed terms.</p><div className="flex gap-2"><button onClick={onRefresh} className="min-h-11 rounded-lg border border-[#dedbd2] bg-white px-4 text-sm font-semibold">Refresh list</button><button onClick={onNew} className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">Add vendor</button></div></div>{error && <div className="mb-4 rounded-xl border border-[#e8c2b9] bg-[#fff1ed] p-4 text-sm text-[#b23a22]">{error}</div>}<div className="overflow-hidden rounded-2xl border border-[#e0ddd5] bg-white"><div className="flex items-center justify-between border-b border-[#e0ddd5] px-5 py-4"><h2 className="font-heading text-lg font-bold">Vendor master</h2><span className="text-xs text-[#667078]">{vendors.length} vendors</span></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#faf9f6] text-xs uppercase tracking-[0.12em] text-[#8b9295]"><tr>{['Code','Vendor','Business line','GSTIN','Primary contact','Billing emails','Credit days','Payment terms','Status'].map(item => <th key={item} className="px-5 py-3 font-semibold">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eeeae2]">{loading ? <tr><td colSpan={10} className="px-5 py-10 text-center text-[#667078]">Loading vendors…</td></tr> : vendors.map(vendor => <tr key={vendor.id} className="hover:bg-[#faf9f6]"><td className="px-5 py-4 font-mono text-xs">{vendor.vendor_code}</td><td className="px-5 py-4"><div className="font-semibold">{vendor.vendor_name}</div><div className="text-xs text-[#667078]">{vendor.city_state}</div></td><td className="px-5 py-4">{vendor.business_line}<div className="text-xs text-[#667078]">{vendor.vendor_type}</div></td><td className="px-5 py-4 font-mono text-xs">{vendor.gstin || <span className="text-[#9b5e00]">Add GSTIN</span>}</td><td className="px-5 py-4">{vendor.contact_person}<div className="text-xs text-[#667078]">{vendor.phone || 'No phone'}</div></td><td className="max-w-[240px] px-5 py-4 text-xs text-[#667078]">{vendor.billing_emails?.length ? vendor.billing_emails.join(', ') : '—'}</td><td className="px-5 py-4">{vendor.credit_days}</td><td className="max-w-48 truncate px-5 py-4">{vendor.payment_terms || <span className="text-[#9b5e00]">Add terms</span>}</td><td className="px-5 py-4">{vendor.status}</td></tr>)}</tbody></table></div></div></div>
}

function VendorForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">Add vendor</h2><p className="mt-1 text-xs text-[#667078]">Capture identity, tax, contact and commercial terms.</p></div><button type="button" aria-label="Close vendor form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Vendor code" name="vendor_code" required /><Field label="Vendor name" name="vendor_name" required /><Field label="Display name" name="display_name" /><Field label="City / State" name="city_state" required /><Field label="Business line" name="business_line" required /><Field label="Vendor type" name="vendor_type" required /><Field label="GSTIN" name="gstin" /><Field label="Contact person" name="contact_person" required /><Field label="Phone" name="phone" required /><Field label="Credit days" name="credit_days" type="number" defaultValue="30" required /><Field label="Payment terms" name="payment_terms" /><Field label="Billing emails" name="billing_emails" type="text" /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Status<select name="status" defaultValue="Active" className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Active</option><option>On hold</option><option>Blacklisted</option><option>Inactive</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a] sm:col-span-2">Internal notes<textarea name="notes" className="min-h-24 rounded-lg border border-[#dedbd2] px-3 py-2 text-sm font-normal" /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">Cancel</button><button className="min-h-11 rounded-lg bg-[#f2a541] px-4 text-sm font-bold text-[#0e1b2c]">Save vendor</button></div></form></div>
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

function LeadForm({ lead, customers, employees, uploadStatuses, onClose, onSubmit }: { lead: Lead | null; customers: Customer[]; employees: Employee[]; uploadStatuses: UploadStatus[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b2c]/50 p-4"><form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">{lead ? 'Edit lead' : 'New lead'}</h2><p className="mt-1 text-xs text-[#667078]">{lead ? 'Update the current lead details.' : 'Capture an enquiry and add it to the pipeline.'}</p></div><button type="button" aria-label="Close form" onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4f2ed]"><X size={20} /></button></div>{uploadStatuses.length > 0 && <div className="mb-5 rounded-xl border border-[#dedbd2] bg-[#faf9f6] p-4" role="status" aria-live="polite"><div className="mb-3 text-sm font-semibold">Uploading attachments</div><div className="flex flex-col gap-3">{uploadStatuses.map(status => <div key={status.fileName}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{status.fileName}</span><span>{status.state === 'uploading' ? `Uploading ${status.progress}%` : status.state === 'error' ? 'Failed' : 'Complete'}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eeeae1]"><div className={`h-full transition-[width] ${status.state === 'error' ? 'bg-[#b23a22]' : status.state === 'complete' ? 'bg-[#23714a]' : 'bg-[#f2a541]'}`} style={{ width: `${status.progress}%` }} /></div>{status.error && <div className="mt-1 text-xs text-[#b23a22]">{status.error}</div>}</div>)}</div></div>}<div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a] sm:col-span-2">Customer *<select name="customer_id" required defaultValue={lead?.customer_id || ''} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option value="">Select customer</option>{customers.filter(customer => customer.status === 'Active').map(customer => <option key={customer.id} value={customer.id}>{customer.customer_code} — {customer.customer_name}</option>)}</select><span className="text-[11px] font-normal text-[#8b9295]">Can&apos;t find a customer? Create one in Customer Master first.</span></label><Field label="Contact person" name="contact_person" defaultValue={lead?.contact_person || ''} /><Field label="Phone" name="phone" type="tel" defaultValue={lead?.phone || ''} /><Field label="Email" name="email" type="email" defaultValue={lead?.email || ''} /><Field label="Product or service" name="product" defaultValue={lead?.product} required /><Field label="Quantity" name="qty" type="number" defaultValue={String(lead?.qty ?? 1)} /><Field label="Unit" name="uom" defaultValue={lead?.uom || 'Units'} /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Owner<span className="flex h-11 items-center rounded-lg border border-[#dedbd2] bg-[#f7f6f2] px-3 text-sm font-normal">{lead?.owner_id ? employees.find(employee => employee.id === lead.owner_id)?.full_name || 'Current owner' : 'You (creator)'}</span></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Working person<select name="working_person_id" defaultValue={lead?.working_person_id || ''} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option value="">Select employee</option>{employees.filter(employee => employee.is_active).map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><Field label="Partner name" name="partner_name" defaultValue={lead?.partner_name || ''} /><Field label="Target selling rate" name="target_rate" type="number" defaultValue={String(lead?.target_rate ?? 0)} /><Field label="Expected buy rate" name="buy_rate" type="number" defaultValue={String(lead?.buy_rate ?? 0)} /><Field label="Expected vendor" name="expected_vendor" defaultValue={lead?.expected_vendor || ''} /><Field label="Next follow-up" name="next_follow_up" type="date" defaultValue={lead?.next_follow_up || ''} /><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Source<select name="source" defaultValue={lead?.source || 'Other'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Referral</option><option>Partner network</option><option>Website</option><option>Cold call</option><option>Existing customer</option><option>Other</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Business type<select name="business_type" defaultValue={lead?.business_type || 'Direct Sale'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal"><option>Direct Sale</option><option>Bill-to-Ship-to</option><option>Commission</option></select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Stage<select name="stage" defaultValue={lead?.stage || 'New'} className="h-11 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-normal">{stages.map(item => <option key={item}>{item}</option>)}</select></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a] sm:col-span-2">Notes<label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Attachments<input name="attachments" type="file" multiple className="rounded-lg border border-[#dedbd2] bg-white p-2 text-sm font-normal" /><span className="text-[11px] font-normal text-[#8b9295]">Private files, up to 10 MB each.</span></label><textarea name="notes" defaultValue={lead?.notes || ''} className="min-h-24 rounded-lg border border-[#dedbd2] p-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd2] px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[#0e1b2c] px-4 py-2.5 text-sm font-bold text-white">{lead ? 'Save changes' : 'Create lead'}</button></div></form></div> }
function Field({ label, name, type = 'text', defaultValue, required, inputMode, pattern, readOnly }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; pattern?: string; readOnly?: boolean }) { return <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">{label}{required && ' *'}<input required={required} name={name} type={type} defaultValue={defaultValue} inputMode={inputMode} pattern={pattern} readOnly={readOnly} aria-readonly={readOnly} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label> }
