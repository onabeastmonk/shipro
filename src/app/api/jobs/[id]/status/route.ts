import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient()
    const { status, note, proof_url, logged_by } = await req.json()

    const { error: jobError } = await supabase
      .from('job_orders')
      .update({ status })
      .eq('id', params.id)

    if (jobError) throw jobError

    const { error: logError } = await supabase
      .from('delivery_status_logs')
      .insert({ job_order_id: params.id, status, note, proof_url, logged_by })

    if (logError) throw logError

    // If completed, free up the truck
    if (status === 'completed') {
      const { data: job } = await supabase
        .from('job_orders')
        .select('assigned_truck_id')
        .eq('id', params.id)
        .single()

      if (job?.assigned_truck_id) {
        await supabase.from('trucks').update({ availability: 'available' }).eq('id', job.assigned_truck_id)
      }
    }

    return NextResponse.json({ message: 'Status updated' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
