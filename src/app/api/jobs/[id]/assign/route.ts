import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Apply to a job as a driver/trucker
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient()
    const { truck_id, driver_id, message } = await req.json()

    const { data, error } = await supabase
      .from('job_applicants')
      .insert({
        job_order_id: params.id,
        truck_id,
        driver_id,
        message,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Assign a truck to a job (approve one applicant, reject others)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient()
    const { applicant_id, truck_id, driver_id } = await req.json()

    await supabase.from('job_orders').update({
      status: 'assigned',
      assigned_truck_id: truck_id,
      assigned_driver_id: driver_id,
    }).eq('id', params.id)

    await supabase.from('job_applicants').update({ status: 'approved' }).eq('id', applicant_id)
    await supabase.from('job_applicants').update({ status: 'rejected' })
      .eq('job_order_id', params.id).neq('id', applicant_id)
    await supabase.from('trucks').update({ availability: 'on_job' }).eq('id', truck_id)

    return NextResponse.json({ message: 'Assigned' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
