import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('job_orders')
      .select(`
        *,
        truck:trucks(id, plate_number, truck_type_label, driver_name, owner_name, contact_number),
        driver:profiles!assigned_driver_id(id, full_name, contact_number, email),
        shipment_items(*),
        status_logs:delivery_status_logs(*),
        applicants:job_applicants(
          *,
          truck:trucks(id, plate_number, truck_type_label, owner_name, driver_name, cbm_capacity),
          driver:profiles!driver_id(id, full_name, contact_number)
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient()
    const body = await req.json()

    const { data, error } = await supabase
      .from('job_orders')
      .update(body)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient()
    const { error } = await supabase.from('job_orders').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
