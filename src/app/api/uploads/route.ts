import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const path = formData.get('path') as string
    const bucket = (formData.get('bucket') as string) || 'shipro-documents'

    if (!file || !path) {
      return NextResponse.json({ error: 'file and path are required' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)

    return NextResponse.json({ url: publicUrl, path })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
