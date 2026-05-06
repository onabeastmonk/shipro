'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api'
import type { Notification } from '@/types'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronLeft, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      const notifs = await fetchNotifications(session.user.id)
      setNotifications(notifs)
      setLoading(false)
    }
    load()
  }, [router])

  const unread = notifications.filter(n => !n.is_read).length

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/profile" className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-xl font-bold">Notifications</h1>
          {unread > 0 && <p className="text-text-muted text-xs">{unread} unread</p>}
        </div>
        {unread > 0 && userId && (
          <button
            onClick={async () => {
              await markAllNotificationsRead(userId)
              setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
              toast.success('All marked as read')
            }}
            className="text-xs text-text-secondary flex items-center gap-1"
          >
            <Check size={12} /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg mb-2" />)
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-text-secondary font-medium">No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(notif => (
            <div
              key={notif.id}
              onClick={async () => {
                if (!notif.is_read) {
                  await markNotificationRead(notif.id)
                  setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
                }
              }}
              className={cn(
                'bg-bg-secondary border rounded-lg p-3.5 cursor-pointer transition-colors',
                notif.is_read ? 'border-border opacity-75' : 'border-border-secondary'
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">
                  {notif.type === 'success' ? '✅' : notif.type === 'warning' ? '⚠️' : notif.type === 'error' ? '❌' : 'ℹ️'}
                </span>
                <div className="flex-1">
                  <div className={cn('text-sm font-semibold', notif.is_read ? 'text-text-secondary' : 'text-text-primary')}>
                    {notif.title}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{notif.message}</div>
                  <div className="text-xs text-text-muted mt-1">{formatRelative(notif.created_at)}</div>
                </div>
                {!notif.is_read && <div className="w-2 h-2 rounded-full bg-brand flex-shrink-0 mt-1.5" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
