import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const allowedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg'])
const maxBytes = 5 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) return NextResponse.json({ error: 'No logo file provided.' }, { status: 400 })

    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    // Some browsers report an empty or generic MIME type for locally selected files.
    if (!allowedTypes.has(file.type) && !allowedExtensions.has(extension)) {
      return NextResponse.json({ error: 'Logo must be PNG, JPG, WEBP, or SVG.' }, { status: 400 })
    }
    if (file.size > maxBytes) return NextResponse.json({ error: 'Logo must be 5 MB or smaller.' }, { status: 400 })

    const safeExtension = allowedExtensions.has(extension) ? extension : 'png'
    const blob = await put(`company-logos/${crypto.randomUUID()}.${safeExtension}`, file, { access: 'public' })
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Company logo upload failed:', error)
    return NextResponse.json({ error: 'Could not upload company logo. Please try again.' }, { status: 500 })
  }
}
