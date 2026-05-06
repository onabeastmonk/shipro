import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(req.url)
    const driver_id = searchParams.get('driver_id')
    const status = searchParams.get('status')

    let query = supabase
      .from('payslips')
      .select('*, driver:profiles!driver_id(full_name, email), job_order:job_orders(job_number)')
      .order('created_at', { ascending: false })

    if (driver_id) query = query.eq('driver_id', driver_id)
    if (status) query = query.eq('payment_status', status)

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
    const { base_rate = 0, additional_charges = 0, fuel_allowance = 0, toll_fee = 0, parking_fee = 0, deductions = 0 } = body

    const total = base_rate + additional_charges + fuel_allowance + toll_fee + parking_fee - deductions

    const { data, error } = await supabase
      .from('payslips')
      .insert({ ...body, total_amount: Math.max(0, total) })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
