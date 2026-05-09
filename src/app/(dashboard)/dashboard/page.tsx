'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchDashboardStats, fetchActivityLogs } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatRelative, getJobStatusColor } from '@/lib/utils'
import type { DashboardStats, JobOrder } from '@/types'
import { JOB_STATUS_LABELS } from '@/types'
import { TrendingUp, AlertTriangle, Package, Users, Truck, DollarSign, Navigation, Phone, MessageCircle } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<JobOrder[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [driverTrips, setDriverTrips] = useState<any[]>([])
  const [driverName, setDriverName] = useState<string>('')

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', session.user.id).single()
        const role = profile?.role || null
        setUserRole(role)
        setDriverName(profile?.full_name || '')

        // Driver-specific dashboard data
        if (role === 'driver') {
          const { data: trips } = await supabase
            .from('job_orders')
            .select('id, job_number, client_name, pickup_location, dropoff_location, delivery_date, status, truck:trucks(plate_number)')
            .eq('assigned_driver_id', session.user.id)
            .not('status', 'in', '(cancelled)')
            .order('delivery_date', { ascending: true })
          setDriverTrips(trips || [])
          setLoading(false)
          return
        }

        // Admin/fleet manager dashboard
        const [s, logs] = await Promise.all([
          fetchDashboardStats(),
          fetchActivityLogs(8),
        ])
        setStats(s)
        setActivities(logs)

        const { data: jobsData } = await supabase
          .from('job_orders')
          .select('*, truck:trucks(id, plate_number, truck_type_label, driver_name, owner_name, contact_number, owner_id), driver:profiles!assigned_driver_id(id, full_name, contact_number)')
          .order('created_at', { ascending: false })
          .limit(5)
        setRecentJobs((jobsData || []) as any)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  if (loading) return <DashboardSkeleton />

  // ── Driver Dashboard ─────────────────────────────────────
  if (userRole === 'driver') {
    const activeTrips = driverTrips.filter(t => !['completed', 'delivered', 'cancelled'].includes(t.status))
    const upcomingTrips = activeTrips.filter(t => t.status === 'assigned')
    const inProgressTrips = activeTrips.filter(t => t.status !== 'assigned')

    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-5">
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Hello, {driverName.split(' ')[0]} 👋
          </h1>
          <p className="text-text-muted text-sm mt-0.5">{today}</p>
        </div>

        {/* My Trips CTA */}
        <Link href="/my-trips"
          className="flex items-center justify-between p-4 rounded-xl mb-4 transition-all"
          style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', border: '1px solid rgba(96,165,250,0.3)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Navigation size={20} className="text-white" />
            </div>
            <div>
              <div className="font-heading font-bold text-white text-base">My Trips</div>
              <div className="text-blue-200 text-xs mt-0.5">
                {activeTrips.length > 0
                  ? `${activeTrips.length} active trip${activeTrips.length > 1 ? 's' : ''}`
                  : 'No active trips'}
              </div>
            </div>
          </div>
          <div className="text-white/70 text-2xl font-bold">›</div>
        </Link>

        {/* Active trips summary */}
        {inProgressTrips.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">In Progress</div>
            <div className="space-y-2">
              {inProgressTrips.slice(0, 2).map((trip: any) => (
                <Link key={trip.id} href="/my-trips"
                  className="flex items-center justify-between bg-bg-secondary border border-border rounded-lg p-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-muted font-mono">{trip.job_number}</div>
                    <div className="font-heading text-sm font-semibold text-text-primary truncate">{trip.client_name}</div>
                    <div className="text-xs text-text-muted truncate">{trip.pickup_location} → {trip.dropoff_location}</div>
                  </div>
                  <span className={`ml-2 status-badge flex-shrink-0 ${getJobStatusColor(trip.status)}`}>
                    {(JOB_STATUS_LABELS as any)[trip.status]}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming trips */}
        {upcomingTrips.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Upcoming Assignments</div>
            <div className="space-y-2">
              {upcomingTrips.slice(0, 3).map((trip: any) => (
                <Link key={trip.id} href="/my-trips"
                  className="flex items-center justify-between bg-bg-secondary border border-border rounded-lg p-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-muted font-mono">{trip.job_number}</div>
                    <div className="font-heading text-sm font-semibold text-text-primary truncate">{trip.client_name}</div>
                    <div className="text-xs text-text-muted">📅 {new Date(trip.delivery_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  <div className="ml-2 text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                    Assigned
                  </div>
                </Link>
              ))}
              {upcomingTrips.length > 3 && (
                <Link href="/my-trips" className="text-xs text-brand text-center block py-1">
                  +{upcomingTrips.length - 3} more →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* No trips */}
        {driverTrips.length === 0 && (
          <div className="text-center py-8 bg-bg-secondary border border-border rounded-xl mb-4">
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🚛</div>
            <p className="text-text-secondary font-semibold text-sm">No assigned trips yet</p>
            <p className="text-text-muted text-xs mt-1">Your fleet manager will assign trips here</p>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/emergency"
            className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-danger-bg border border-danger-border text-danger text-center">
            <Phone size={20} />
            <span className="text-xs font-bold">SOS</span>
          </Link>
          <Link href="/incidents"
            className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center">
            <AlertTriangle size={20} />
            <span className="text-xs font-bold">Incident</span>
          </Link>
          <Link href="/chat"
            className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center">
            <MessageCircle size={20} />
            <span className="text-xs font-bold">Messages</span>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-muted text-sm mt-0.5">{today}</p>
      </div>

      {/* Alert Banner */}
      <div className="bg-warning-bg border border-warning-border rounded-md p-3 mb-5 flex items-start gap-3">
        <AlertTriangle size={16} className="text-warning mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-warning text-sm font-semibold">Documents Expiring Soon</p>
          <p className="text-text-muted text-xs mt-0.5">3 truck documents require attention before expiry</p>
        </div>
        <Link href="/fleet?tab=documents" className="text-warning text-xs font-semibold">View</Link>
      </div>

      {/* Stat Grid Row 1 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <StatCard
          label="Active Jobs"
          value={stats?.active_jobs ?? 0}
          sub="↑ Running now"
          accent="border-l-2 border-l-brand"
          href="/jobs"
        />
        <StatCard
          label="Pending"
          value={stats?.pending_jobs ?? 0}
          sub="Awaiting assignment"
          accent="border-l-2 border-l-warning"
          href="/jobs?status=pending_assignment"
        />
        <StatCard
          label="In Transit"
          value={stats?.in_transit ?? 0}
          sub="Live deliveries"
          accent="border-l-2 border-l-success"
          href="/tracking"
        />
        <StatCard
          label="Available Trucks"
          value={stats?.available_trucks ?? 0}
          sub={`of ${stats?.total_trucks ?? 0} registered`}
          accent="border-l-2 border-l-info"
          href="/fleet"
        />
      </div>

      {/* Stat Grid Row 2 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          label="Completed Today"
          value={stats?.completed_today ?? 0}
          sub="Deliveries done"
          valueColor="text-success"
        />
        <StatCard
          label="Total Payables"
          value={formatCurrency(stats?.total_payables ?? 0)}
          sub="Pending payment"
          valueFontSize="text-lg"
          href="/payroll"
        />
        <StatCard
          label="Registered Drivers"
          value={stats?.registered_drivers ?? 0}
          sub="Active fleet members"
          href="/fleet?tab=drivers"
        />
        <StatCard
          label="Cancelled"
          value={stats?.cancelled_this_week ?? 0}
          sub="This period"
          valueColor="text-danger"
          accent="border-l-2 border-l-danger"
        />
      </div>

      {/* Delivery Status Overview */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold text-text-primary">Status Overview</h2>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          {(stats?.jobs_by_status || []).slice(0, 6).map(({ status, count }) => {
            const total = stats?.active_jobs || 1
            const pct = Math.min(100, Math.round((count / Math.max(total, count)) * 100))
            return (
              <div key={status} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary">{JOB_STATUS_LABELS[status] || status}</span>
                  <span className="font-semibold text-text-primary">{count}</span>
                </div>
                <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      status === 'completed' ? 'bg-success' :
                      status === 'in_transit' ? 'bg-brand' :
                      status === 'cancelled' ? 'bg-danger' :
                      status === 'pending_assignment' ? 'bg-warning' : 'bg-info'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold text-text-primary">Recent Job Orders</h2>
          <Link href="/jobs" className="text-xs text-text-muted">See all</Link>
        </div>
        <div className="space-y-2">
          {recentJobs.map((job: any) => (
            <div key={job.id} className="bg-bg-secondary border border-border rounded-lg p-3.5">
              <Link href={`/jobs/${job.id}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-xs text-text-muted font-semibold tracking-wide">{job.job_number}</div>
                    <div className="font-heading text-sm font-semibold text-text-primary mt-0.5">{job.client_name}</div>
                    <div className="text-xs text-text-muted mt-0.5" style={{ color: '#f97316' }}>
                      📅 {job.delivery_date ? new Date(job.delivery_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </div>
                  </div>
                  <span className={`status-badge ${getJobStatusColor(job.status)}`}>
                    {(JOB_STATUS_LABELS as any)[job.status]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                  <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                  <span className="flex-1 truncate">{job.pickup_location}</span>
                  <span>→</span>
                  <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                  <span className="flex-1 truncate text-right">{job.dropoff_location}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-xs text-text-muted">
                    {job.truck ? `🚛 ${job.truck.plate_number} · ${job.truck.truck_type_label}` : '⏳ Unassigned'}
                  </span>
                  <span className="font-heading text-sm font-semibold">
                    {job.total_rate ? formatCurrency(job.total_rate) : '—'}
                  </span>
                </div>
              </Link>
              {/* Contact info */}
              {(job.truck || job.driver) && (
                <div className="mt-2 space-y-1.5">
                  {job.truck?.owner_name && (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-text-muted">
                        🚛 <span className="text-text-secondary font-medium">{job.truck.owner_name}</span>
                        {job.truck.contact_number && <span className="ml-1 text-text-muted">· {job.truck.contact_number}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        {job.truck.contact_number && (
                          <a href={`tel:${job.truck.contact_number}`}
                            className="text-xs px-2 py-1 rounded-md font-semibold"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                            Call
                          </a>
                        )}
                        {job.truck.owner_id && (
                          <Link href={`/chat/${job.truck.owner_id}`}
                            className="text-xs px-2 py-1 rounded-md font-semibold"
                            style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                            Chat
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                  {job.driver?.full_name && (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-text-muted">
                        👤 <span className="text-text-secondary font-medium">{job.driver.full_name}</span>
                        {job.driver.contact_number && <span className="ml-1 text-text-muted">· {job.driver.contact_number}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        {job.driver.contact_number && (
                          <a href={`tel:${job.driver.contact_number}`}
                            className="text-xs px-2 py-1 rounded-md font-semibold"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                            Call
                          </a>
                        )}
                        {job.driver.id && (
                          <Link href={`/chat/${job.driver.id}`}
                            className="text-xs px-2 py-1 rounded-md font-semibold"
                            style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                            Chat
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {recentJobs.length === 0 && (
            <div className="text-center text-text-muted text-sm py-8">No job orders yet</div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="font-heading text-base font-semibold text-text-primary mb-3">Recent Activity</h2>
        <div className="bg-bg-secondary border border-border rounded-lg divide-y divide-border">
          {activities.slice(0, 6).map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3">
              <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-sm flex-shrink-0">
                {log.action === 'create' ? '📋' :
                 log.action === 'assign' ? '🚛' :
                 log.action === 'status_update' ? '📡' :
                 log.action === 'verify' ? '✅' : '📌'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-secondary leading-relaxed">{log.description}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {log.user?.full_name} · {formatRelative(log.created_at)}
                </p>
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-center text-text-muted text-sm py-8">No activity yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function StatCard({
  label, value, sub, accent = '', valueColor = 'text-text-primary',
  valueFontSize = 'text-3xl', href
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
  valueColor?: string
  valueFontSize?: string
  href?: string
}) {
  const content = (
    <div className={`bg-bg-secondary border border-border rounded-md p-3.5 ${accent} cursor-pointer hover:border-border-secondary transition-colors`}>
      <div className="text-xs text-text-muted font-semibold uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`font-heading ${valueFontSize} font-bold ${valueColor} leading-none`}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-1.5">{sub}</div>}
    </div>
  )

  if (href) return <Link href={href}>{content}</Link>
  return content
}

function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-4 w-64" />
      <div className="grid grid-cols-2 gap-3">
        {Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-md" />)}
      </div>
      <div className="skeleton h-40 rounded-lg" />
      <div className="skeleton h-64 rounded-lg" />
    </div>
  )
}
