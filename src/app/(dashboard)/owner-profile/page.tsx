'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Upload, CheckCircle, Clock, XCircle, Users, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function OwnerProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [driverApplications, setDriverApplications] = useState<any[]>([])
  const [myDrivers, setMyDrivers] = useState<any[]>([])
  const [myTrucks, setMyTrucks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'documents' | 'drivers' | 'trucks'>('drivers')
  const [saving, setSaving] = useState(false)
  const [businessPermitFile, setBusinessPermitFile] = useState<File | null>(null)
  const [validIdFile, setValidIdFile] = useState<File | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const [profRes, appsRes, driversRes, trucksRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('driver_applications')
          .select('*, driver:profiles!driver_id(id, full_name, contact_number, email)')
          .eq('truck_owner_id', session.user.id)
          .order('submitted_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, contact_number, email, is_verified, license_number, license_expiry, med_cert_expiry')
          .eq('owner_id', session.user.id)
          .eq('role', 'driver'),
        supabase.from('trucks').select('*, documents:truck_documents(id, document_type, expiry_date, status)').eq('owner_id', session.user.id),
      ])

      setProfile(profRes.data)
      setDriverApplications(appsRes.data || [])
      setMyDrivers(driversRes.data || [])
      setMyTrucks(trucksRes.data || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('shipro-documents').upload(path, file, { upsert: true })
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('shipro-documents').getPublicUrl(path)
    return publicUrl
  }

  async function handleUploadDocs() {
    if (!businessPermitFile && !validIdFile) { toast.error('Please select at least one file'); return }
    setSaving(true)
    try {
      const updates: any = {}
      if (businessPermitFile) {
        const url = await uploadFile(businessPermitFile, `owner-docs/${userId}/business-permit.${businessPermitFile.name.split('.').pop()}`)
        if (url) updates.business_permit_url = url
      }
      if (validIdFile) {
        const url = await uploadFile(validIdFile, `owner-docs/${userId}/valid-id.${validIdFile.name.split('.').pop()}`)
        if (url) updates.valid_id_url = url
      }
      await supabase.from('profiles').update(updates).eq('id', userId)
      setProfile((p: any) => ({ ...p, ...updates }))
      toast.success('Documents uploaded!')
      setBusinessPermitFile(null)
      setValidIdFile(null)
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  async function handleDriverApplication(appId: string, driverId: string, action: 'approve' | 'reject', remarks?: string) {
    const newStatus = action === 'approve' ? 'owner_approved' : 'rejected'
    await supabase.from('driver_applications').update({
      status: newStatus,
      owner_remarks: remarks || null,
      owner_reviewed_at: new Date().toISOString(),
    }).eq('id', appId)

    if (action === 'approve') {
      // Update driver's owner_id
      await supabase.from('profiles').update({ owner_id: userId }).eq('id', driverId)

      // Notify driver
      await supabase.from('notifications').insert({
        user_id: driverId,
        type: 'application',
        title: '✅ Application Approved by Truck Owner',
        body: `${profile?.full_name} has approved your application. Waiting for fleet manager verification.`,
      })
    } else {
      await supabase.from('notifications').insert({
        user_id: driverId,
        type: 'application',
        title: '❌ Application Rejected',
        body: `Your application was rejected. ${remarks || ''}`,
      })
    }

    toast.success(action === 'approve' ? 'Driver approved!' : 'Driver rejected')
    const { data } = await supabase.from('driver_applications')
      .select('*, driver:profiles!driver_id(id, full_name, contact_number, email)')
      .eq('truck_owner_id', userId!)
      .order('submitted_at', { ascending: false })
    setDriverApplications(data || [])
  }

  const pendingApps = driverApplications.filter(a => a.status === 'pending')
  const approvedDrivers = driverApplications.filter(a => a.status === 'owner_approved' || a.status === 'fleet_approved')

  if (loading) return <div className="p-4 space-y-3">{Array(4).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center font-heading text-2xl font-bold text-text-secondary">
          {profile?.full_name?.charAt(0) || '?'}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold">{profile?.full_name}</h1>
            {profile?.is_verified && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                ✓ Verified
              </span>
            )}
          </div>
          <div className="text-sm text-text-muted">🚛 Truck Owner</div>
          {profile?.company_name && <div className="text-sm text-text-muted">{profile.company_name}</div>}
        </div>
      </div>

      {/* Alert for pending driver apps */}
      {pendingApps.length > 0 && (
        <div className="mb-4 p-3 rounded-lg flex items-center gap-2"
          style={{ background: 'rgba(249,115,22,0.1)', border: '1.5px solid #f97316' }}>
          <span className="text-lg">🙋</span>
          <div>
            <div className="text-sm font-bold" style={{ color: '#f97316' }}>{pendingApps.length} driver application{pendingApps.length > 1 ? 's' : ''} waiting for your review</div>
            <button onClick={() => setTab('drivers')} className="text-xs underline" style={{ color: '#f97316' }}>Review now →</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'drivers', label: `Drivers (${driverApplications.length})`, icon: Users },
          { key: 'trucks', label: `Trucks (${myTrucks.length})`, icon: Truck },
          { key: 'documents', label: 'My Documents', icon: Upload },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
              tab === t.key ? 'bg-brand text-bg-primary' : 'bg-bg-secondary border border-border text-text-secondary')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Drivers Tab */}
      {tab === 'drivers' && (
        <div className="space-y-3">
          {/* Pending Applications */}
          {pendingApps.length > 0 && (
            <div>
              <div className="text-xs font-bold text-warning uppercase mb-2">⏳ Pending Review</div>
              {pendingApps.map(app => (
                <DriverApplicationCard key={app.id} app={app} onApprove={(remarks) => handleDriverApplication(app.id, app.driver_id, 'approve', remarks)}
                  onReject={(remarks) => handleDriverApplication(app.id, app.driver_id, 'reject', remarks)} />
              ))}
            </div>
          )}

          {/* Active Drivers */}
          {myDrivers.length > 0 && (
            <div>
              <div className="text-xs font-bold text-text-muted uppercase mb-2">✅ Active Drivers</div>
              {myDrivers.map(driver => (
                <div key={driver.id} className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center font-bold text-text-secondary">
                    {driver.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-text-primary">{driver.full_name}</div>
                    <div className="text-xs text-text-muted">{driver.contact_number}</div>
                    {driver.license_number && <div className="text-xs text-text-muted">🪪 {driver.license_number}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {driver.is_verified
                      ? <span className="text-xs text-success font-bold">✓ Verified</span>
                      : <span className="text-xs text-warning font-bold">Pending</span>}
                    <a href={`tel:${driver.contact_number}`} className="text-xs text-info">📞 Call</a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {driverApplications.length === 0 && myDrivers.length === 0 && (
            <div className="text-center py-10 text-text-muted text-sm">
              <Users size={36} className="mx-auto mb-2 opacity-40" />
              No driver applications yet. Drivers will apply through their app.
            </div>
          )}
        </div>
      )}

      {/* Trucks Tab */}
      {tab === 'trucks' && (
        <div className="space-y-3">
          {myTrucks.length === 0 ? (
            <div className="text-center py-10 text-text-muted text-sm">
              <Truck size={36} className="mx-auto mb-2 opacity-40" />
              No trucks registered yet.
            </div>
          ) : myTrucks.map((truck: any) => (
            <div key={truck.id} className="bg-bg-secondary border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-bold text-sm">{truck.plate_number}</div>
                  <div className="text-xs text-text-muted">{truck.truck_type_label}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${truck.verification_status === 'approved' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                  {truck.verification_status}
                </span>
              </div>
              <div className="text-xs text-text-muted">CBM: {truck.cbm_capacity} · Driver: {truck.driver_name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Documents Tab */}
      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="text-xs text-text-muted">Upload your business documents for fleet manager verification</div>

          {/* Business Permit */}
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">Business Permit</div>
              {profile?.business_permit_url
                ? <a href={profile.business_permit_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-info underline">View uploaded</a>
                : <span className="text-xs text-danger">Not uploaded</span>}
            </div>
            <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-border-secondary">
              <Upload size={14} className="text-text-muted" />
              <span className="text-xs text-text-secondary">{businessPermitFile ? businessPermitFile.name : 'Upload Business Permit'}</span>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                onChange={e => e.target.files?.[0] && setBusinessPermitFile(e.target.files[0])} />
            </label>
          </div>

          {/* Valid ID */}
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">Valid Government ID</div>
              {profile?.valid_id_url
                ? <a href={profile.valid_id_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-info underline">View uploaded</a>
                : <span className="text-xs text-danger">Not uploaded</span>}
            </div>
            <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-border-secondary">
              <Upload size={14} className="text-text-muted" />
              <span className="text-xs text-text-secondary">{validIdFile ? validIdFile.name : 'Upload Valid ID'}</span>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                onChange={e => e.target.files?.[0] && setValidIdFile(e.target.files[0])} />
            </label>
          </div>

          {(businessPermitFile || validIdFile) && (
            <button onClick={handleUploadDocs} disabled={saving} className="btn btn-primary btn-full">
              {saving ? 'Uploading...' : '⬆️ Upload Documents'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DriverApplicationCard({ app, onApprove, onReject }: {
  app: any
  onApprove: (remarks?: string) => void
  onReject: (remarks?: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [remarks, setRemarks] = useState('')

  return (
    <div className="bg-bg-secondary border border-warning-border rounded-lg overflow-hidden mb-2">
      <div className="p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm text-text-primary">{app.driver?.full_name}</div>
            <div className="text-xs text-text-muted">{app.driver?.contact_number} · {app.driver?.email}</div>
            <div className="text-xs text-text-muted mt-0.5">Applied: {formatDate(app.submitted_at)}</div>
          </div>
          <span className="text-xs text-warning font-bold">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
          {/* Documents */}
          <div className="flex gap-2">
            {app.driver_license_url && (
              <a href={app.driver_license_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                🪪 View License
              </a>
            )}
            {app.med_cert_url && (
              <a href={app.med_cert_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                🏥 Med Cert
              </a>
            )}
          </div>
          {app.license_number && <div className="text-xs text-text-muted">License #: {app.license_number}</div>}
          <div>
            <label className="form-label">Remarks (optional)</label>
            <input className="form-input text-sm" placeholder="Add a note..."
              value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => onReject(remarks)} className="btn btn-sm btn-danger flex-1">✗ Reject</button>
            <button onClick={() => onApprove(remarks)} className="btn btn-sm btn-success flex-1">✓ Approve & Forward</button>
          </div>
        </div>
      )}
    </div>
  )
}
