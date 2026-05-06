import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerClient()

    const [jobsRes, trucksRes, driversRes, payslipsRes] = await Promise.all([
      supabase.from('job_orders').select('status, created_at'),
      supabase.from('trucks').select('availability, verification_status'),
      supabase.from('profiles').select('id').eq('role', 'driver'),
      supabase.from('payslips').select('total_amount, payment_status').eq('payment_status', 'pending'),
    ])

    const jobs = jobsRes.data || []
    const trucks = trucksRes.data || []
    const drivers = driversRes.data || []
    const payslips = payslipsRes.data || []

    const today = new Date().toISOString().split('T')[0]

    const jobsByStatus = jobs.reduce((acc: Record<string, number>, j) => {
      acc[j.status] = (acc[j.status] || 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      active_jobs: jobs.filter(j => !['completed', 'cancelled', 'draft'].includes(j.status)).length,
      pending_jobs: jobsByStatus['pending_assignment'] || 0,
      in_transit: jobsByStatus['in_transit'] || 0,
      completed_today: jobs.filter(j => j.status === 'completed' && j.created_at?.startsWith(today)).length,
      available_trucks: trucks.filter(t => t.availability === 'available' && t.verification_status === 'approved').length,
      total_trucks: trucks.length,
      registered_drivers: drivers.length,
      total_payables: payslips.reduce((sum, p) => sum + (p.total_amount || 0), 0),
      cancelled_this_week: jobsByStatus['cancelled'] || 0,
      jobs_by_status: Object.entries(jobsByStatus).map(([status, count]) => ({ status, count })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
