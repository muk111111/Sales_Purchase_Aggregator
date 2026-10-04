'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import { fetchCompanies, fetchLocations, INDIAN_STATES, type Company } from '@/lib/companies'
import {
  computeLine,
  computeTotals,
  createPo,
  defaultAnnexureTerms,
  fetchPartners,
  fetchSkus,
  fetchTermsTemplates,
  fetchVendors,
  formatInr,
  GST_RATES,
  gstModeFor,
  hsnLooksValid,
  PAYMENT_BASIS_OPTIONS,
  paymentTermsText,
  updatePo,
  type PaymentBasis,
  type PoDetail,
  type PurchaseType,
  type ShipTo,
  type Sku,
} from '@/lib/purchases'
import { PoDocument } from '@/components/purchases/po-document'

type DraftLine = {
  key: string
  sku_id: string
  item_name: string
  description: string
  hsn: string
  qty: string
  unit: string
  rate: string
  discount_pct: string
  gst_pct: string
}

type ShipToDraft = Record<keyof ShipTo, string>

type Draft = {
  company_id: string
  po_date: string
  vendor_id: string
  vendor_quotation_ref: string
  purchase_type: PurchaseType
  linked_sales_invoice_no: string
  partner_id: string
  subject: string
  intro_text: string
  internal_notes: string
  ship_to: ShipToDraft
  ship_to_location_id: string
  payment_basis: PaymentBasis
  payment_days: string
  advance_pct: string
  payment_custom_text: string
  delivery_days: string
  annexure_enabled: boolean
  annexure_heading: string
  annexure_terms: string[]
  annexure_custom: boolean
  round_off_enabled: boolean
  lines: DraftLine[]
}

const EMPTY_SHIP_TO: ShipToDraft = {
  name: '', line1: '', line2: '', city: '', state: '', state_code: '', pin: '', contact_name: '', contact_phone: '', gstin: '',
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()))
const today = () => new Date().toLocaleDateString('en-CA')
const num = (value: string) => (value.trim() === '' ? 0 : Number(value))

const blankLine = (): DraftLine => ({
  key: newKey(), sku_id: '', item_name: '', description: '', hsn: '', qty: '1', unit: '', rate: '', discount_pct: '', gst_pct: '18',
})

const lineFromSku = (sku: Sku): DraftLine => ({
  ...blankLine(),
  sku_id: sku.id,
  item_name: sku.name,
  hsn: sku.hsn ?? '',
  unit: sku.uom ?? 'Nos',
  rate: sku.std_purchase_rate ? String(sku.std_purchase_rate) : '',
  gst_pct: String(sku.gst_pct ?? 18),
})

function draftFromPo(po: PoDetail, duplicate: boolean): Draft {
  const shipTo = { ...EMPTY_SHIP_TO }
  for (const key of Object.keys(EMPTY_SHIP_TO) as (keyof ShipTo)[]) shipTo[key] = String(po.ship_to?.[key] ?? '')
  return {
    company_id: po.company_id,
    po_date: duplicate ? today() : po.po_date,
    vendor_id: po.vendor_id,
    vendor_quotation_ref: duplicate ? '' : po.vendor_quotation_ref ?? '',
    purchase_type: po.purchase_type,
    linked_sales_invoice_no: duplicate ? '' : po.linked_sales_invoice_no ?? '',
    partner_id: po.partner_id ?? '',
    subject: po.subject,
    intro_text: po.intro_text ?? '',
    internal_notes: duplicate ? '' : po.internal_notes ?? '',
    ship_to: shipTo,
    ship_to_location_id: po.ship_to_location_id ?? '',
    payment_basis: po.payment_basis,
    payment_days: String(po.payment_days),
    advance_pct: po.advance_pct === null ? '' : String(po.advance_pct),
    payment_custom_text: po.payment_basis === 'CUSTOM' ? po.payment_terms_text : '',
    delivery_days: String(po.delivery_days),
    annexure_enabled: po.annexure_enabled,
    annexure_heading: po.annexure_heading,
    annexure_terms: po.annexure_terms,
    annexure_custom: true,
    round_off_enabled: po.round_off_enabled,
    lines: po.lines.map(line => ({
      key: newKey(),
      sku_id: line.sku_id,
      item_name: line.item_name,
      description: line.description ?? '',
      hsn: line.hsn,
      qty: String(line.qty),
      unit: line.unit,
      rate: String(line.rate),
      discount_pct: line.discount_pct ? String(line.discount_pct) : '',
      gst_pct: String(line.gst_pct),
    })),
  }
}

