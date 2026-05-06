'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'
import {
  LayoutDashboard, ClipboardList, MapPin, Truck, DollarSign,
  Bell, LogOut, X, ChevronRight, Calendar, AlertTriangle, Users
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/tracking', label: 'Tracking', icon: MapPin },
  { href: '/fleet', label: 'Fleet', icon: Truck },
  { href: '/payroll', label: 'Payroll', icon: DollarSign },
  { href: '/drivers', label: 'My Drivers', icon: Users },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
]

const BOTTOM_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/tracking', label: 'Track', icon: MapPin },
  { href: '/fleet', label: 'Fleet', icon: Truck },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single()
      if (profile) setUser(profile as User)
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    }
    loadUser()
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex bg-bg-primary" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* SIDEBAR (desktop only) */}
      <aside className={cn(
        'sidebar w-64 bg-bg-secondary border-r border-border flex-col',
        'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
        'md:relative md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <Link href="/dashboard">
            <span className="font-heading text-2xl font-bold text-text-primary tracking-tight">
              shi<span className="text-text-muted">PRO</span>
            </span>
          </Link>
          <button className="md:hidden p-1" onClick={() => setSidebarOpen(false)}>
            <X size={18} className="text-text-muted" />
          </button>
        </div>
        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5 transition-colors text-sm font-medium',
                  active ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary')}>
                <item.icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <Link href="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-bg-tertiary transition-colors mb-1">
            <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-primary">
              {user?.full_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{user?.full_name || 'Loading...'}</div>
              <div className="text-xs text-text-muted capitalize">{
              user?.role === 'truck_owner' ? '🚛 Truck Owner' :
              user?.role === 'fleet_manager' ? '📋 Fleet Manager' :
              user?.role === 'admin' ? '⚙️ Admin' :
              user?.role || ''
            }</div>
            </div>
            <ChevronRight size={14} className="text-text-muted" />
          </Link>
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 rounded-md w-full text-left text-sm text-danger hover:bg-danger-bg transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0" style={{ height: '100dvh', overflow: 'hidden' }}>

        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0 z-20">
          <Link href="/dashboard">
            <span className="font-heading text-xl font-bold text-text-primary">
              shi<span className="text-text-muted">PRO</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/incidents" className="relative p-2 rounded-full hover:bg-bg-tertiary transition-colors">
              <AlertTriangle size={18} className="text-text-secondary" />
            </Link>
            <Link href="/profile/notifications" className="relative p-2 rounded-full hover:bg-bg-tertiary transition-colors">
              <Bell size={20} className="text-text-secondary" />
              {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />}
            </Link>
            <Link href="/profile" className="w-8 h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-xs font-bold text-text-primary hover:border-border-active transition-colors">
              {user?.full_name?.charAt(0) || '?'}
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 scrollbar-hide smooth-scroll" style={{
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        }}>
          {children}
        </main>

        {/* BOTTOM NAV */}
        <nav className="md:hidden bg-bg-secondary border-t border-border z-50"
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', paddingBottom: 'env(safe-area-inset-bottom, 0px)', minHeight: '56px' }}>
          {BOTTOM_NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} style={{ flex: 1 }}
                className={cn('flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors',
                  active ? 'text-text-primary' : 'text-text-muted')}>
                <item.icon size={20} />
                <span className="text-[9px] font-medium uppercase tracking-wide">{item.label}</span>
              </Link>
            )
          })}
        </nav>

      </div>
    </div>
  )
}
