'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { AlertTriangle, CheckCircle, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function EmergencyPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [activeJobs, setActiveJobs] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [locationText, setLocationText] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [holdInterval, setHoldInterval] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setUserProfile(profile)
      const adminRole = profile?.role === 'admin' || profile?.role === 'fleet_manager'
      setIsAdmin(adminRole)

      // Load active jobs for this user
      if (!adminRole) {
        const { data: jobs } = await supabase.from('job_orders')
          .select('id, job_number, client_name, pickup_location, dropoff_location')
          .eq('assigned_driver_id', session.user.id)
          .in('status', ['assigned', 'accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'])
        setActiveJobs(jobs || [])
        if (jobs && jobs.length === 1) setSelectedJobId(jobs[0].id)
      }

      // Load emergency alerts
      const alertQuery = supabase.from('emergency_alerts')
        .select('*, reporter:profiles!reported_by(full_name, contact_number, role), job:job_orders(job_number, client_name)')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!adminRole) alertQuery.eq('reported_by', session.user.id)
      const { data: alertData } = await alertQuery
      setAlerts(alertData || [])

      // Real-time for admins
      if (adminRole) {
        const channel = supabase.channel('emergency-alerts')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' },
            async (payload) => {
              const { data } = await supabase.from('emergency_alerts')
                .select('*, reporter:profiles!reported_by(full_name, contact_number, role), job:job_orders(job_number, client_name)')
                .eq('id', payload.new.id).single()
              if (data) {
                setAlerts(prev => [data, ...prev])
                // Play alert sound
                try {
                  const ctx = new AudioContext()
                  const osc = ctx.createOscillator()
                  const gain = ctx.createGain()
                  osc.connect(gain); gain.connect(ctx.destination)
                  osc.frequency.value = 880
                  gain.gain.setValueAtTime(0.5, ctx.currentTime)
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1)
                  osc.start(); osc.stop(ctx.currentTime + 1)
                } catch { }
              }
            })
          .subscribe()
        return () => { supabase.removeChannel(channel) }
      }
    }
    load()
  }, [router])

  function getGPS() {
    if (!navigator.geolocation) { toast.error('GPS not available on this device'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationText(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
        setGpsLoading(false)
        toast.success('GPS location captured!')
      },
      () => { setGpsLoading(false); toast.error('Could not get GPS. Type your location manually.') },
      { timeout: 10000 }
    )
  }

  // Hold to send SOS
  function startHold() {
    let progress = 0
    const interval = setInterval(() => {
      progress += 4
      setHoldProgress(progress)
      if (progress >= 100) {
        clearInterval(interval)
        setHoldInterval(null)
        setHoldProgress(0)
        sendSOS()
      }
    }, 100)
    setHoldInterval(interval)
  }

  function stopHold() {
    if (holdInterval) {
      clearInterval(holdInterval)
      setHoldInterval(null)
      setHoldProgress(0)
    }
  }

  async function sendSOS() {
    if (!userId || sending) return
    setSending(true)
    try {
      // Create emergency alert
      const { data: alert, error } = await supabase.from('emergency_alerts').insert({
        reported_by: userId,
        job_order_id: selectedJobId || null,
        location_lat: gpsCoords?.lat || null,
        location_lng: gpsCoords?.lng || null,
        location_text: locationText || 'Location not provided',
        status: 'active',
      }).select().single()

      if (error) throw error

      // Create incident report automatically
      await supabase.from('incident_reports').insert({
        job_order_id: selectedJobId || null,
        reported_by: userId,
        incident_type: 'Driver Emergency',
        description: `🚨 EMERGENCY ALERT from ${userProfile?.full_name}. Location: ${locationText || 'Unknown'}`,
        location: locationText || 'Unknown',
        status: 'open',
      })

      // Notify ALL admins and fleet managers
      const { data: admins } = await supabase.from('profiles')
        .select('id')
        .in('role', ['admin', 'fleet_manager'])

      if (admins && admins.length > 0) {
        await supabase.from('notifications').insert(
          admins.map(admin => ({
            user_id: admin.id,
            type: 'emergency',
            title: '🚨 EMERGENCY ALERT',
            body: `${userProfile?.full_name} needs immediate help! Location: ${locationText || 'Unknown'}`,
            data: { alert_id: alert.id, reporter_id: userId },
          }))
        )
      }

      setSent(true)
      toast.success('🚨 Emergency alert sent! Help is on the way.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to send emergency alert')
    } finally {
      setSending(false)
    }
  }

  async function resolveAlert(alertId: string) {
    await supabase.from('emergency_alerts').update({
      status: 'resolved',
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    }).eq('id', alertId)
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'resolved' } : a))
    toast.success('Alert marked as resolved')
  }

  const activeAlerts = alerts.filter(a => a.status === 'active')
  const resolvedAlerts = alerts.filter(a => a.status === 'resolved')

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Admin view — see all emergency alerts */}
      {isAdmin ? (
        <>
          <div className="mb-5">
            <h1 className="font-heading text-2xl font-bold text-text-primary">Emergency Center</h1>
            <p className="text-text-muted text-sm mt-0.5">Real-time emergency alerts from drivers</p>
          </div>

          {/* Active alerts */}
          {activeAlerts.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                <h2 className="font-heading text-sm font-bold text-danger uppercase tracking-wide">
                  {activeAlerts.length} Active Emergency{activeAlerts.length > 1 ? 'ies' : ''}
                </h2>
              </div>
              <div className="space-y-3">
                {activeAlerts.map(alert => (
                  <div key={alert.id} style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid #ef4444', borderRadius: '12px', padding: '16px' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={20} className="text-danger flex-shrink-0" />
                        <div>
                          <div className="font-heading text-base font-bold text-danger">🚨 EMERGENCY</div>
                          <div className="text-xs text-text-muted">{formatDate(alert.created_at)}</div>
                        </div>
                      </div>
                      <button onClick={() => resolveAlert(alert.id)}
                        className="btn btn-sm btn-success flex items-center gap-1">
                        <CheckCircle size={12} /> Resolve
                      </button>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Driver</span>
                        <span className="font-bold text-text-primary">{alert.reporter?.full_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Contact</span>
                        <a href={`tel:${alert.reporter?.contact_number}`}
                          className="font-bold text-info flex items-center gap-1">
                          <Phone size={12} /> {alert.reporter?.contact_number || '—'}
                        </a>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Location</span>
                        <span className="font-semibold text-text-primary text-right max-w-[60%]">{alert.location_text || '—'}</span>
                      </div>
                      {alert.job && (
                        <div className="flex justify-between text-sm">
                          <span className="text-text-muted">Job</span>
                          <span className="font-semibold text-text-primary">{alert.job.job_number} · {alert.job.client_name}</span>
                        </div>
                      )}
                    </div>

                    {alert.location_lat && alert.location_lng && (
                      <a
                        href={`https://maps.google.com/?q=${alert.location_lat},${alert.location_lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="btn btn-sm btn-outline w-full text-center block"
                        style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                        📍 Open in Google Maps
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeAlerts.length === 0 && (
            <div className="text-center py-8 mb-5 bg-success-bg border border-success-border rounded-lg">
              <CheckCircle size={36} className="text-success mx-auto mb-2" />
              <p className="text-success font-semibold">No active emergencies</p>
              <p className="text-text-muted text-sm mt-1">All drivers are safe</p>
            </div>
          )}

          {/* Resolved alerts history */}
          {resolvedAlerts.length > 0 && (
            <div>
              <h2 className="font-heading text-sm font-semibold text-text-muted uppercase mb-3">Recent History</h2>
              <div className="space-y-2">
                {resolvedAlerts.slice(0, 5).map(alert => (
                  <div key={alert.id} className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-text-secondary">{alert.reporter?.full_name}</div>
                      <div className="text-xs text-text-muted">{alert.location_text} · {formatDate(alert.created_at)}</div>
                    </div>
                    <span className="status-badge bg-success-bg text-success border-success-border">Resolved</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Driver/Truck Owner SOS view */
        <>
          <div className="mb-5">
            <h1 className="font-heading text-2xl font-bold text-text-primary">Emergency SOS</h1>
            <p className="text-text-muted text-sm mt-0.5">Press and hold the button to send alert</p>
          </div>

          {sent ? (
            <div className="text-center py-12">
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🚨</div>
              <h2 className="font-heading text-xl font-bold text-danger mb-2">Alert Sent!</h2>
              <p className="text-text-secondary mb-1">Your emergency alert has been sent to all fleet managers.</p>
              <p className="text-text-muted text-sm mb-6">Stay calm. Help is on the way.</p>
              <button onClick={() => setSent(false)} className="btn btn-secondary">Send Another Alert</button>
            </div>
          ) : (
            <>
              {/* Job selector */}
              {activeJobs.length > 0 && (
                <div className="mb-4">
                  <label className="form-label">Which job are you on?</label>
                  <select className="form-input" value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}>
                    <option value="">— Select job (optional) —</option>
                    {activeJobs.map((job: any) => (
                      <option key={job.id} value={job.id}>{job.job_number} · {job.client_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location */}
              <div className="mb-6">
                <label className="form-label">Your Location</label>
                <div className="flex gap-2">
                  <input className="form-input flex-1" placeholder="Describe your location..." value={locationText} onChange={e => setLocationText(e.target.value)} />
                  <button onClick={getGPS} disabled={gpsLoading} className="btn btn-sm btn-outline flex-shrink-0">
                    {gpsLoading ? '...' : '📍 GPS'}
                  </button>
                </div>
                {gpsCoords && <p className="text-xs text-success mt-1">✓ GPS captured: {gpsCoords.lat.toFixed(4)}, {gpsCoords.lng.toFixed(4)}</p>}
              </div>

              {/* SOS Button */}
              <div className="flex flex-col items-center py-8">
                <p className="text-sm text-text-muted mb-6 text-center">Hold the button for 3 seconds to send SOS</p>

                <div className="relative">
                  {/* Progress ring */}
                  <svg width="180" height="180" style={{ position: 'absolute', top: '-10px', left: '-10px', transform: 'rotate(-90deg)' }}>
                    <circle cx="90" cy="90" r="85" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="6" />
                    <circle cx="90" cy="90" r="85" fill="none" stroke="#ef4444" strokeWidth="6"
                      strokeDasharray={`${2 * Math.PI * 85}`}
                      strokeDashoffset={`${2 * Math.PI * 85 * (1 - holdProgress / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
                  </svg>

                  <button
                    onMouseDown={startHold} onMouseUp={stopHold} onMouseLeave={stopHold}
                    onTouchStart={startHold} onTouchEnd={stopHold}
                    disabled={sending}
                    style={{
                      width: '160px', height: '160px', borderRadius: '50%',
                      background: holdProgress > 0 ? `rgba(239,68,68,${0.7 + holdProgress / 300})` : '#ef4444',
                      border: '4px solid rgba(239,68,68,0.4)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: holdProgress > 0 ? '0 0 40px rgba(239,68,68,0.6)' : '0 0 20px rgba(239,68,68,0.3)',
                      transition: 'all 0.1s',
                      userSelect: 'none', WebkitUserSelect: 'none',
                    }}>
                    <span style={{ fontSize: '40px' }}>🚨</span>
                    <span style={{ color: '#fff', fontWeight: 900, fontSize: '16px', fontFamily: 'var(--font-heading)' }}>
                      {sending ? 'SENDING...' : holdProgress > 0 ? `${Math.round(holdProgress)}%` : 'SOS'}
                    </span>
                  </button>
                </div>

                <p className="text-xs text-danger mt-6 text-center font-semibold">
                  {holdProgress > 0 ? 'Keep holding...' : 'For real emergencies only'}
                </p>
              </div>

              {/* Emergency contacts */}
              <div className="bg-bg-secondary border border-border rounded-lg p-4">
                <div className="text-xs font-bold text-text-muted uppercase mb-3">Emergency Contacts</div>
                <div className="space-y-2">
                  <a href="tel:911" className="flex items-center justify-between p-2.5 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🚔</span>
                      <div>
                        <div className="text-sm font-semibold text-text-primary">Police / Fire / Ambulance</div>
                        <div className="text-xs text-text-muted">National Emergency Hotline</div>
                      </div>
                    </div>
                    <span className="font-heading text-base font-bold text-danger">911</span>
                  </a>
                  <a href="tel:136" className="flex items-center justify-between p-2.5 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🏥</span>
                      <div>
                        <div className="text-sm font-semibold text-text-primary">Red Cross</div>
                        <div className="text-xs text-text-muted">Medical Emergency</div>
                      </div>
                    </div>
                    <span className="font-heading text-base font-bold text-danger">143</span>
                  </a>
                </div>
              </div>
            </>
          )}

          {/* My alert history */}
          {alerts.length > 0 && (
            <div className="mt-5">
              <h2 className="font-heading text-sm font-semibold text-text-muted uppercase mb-3">My Alert History</h2>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-text-muted">{formatDate(alert.created_at)}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{alert.location_text || '—'}</div>
                    </div>
                    <span className={`status-badge ${alert.status === 'resolved' ? 'bg-success-bg text-success border-success-border' : 'bg-danger-bg text-danger border-danger-border'}`}>
                      {alert.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
