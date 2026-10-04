import { createClient } from '@/lib/supabase/client'

export type AppRole = 'OWNER' | 'PARTNER' | 'VIEWER'

export type Company = {
  id: string
  code: string
  abbr: string
  legal_name: string
  trade_name: string | null
  entity_type: string | null
  logo_url: string | null
  cin: string | null
  incorporation_date: string | null
  gst_type: 'Regular' | 'Composition' | 'Unregistered'
  gstin: string | null
  pan: string | null
  tan: string | null
  msme_no: string | null
  iec: string | null
  state_name: string | null
  state_code: string | null
  reg_address: string | null
  city: string | null
  pin: string | null
  phone: string | null
  email: string | null
  website: string | null
  signatory_name: string | null
  signatory_designation: string | null
  default_payment_terms: string
  default_delivery_days: number
  tds_commission_pct: number
  doc_terms_text: string | null
  doc_footer_note: string | null
  show_bank_on_docs: boolean
  fy: string
  status: 'Active' | 'Inactive'
  sells: boolean
  buys: boolean
  is_default: boolean
  company_missing_fields: string[]
  company_document_blockers: string[]
}

export type BankAccount = {
  id: string
  company_id: string
  account_name: string
  bank_name: string
  branch: string | null
  account_no_last4: string
  ifsc: string
  upi_id: string | null
  is_default: boolean
}

export type CompanyLocation = {
  id: string
  company_id: string
  name: string
  line1: string
  line2: string | null
  city: string
  state: string
  state_code: string
  pin: string
  contact_name: string
  contact_phone: string
  gstin: string | null
  is_default: boolean
}

export type DocumentSeries = {
  id: string
  doc_type: 'PO' | 'PI' | 'SO' | 'SI' | 'CN'
  prefix: string
  next_number: number
  start_number: number
}

export const ENTITY_TYPES = ['Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'OPC'] as const
export const GST_TYPES = ['Regular', 'Composition', 'Unregistered'] as const

export const DOC_TYPE_LABELS: Record<DocumentSeries['doc_type'], string> = {
  PO: 'Purchase order',
  PI: 'Purchase invoice',
  SO: 'Sales order',
  SI: 'Sales invoice',
  CN: 'Credit note',
}

export const FIELD_LABELS: Record<string, string> = {
  code: 'company code',
  legal_name: 'legal name',
  entity_type: 'entity type',
  cin: 'CIN',
  gstin: 'GSTIN',
  pan: 'PAN',
  state: 'state',
  reg_address: 'registered address',
  city: 'city',
  pin: 'PIN code',
  phone: 'phone',
  email: 'email',
  signatory_name: 'authorised signatory',
}

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' }, { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' }, { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' }, { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' }, { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' }, { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' }, { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' }, { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' }, { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' }, { code: '38', name: 'Ladakh' },
]

export const stateName = (code: string | null) => INDIAN_STATES.find(state => state.code === code)?.name ?? null

const COMPANY_COLUMNS =
  'id,code,abbr,legal_name,trade_name,entity_type,logo_url,cin,incorporation_date,gst_type,gstin,pan,tan,msme_no,iec,state_name,state_code,reg_address,city,pin,phone,email,website,signatory_name,signatory_designation,default_payment_terms,default_delivery_days,tds_commission_pct,doc_terms_text,doc_footer_note,show_bank_on_docs,fy,status,sells,buys,is_default,company_missing_fields,company_document_blockers'

const throwOn = <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => {
  if (error) throw new Error(error.message)
  return data as T
}

export async function fetchCompanies() {
  return throwOn<Company[]>(
    await createClient().from('companies').select(COMPANY_COLUMNS).order('is_default', { ascending: false }).order('legal_name'),
  )
}

export async function fetchCompany(id: string) {
  return throwOn<Company>(await createClient().from('companies').select(COMPANY_COLUMNS).eq('id', id).single())
}

export async function fetchBankAccounts(companyId: string) {
  return throwOn<BankAccount[]>(
    await createClient()
      .from('company_bank_accounts')
      .select('id,company_id,account_name,bank_name,branch,account_no_last4,ifsc,upi_id,is_default')
      .eq('company_id', companyId)
      .order('created_at'),
  )
}

export async function fetchLocations(companyId: string) {
  return throwOn<CompanyLocation[]>(
    await createClient()
      .from('delivery_locations')
      .select('id,company_id,name,line1,line2,city,state,state_code,pin,contact_name,contact_phone,gstin,is_default')
      .eq('company_id', companyId)
      .eq('owner_type', 'COMPANY')
      .order('created_at'),
  )
}

export async function fetchSeries(companyId: string) {
  const order = ['PO', 'PI', 'SO', 'SI', 'CN']
  const rows = throwOn<DocumentSeries[]>(
    await createClient().from('document_series').select('id,doc_type,prefix,next_number,start_number').eq('company_id', companyId),
  )
  return rows.sort((a, b) => order.indexOf(a.doc_type) - order.indexOf(b.doc_type))
}

export async function fetchSession() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null
  const [{ data: employee }, { data: role }] = await Promise.all([
    supabase.from('employees').select('full_name,is_active').eq('id', session.user.id).maybeSingle(),
    supabase.rpc('app_role'),
  ])
  if (!employee?.is_active) return null
  return { name: employee.full_name as string, role: (role ?? 'VIEWER') as AppRole }
}

export const emptyToNull = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}
