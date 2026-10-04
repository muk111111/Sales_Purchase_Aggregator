'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { emptyToNull, fetchLocations, INDIAN_STATES, stateName, type CompanyLocation } from '@/lib/companies'

const inputClass = 'min-h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 text-sm'

function LocationForm({
  location,
  onSubmit,
  onCancel,
}: {
  location: CompanyLocation | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg bg-[#f6f4ee] p-4 sm:grid-cols-2">
      <input name="name" required defaultValue={location?.name} placeholder="Location name, e.g. Bhiwandi godown" aria-label="Location name" className={`${inputClass} sm:col-span-2`} />
      <input name="line1" required defaultValue={location?.line1} placeholder="Address line 1" aria-label="Address line 1" className={inputClass} />
      <input name="line2" defaultValue={location?.line2 ?? ''} placeholder="Address line 2" aria-label="Address line 2" className={inputClass} />
      <input name="city" required defaultValue={location?.city} placeholder="City" aria-label="City" className={inputClass} />
      <input name="pin" required defaultValue={location?.pin} inputMode="numeric" pattern="[1-9][0-9]{5}" placeholder="PIN code" aria-label="PIN code" className={`${inputClass} font-mono`} />
      <select name="state_code" required defaultValue={location?.state_code ?? ''} aria-label="State" className={inputClass}>
        <option value="">Select state</option>
        {INDIAN_STATES.map(state => (
          <option key={state.code} value={state.code}>
            {state.code} · {state.name}
          </option>
        ))}
      </select>
      <input name="gstin" defaultValue={location?.gstin ?? ''} maxLength={15} placeholder="GSTIN (optional)" aria-label="GSTIN" className={`${inputClass} font-mono uppercase`} />
      <input name="contact_name" required defaultValue={location?.contact_name} placeholder="Contact person" aria-label="Contact person" className={inputClass} />
      <input name="contact_phone" required type="tel" defaultValue={location?.contact_phone} placeholder="Contact phone" aria-label="Contact phone" className={inputClass} />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_default" defaultChecked={location?.is_default} /> Default dispatch location
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-lg px-3 text-sm">
          Cancel
        </button>
        <button type="submit" className="min-h-10 rounded-lg bg-[#142033] px-4 text-sm font-bold text-white">
          Save location
        </button>
      </div>
    </form>
  )
}

export function DispatchLocations({ companyId, canAdd, canEdit }: { companyId: string; canAdd: boolean; canEdit: boolean }) {
  const { data: locations, error, mutate } = useSWR(['locations', companyId], () => fetchLocations(companyId))
  const [editing, setEditing] = useState<CompanyLocation | 'new' | null>(null)
  const [actionError, setActionError] = useState('')

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setActionError('')
    const form = new FormData(event.currentTarget)
    const stateCode = String(form.get('state_code') ?? '')
    const payload = {
      name: emptyToNull(form.get('name')),
      line1: emptyToNull(form.get('line1')),
      line2: emptyToNull(form.get('line2')),
      city: emptyToNull(form.get('city')),
      pin: emptyToNull(form.get('pin')),
      state_code: stateCode,
      state: stateName(stateCode),
      gstin: emptyToNull(form.get('gstin'))?.toUpperCase() ?? null,
      contact_name: emptyToNull(form.get('contact_name')),
      contact_phone: emptyToNull(form.get('contact_phone')),
      is_default: form.get('is_default') === 'on',
    }
    const supabase = createClient()
    const { data, error: saveError } =
      editing && editing !== 'new'
        ? await supabase.from('delivery_locations').update(payload).eq('id', editing.id).select('id')
        : await supabase.from('delivery_locations').insert({ ...payload, owner_type: 'COMPANY', company_id: companyId }).select('id')
    if (saveError) {
      setActionError(saveError.message)
      return
    }
    if (!data?.length) {
      setActionError('Nothing was saved. Only owners can edit existing locations.')
      return
    }
    setEditing(null)
    await mutate()
  }

  const remove = async (location: CompanyLocation) => {
    if (!window.confirm(`Remove ${location.name}?`)) return
    setActionError('')
    const { error: deleteError } = await createClient().from('delivery_locations').delete().eq('id', location.id)
    if (deleteError) setActionError(deleteError.message)
    else await mutate()
  }

  return (
    <section aria-labelledby="locations-heading" className="flex flex-col gap-4 rounded-xl border border-[#dedbd2] bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="locations-heading" className="font-heading text-xl font-bold">Dispatch &amp; ship-to locations</h2>
          <p className="text-xs leading-relaxed text-[#667078]">Partners can add a location; only owners can edit or remove one.</p>
        </div>
        {canAdd && editing === null && (
          <button type="button" onClick={() => setEditing('new')} className="min-h-10 rounded-lg border border-[#dedbd2] px-3 text-sm font-semibold">
            Add location
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-[#a33b2b]">Could not load locations: {error.message}</p>}
      {locations?.length === 0 && editing === null && <p className="text-sm text-[#667078]">No dispatch locations yet.</p>}
      <ul className="flex flex-col divide-y divide-[#ece9e1]">
        {locations?.map(location =>
          editing !== 'new' && editing?.id === location.id ? (
            <li key={location.id} className="py-3">
              <LocationForm location={location} onSubmit={save} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={location.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  {location.name}
                  {location.is_default && <span className="rounded-md bg-[#f2a541] px-2 py-0.5 text-xs font-bold text-[#0e1b2c]">Default</span>}
                </span>
                <span className="text-xs leading-relaxed text-[#667078]">
                  {[location.line1, location.line2, location.city, location.state, location.pin].filter(Boolean).join(', ')} · {location.contact_name}{' '}
                  {location.contact_phone}
                </span>
              </div>
              {canEdit && editing === null && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(location)} className="min-h-10 rounded-lg border border-[#dedbd2] px-3 text-sm">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(location)} className="min-h-10 rounded-lg px-3 text-sm text-[#a33b2b]">
                    Remove
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      {editing === 'new' && <LocationForm location={null} onSubmit={save} onCancel={() => setEditing(null)} />}
      {actionError && <p role="alert" className="text-sm text-[#a33b2b]">{actionError}</p>}
    </section>
  )
}
