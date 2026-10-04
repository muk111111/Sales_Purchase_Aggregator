'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { emptyToNull, fetchBankAccounts } from '@/lib/companies'

const inputClass = 'min-h-11 w-full rounded-lg border border-[#dedbd2] bg-white px-3 text-sm'

export function BankAccounts({ companyId, canEdit, onChange }: { companyId: string; canEdit: boolean; onChange: () => void }) {
  const { data: accounts, error, mutate } = useSWR(['banks', companyId], () => fetchBankAccounts(companyId))
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState('')

  const refresh = async () => {
    await mutate()
    onChange()
  }

  const run = async (action: PromiseLike<{ error: { message: string } | null }>) => {
    setActionError('')
    const { error: actionFailure } = await action
    if (actionFailure) setActionError(actionFailure.message)
    else await refresh()
  }

  const addAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setActionError('')
    const { error: insertError } = await createClient()
      .from('company_bank_accounts')
      .insert({
        company_id: companyId,
        account_name: emptyToNull(form.get('account_name')),
        bank_name: emptyToNull(form.get('bank_name')),
        branch: emptyToNull(form.get('branch')),
        account_no: String(form.get('account_no') ?? '').replace(/\s/g, ''),
        ifsc: String(form.get('ifsc') ?? '').trim().toUpperCase(),
        upi_id: emptyToNull(form.get('upi_id')),
      })
    if (insertError) {
      setActionError(insertError.message)
      return
    }
    setAdding(false)
    await refresh()
  }

  return (
    <section aria-labelledby="banks-heading" className="flex flex-col gap-4 rounded-xl border border-[#dedbd2] bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="banks-heading" className="font-heading text-xl font-bold">Bank accounts</h2>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="min-h-10 rounded-lg border border-[#dedbd2] px-3 text-sm font-semibold">
            Add account
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-[#a33b2b]">Could not load bank accounts: {error.message}</p>}
      {accounts?.length === 0 && !adding && (
        <p className="text-sm text-[#a33b2b]">No bank account yet. A default bank is required before issuing PO, PI or SI.</p>
      )}
      <ul className="flex flex-col divide-y divide-[#ece9e1]">
        {accounts?.map(account => (
          <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 font-semibold">
                {account.bank_name}
                {account.is_default && <span className="rounded-md bg-[#f2a541] px-2 py-0.5 text-xs font-bold text-[#0e1b2c]">Default</span>}
              </span>
              <span className="font-mono text-xs text-[#667078]">
                {account.account_name} · ••••{account.account_no_last4} · {account.ifsc}
                {account.upi_id ? ` · ${account.upi_id}` : ''}
              </span>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {!account.is_default && (
                  <button
                    type="button"
                    onClick={() => run(createClient().from('company_bank_accounts').update({ is_default: true }).eq('id', account.id))}
                    className="min-h-10 rounded-lg border border-[#dedbd2] px-3 text-sm"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove ${account.bank_name} ••••${account.account_no_last4}?`))
                      run(createClient().from('company_bank_accounts').delete().eq('id', account.id))
                  }}
                  className="min-h-10 rounded-lg px-3 text-sm text-[#a33b2b]"
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={addAccount} className="grid gap-3 rounded-lg bg-[#f6f4ee] p-4 sm:grid-cols-2">
          <input name="account_name" required placeholder="Account holder name" aria-label="Account holder name" className={inputClass} />
          <input name="bank_name" required placeholder="Bank name" aria-label="Bank name" className={inputClass} />
          <input name="account_no" required inputMode="numeric" pattern="[0-9 ]{9,22}" placeholder="Account number" aria-label="Account number" className={`${inputClass} font-mono`} />
          <input name="ifsc" required pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" placeholder="IFSC" aria-label="IFSC" className={`${inputClass} font-mono uppercase`} />
          <input name="branch" placeholder="Branch (optional)" aria-label="Branch" className={inputClass} />
          <input name="upi_id" placeholder="UPI ID (optional)" aria-label="UPI ID" className={inputClass} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setAdding(false)} className="min-h-10 rounded-lg px-3 text-sm">
              Cancel
            </button>
            <button type="submit" className="min-h-10 rounded-lg bg-[#142033] px-4 text-sm font-bold text-white">
              Save account
            </button>
          </div>
        </form>
      )}
      {actionError && <p role="alert" className="text-sm text-[#a33b2b]">{actionError}</p>}
    </section>
  )
}