const blankDraft = (): Draft => ({
  company_id: '',
  po_date: today(),
  vendor_id: '',
  vendor_quotation_ref: '',
  purchase_type: 'STOCK',
  linked_sales_invoice_no: '',
  partner_id: '',
  subject: 'Purchase Order',
  intro_text: '',
  internal_notes: '',
  ship_to: { ...EMPTY_SHIP_TO },
  ship_to_location_id: '',
  payment_basis: 'DELIVERY',
  payment_days: '45',
  advance_pct: '',
  payment_custom_text: '',
  delivery_days: '5',
  annexure_enabled: true,
  annexure_heading: 'Annexure A',
  annexure_terms: [],
  annexure_custom: false,
  round_off_enabled: false,
  lines: [blankLine()],
})

type StoredDraft = { savedAt: string; draft: Draft }

function readStoredDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredDraft) : null
  } catch {
    return null
  }
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 text-sm text-[#142033] disabled:bg-[#f6f4ee] disabled:text-[#667078]'

function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-[#667078]">{hint}</span>}
    </label>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[#dedbd2] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-semibold tracking-widest text-[#667078] uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SkuPicker({ skus, open, onClose, onAdd }: { skus: Sku[]; open: boolean; onClose: () => void; onAdd: (skus: Sku[]) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const visible = skus.filter(sku => `${sku.code} ${sku.name}`.toLowerCase().includes(query.trim().toLowerCase()))
  const close = () => {
    setQuery('')
    setSelected(new Set())
    onClose()
  }
  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      aria-labelledby="sku-picker-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-[#dedbd2] bg-white p-0 text-[#142033] backdrop:bg-[#142033]/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="sku-picker-title" className="font-heading text-xl font-bold">
          Add SKUs
        </h2>
        <label className="relative">
          <span className="sr-only">Search SKUs</span>
          <Search size={16} aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-[#667078]" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code or name" className={`${inputClass} pl-9`} />
        </label>
        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-[#dedbd2]">
          {visible.length === 0 && <li className="p-4 text-sm text-[#667078]">No SKUs match.</li>}
          {visible.map(sku => (
            <li key={sku.id} className="border-b border-[#eeeae1] last:border-0">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-[#f6f4ee]">
                <input type="checkbox" checked={selected.has(sku.id)} onChange={() => toggle(sku.id)} className="size-4" />
                <span className="font-mono text-xs text-[#667078]">{sku.code}</span>
                <span className="flex-1">{sku.name}</span>
                <span className="font-mono text-xs text-[#667078]">{sku.gst_pct ?? '—'}%</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="min-h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">
            Close
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => {
              onAdd(skus.filter(sku => selected.has(sku.id)))
              close()
            }}
            className="min-h-11 rounded-lg bg-[#142033] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            Add {selected.size || ''} {selected.size === 1 ? 'line' : 'lines'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export function PoForm({ source, mode }: { source: PoDetail | null; mode: 'new' | 'edit' | 'duplicate' }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const storageKey = mode === 'edit' && source ? `po-draft:${source.id}` : 'po-draft:new'

  const [restored] = useState<StoredDraft | null>(() => (mode === 'duplicate' ? null : readStoredDraft(storageKey)))
  const [draft, setDraft] = useState<Draft>(() => restored?.draft ?? (source ? draftFromPo(source, mode === 'duplicate') : blankDraft()))
  const [showRestored, setShowRestored] = useState(Boolean(restored))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [view, setView] = useState<'form' | 'preview'>('form')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = useRef(Boolean(restored))

  const { data: companies } = useSWR('companies', fetchCompanies)
  const { data: vendors } = useSWR('vendors', fetchVendors)
  const { data: skus = [] } = useSWR('skus', fetchSkus)
  const { data: partners = [] } = useSWR('partners', fetchPartners)

  const purchasingCompanies = (companies ?? []).filter(company => company.buys && company.status === 'Active')
  const companyId = draft.company_id || purchasingCompanies.find(company => company.is_default)?.id || purchasingCompanies[0]?.id || ''
  const company: Company | null = companies?.find(item => item.id === companyId) ?? null

  const { data: locations = [] } = useSWR(companyId ? ['locations', companyId] : null, () => fetchLocations(companyId))
  const { data: templates = [] } = useSWR(companyId ? ['terms-templates', companyId] : null, () => fetchTermsTemplates(companyId))

  const vendor = vendors?.find(item => item.id === draft.vendor_id) ?? null
  const vendorOptions = (vendors ?? []).filter(item => item.status === 'Active' || item.id === source?.vendor_id)
  const gstMode = gstModeFor(company?.state_code, vendor)

  useEffect(() => {
    if (!dirty.current) return
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: new Date().toISOString(), draft } satisfies StoredDraft))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, storageKey])

  const update = (patch: Partial<Draft>) => {
    dirty.current = true
    setDraft(current => ({ ...current, ...patch }))
  }
  const updateShipTo = (patch: Partial<ShipToDraft>) => {
    dirty.current = true
    setDraft(current => ({ ...current, ship_to: { ...current.ship_to, ...patch }, ship_to_location_id: '' }))
  }
  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    dirty.current = true
    setDraft(current => ({ ...current, lines: current.lines.map(line => (line.key === key ? { ...line, ...patch } : line)) }))
  }
  const moveLine = (index: number, offset: number) => {
    dirty.current = true
    setDraft(current => {
      const lines = [...current.lines]
      const [line] = lines.splice(index, 1)
      lines.splice(index + offset, 0, line)
      return { ...current, lines }
    })
  }

  const paymentDays = num(draft.payment_days)
  const deliveryDays = num(draft.delivery_days)
  const advancePct = draft.advance_pct.trim() === '' ? null : num(draft.advance_pct)
  const termsText = paymentTermsText(draft.payment_basis, paymentDays, advancePct, draft.payment_custom_text)
  const annexureTerms = draft.annexure_custom ? draft.annexure_terms : defaultAnnexureTerms(deliveryDays, termsText)

  const computedLines = useMemo(
    () =>
      draft.lines.map(line => {
        const sku = skus.find(item => item.id === line.sku_id)
        const amounts = computeLine(num(line.qty), num(line.rate), num(line.discount_pct), num(line.gst_pct))
        return { line, sku, ...amounts }
      }),
    [draft.lines, skus],
  )
  const totals = computeTotals(
    computedLines.map(item => ({ taxable: item.taxable, gstAmount: item.gstAmount, gstPct: num(item.line.gst_pct) })),
    gstMode,
    draft.round_off_enabled,
  )

  const discardRestored = () => {
    window.localStorage.removeItem(storageKey)
    dirty.current = false
    setShowRestored(false)
    setDraft(source ? draftFromPo(source, false) : blankDraft())
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      company_id: companyId,
      po_date: draft.po_date,
      vendor_id: draft.vendor_id,
      vendor_quotation_ref: draft.vendor_quotation_ref,
      purchase_type: draft.purchase_type,
      linked_sales_invoice_no: draft.linked_sales_invoice_no,
      partner_id: draft.partner_id,
      subject: draft.subject,
      intro_text: draft.intro_text,
      internal_notes: draft.internal_notes,
      ship_to: draft.ship_to,
      ship_to_location_id: draft.ship_to_location_id,
      payment_basis: draft.payment_basis,
      payment_days: draft.payment_days,
      advance_pct: draft.advance_pct,
      payment_custom_text: draft.payment_custom_text,
      delivery_days: draft.delivery_days,
      annexure_enabled: draft.annexure_enabled,
      annexure_heading: draft.annexure_heading,
      annexure_terms: annexureTerms,
      round_off_enabled: draft.round_off_enabled,
      lines: draft.lines.map(line => ({
        sku_id: line.sku_id,
        item_name: line.item_name,
        description: line.description,
        hsn: line.hsn,
        qty: line.qty,
        unit: line.unit,
        rate: line.rate,
        discount_pct: line.discount_pct,
        gst_pct: line.gst_pct,
      })),
    }
    try {
      const result = mode === 'edit' && source ? await updatePo(source.id, payload) : await createPo(payload)
      window.localStorage.removeItem(storageKey)
      dirty.current = false
      await Promise.all([mutate('po-list'), mutate(['po', result.id])])
      router.push(`/purchases/po/${result.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the PO')
      setSaving(false)
    }
  }

  const preview = (
    <PoDocument
      data={{
        number: mode === 'edit' ? source?.number ?? null : null,
        po_date: draft.po_date,
        subject: draft.subject,
        intro_text: draft.intro_text || null,
        company,
        vendor,
        vendor_quotation_ref: draft.vendor_quotation_ref || null,
        purchase_type: draft.purchase_type,
        linked_sales_invoice_no: draft.linked_sales_invoice_no || null,
        ship_to: draft.ship_to,
        lines: computedLines.map(({ line, sku, taxable, gstAmount, lineTotal }) => ({
          sku_code: sku?.code ?? '',
          item_name: line.item_name,
          description: line.description && line.description !== line.item_name ? line.description : null,
          hsn: line.hsn,
          qty: num(line.qty),
          unit: line.unit,
          rate: num(line.rate),
          discount_pct: num(line.discount_pct),
          taxable,
          gst_pct: num(line.gst_pct),
          gst_amount: gstAmount,
          line_total: lineTotal,
        })),
        totals,
        gst_mode: gstMode,
        payment_terms_text: termsText,
        delivery_days: deliveryDays,
        annexure_enabled: draft.annexure_enabled,
        annexure_heading: draft.annexure_heading,
        annexure_terms: annexureTerms.filter(term => term.trim()),
      }}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      {showRestored && restored && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8d3a8] bg-[#fdf5e6] px-4 py-3 text-sm">
          <span>
            Restored your unsaved changes from{' '}
            {new Date(restored.savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setShowRestored(false)} className="min-h-9 rounded-lg px-3 font-semibold">
              Keep
            </button>
            <button type="button" onClick={discardRestored} className="min-h-9 rounded-lg border border-[#dedbd2] bg-white px-3 font-semibold">
              Discard
            </button>
          </span>
        </div>
      )}

      <div role="tablist" aria-label="Form or preview" className="flex w-fit rounded-lg border border-[#dedbd2] bg-white p-1 xl:hidden">
        {(['form', 'preview'] as const).map(option => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={`min-h-9 rounded-md px-4 text-sm font-semibold capitalize ${view === option ? 'bg-[#142033] text-white' : 'text-[#667078]'}`}
          >
            {option === 'form' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <form onSubmit={handleSubmit} className={`flex-col gap-5 ${view === 'form' ? 'flex' : 'hidden xl:flex'}`}>
          <fieldset disabled={saving} className="flex flex-col gap-5">
            <Section title="Order">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company" hint={mode === 'edit' ? 'Fixed once the PO number is issued.' : undefined}>
                  <select
                    required
                    value={companyId}
                    disabled={mode === 'edit'}
                    onChange={event => update({ company_id: event.target.value, ship_to_location_id: '' })}
                    className={inputClass}
                  >
                    {purchasingCompanies.length === 0 && <option value="">No purchasing company set up</option>}
                    {purchasingCompanies.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.abbr} · {item.legal_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="PO date">
                  <input type="date" required value={draft.po_date} onChange={event => update({ po_date: event.target.value })} className={inputClass} />
                </Field>
                <Field
                  label="Vendor"
                  className="sm:col-span-2"
                  hint={
                    vendor ? (
                      <span className="flex flex-col">
                        <span>{[vendor.address, vendor.city_state].filter(Boolean).join(', ') || 'No address on file'}</span>
                        <span className="font-mono">
                          GSTIN {vendor.gstin ?? '—'} · {gstMode === 'IGST' ? 'IGST (inter-state)' : 'CGST + SGST (same state)'}
                        </span>
                      </span>
                    ) : (
                      'Only active vendors are listed.'
                    )
                  }
                >
                  <select required value={draft.vendor_id} onChange={event => update({ vendor_id: event.target.value })} className={inputClass}>
                    <option value="">Select vendor</option>
                    {vendorOptions.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.vendor_name}
                        {item.status !== 'Active' ? ` (${item.status})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Vendor quotation ref">
                  <input value={draft.vendor_quotation_ref} onChange={event => update({ vendor_quotation_ref: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Partner / owner">
                  <select value={draft.partner_id} onChange={event => update({ partner_id: event.target.value })} className={inputClass}>
                    <option value="">None</option>
                    {partners.map(partner => (
                      <option key={partner.id} value={partner.id}>
                        {partner.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Purchase type">
                  <select
                    value={draft.purchase_type}
                    onChange={event => update({ purchase_type: event.target.value as PurchaseType })}
                    className={inputClass}
                  >
                    <option value="STOCK">Stock</option>
                    <option value="BILL_TO_SHIP_TO">Bill to Ship to</option>
                  </select>
                </Field>
                {draft.purchase_type === 'BILL_TO_SHIP_TO' && (
                  <Field label="Linked sales invoice">
                    <input
                      required
                      value={draft.linked_sales_invoice_no}
                      onChange={event => update({ linked_sales_invoice_no: event.target.value })}
                      className={`${inputClass} font-mono uppercase`}
                    />
                  </Field>
                )}
                <Field label="Subject" className="sm:col-span-2">
                  <input value={draft.subject} onChange={event => update({ subject: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Intro text" className="sm:col-span-2">
                  <textarea
                    rows={2}
                    value={draft.intro_text}
                    placeholder="Dear Sir/Madam, we are pleased to place our order for the following items."
                    onChange={event => update({ intro_text: event.target.value })}
                    className={`${inputClass} py-2`}
                  />
                </Field>
                <Field label="Internal notes" hint="Not printed on the PO." className="sm:col-span-2">
                  <textarea rows={2} value={draft.internal_notes} onChange={event => update({ internal_notes: event.target.value })} className={`${inputClass} py-2`} />
                </Field>
              </div>
            </Section>

            <Section
              title="Ship to"
              action={
                locations.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Saved location</span>
                    <select
                      value={draft.ship_to_location_id}
                      onChange={event => {
                        const location = locations.find(item => item.id === event.target.value)
                        if (!location) return update({ ship_to_location_id: '' })
                        update({
                          ship_to_location_id: location.id,
                          ship_to: {
                            name: location.name,
                            line1: location.line1,
                            line2: location.line2 ?? '',
                            city: location.city,
                            state: location.state,
                            state_code: location.state_code,
                            pin: location.pin,
                            contact_name: location.contact_name,
                            contact_phone: location.contact_phone,
                            gstin: location.gstin ?? '',
                          },
                        })
                      }}
                      className="min-h-9 rounded-lg border border-[#dedbd2] bg-white px-2 text-sm"
                    >
                      <option value="">Pick a saved location…</option>
                      {locations.map(location => (
                        <option key={location.id} value={location.id}>
                          {location.name} · {location.city}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Location name" className="sm:col-span-2">
                  <input required value={draft.ship_to.name} onChange={event => updateShipTo({ name: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Address line 1">
                  <input required value={draft.ship_to.line1} onChange={event => updateShipTo({ line1: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Address line 2">
                  <input value={draft.ship_to.line2} onChange={event => updateShipTo({ line2: event.target.value })} className={inputClass} />
                </Field>
                <Field label="City">
                  <input required value={draft.ship_to.city} onChange={event => updateShipTo({ city: event.target.value })} className={inputClass} />
                </Field>
                <Field label="State">
                  <select
                    required
                    value={draft.ship_to.state_code}
                    onChange={event => {
                      const state = INDIAN_STATES.find(item => item.code === event.target.value)
                      updateShipTo({ state_code: state?.code ?? '', state: state?.name ?? '' })
                    }}
                    className={inputClass}
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map(state => (
                      <option key={state.code} value={state.code}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="PIN code">
                  <input
                    required
                    inputMode="numeric"
                    pattern="[1-9][0-9]{5}"
                    maxLength={6}
                    value={draft.ship_to.pin}
                    onChange={event => updateShipTo({ pin: event.target.value })}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label="Consignee GSTIN" hint="Optional.">
                  <input
                    maxLength={15}
                    value={draft.ship_to.gstin}
                    onChange={event => updateShipTo({ gstin: event.target.value.toUpperCase() })}
                    className={`${inputClass} font-mono uppercase`}
                  />
                </Field>
                <Field label="Contact person">
                  <input required value={draft.ship_to.contact_name} onChange={event => updateShipTo({ contact_name: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Contact phone">
                  <input
                    required
                    type="tel"
                    value={draft.ship_to.contact_phone}
                    onChange={event => updateShipTo({ contact_phone: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title={`Line items (${draft.lines.length})`}
              action={
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[#dedbd2] px-3 text-sm font-semibold"
                  >
                    <Plus size={15} aria-hidden="true" /> Add multiple SKUs
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ lines: [...draft.lines, blankLine()] })}
                    className="flex min-h-9 items-center gap-1.5 rounded-lg bg-[#142033] px-3 text-sm font-bold text-white"
                  >
                    <Plus size={15} aria-hidden="true" /> Add line
                  </button>
                </span>
              }
            >
              <ol className="flex flex-col gap-3">
                {computedLines.map(({ line, sku, taxable, gstAmount, lineTotal }, index) => (
                  <li key={line.key} className="flex flex-col gap-3 rounded-lg border border-[#dedbd2] bg-[#fbfaf7] p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <span className="flex h-11 w-8 items-center font-mono text-sm font-semibold text-[#667078]">{index + 1}</span>
                      <Field label="SKU" className="min-w-48 flex-1">
                        <select
                          required
                          value={line.sku_id}
                          onChange={event => {
                            const picked = skus.find(item => item.id === event.target.value)
                            if (!picked) return updateLine(line.key, { sku_id: '' })
                            const filled = lineFromSku(picked)
                            updateLine(line.key, {
                              sku_id: picked.id,
                              item_name: filled.item_name,
                              hsn: filled.hsn,
                              unit: filled.unit,
                              gst_pct: filled.gst_pct,
                              rate: line.rate || filled.rate,
                            })
                          }}
                          className={inputClass}
                        >
                          <option value="">Select SKU</option>
                          {skus.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <span className="flex gap-1">
                        <button type="button" aria-label={`Move line ${index + 1} up`} disabled={index === 0} onClick={() => moveLine(index, -1)} className="flex size-11 items-center justify-center rounded-lg border border-[#dedbd2] bg-white disabled:opacity-40">
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`Move line ${index + 1} down`} disabled={index === draft.lines.length - 1} onClick={() => moveLine(index, 1)} className="flex size-11 items-center justify-center rounded-lg border border-[#dedbd2] bg-white disabled:opacity-40">
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate line ${index + 1}`}
                          onClick={() => {
                            const lines = [...draft.lines]
                            lines.splice(index + 1, 0, { ...line, key: newKey() })
                            update({ lines })
                          }}
                          className="flex size-11 items-center justify-center rounded-lg border border-[#dedbd2] bg-white"
                        >
                          <Copy size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete line ${index + 1}`}
                          disabled={draft.lines.length === 1}
                          onClick={() => update({ lines: draft.lines.filter(item => item.key !== line.key) })}
                          className="flex size-11 items-center justify-center rounded-lg border border-[#dedbd2] bg-white text-[#a33b2b] disabled:opacity-40"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Item name">
                        <input required value={line.item_name} onChange={event => updateLine(line.key, { item_name: event.target.value })} className={inputClass} />
                      </Field>
                      <Field label="Description" hint="Printed only if different from the item name.">
                        <input value={line.description} onChange={event => updateLine(line.key, { description: event.target.value })} className={inputClass} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                      <Field
                        label="HSN"
                        hint={
                          line.hsn && !hsnLooksValid(line.hsn) ? (
                            <span className="flex items-center gap-1 text-[#9a6206]">
                              <TriangleAlert size={12} aria-hidden="true" /> Usually 4, 6 or 8 digits
                            </span>
                          ) : undefined
                        }
                      >
                        <input
                          required
                          inputMode="numeric"
                          value={line.hsn}
                          onChange={event => updateLine(line.key, { hsn: event.target.value.replace(/\s/g, '') })}
                          className={`${inputClass} font-mono`}
                        />
                      </Field>
                      <Field label="Qty">
                        <input required type="number" min="0.001" step="any" value={line.qty} onChange={event => updateLine(line.key, { qty: event.target.value })} className={`${inputClass} font-mono`} />
                      </Field>
                      <Field label="Unit">
                        <input required value={line.unit} onChange={event => updateLine(line.key, { unit: event.target.value })} className={inputClass} />
                      </Field>
                      <Field label="Rate (ex-tax)">
                        <input required type="number" min="0" step="0.01" value={line.rate} onChange={event => updateLine(line.key, { rate: event.target.value })} className={`${inputClass} font-mono`} />
                      </Field>
                      <Field label="Disc %">
                        <input type="number" min="0" max="100" step="0.01" value={line.discount_pct} onChange={event => updateLine(line.key, { discount_pct: event.target.value })} className={`${inputClass} font-mono`} />
                      </Field>
                      <Field label="GST %">
                        <select value={line.gst_pct} onChange={event => updateLine(line.key, { gst_pct: event.target.value })} className={`${inputClass} font-mono`}>
                          {GST_RATES.map(rate => (
                            <option key={rate} value={rate}>
                              {rate}%
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <dl className="flex flex-wrap justify-end gap-x-6 gap-y-1 font-mono text-sm">
                      {sku && (
                        <div className="mr-auto flex gap-2">
                          <dt className="text-[#667078]">SKU</dt>
                          <dd>{sku.code}</dd>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <dt className="text-[#667078]">Taxable</dt>
                        <dd>{formatInr(taxable)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-[#667078]">GST</dt>
                        <dd>{formatInr(gstAmount)}</dd>
                      </div>
                      <div className="flex gap-2 font-semibold">
                        <dt className="text-[#667078]">Total</dt>
                        <dd>{formatInr(lineTotal)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.round_off_enabled} onChange={event => update({ round_off_enabled: event.target.checked })} className="size-4" />
                Round off the total to the nearest rupee
              </label>
            </Section>

            <Section title="Payment & delivery">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Payment terms">
                  <select
                    value={draft.payment_basis}
                    onChange={event => update({ payment_basis: event.target.value as PaymentBasis })}
                    className={inputClass}
                  >
                    {PAYMENT_BASIS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {['DELIVERY', 'PO_DATE', 'INVOICE_DATE', 'ADVANCE_BALANCE'].includes(draft.payment_basis) && (
                  <Field label="Credit days">
                    <input type="number" min={0} max={365} required value={draft.payment_days} onChange={event => update({ payment_days: event.target.value })} className={inputClass} />
                  </Field>
                )}
                {draft.payment_basis === 'ADVANCE_BALANCE' && (
                  <Field label="Advance %">
                    <input type="number" min={1} max={99} required value={draft.advance_pct} onChange={event => update({ advance_pct: event.target.value })} className={inputClass} />
                  </Field>
                )}
                {draft.payment_basis === 'CUSTOM' && (
                  <Field label="Custom terms" className="sm:col-span-2">
                    <input required value={draft.payment_custom_text} onChange={event => update({ payment_custom_text: event.target.value })} className={inputClass} />
                  </Field>
                )}
                <Field label="Delivery days">
                  <input type="number" min={0} max={365} required value={draft.delivery_days} onChange={event => update({ delivery_days: event.target.value })} className={inputClass} />
                </Field>
                <p className="rounded-lg bg-[#f6f4ee] px-3 py-2 text-sm leading-relaxed text-[#3b4654] sm:col-span-2">{termsText}</p>
              </div>
            </Section>

            <Section
              title="Annexure"
              action={
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={draft.annexure_enabled} onChange={event => update({ annexure_enabled: event.target.checked })} className="size-4" />
                  Print annexure
                </label>
              }
            >
              {draft.annexure_enabled && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Heading" className="min-w-48 flex-1">
                      <input value={draft.annexure_heading} onChange={event => update({ annexure_heading: event.target.value })} className={inputClass} />
                    </Field>
                    {templates.length > 0 && (
                      <Field label="Template">
                        <select
                          value=""
                          onChange={event => {
                            const template = templates.find(item => item.id === event.target.value)
                            if (template) update({ annexure_heading: template.heading, annexure_terms: template.terms, annexure_custom: true })
                          }}
                          className={inputClass}
                        >
                          <option value="">Apply template…</option>
                          {templates.map(template => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {draft.annexure_custom && (
                      <button type="button" onClick={() => update({ annexure_custom: false, annexure_heading: 'Annexure A' })} className="min-h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-semibold">
                        Reset to defaults
                      </button>
                    )}
                  </div>
                  {!draft.annexure_custom && (
                    <p className="text-xs leading-relaxed text-[#667078]">Default terms follow the delivery days and payment terms above. Editing a term keeps your wording.</p>
                  )}
                  <ol className="flex flex-col gap-2">
                    {annexureTerms.map((term, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="flex h-11 w-6 items-center font-mono text-sm text-[#667078]">{index + 1}.</span>
                        <label className="flex-1">
                          <span className="sr-only">Term {index + 1}</span>
                          <textarea
                            rows={2}
                            value={term}
                            onChange={event => {
                              const terms = [...annexureTerms]
                              terms[index] = event.target.value
                              update({ annexure_terms: terms, annexure_custom: true })
                            }}
                            className={`${inputClass} py-2`}
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`Remove term ${index + 1}`}
                          onClick={() => update({ annexure_terms: annexureTerms.filter((_, position) => position !== index), annexure_custom: true })}
                          className="flex size-11 items-center justify-center rounded-lg border border-[#dedbd2] bg-white text-[#a33b2b]"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={() => update({ annexure_terms: [...annexureTerms, ''], annexure_custom: true })}
                    className="flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-[#dedbd2] px-3 text-sm font-semibold"
                  >
                    <Plus size={15} aria-hidden="true" /> Add term
                  </button>
                </div>
              )}
            </Section>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
              {error}
            </p>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dedbd2] bg-white/95 p-4 backdrop-blur">
            <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm">
              <div className="flex gap-2">
                <dt className="text-[#667078]">Taxable</dt>
                <dd>{formatInr(totals.taxable)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[#667078]">{gstMode === 'IGST' ? 'IGST' : 'CGST+SGST'}</dt>
                <dd>{formatInr(totals.tax)}</dd>
              </div>
              <div className="flex gap-2 font-bold">
                <dt className="text-[#667078]">Total</dt>
                <dd>₹ {formatInr(totals.grandTotal)}</dd>
              </div>
            </dl>
            <span className="flex gap-2">
              <button type="button" onClick={() => router.back()} className="min-h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">
                Back
              </button>
              <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-[#f2a541] px-6 text-sm font-bold text-[#0e1b2c] disabled:opacity-60">
                {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save & issue number'}
              </button>
            </span>
          </div>
        </form>

        <aside aria-label="Live PO preview" className={`xl:sticky xl:top-6 xl:block xl:self-start ${view === 'preview' ? 'block' : 'hidden'}`}>
          {preview}
        </aside>
      </div>

      <SkuPicker
        skus={skus}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={picked => {
          const lines = draft.lines.filter(line => line.sku_id)
          update({ lines: [...lines, ...picked.map(lineFromSku)].length ? [...lines, ...picked.map(lineFromSku)] : [blankLine()] })
        }}
      />
    </div>
  )
}
