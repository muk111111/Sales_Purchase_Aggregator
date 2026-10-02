'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !data.user) {
      setError(signInError?.message.toLowerCase().includes('confirm') ? 'Please confirm your email before signing in.' : 'Invalid email or password.')
      setLoading(false)
      return
    }
    const { data: employee, error: employeeError } = await supabase.from('employees').select('id,is_active').eq('id', data.user.id).maybeSingle()
    if (employeeError || !employee?.is_active) {
      await supabase.auth.signOut()
      setError('This account is not an active employee.')
      setLoading(false)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] px-5 py-10 text-[#0e1b2c]"><div className="w-full max-w-md rounded-2xl border border-[#e0ddd5] bg-white p-8 shadow-sm"><div className="mb-8"><div className="font-heading text-[25px] font-bold tracking-[-0.04em]">Supply<span className="text-[#f2a541]">360</span></div><p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#8b9295]">Employee access</p></div><h1 className="font-heading text-3xl font-bold">Welcome back</h1><p className="mt-2 text-sm text-[#667078]">Sign in with your employee account to continue.</p><form onSubmit={handleSubmit} className="mt-7 space-y-4"><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Work email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label><label className="flex flex-col gap-1.5 text-xs font-semibold text-[#52606a]">Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} className="h-11 rounded-lg border border-[#dedbd2] px-3 text-sm font-normal outline-none focus:border-[#f2a541]" /></label>{error && <p className="rounded-lg bg-[#fff1ed] p-3 text-sm text-[#b23a22]">{error}</p>}<button disabled={loading} className="h-11 w-full rounded-lg bg-[#f2a541] text-sm font-bold text-[#0e1b2c] disabled:opacity-60">{loading ? 'Signing in…' : 'Sign in'}</button></form><Link href="/forgot-password" className="mt-5 block text-center text-sm font-semibold text-[#8a5b10] hover:underline">Forgot password?</Link></div></main>
}
