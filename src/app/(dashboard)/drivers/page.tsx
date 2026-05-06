'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Plus, X, Upload, Camera, User, Phone, FileText, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DriversPage() {
  const router = useRouter()
  const [drivers, setDrivers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editDriver, setEditDriver] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [medCertFile, setMedCertFile] = useState<File | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name: '', contact_number: '', license_number: '',
    license_expiry: '', med_cert_expiry: '', notes: '', status: 'active',
  })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setUserRole(profile?.role || null)

      await loadDrivers(session.user.id, profile?.role || null)
    }
    load()
  }, [router])

  async function loadDrivers(uid: string, role: string | null) {
    const query = supabase.from('truck_drivers').select('*').order('created_at', { ascending: false })
    if (role !== 'admin' && role !== 'fleet_manager') {
      query.eq('owner_id', uid)
    }
    const { data } = await query
    setDrivers(data || [])
    setLoading(false)
  }

  function resetForm() {
    setForm({ full_name: '', contact_number: '', license_number: '', license_expiry: '', med_cert_expiry: '', notes: '', status: 'active' })
    setLicenseFile(null)
    setMedCertFile(null)
    setPhotoFile(null)
    setPhotoPreview(null)
    setEditDriver(null)
  }

  function openEdit(driver: any) {
    setEditDriver(driver)
    setForm({
      full_name: driver.full_name || '',
      contact_number: driver.contact_number || '',
      license_number: driver.license_number || '',
      license_expiry: driver.license_expiry || '',
      med_cert_expiry: driver.med_cert_expiry || '',
      notes: driver.notes || '',
      status: driver.status || 'active',
    })
    setPhotoPreview(driver.profile_photo_url || null)
    setShowForm(true)
  }

  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('shipro-documents').upload(path, file, { upsert: true })
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('shipro-documents').getPublicUrl(path)
    return publicUrl
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { toast.error('Driver name is required'); return }
    if (!userId) return
    setSaving(true)

    try {
      const driverId = editDriver?.id || crypto.randomUUID()
      let licenseUrl = editDriver?.license_url || null
      let medCertUrl = editDriver?.med_cert_url || null
      let photoUrl = editDriver?.profile_photo_url || null

      if (licenseFile) {
        licenseUrl = await uploadFile(licenseFile, `drivers/${userId}/${driverId}/license.${licenseFile.name.split('.').pop()}`)
      }
      if (medCertFile) {
        medCertUrl = await uploadFile(medCertFile, `drivers/${userId}/${driverId}/medcert.${medCertFile.name.split('.').pop()}`)
      }
      if (photoFile) {
        photoUrl = await uploadFile(photoFile, `drivers/${userId}/${driverId}/photo.${photoFile.name.split('.').pop()}`)
      }

      if (editDriver) {
        const { error } = await supabase.from('truck_drivers').update({
          ...form,
          license_url: licenseUrl,
          med_cert_url: medCertUrl,
          profile_photo_url: photoUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', editDriver.id)
        if (error) throw error
        toast.success('Driver updated!')
      } else {
        const { error } = await supabase.from('truck_drivers').insert({
          id: driverId,
          ...form,
          owner_id: userId,
          license_url: licenseUrl,
          med_cert_url: medCertUrl,
          profile_photo_url: photoUrl,
        })
        if (error) throw error
        toast.success('Driver added!')
      }

      setShowForm(false)
      resetForm()
      await loadDrivers(userId, userRole)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save driver')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(driverId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    await supabase.from('truck_drivers').update({ status: newStatus }).eq('id', driverId)
    toast.success(newStatus === 'active' ? 'Driver reactivated' : 'Driver deactivated')
    await loadDrivers(userId!, userRole)
  }

  const activeDrivers = drivers.filter(d => d.status === 'active')
  const inactiveDrivers = drivers.filter(d => d.status !== 'active')

  const today = new Date().toISOString().split('T')[0]

  function getExpiryStatus(date: string | null) {
    if (!date) return null
    const days = Math.floor((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    if (days < 0) return { label: 'EXPIRED', color: 'text-danger' }
    if (days <= 30) return { label: `${days}d left`, color: 'text-warning' }
    return { label: `${days}d left`, color: 'text-success' }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">My Drivers</h1>
          <p className="text-text-muted text-sm mt-0.5">Manage your driver pool</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={14} /> Add Driver
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
          <div className="font-heading text-2xl font-bold text-success">{activeDrivers.length}</div>
          <div className="text-xs text-text-muted mt-0.5">Active Drivers</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
          <div className="font-heading text-2xl font-bold text-text-muted">{inactiveDrivers.length}</div>
          <div className="text-xs text-text-muted mt-0.5">Inactive</div>
        </div>
      </div>

      {/* Driver List */}
      {loading ? (
        Array(3).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-24 rounded-lg mb-3" />)
      ) : drivers.length === 0 ? (
        <div className="text-center py-12">
          <User size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No drivers added yet</p>
          <p className="text-text-muted text-sm mt-1">Click + Add Driver to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drivers.map(driver => {
            const licenseExp = getExpiryStatus(driver.license_expiry)
            const medExp = getExpiryStatus(driver.med_cert_expiry)
            const hasIssue = (licenseExp && licenseExp.color !== 'text-success') || (medExp && medExp.color !== 'text-success')

            return (
              <div key={driver.id} className={cn(
                'bg-bg-secondary border rounded-lg p-4',
                driver.status !== 'active' ? 'opacity-60 border-border' : hasIssue ? 'border-warning' : 'border-border'
              )}>
                <div className="flex items-start gap-3">
                  {/* Photo */}
                  <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {driver.profile_photo_url
                      ? <img src={driver.profile_photo_url} alt={driver.full_name} className="w-full h-full object-cover" />
                      : <span className="font-heading text-lg font-bold text-text-secondary">{driver.full_name?.charAt(0)}</span>
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-heading text-sm font-bold text-text-primary">{driver.full_name}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                        driver.status === 'active' ? 'bg-success-bg text-success' : 'bg-bg-tertiary text-text-muted')}>
                        {driver.status}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted">📞 {driver.contact_number || '—'}</div>
                    {driver.license_number && <div className="text-xs text-text-muted">🪪 License: {driver.license_number}</div>}

                    {/* Expiry badges */}
                    <div className="flex gap-3 mt-2">
                      {driver.license_expiry && (
                        <div className="text-xs">
                          <span className="text-text-muted">License: </span>
                          <span className={licenseExp?.color}>{licenseExp?.label}</span>
                        </div>
                      )}
                      {driver.med_cert_expiry && (
                        <div className="text-xs">
                          <span className="text-text-muted">Med Cert: </span>
                          <span className={medExp?.color}>{medExp?.label}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Document links */}
                <div className="flex gap-2 mt-3">
                  {driver.license_url && (
                    <a href={driver.license_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm btn-outline text-xs flex items-center gap-1">
                      <FileText size={11} /> License
                    </a>
                  )}
                  {driver.med_cert_url && (
                    <a href={driver.med_cert_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm btn-outline text-xs flex items-center gap-1">
                      <FileText size={11} /> Med Cert
                    </a>
                  )}
                  <button onClick={() => openEdit(driver)}
                    className="btn btn-sm btn-secondary text-xs ml-auto">
                    ✏️ Edit
                  </button>
                  <button onClick={() => handleDeactivate(driver.id, driver.status)}
                    className={cn('btn btn-sm text-xs', driver.status === 'active' ? 'btn-outline' : 'btn-success')}>
                    {driver.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>

                {driver.notes && (
                  <div className="mt-2 text-xs text-text-muted bg-bg-tertiary rounded p-2">{driver.notes}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Driver Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">{editDriver ? '✏️ Edit Driver' : '👤 Add New Driver'}</h2>
              <button onClick={() => { setShowForm(false); resetForm() }}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">

              {/* Photo */}
              <div>
                <label className="form-label">Driver Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
                    {photoPreview
                      ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      : <Camera size={24} className="text-text-muted" />
                    }
                  </div>
                  <label className="btn btn-sm btn-outline cursor-pointer flex items-center gap-1.5">
                    <Upload size={12} /> {photoPreview ? 'Change Photo' : 'Upload Photo'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setPhotoFile(file)
                        const reader = new FileReader()
                        reader.onload = ev => setPhotoPreview(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }
                    }} />
                  </label>
                </div>
              </div>

              {/* Basic Info */}
              <div>
                <label className="form-label">Full Name *</label>
                <input className="form-input" placeholder="Juan dela Cruz" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>

              <div>
                <label className="form-label">Contact Number</label>
                <input className="form-input" placeholder="+63 9XX XXX XXXX" value={form.contact_number}
                  onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">License Number</label>
                <input className="form-input" placeholder="Professional Driver's License #" value={form.license_number}
                  onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} />
              </div>

              {/* Driver's License */}
              <div>
                <label className="form-label">Driver's License Document</label>
                <div className="flex gap-2 items-center">
                  <label className="btn btn-sm btn-outline cursor-pointer flex items-center gap-1.5 flex-1">
                    <Upload size={12} />
                    {licenseFile ? licenseFile.name.substring(0, 20) + '...' : editDriver?.license_url ? 'Replace License' : 'Upload License'}
                    <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                      onChange={e => e.target.files?.[0] && setLicenseFile(e.target.files[0])} />
                  </label>
                  {editDriver?.license_url && !licenseFile && (
                    <a href={editDriver.license_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary text-xs">View</a>
                  )}
                </div>
                <label className="form-label mt-2">License Expiry Date</label>
                <input className="form-input" type="date" value={form.license_expiry}
                  onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))} />
              </div>

              {/* Medical Certificate */}
              <div>
                <label className="form-label">Medical Certificate</label>
                <div className="flex gap-2 items-center">
                  <label className="btn btn-sm btn-outline cursor-pointer flex items-center gap-1.5 flex-1">
                    <Upload size={12} />
                    {medCertFile ? medCertFile.name.substring(0, 20) + '...' : editDriver?.med_cert_url ? 'Replace Med Cert' : 'Upload Med Cert'}
                    <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                      onChange={e => e.target.files?.[0] && setMedCertFile(e.target.files[0])} />
                  </label>
                  {editDriver?.med_cert_url && !medCertFile && (
                    <a href={editDriver.med_cert_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary text-xs">View</a>
                  )}
                </div>
                <label className="form-label mt-2">Med Cert Expiry Date</label>
                <input className="form-input" type="date" value={form.med_cert_expiry}
                  onChange={e => setForm(f => ({ ...f, med_cert_expiry: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} placeholder="Any additional notes about this driver..."
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : editDriver ? 'Save Changes' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
