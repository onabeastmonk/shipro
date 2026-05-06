'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { ChevronLeft, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const INCIDENT_TYPES = [
  'Vehicle Breakdown',
  'Road Accident',
  'Traffic / Road Closure',
  'Weather Condition',
  'Cargo Damage',
  'Cannot Locate Address',
  'Client Not Available',
  'Refused Delivery',
  'Stolen / Lost Cargo',
  'Driver Emergency',
  'Others',
]

export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [myJobs, setMyJobs] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    job_order_id: '',
    incident_type: '',
    description: '',
    location: '',
    action_taken: '',
    reported_at: new Date().toISOString().slice(0, 16),
  })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setUserRole(profile?.role || null)

      // Load incidents
      const { data: inc } = await supabase
        .from('incident_reports')
        .select('*, job_order:job_orders(job_number, client_name, pickup_location, dropoff_location), reporter:profiles!reported_by(full_name)')
        .order('created_at', { ascending: false })
      setIncidents(inc || [])

      // Load jobs for the reporter (driver sees own, admin sees all)
      if (profile?.role === 'driver') {
        const { data: jobs } = await supabase
          .from('job_orders')
          .select('id, job_number, client_name, status')
          .eq('assigned_driver_id', session.user.id)
          .in('status', ['assigned', 'accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'])
        setMyJobs(jobs || [])
      } else {
        const { data: jobs } = await supabase
          .from('job_orders')
          .select('id, job_number, client_name, status')
          .not('status', 'in', '("completed","cancelled","draft")')
          .order('created_at', { ascending: false })
          .limit(30)
        setMyJobs(jobs || [])
      }

      setLoading(false)
    }
    load()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.job_order_id || !form.incident_type || !form.description) {
      toast.error('Please fill in all required fields')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('incident_reports').insert({
        ...form,
        reported_by: userId,
        status: 'open',
      })
      if (error) throw error
      toast.success('Incident report submitted!')
      setShowForm(false)
      setForm({ job_order_id: '', incident_type: '', description: '', location: '', action_taken: '', reported_at: new Date().toISOString().slice(0, 16) })

      // Reload
      const { data: inc } = await supabase
        .from('incident_reports')
        .select('*, job_order:job_orders(job_number, client_name, pickup_location, dropoff_location), reporter:profiles!reported_by(full_name)')
        .order('created_at', { ascending: false })
      setIncidents(inc || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report')
    } finally {
      setSaving(false)
    }
  }

  const statusColor: Record<string, string> = {
    open: 'bg-danger-bg text-danger border-danger-border',
    in_review: 'bg-warning-bg text-warning border-warning-border',
    resolved: 'bg-success-bg text-success border-success-border',
    closed: 'bg-bg-tertiary text-text-muted border-border',
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Incident Reports</h1>
          <p className="text-text-muted text-sm mt-0.5">Report delivery issues and incidents</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={14} /> Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Open', count: incidents.filter(i => i.status === 'open').length, color: 'text-danger' },
          { label: 'In Review', count: incidents.filter(i => i.status === 'in_review').length, color: 'text-warning' },
          { label: 'Resolved', count: incidents.filter(i => i.status === 'resolved').length, color: 'text-success' },
        ].map(s => (
          <div key={s.label} className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
            <div className={`font-heading text-2xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? (
        Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-lg mb-3" />)
      ) : incidents.length === 0 ? (
        <div className="text-center py-12">
          <AlertTriangle size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No incidents reported</p>
          <p className="text-text-muted text-sm mt-1">Click + Report to file a new incident</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(incident => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              statusColor={statusColor}
              isAdmin={userRole === 'admin'}
              onStatusChange={async (newStatus: string) => {
                await supabase.from('incident_reports').update({ status: newStatus }).eq('id', incident.id)
                setIncidents(prev => prev.map(i => i.id === incident.id ? { ...i, status: newStatus } : i))
                toast.success('Status updated')
              }}
            />
          ))}
        </div>
      )}

      {/* Report Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-heading text-base font-bold">🚨 File Incident Report</h2>
              <button onClick={() => setShowForm(false)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="form-label">Job Order *</label>
                <select className="form-input" value={form.job_order_id} onChange={e => setForm(f => ({ ...f, job_order_id: e.target.value }))} required>
                  <option value="">— Select job order —</option>
                  {myJobs.map(job => (
                    <option key={job.id} value={job.id}>{job.job_number} · {job.client_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Incident Type *</label>
                <select className="form-input" value={form.incident_type} onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))} required>
                  <option value="">— Select type —</option>
                  {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Current Location</label>
                <input className="form-input" placeholder="Where did this happen?" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Description *</label>
                <textarea className="form-input" rows={4} placeholder="Describe what happened in detail..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
              </div>
              <div>
                <label className="form-label">Action Taken</label>
                <textarea className="form-input" rows={3} placeholder="What did you do about it?" value={form.action_taken} onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Date & Time of Incident</label>
                <input className="form-input" type="datetime-local" value={form.reported_at} onChange={e => setForm(f => ({ ...f, reported_at: e.target.value }))} />
              </div>
              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-danger flex-1">
                  {saving ? 'Submitting...' : '🚨 Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function IncidentCard({ incident, statusColor, isAdmin, onStatusChange }: any) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🚨</span>
              <span className="font-heading text-sm font-bold text-text-primary">{incident.incident_type}</span>
            </div>
            <div className="text-xs text-text-muted">{incident.job_order?.job_number} · {incident.job_order?.client_name}</div>
            <div className="text-xs text-text-muted mt-0.5">By {incident.reporter?.full_name} · {formatDate(incident.created_at, 'MMM dd, h:mm a')}</div>
          </div>
          <span className={`status-badge ${statusColor[incident.status] || statusColor.open}`}>
            {incident.status?.replace('_', ' ')}
          </span>
        </div>
        <p className="text-xs text-text-secondary line-clamp-2">{incident.description}</p>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {incident.location && (
            <div><span className="text-xs text-text-muted">📍 Location: </span><span className="text-xs text-text-secondary">{incident.location}</span></div>
          )}
          <div><span className="text-xs text-text-muted font-semibold block mb-1">Description</span>
            <p className="text-xs text-text-secondary">{incident.description}</p></div>
          {incident.action_taken && (
            <div><span className="text-xs text-text-muted font-semibold block mb-1">Action Taken</span>
              <p className="text-xs text-text-secondary">{incident.action_taken}</p></div>
          )}
          {incident.job_order && (
            <div className="bg-bg-tertiary rounded p-2.5 text-xs text-text-muted">
              🚛 {incident.job_order.pickup_location} → {incident.job_order.dropoff_location}
            </div>
          )}
          {isAdmin && (
            <div>
              <label className="text-xs text-text-muted font-semibold block mb-1.5">Update Status</label>
              <div className="flex gap-2 flex-wrap">
                {['open', 'in_review', 'resolved', 'closed'].map(s => (
                  <button key={s} onClick={() => onStatusChange(s)}
                    className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-all',
                      incident.status === s ? 'bg-brand text-bg-primary border-brand' : 'bg-bg-tertiary border-border text-text-secondary')}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
