import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'

// ── useUser: get the current authenticated user ────────────

export function useUser() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single()
      setUser(profile as User | null)
      setLoading(false)
    }
    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  return { user, loading }
}

// ── useDebounce: debounce a value ──────────────────────────

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ── useLocalStorage: persist state to localStorage ────────

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initial
    } catch { return initial }
  })

  const set = useCallback((val: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof val === 'function' ? (val as (p: T) => T)(prev) : val
      try { window.localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])

  return [value, set] as const
}

// ── useOnlineStatus: detect network connectivity ──────────

export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

// ── useNotificationCount: real-time unread count ──────────

export function useNotificationCount(userId: string | null) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) return

    // Initial fetch
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .then(({ count: c }) => setCount(c || 0))

    // Real-time subscription
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .then(({ count: c }) => setCount(c || 0))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return count
}
