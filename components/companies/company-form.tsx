'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { emptyToNull, ENTITY_TYPES, GST_TYPES, INDIAN_STATES, stateName, type Company } from '@/lib/companies'

const inputClass =
  'min-h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 text-sm text-[#142033] disabled:bg-[#f6f4ee] disabled:text-[#667078]'

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-[#667078]">{hint}</span>}
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-[#dedbd2] bg-white p-5 sm:p-6">
      <legend className="px-1 font-mono text-xs font-semibold tracking-widest text-[#667078] uppercase">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

async function uploadLogo(file: File) {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch('/api/company-logo', { method: 'POST', body })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.url) throw new Error(result.error || `Logo upload failed (${response.status})`)
  return result.url as string
}

export function CompanyForm({
  company,
  readOnly,
  onSaved,
}: {
  company: Company | null
  readOnly: boolean
  onSaved: (id: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [gstType, setGstType] = useState(company?.gst_type ?? 'Regular')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    const form = new FormData(event.currentTarget)
    try {
      let logoUrl = company?.logo_url ?? null
      const logo = form.get('logo_file')
      if (logo instanceof File && logo.size > 0) logoUrl = await uploadLogo(logo)

      const stateCode = emptyToNull(form.get('state_code'))
      const payload = {
        code: emptyToNull(form.get('code')),
        legal_name: emptyToNull(form.get('legal_name')),
        trade_name: emptyToNull(form.get('trade_name')),
        entity_type: emptyToNull(form.get('entity_type')),
        cin: emptyToNull(form.get('cin')),
        incorporation_date: emptyToNull(form.get('incorporation_date')),
        logo_url: logoUrl,
        gst_type: gstType,
        gstin: gstType === 'Unregistered' ? null : emptyToNull(form.get('gstin')),
        pan: emptyToNull(form.get('pan')),
        tan: emptyToNull(form.get('tan')),
        msme_no: emptyToNull(form.get('msme_no')),
        iec: emptyToNull(form.get('iec')),
        state_code: stateCode,
        state_name: stateName(stateCode),
        reg_address: emptyToNull(form.get('reg_address')),
        city: emptyToNull(form.get('city')),
        pin: emptyToNull(form.get('pin')),
        phone: emptyToNull(form.get('phone')),
        email: emptyToNull(form.get('email')),
        website: emptyToNull(form.get('website')),
        signatory_name: emptyToNull(form.get('signatory_name')),
        signatory_designation: emptyToNull(form.get('signatory_designation')),
        default_payment_terms: emptyToNull(form.get('default_payment_terms')) ?? '45 days from date of delivery',
        default_delivery_days: Number(form.get('default_delivery_days') || 5),
        tds_commission_pct: Number(form.get('tds_commission_pct') || 5),
        doc_terms_text: emptyToNull(form.get('doc_terms_text')),
        doc_footer_note: emptyToNull(form.get('doc_footer_note')),
        show_bank_on_docs: form.get('show_bank_on_docs') === 'on',
        fy: emptyToNull(form.get('fy')) ?? '2026-27',
        status: form.get('status') === 'Inactive' ? 'Inactive' : 'Active',
        sells: form.get('sells') === 'on',
        buys: form.get('buys') === 'on',
      }

      const supabase = createClient()
      const query = company
        ? supabase.from('companies').update(payload).eq('id', company.id).select('id')
        : supabase.from('companies').insert({ ...payload, abbr: emptyToNull(form.get('abbr')) }).select('id')
      const { data, error: saveError } = await query
      if (saveError) throw new Error(saveError.message)
      if (!data?.length) throw new Error('Nothing was saved. Only owners can edit company setup.')
      onSaved(data[0].id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save company')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset disabled={readOnly || saving} className="flex flex-col gap-5">
        <Section title="Identity">
          <Field label="Legal name">
            <input name="legal_name" required defaultValue={company?.legal_name} className={inputClass} />
          </Field>
          <Field label="Trade name">
            <input name="trade_name" defaultValue={company?.trade_name ?? ''} className={inputClass} />
          </Field>
          <Field label="Company code" hint="Internal code, e.g. C03.">
            <input name="code" required defaultValue={company?.code} className={`${inputClass} font-mono uppercase`} />
          </Field>
          <Field
            label="Abbreviation"
            hint={company ? 'Used in document numbers. Fixed after creation.' : 'Leave blank to derive from the legal name (Vensun Group → VG).'}
          >
            <input
              name="abbr"
              defaultValue={company?.abbr ?? ''}
              disabled={Boolean(company)}
              maxLength={4}
              pattern="[A-Za-z0-9]{2,4}"
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
          <Field label="Entity type">
            <select name="entity_type" defaultValue={company?.entity_type ?? ''} className={inputClass}>
              <option value="">Add entity type</option>
              {ENTITY_TYPES.map(type => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="CIN / LLPIN" hint="Required for LLP, Private Limited and OPC.">
            <input name="cin" defaultValue={company?.cin ?? ''} className={`${inputClass} font-mono uppercase`} />
          </Field>
          <Field label="Incorporation date">
            <input type="date" name="incorporation_date" defaultValue={company?.incorporation_date ?? ''} className={inputClass} />
          </Field>
          <Field label="Logo" hint="PNG or JPG, shown on document headers.">
            <input type="file" name="logo_file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
          </Field>
        </Section>

        <Section title="Tax registration">
          <Field label="GST registration">
            <select name="gst_type" value={gstType} onChange={event => setGstType(event.target.value as Company['gst_type'])} className={inputClass}>
              {GST_TYPES.map(type => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="GSTIN" hint="PAN and state code are filled from the GSTIN when left blank.">
            <input
              name="gstin"
              defaultValue={company?.gstin ?? ''}
              disabled={gstType === 'Unregistered'}
              maxLength={15}
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
          <Field label="PAN">
            <input name="pan" defaultValue={company?.pan ?? ''} maxLength={10} className={`${inputClass} font-mono uppercase`} />
          </Field>
          <Field label="TAN">
            <input name="tan" defaultValue={company?.tan ?? ''} maxLength={10} className={`${inputClass} font-mono uppercase`} />
          </Field>
          <Field label="MSME / Udyam no.">
            <input name="msme_no" defaultValue={company?.msme_no ?? ''} className={`${inputClass} font-mono uppercase`} />
          </Field>
          <Field label="IEC">
            <input name="iec" defaultValue={company?.iec ?? ''} className={`${inputClass} font-mono uppercase`} />
          </Field>
        </Section>

        <Section title="Registered address & contact">
          <Field label="Registered address" wide>
            <textarea name="reg_address" rows={2} defaultValue={company?.reg_address ?? ''} className={`${inputClass} py-2`} />
          </Field>
          <Field label="City">
            <input name="city" defaultValue={company?.city ?? ''} className={inputClass} />
          </Field>
          <Field label="PIN code">
            <input name="pin" defaultValue={company?.pin ?? ''} inputMode="numeric" maxLength={6} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="State">
            <select name="state_code" defaultValue={company?.state_code ?? ''} className={inputClass}>
              <option value="">Select state</option>
              {INDIAN_STATES.map(state => (
                <option key={state.code} value={state.code}>
                  {state.code} · {state.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={company?.phone ?? ''} className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" defaultValue={company?.email ?? ''} className={inputClass} />
          </Field>
          <Field label="Website">
            <input name="website" type="url" defaultValue={company?.website ?? ''} className={inputClass} />
          </Field>
          <Field label="Authorised signatory">
            <input name="signatory_name" defaultValue={company?.signatory_name ?? ''} className={inputClass} />
          </Field>
          <Field label="Signatory designation">
            <input name="signatory_designation" defaultValue={company?.signatory_designation ?? ''} className={inputClass} />
          </Field>
        </Section>

        <Section title="Document defaults">
          <Field label="Default payment terms">
            <input name="default_payment_terms" defaultValue={company?.default_payment_terms ?? '45 days from date of delivery'} className={inputClass} />
          </Field>
          <Field label="Default delivery days">
            <input type="number" min={0} max={365} name="default_delivery_days" defaultValue={company?.default_delivery_days ?? 5} className={inputClass} />
          </Field>
          <Field label="TDS on commission (%)">
            <input type="number" min={0} max={100} step="0.01" name="tds_commission_pct" defaultValue={company?.tds_commission_pct ?? 5} className={inputClass} />
          </Field>
          <Field label="Financial year">
            <input name="fy" defaultValue={company?.fy ?? '2026-27'} pattern="\d{4}-\d{2}" className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Terms printed on documents" wide>
            <textarea name="doc_terms_text" rows={3} defaultValue={company?.doc_terms_text ?? ''} className={`${inputClass} py-2`} />
          </Field>
          <Field label="Footer note" wide>
            <input name="doc_footer_note" defaultValue={company?.doc_footer_note ?? ''} className={inputClass} />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="show_bank_on_docs" defaultChecked={company?.show_bank_on_docs ?? true} /> Show bank details on documents
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="buys" defaultChecked={company?.buys ?? true} /> Buys
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="sells" defaultChecked={company?.sells ?? true} /> Sells
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="status" value="Inactive" defaultChecked={company?.status === 'Inactive'} /> Inactive
            </label>
          </div>
        </Section>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl border border-[#f0c4bd] bg-[#fdf0ee] px-4 py-3 text-sm text-[#a33b2b]">
          {error}
        </p>
      )}
      {!readOnly && (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-[#142033] px-6 text-sm font-bold text-white disabled:opacity-60">
            {saving ? 'Saving…' : company ? 'Save changes' : 'Create company'}
          </button>
        </div>
      )}
    </form>
  )
}
