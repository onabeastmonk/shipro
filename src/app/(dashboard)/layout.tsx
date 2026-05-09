'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'
import {
  LayoutDashboard, ClipboardList, MapPin, Truck, DollarSign,
  Bell, LogOut, X, ChevronRight, Calendar, AlertTriangle, Users,
  MessageCircle, Phone, MoreHorizontal, Warehouse, ShieldCheck, UserCheck, Navigation
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Nav items: roles: ['all'] = all authenticated roles; otherwise explicit list
const ALL_NAV_ITEMS = [
  { href: '/dashboard',          label: 'Dashboard',      icon: LayoutDashboard, roles: ['all'] },
  { href: '/my-trips',           label: 'My Trips',       icon: Navigation,      roles: ['driver'] },
  { href: '/jobs',               label: 'Jobs',           icon: ClipboardList,   roles: ['all'] },
  { href: '/tracking',           label: 'Tracking',       icon: MapPin,          roles: ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'] },
  { href: '/fleet',              label: 'Fleet',          icon: Truck,           roles: ['admin', 'fleet_manager', 'truck_owner'] },
  { href: '/payroll',            label: 'Payroll',        icon: DollarSign,      roles: ['admin', 'fleet_manager', 'truck_owner'] },
  { href: '/warehouse',          label: 'Warehouse',      icon: Warehouse,       roles: ['admin', 'fleet_manager', 'warehouse_manager'] },
  { href: '/verification',       label: 'Verification',   icon: ShieldCheck,     roles: ['admin', 'fleet_manager'] },
  { href: '/owner-profile',      label: 'My Team',        icon: UserCheck,       roles: ['truck_owner'] },
  { href: '/drivers',            label: 'My Drivers',     icon: Users,           roles: ['truck_owner'] },
  { href: '/driver-application', label: 'My Application', icon: UserCheck,       roles: ['driver'] },
  { href: '/chat',               label: 'Messages',       icon: MessageCircle,   roles: ['all'] },
  { href: '/calendar',           label: 'Calendar',       icon: Calendar,        roles: ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'] },
  { href: '/incidents',          label: 'Incidents',      icon: AlertTriangle,   roles: ['all'] },
  { href: '/emergency',          label: 'Emergency',      icon: Phone,           roles: ['all'] },
]

// Bottom nav primary items — shown directly (role-filtered at render time)
const BOTTOM_NAV_PRIMARY_ALL = [
  { href: '/my-trips',    label: 'My Trips', icon: Navigation,      roles: ['driver'] },
  { href: '/dashboard',   label: 'Home',   icon: LayoutDashboard, roles: ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'] },
  { href: '/jobs',        label: 'Jobs',   icon: ClipboardList,   roles: ['all'] },
  { href: '/chat',        label: 'Chat',   icon: MessageCircle,   roles: ['all'] },
  { href: '/emergency',   label: 'SOS',    icon: Phone,           roles: ['driver'] },
  { href: '/fleet',       label: 'Fleet',  icon: Truck,           roles: ['admin', 'fleet_manager', 'truck_owner'] },
]

// Bottom nav "More" sheet items — role-filtered at render time
const BOTTOM_NAV_MORE_ALL = [
  { href: '/tracking',           label: 'Tracking',    icon: MapPin,        roles: ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'] },
  { href: '/warehouse',          label: 'Warehouse',   icon: Warehouse,     roles: ['admin', 'fleet_manager', 'warehouse_manager'] },
  { href: '/verification',       label: 'Verify',      icon: ShieldCheck,   roles: ['admin', 'fleet_manager'] },
  { href: '/payroll',            label: 'Payroll',     icon: DollarSign,    roles: ['admin', 'fleet_manager', 'truck_owner'] },
  { href: '/drivers',            label: 'My Drivers',  icon: Users,         roles: ['truck_owner'] },
  { href: '/owner-profile',      label: 'My Team',     icon: UserCheck,     roles: ['truck_owner'] },
  { href: '/driver-application', label: 'My App',      icon: UserCheck,     roles: ['driver'] },
  { href: '/incidents',          label: 'Incidents',   icon: AlertTriangle, roles: ['all'] },
  { href: '/emergency',          label: 'SOS',         icon: Phone,         roles: ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'] },
  { href: '/calendar',           label: 'Calendar',    icon: Calendar,      roles: ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'] },
]

function roleMatch(roles: string[], userRole: string): boolean {
  return roles.includes('all') || roles.includes(userRole)
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [activeEmergencies, setActiveEmergencies] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [emergencyFlash, setEmergencyFlash] = useState(false)

  useEffect(() => {
    let cleanup: (() => void) | undefined

    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (profile) setUser(profile as User)

      const { count: notifCount } = await supabase.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id).eq('is_read', false)
      setUnreadCount(notifCount || 0)

      const { count: msgCount } = await supabase.from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', session.user.id).eq('is_read', false)
      setUnreadMessages(msgCount || 0)

      if (profile?.role === 'admin' || profile?.role === 'fleet_manager') {
        const { count: emergCount } = await supabase.from('emergency_alerts')
          .select('*', { count: 'exact', head: true }).eq('status', 'active')
        setActiveEmergencies(emergCount || 0)

        const emergChannel = supabase.channel('layout-emergency')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, () => {
            setActiveEmergencies(prev => prev + 1)
            setEmergencyFlash(true)
            setTimeout(() => setEmergencyFlash(false), 5000)
          }).subscribe()
        cleanup = () => { supabase.removeChannel(emergChannel) }
        return
      }

      // Real-time message badge
      const msgChannel = supabase.channel('layout-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages',
          filter: `receiver_id=eq.${session.user.id}` }, () => {
          if (!window.location.pathname.startsWith('/chat')) {
            setUnreadMessages(prev => prev + 1)
          }
        }).subscribe()

      // Always re-query unread count so badge clears after reading messages
      const interval = setInterval(async () => {
        const { count } = await supabase.from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', session.user.id).eq('is_read', false)
        setUnreadMessages(count || 0)
      }, 4000)

      cleanup = () => { supabase.removeChannel(msgChannel); clearInterval(interval) }
    }
    loadUser()
    return () => { cleanup?.() }
  }, [router])

  // Close more menu when navigating
  useEffect(() => { setMoreOpen(false) }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabelMap: Record<string, string> = {
    truck_owner: '🚛 Truck Owner', fleet_manager: '🏢 Fleet Manager',
    warehouse_manager: '🏭 Warehouse Manager',
    admin: '⚙️ Admin', driver: '👤 Driver', client: '👁️ Client',
  }
  const roleLabel = roleLabelMap[user?.role || ''] || user?.role || ''

  const userRoleStr = user?.role || ''
  const BOTTOM_NAV_PRIMARY = BOTTOM_NAV_PRIMARY_ALL.filter(i => roleMatch(i.roles, userRoleStr))
  const BOTTOM_NAV_MORE = BOTTOM_NAV_MORE_ALL.filter(i => roleMatch(i.roles, userRoleStr))
  const isMoreActive = BOTTOM_NAV_MORE.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))

  return (
    <div className="flex bg-bg-primary" style={{ height: '100dvh', overflow: 'hidden' }}>

      {emergencyFlash && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-danger text-white text-center py-2 font-bold text-sm animate-pulse cursor-pointer"
          onClick={() => router.push('/emergency')}>
          🚨 EMERGENCY ALERT — Tap to view
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={cn(
        'w-64 bg-bg-secondary border-r border-border flex-col',
        'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
        'md:relative md:translate-x-0 flex',
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
          {ALL_NAV_ITEMS.filter(item => roleMatch(item.roles, userRoleStr)).map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            const badge = item.href === '/chat' ? unreadMessages : item.href === '/emergency' ? activeEmergencies : 0
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5 transition-colors text-sm font-medium',
                  active ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                  item.href === '/emergency' && activeEmergencies > 0 && 'text-danger')}>
                <item.icon size={18} />
                {item.label}
                {badge > 0 && (
                  <span className={cn('ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold',
                    item.href === '/emergency' ? 'bg-danger text-white' : 'bg-brand text-bg-primary')}>
                    {badge}
                  </span>
                )}
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
              <div className="text-xs text-text-muted">{roleLabel}</div>
            </div>
            <ChevronRight size={14} className="text-text-muted" />
          </Link>
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 rounded-md w-full text-left text-sm text-danger hover:bg-danger-bg transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0" style={{ height: '100dvh', overflow: 'hidden' }}>
        <header className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0 z-20">
          <Link href="/dashboard">
            <span className="font-heading text-xl font-bold text-text-primary">shi<span className="text-text-muted">PRO</span></span>
          </Link>
          <div className="flex items-center gap-1">
            {activeEmergencies > 0 && (
              <Link href="/emergency" className="relative p-2 rounded-full bg-danger-bg animate-pulse">
                <AlertTriangle size={18} className="text-danger" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center text-xs font-bold text-white">{activeEmergencies}</span>
              </Link>
            )}
            <Link href="/chat" className="relative p-2 rounded-full hover:bg-bg-tertiary transition-colors">
              <MessageCircle size={18} className="text-text-secondary" />
              {unreadMessages > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full" />}
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

        <main className="flex-1 scrollbar-hide smooth-scroll" style={{
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        }}>
          {children}
        </main>

        {/* BOTTOM NAV - scrollable with More button */}
        <nav className="md:hidden bg-bg-secondary border-t border-border z-50"
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div style={{ display: 'flex', minHeight: '56px' }}>
            {BOTTOM_NAV_PRIMARY.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              const badge = item.href === '/chat' ? unreadMessages : 0
              return (
                <Link key={item.href} href={item.href} style={{ flex: 1 }}
                  className={cn('flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors relative',
                    active ? 'text-text-primary' : 'text-text-muted')}>
                  <item.icon size={20} />
                  <span className="text-[9px] font-medium uppercase tracking-wide">{item.label}</span>
                  {badge > 0 && <span className="absolute top-1 right-1/4 w-4 h-4 rounded-full bg-brand flex items-center justify-center text-xs font-bold text-white">{badge}</span>}
                </Link>
              )
            })}
            {/* More button */}
            <button style={{ flex: 1 }} onClick={() => setMoreOpen(true)}
              className={cn('flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors relative',
                isMoreActive ? 'text-text-primary' : 'text-text-muted')}>
              <MoreHorizontal size={20} />
              <span className="text-[9px] font-medium uppercase tracking-wide">More</span>
              {activeEmergencies > 0 && <span className="absolute top-1 right-1/4 w-4 h-4 rounded-full bg-danger flex items-center justify-center text-xs font-bold text-white">{activeEmergencies}</span>}
            </button>
          </div>
        </nav>

        {/* MORE MENU SHEET */}
        {moreOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMoreOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary rounded-t-2xl md:hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
              <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-4" />
              <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                {BOTTOM_NAV_MORE.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  const badge = item.href === '/emergency' ? activeEmergencies : 0
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                      className={cn('flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors relative',
                        active ? 'bg-bg-elevated text-text-primary' : 'bg-bg-tertiary text-text-secondary',
                        item.href === '/emergency' && 'border border-danger-border')}>
                      <item.icon size={22} className={item.href === '/emergency' && activeEmergencies > 0 ? 'text-danger' : ''} />
                      <span className="text-xs font-semibold">{item.label}</span>
                      {badge > 0 && <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger flex items-center justify-center text-xs font-bold text-white">{badge}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
