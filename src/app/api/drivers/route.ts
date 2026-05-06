import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(_req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name, contact_number, is_verified, created_at')
      .eq('role', 'driver')
      .order('full_name')

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
