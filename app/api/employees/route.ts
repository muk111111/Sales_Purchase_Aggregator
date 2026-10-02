import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: userError } = await admin.auth.getUser(token)
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: actor, error: actorError } = await admin.from('employees').select('role,is_active').eq('id', user.id).maybeSingle()
  if (actorError || !actor?.is_active || actor.role !== 'Admin') return NextResponse.json({ error: 'Only active Admins can create employees.' }, { status: 403 })

  const body = await request.json()
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  if (!fullName || !email || password.length < 8 || !role) return NextResponse.json({ error: 'Enter a name, email, role, and password of at least 8 characters.' }, { status: 400 })

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError || !created.user) return NextResponse.json({ error: createError?.message || 'Could not create user.' }, { status: 400 })

  const { error: employeeError } = await admin.from('employees').insert({ id: created.user.id, full_name: fullName, email, role, is_active: true })
  if (employeeError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: employeeError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
