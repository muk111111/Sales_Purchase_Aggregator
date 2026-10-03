import { put } from '@vercel/blob'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: employee } = await supabase.from('employees').select('is_active').eq('id', user.id).maybeSingle()
  if (!employee?.is_active) return NextResponse.json({ error: 'Employee access required' }, { status: 403 })
  const formData = await request.formData()
  const file = formData.get('file')
  const leadId = formData.get('lead_id')
  if (!(file instanceof File) || typeof leadId !== 'string') return NextResponse.json({ error: 'File and lead are required' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Files must be 10 MB or smaller' }, { status: 400 })
  try {
    const blob = await put(`leads/${leadId}/${crypto.randomUUID()}-${file.name}`, file, { access: 'private' })
    const { error } = await supabase.from('lead_attachments').insert({ lead_id: leadId, pathname: blob.pathname, filename: file.name, content_type: file.type || null, size_bytes: file.size, created_by: user.id })
    if (error) return NextResponse.json({ error: `Could not save attachment metadata: ${error.message}` }, { status: 500 })
    return NextResponse.json({ pathname: blob.pathname, filename: file.name })
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : 'The storage upload failed.'
    return NextResponse.json({ error: `Could not upload ${file.name}: ${message}` }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: employee } = await supabase.from('employees').select('is_active').eq('id', user.id).maybeSingle()
  if (!employee?.is_active) return NextResponse.json({ error: 'Employee access required' }, { status: 403 })
  const pathname = request.nextUrl.searchParams.get('pathname')
  if (!pathname) return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  const { get } = await import('@vercel/blob')
  const result = await get(pathname, { access: 'private' })
  if (!result) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType || 'application/octet-stream', 'Cache-Control': 'private, no-cache' } })
}
