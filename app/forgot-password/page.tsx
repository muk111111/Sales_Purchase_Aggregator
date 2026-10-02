'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('')
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    if (resetError) setError('We could not send the reset email. Please try again.')
    else setSent(true)
    setLoading(false)
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] px-5 py-10 text-[#0e1b2c]"><div className="w-full max-w-md rounded-2xl border border-[#e0ddd5] bg-white p-8 shadow-sm"><div className="font-heading text-[25px] font-bold tracking-[-0.04em]">Supply<span className="text-[#f2a541]">360</span></div><h1 className="mt-8 font-heading text-3xl font-bold">Reset password</h1><p className="mt-2 text-sm text-[#667078]">Enter your work email and we&apos;ll send a reset link.</p>{sent ? <div className="mt-7 rounded-lg bg-[#eaf5ee] p-4 text-sm text-[#23714a]">If an employee account exists for that email, a reset link has been sent.</div> : <form onSubmit={handleSubmit} className="mt-7 space-y-4"><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Work email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label>{error && <p className="text-sm text-[#b23a22]">{error}</p>}<button disabled={loading} className="h-11 w-full rounded-lg bg-[#f2a541] text-sm font-bold disabled:opacity-60">{loading ? 'Sending…' : 'Send reset link'}</button></form>}<Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#8a5b10] hover:underline">Back to sign in</Link></div></main>
}
