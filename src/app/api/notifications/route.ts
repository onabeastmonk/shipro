import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(req.url)
    const user_id = searchParams.get('user_id')

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(50)

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

    const { data, error } = await supabase
      .from('notifications')
      .insert(body)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { user_id, notification_id, mark_all } = await req.json()

    if (mark_all && user_id) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user_id)
    } else if (notification_id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notification_id)
    }

    return NextResponse.json({ message: 'Updated' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
