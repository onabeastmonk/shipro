'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { updateProfile } from '@/lib/auth'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api'
import type { User, Notification } from '@/types'
import { User as UserIcon, Bell, LogOut, ChevronRight, Check } from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'

type Section = 'profile' | 'notifications' | 'security'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [section, setSection] = useState<Section>('profile')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', company_name: '', contact_number: '' })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (profile) {
        setUser(profile as User)
        setForm({ full_name: profile.full_name, company_name: profile.company_name || '', contact_number: profile.contact_number || '' })
      }
      const notifs = await fetchNotifications(session.user.id)
      setNotifications(notifs)
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Not logged in'); return }

      if (!form.full_name.trim()) {
        toast.error('Full name is required')
        setSaving(false)
        return
      }

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: form.full_name,
            company_name: form.company_name || null,
            contact_number: form.contact_number || null,
          })
          .eq('id', session.user.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert({
            id: session.user.id,
            email: session.user.email,
            full_name: form.full_name,
            company_name: form.company_name || null,
            contact_number: form.contact_number || null,
            role: 'driver',
            is_verified: false,
          })
        if (error) throw error
      }

      toast.success('Profile saved!')
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (profile) setUser(profile as User)

    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkAllRead() {
    if (!user) return
    await markAllNotificationsRead(user.id)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    toast.success('All notifications marked as read')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const unread = notifications.filter(n => !n.is_read).length

  if (loading) return (
    <div className="p-4 space-y-4">
      <div className="skeleton h-20 rounded-lg" />
      <div className="skeleton h-48 rounded-lg" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* User header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-bg-tertiary border border-border flex items-center justify-center text-2xl font-bold font-heading text-text-primary">
          {user?.full_name?.charAt(0) || '?'}
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold text-text-primary">{user?.full_name}</h1>
          <p className="text-text-muted text-sm capitalize">{user?.role}</p>
          <p className="text-text-muted text-xs">{user?.email}</p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-5 bg-bg-secondary border border-border rounded-lg p-1">
        {(['profile', 'notifications', 'security'] as Section[]).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              'flex-1 py-2 text-xs font-semibold rounded-md capitalize transition-all relative',
              section === s ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'
            )}
          >
            {s}
            {s === 'notifications' && unread > 0 && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-danger rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* PROFILE SECTION */}
      {section === 'profile' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="form-label">Full Name</label>
            <input className="form-input" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Company / Business Name</label>
            <input className="form-input" placeholder="Optional" value={form.company_name}
              onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Mobile Number</label>
            <input className="form-input" type="tel" placeholder="+63 9XX XXX XXXX" value={form.contact_number}
              onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Email Address</label>
            <input className="form-input" value={user?.email || ''} disabled className="form-input opacity-50 cursor-not-allowed" />
            <p className="text-xs text-text-muted mt-1">Email cannot be changed here.</p>
          </div>
          <div>
            <label className="form-label">Role</label>
            <input className="form-input opacity-50 cursor-not-allowed capitalize" value={user?.role || ''} disabled />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-full">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {/* Quick links */}
          <div className="mt-4 bg-bg-secondary border border-border rounded-lg divide-y divide-border">
            <QuickLink label="Job Orders" href="/jobs" />
            <QuickLink label="Fleet" href="/fleet" />
            <QuickLink label="Payroll" href="/payroll" />
          </div>

          <button
            onClick={handleSignOut}
            className="btn btn-danger btn-full flex items-center justify-center gap-2 mt-2"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}

      {/* NOTIFICATIONS SECTION */}
      {section === 'notifications' && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-text-muted">
              {unread > 0 ? `${unread} unread notification${unread > 1 ? 's' : ''}` : 'All caught up'}
            </p>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={async () => {
                    await markNotificationRead(notif.id)
                    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
                  }}
                  className={cn(
                    'bg-bg-secondary border rounded-lg p-3.5 cursor-pointer transition-all',
                    notif.is_read ? 'border-border' : 'border-border-secondary'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">
                      {notif.type === 'success' ? '✅' : notif.type === 'warning' ? '⚠️' : notif.type === 'error' ? '❌' : 'ℹ️'}
                    </span>
                    <div className="flex-1 min-w-0">
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
      )}

      {/* SECURITY SECTION */}
      {section === 'security' && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <h3 className="font-heading text-sm font-semibold mb-3">Change Password</h3>
            <div className="space-y-3">
              <div>
                <label className="form-label">Current Password</label>
                <input type="password" className="form-input" placeholder="••••••••" />
              </div>
              <div>
                <label className="form-label">New Password</label>
                <input type="password" className="form-input" placeholder="At least 8 characters" />
              </div>
              <div>
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-input" placeholder="Repeat new password" />
              </div>
              <button className="btn btn-primary btn-full" onClick={() => toast('Password change coming soon', { icon: '🔒' })}>
                Update Password
              </button>
            </div>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <h3 className="font-heading text-sm font-semibold mb-1">Two-Factor Authentication</h3>
            <p className="text-xs text-text-muted mb-3">Add an extra layer of security to your account</p>
            <button className="btn btn-outline btn-sm" onClick={() => toast('2FA setup coming soon', { icon: '🔐' })}>
              Enable 2FA
            </button>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg divide-y divide-border">
            <div className="p-3.5">
              <div className="text-xs text-text-muted font-semibold uppercase mb-1">Account Created</div>
              <div className="text-sm text-text-primary">{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div>
            </div>
            <div className="p-3.5">
              <div className="text-xs text-text-muted font-semibold uppercase mb-1">Account Status</div>
              <div className={cn('text-sm font-medium', user?.is_verified ? 'text-success' : 'text-warning')}>
                {user?.is_verified ? '✓ Verified' : '⏳ Pending Verification'}
              </div>
            </div>
          </div>

          <div className="bg-danger-bg border border-danger-border rounded-lg p-4">
            <h3 className="font-heading text-sm font-semibold text-danger mb-1">Danger Zone</h3>
            <p className="text-xs text-text-muted mb-3">These actions are irreversible.</p>
            <button className="btn btn-danger btn-sm" onClick={() => toast.error('Please contact support to delete your account.')}>
              Delete Account
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} className="flex items-center justify-between px-4 py-3 hover:bg-bg-tertiary transition-colors">
      <span className="text-sm text-text-secondary">{label}</span>
      <ChevronRight size={14} className="text-text-muted" />
    </a>
  )
}
