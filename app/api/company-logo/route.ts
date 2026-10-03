import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const maxBytes = 2 * 1024 * 1024

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) return NextResponse.json({ error: 'No logo file provided.' }, { status: 400 })
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'Logo must be PNG, JPG, WEBP, or SVG.' }, { status: 400 })
  if (file.size > maxBytes) return NextResponse.json({ error: 'Logo must be 2 MB or smaller.' }, { status: 400 })

  try {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const blob = await put(`company-logos/${crypto.randomUUID()}.${extension}`, file, { access: 'public', addRandomSuffix: false })
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Company logo upload failed:', error)
    return NextResponse.json({ error: 'Could not upload company logo.' }, { status: 500 })
  }
}
