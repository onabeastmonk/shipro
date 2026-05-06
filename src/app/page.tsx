import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase'

export default async function RootPage() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      redirect('/dashboard')
    } else {
      redirect('/login')
    }
  } catch {
    redirect('/login')
  }
}
