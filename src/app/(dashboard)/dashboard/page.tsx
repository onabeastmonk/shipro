'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchDashboardStats, fetchJobOrders, fetchActivityLogs } from '@/lib/api'
import { formatCurrency, formatRelative, getJobStatusColor } from '@/lib/utils'
import type { DashboardStats, JobOrder } from '@/types'
import { JOB_STATUS_LABELS } from '@/types'
import { TrendingUp, AlertTriangle, Package, Users, Truck, DollarSign } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<JobOrder[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, jobs, logs] = await Promise.all([
          fetchDashboardStats(),
          fetchJobOrders({ limit: 5 }),
          fetchActivityLogs(8),
        ])
        setStats(s)
        setRecentJobs(jobs)
        setActivities(logs)
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
          {recentJobs.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <div className="bg-bg-secondary border border-border rounded-lg p-3.5 hover:border-border-secondary transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-xs text-text-muted font-semibold tracking-wide">{job.job_number}</div>
                    <div className="font-heading text-sm font-semibold text-text-primary mt-0.5">{job.client_name}</div>
                  </div>
                  <span className={`status-badge ${getJobStatusColor(job.status)}`}>
                    {JOB_STATUS_LABELS[job.status]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                  <span className="flex-1 truncate">{job.pickup_location}</span>
                  <span>→</span>
                  <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                  <span className="flex-1 truncate text-right">{job.dropoff_location}</span>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                  <span className="text-xs text-text-muted">
                    {job.truck ? `🚛 ${job.truck.plate_number}` : '⏳ Unassigned'}
                  </span>
                  <span className="font-heading text-sm font-semibold">
                    {job.total_rate ? formatCurrency(job.total_rate) : '—'}
                  </span>
                </div>
              </div>
            </Link>
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
