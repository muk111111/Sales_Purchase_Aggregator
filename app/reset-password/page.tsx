'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter(); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); const { error: updateError } = await createClient().auth.updateUser({ password }); if (updateError) setError('Could not update password. Please request a new link.'); else router.replace('/'); setLoading(false) }
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] px-5 text-[#0e1b2c]"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[#e0ddd5] bg-white p-8 shadow-sm"><h1 className="font-heading text-3xl font-bold">Set new password</h1><label className="mt-7 flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">New password<input required minLength={8} type="password" value={password} onChange={event => setPassword(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label>{error && <p className="mt-3 text-sm text-[#b23a22]">{error}</p>}<button disabled={loading} className="mt-5 h-11 w-full rounded-lg bg-[#f2a541] text-sm font-bold disabled:opacity-60">{loading ? 'Updating…' : 'Update password'}</button></form></main>
}
