import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('job_orders')
      .select(`*, truck:trucks(id, plate_number, truck_type_label, driver_name), driver:profiles!assigned_driver_id(id, full_name)`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') query = query.eq('status', status)
    if (search) query = query.or(`job_number.ilike.%${search}%,client_name.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ data, total: count })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await req.json()
    const { shipment_items, ...jobData } = body

    const { data: job, error: jobError } = await supabase
      .from('job_orders')
      .insert(jobData)
      .select()
      .single()

    if (jobError) throw jobError

    if (shipment_items?.length) {
      const items = shipment_items.map((item: any) => ({
        ...item,
        job_order_id: job.id,
        total_cbm: (item.cbm_per_item || 0) * item.quantity,
      }))
      const { error: itemsError } = await supabase.from('shipment_items').insert(items)
      if (itemsError) throw itemsError
    }

    return NextResponse.json({ data: job }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
