import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(req.url)
    const verification_status = searchParams.get('verification_status')
    const availability = searchParams.get('availability')
    const search = searchParams.get('search')

    let query = supabase
      .from('trucks')
      .select('*, documents:truck_documents(*)')
      .order('created_at', { ascending: false })

    if (verification_status) query = query.eq('verification_status', verification_status)
    if (availability) query = query.eq('availability', availability)
    if (search) query = query.or(`plate_number.ilike.%${search}%,owner_name.ilike.%${search}%,driver_name.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await req.json()

    const { data: truck, error } = await supabase
      .from('trucks')
      .insert({ ...body, verification_status: 'pending' })
      .select()
      .single()

    if (error) throw error

    // Create document placeholders
    const docTypes = ['OR/CR', 'LTFRB Permit', 'Insurance', "Driver's License", 'Medical Certificate', 'Vehicle Photos']
    await supabase.from('truck_documents').insert(
      docTypes.map(doc => ({ truck_id: truck.id, document_type: doc, status: 'pending_upload' }))
    )

    return NextResponse.json({ data: truck }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
