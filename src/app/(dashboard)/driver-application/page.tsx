'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Upload, CheckCircle, Clock, XCircle, Search } from 'lucide-react'

export default function DriverApplicationPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [myApplication, setMyApplication] = useState<any>(null)
  const [truckOwners, setTruckOwners] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showApplyForm, setShowApplyForm] = useState(false)
  const [selectedOwner, setSelectedOwner] = useState<any>(null)
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [medCertFile, setMedCertFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    license_number: '',
    license_expiry: '',
    med_cert_expiry: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(prof)

      // Load existing application
      const { data: app } = await supabase
        .from('driver_applications')
        .select('*, truck_owner:profiles!truck_owner_id(full_name, company_name, contact_number)')
        .eq('driver_id', session.user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()
      setMyApplication(app || null)

      // Load truck owners
      const { data: owners } = await supabase
        .from('profiles')
        .select('id, full_name, company_name, contact_number, is_verified')
        .eq('role', 'truck_owner')
        .order('full_name')
      setTruckOwners(owners || [])
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

  async function handleApply() {
    if (!selectedOwner) { toast.error('Please select a truck owner'); return }
    if (!licenseFile) { toast.error('Please upload your driver\'s license'); return }
    if (!form.license_number) { toast.error('Please enter your license number'); return }
    setSaving(true)
    try {
      const licenseUrl = await uploadFile(licenseFile, `driver-docs/${userId}/license.${licenseFile.name.split('.').pop()}`)
      let medCertUrl = null
      if (medCertFile) {
        medCertUrl = await uploadFile(medCertFile, `driver-docs/${userId}/medcert.${medCertFile.name.split('.').pop()}`)
      }

      const { error } = await supabase.from('driver_applications').upsert({
        driver_id: userId,
        truck_owner_id: selectedOwner.id,
        status: 'pending',
        driver_license_url: licenseUrl,
        med_cert_url: medCertUrl,
        license_number: form.license_number,
        license_expiry: form.license_expiry || null,
        med_cert_expiry: form.med_cert_expiry || null,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' })

      if (error) throw error

      // Update driver profile with owner_id
      await supabase.from('profiles').update({
        owner_id: selectedOwner.id,
        license_number: form.license_number,
        license_expiry: form.license_expiry || null,
        med_cert_expiry: form.med_cert_expiry || null,
      }).eq('id', userId)

      // Notify truck owner
      await supabase.from('notifications').insert({
        user_id: selectedOwner.id,
        type: 'application',
        title: '🚗 New Driver Application',
        body: `${profile?.full_name} has applied to join your team`,
        data: { driver_id: userId },
      })

      toast.success('Application submitted! Waiting for truck owner approval.')
      setShowApplyForm(false)
      const { data: app } = await supabase
        .from('driver_applications')
        .select('*, truck_owner:profiles!truck_owner_id(full_name, company_name, contact_number)')
        .eq('driver_id', userId!)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()
      setMyApplication(app || null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit application')
    } finally { setSaving(false) }
  }

  const statusInfo: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: 'Waiting for Truck Owner Review', color: 'text-warning', icon: Clock },
    owner_approved: { label: 'Truck Owner Approved — Waiting Fleet Manager', color: 'text-info', icon: Clock },
    fleet_approved: { label: 'Fully Verified & Approved!', color: 'text-success', icon: CheckCircle },
    rejected: { label: 'Application Rejected', color: 'text-danger', icon: XCircle },
  }

  const filteredOwners = truckOwners.filter(o =>
    o.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="p-4 space-y-3">{Array(4).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold">Driver Application</h1>
        <p className="text-text-muted text-sm mt-0.5">Register under a truck owner to start receiving jobs</p>
      </div>

      {/* Current Application Status */}
      {myApplication && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-5">
          <div className="text-xs text-text-muted uppercase font-bold mb-3">Your Application</div>
          {(() => {
            const info = statusInfo[myApplication.status] || statusInfo.pending
            const Icon = info.icon
            return (
              <div className="flex items-start gap-3">
                <Icon size={20} className={info.color} />
                <div className="flex-1">
                  <div className={`font-semibold text-sm ${info.color}`}>{info.label}</div>
                  <div className="text-xs text-text-muted mt-1">
                    Under: <strong>{myApplication.truck_owner?.full_name}</strong>
                    {myApplication.truck_owner?.company_name && ` · ${myApplication.truck_owner.company_name}`}
                  </div>
                  <div className="text-xs text-text-muted">Submitted: {formatDate(myApplication.submitted_at)}</div>
                  {myApplication.owner_remarks && (
                    <div className="mt-2 p-2 bg-bg-tertiary rounded text-xs">
                      <span className="text-text-muted">Truck Owner Note: </span>{myApplication.owner_remarks}
                    </div>
                  )}
                  {myApplication.fleet_remarks && (
                    <div className="mt-1 p-2 bg-bg-tertiary rounded text-xs">
                      <span className="text-text-muted">Fleet Manager Note: </span>{myApplication.fleet_remarks}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Documents */}
          <div className="flex gap-2 mt-3">
            {myApplication.driver_license_url && (
              <a href={myApplication.driver_license_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                🪪 View License
              </a>
            )}
            {myApplication.med_cert_url && (
              <a href={myApplication.med_cert_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                🏥 View Med Cert
              </a>
            )}
          </div>

          {myApplication.status === 'rejected' && (
            <button onClick={() => setShowApplyForm(true)} className="btn btn-primary btn-sm mt-3 w-full">
              Resubmit Application
            </button>
          )}
        </div>
      )}

      {!myApplication && !showApplyForm && (
        <div className="text-center py-10 bg-bg-secondary border border-border rounded-lg">
          <div className="text-5xl mb-3">🚗</div>
          <p className="text-text-secondary font-semibold">No application yet</p>
          <p className="text-text-muted text-sm mt-1 mb-4">Select a truck owner and submit your documents</p>
          <button onClick={() => setShowApplyForm(true)} className="btn btn-primary">
            Apply Now
          </button>
        </div>
      )}

      {/* Application Form */}
      {showApplyForm && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-4">
          <h2 className="font-heading text-base font-bold">Submit Application</h2>

          {/* Select truck owner */}
          <div>
            <label className="form-label">Select Your Truck Owner / Company *</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input className="form-input pl-8 text-sm" placeholder="Search truck owner..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filteredOwners.map(owner => (
                <div key={owner.id} onClick={() => setSelectedOwner(owner)}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: selectedOwner?.id === owner.id ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                    border: selectedOwner?.id === owner.id ? '1.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{owner.full_name}</div>
                    {owner.company_name && <div className="text-xs text-text-muted">{owner.company_name}</div>}
                  </div>
                  {owner.is_verified && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>✓ Verified</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* License */}
          <div>
            <label className="form-label">License Number *</label>
            <input className="form-input" placeholder="Professional Driver's License #"
              value={form.license_number} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Driver's License *</label>
            <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-border-secondary">
              <Upload size={16} className="text-text-muted" />
              <span className="text-sm text-text-secondary">{licenseFile ? licenseFile.name : 'Upload Driver\'s License'}</span>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                onChange={e => e.target.files?.[0] && setLicenseFile(e.target.files[0])} />
            </label>
          </div>
          <div>
            <label className="form-label">License Expiry Date</label>
            <input className="form-input" type="date" value={form.license_expiry}
              onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))} />
          </div>

          <div className="h-px bg-border" />

          {/* Med cert */}
          <div>
            <label className="form-label">Medical Certificate</label>
            <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-border-secondary">
              <Upload size={16} className="text-text-muted" />
              <span className="text-sm text-text-secondary">{medCertFile ? medCertFile.name : 'Upload Medical Certificate'}</span>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                onChange={e => e.target.files?.[0] && setMedCertFile(e.target.files[0])} />
            </label>
          </div>
          <div>
            <label className="form-label">Med Cert Expiry Date</label>
            <input className="form-input" type="date" value={form.med_cert_expiry}
              onChange={e => setForm(f => ({ ...f, med_cert_expiry: e.target.value }))} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowApplyForm(false)} className="btn btn-secondary flex-1">Cancel</button>
            <button onClick={handleApply} disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'Submitting...' : '✓ Submit Application'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
