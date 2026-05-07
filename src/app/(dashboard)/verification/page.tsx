'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { CheckCircle, XCircle, Users, Truck, Building } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContactCard from '@/components/ContactCard'

export default function VerificationPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [tab, setTab] = useState<'owners' | 'drivers' | 'trucks'>('owners')
  const [truckOwners, setTruckOwners] = useState<any[]>([])
  const [driverApps, setDriverApps] = useState<any[]>([])
  const [trucks, setTrucks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (!['admin', 'fleet_manager'].includes(profile?.role)) { router.push('/dashboard'); return }
      setUserRole(profile?.role)

      await loadAll()
    }
    load()
  }, [router])

  async function loadAll() {
    const [ownersRes, appsRes, trucksRes] = await Promise.all([
      supabase.from('profiles')
        .select('*, trucks:trucks(id, plate_number, verification_status), drivers:profiles!owner_id(id, full_name, is_verified)')
        .eq('role', 'truck_owner')
        .order('created_at', { ascending: false }),
      supabase.from('driver_applications')
        .select('*, driver:profiles!driver_id(id, full_name, contact_number, email, license_number), truck_owner:profiles!truck_owner_id(full_name, company_name)')
        .eq('status', 'owner_approved')
        .order('submitted_at', { ascending: false }),
      supabase.from('trucks')
        .select('*, owner:profiles!owner_id(id, full_name, contact_number, email, company_name, business_permit_url, valid_id_url), documents:truck_documents(id, document_type, file_url, expiry_date, status)')
        .order('created_at', { ascending: false }),
    ])

    setTruckOwners(ownersRes.data || [])
    setDriverApps(appsRes.data || [])
    setTrucks(trucksRes.data || [])
    setLoading(false)
  }

  async function verifyOwner(ownerId: string, verified: boolean) {
    await supabase.from('profiles').update({
      is_verified: verified,
      verified_by: userId,
      verified_at: new Date().toISOString(),
    }).eq('id', ownerId)

    await supabase.from('notifications').insert({
      user_id: ownerId,
      type: 'general',
      title: verified ? '✅ Account Verified!' : '❌ Verification Rejected',
      body: verified ? 'Your truck owner account has been verified by the fleet manager.' : 'Your verification was not approved. Please contact the fleet manager.',
    })

    toast.success(verified ? 'Truck owner verified!' : 'Owner rejected')
    await loadAll()
  }

  async function approveDriverApp(appId: string, driverId: string, approve: boolean, remarks?: string) {
    const newStatus = approve ? 'fleet_approved' : 'rejected'
    await supabase.from('driver_applications').update({
      status: newStatus,
      fleet_remarks: remarks || null,
      fleet_reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    }).eq('id', appId)

    if (approve) {
      await supabase.from('profiles').update({ is_verified: true, verified_by: userId, verified_at: new Date().toISOString() }).eq('id', driverId)
    }

    await supabase.from('notifications').insert({
      user_id: driverId,
      type: 'application',
      title: approve ? '✅ Driver Verified!' : '❌ Application Rejected',
      body: approve ? 'Fleet manager has verified your driver account. You can now receive job assignments.' : `Application rejected by fleet manager. ${remarks || ''}`,
    })

    toast.success(approve ? 'Driver verified!' : 'Application rejected')
    await loadAll()
  }

  async function verifyTruck(truckId: string, ownerId: string, approved: boolean) {
    await supabase.from('trucks').update({
      verification_status: approved ? 'approved' : 'rejected',
    }).eq('id', truckId)

    await supabase.from('notifications').insert({
      user_id: ownerId,
      type: 'general',
      title: approved ? '✅ Truck Approved!' : '❌ Truck Rejected',
      body: approved ? 'Your truck has been verified and approved.' : 'Your truck registration was rejected.',
    })

    toast.success(approved ? 'Truck approved!' : 'Truck rejected')
    await loadAll()
  }

  const pendingOwners = truckOwners.filter(o => !o.is_verified)
  const verifiedOwners = truckOwners.filter(o => o.is_verified)

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold">Verification Center</h1>
        <p className="text-text-muted text-sm mt-0.5">Verify truck owners, drivers and trucks</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center cursor-pointer" onClick={() => setTab('owners')}>
          <div className="font-heading text-2xl font-bold text-warning">{pendingOwners.length}</div>
          <div className="text-xs text-text-muted">Owners Pending</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center cursor-pointer" onClick={() => setTab('drivers')}>
          <div className="font-heading text-2xl font-bold text-info">{driverApps.length}</div>
          <div className="text-xs text-text-muted">Drivers Pending</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center cursor-pointer" onClick={() => setTab('trucks')}>
          <div className="font-heading text-2xl font-bold text-info">{trucks.length}</div>
          <div className="text-xs text-text-muted">Total Trucks</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'owners', label: `Truck Owners (${truckOwners.length})` },
          { key: 'drivers', label: `Driver Apps (${driverApps.length})` },
          { key: 'trucks', label: `Trucks (${trucks.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
              tab === t.key ? 'bg-brand text-bg-primary' : 'bg-bg-secondary border border-border text-text-secondary')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? Array(3).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-24 rounded-lg mb-3" />) : (
        <>
          {/* Truck Owners Tab */}
          {tab === 'owners' && (
            <div className="space-y-3">
              {pendingOwners.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-warning uppercase mb-2">⏳ Awaiting Verification</div>
                  {pendingOwners.map(owner => (
                    <OwnerCard key={owner.id} owner={owner}
                      onVerify={() => verifyOwner(owner.id, true)}
                      onReject={() => verifyOwner(owner.id, false)} />
                  ))}
                </div>
              )}
              {verifiedOwners.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-success uppercase mb-2">✅ Verified Owners</div>
                  {verifiedOwners.map(owner => (
                    <OwnerCard key={owner.id} owner={owner} verified />
                  ))}
                </div>
              )}
              {truckOwners.length === 0 && (
                <div className="text-center py-10 text-text-muted text-sm">No truck owners registered yet</div>
              )}
            </div>
          )}

          {/* Driver Applications Tab */}
          {tab === 'drivers' && (
            <div className="space-y-3">
              {driverApps.length === 0 ? (
                <div className="text-center py-10 text-text-muted text-sm">
                  <Users size={36} className="mx-auto mb-2 opacity-40" />
                  No driver applications awaiting fleet approval
                </div>
              ) : driverApps.map(app => (
                <DriverAppCard key={app.id} app={app}
                  onApprove={(remarks: string) => approveDriverApp(app.id, app.driver_id, true, remarks)}
                  onReject={(remarks: string) => approveDriverApp(app.id, app.driver_id, false, remarks)} />
              ))}
            </div>
          )}

          {/* Trucks Tab */}
          {tab === 'trucks' && (
            <div className="space-y-3">
              {trucks.length === 0 ? (
                <div className="text-center py-10 text-text-muted text-sm">
                  <Truck size={36} className="mx-auto mb-2 opacity-40" />
                  No trucks pending verification
                </div>
              ) : trucks.map(truck => (
                <TruckVerificationCard key={truck.id} truck={truck}
                  onApprove={() => verifyTruck(truck.id, truck.owner_id, true)}
                  onReject={() => verifyTruck(truck.id, truck.owner_id, false)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OwnerCard({ owner, verified, onVerify, onReject }: any) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden mb-2">
      <div className="p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center font-bold text-text-secondary">
              {owner.full_name?.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                {owner.full_name}
                {owner.is_verified && <span className="text-xs text-success">✓</span>}
              </div>
              <div className="text-xs text-text-muted">{owner.company_name || 'Individual'} · {owner.contact_number}</div>
              <div className="text-xs text-text-muted">🚛 {owner.trucks?.length || 0} trucks · 👤 {owner.drivers?.length || 0} drivers</div>
            </div>
          </div>
          <span className="text-xs text-text-muted">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
          <div className="flex gap-2">
            {owner.business_permit_url && (
              <a href={owner.business_permit_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                📋 Business Permit
              </a>
            )}
            {owner.valid_id_url && (
              <a href={owner.valid_id_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                🪪 Valid ID
              </a>
            )}
          </div>
          {!owner.business_permit_url && !owner.valid_id_url && (
            <div className="text-xs text-warning">⚠️ No documents uploaded yet</div>
          )}
          {!verified && (
            <div className="flex gap-2">
              <button onClick={onReject} className="btn btn-sm btn-danger flex-1">✗ Reject</button>
              <button onClick={onVerify} className="btn btn-sm btn-success flex-1">✓ Verify Owner</button>
            </div>
          )}
          {verified && (
            <div className="text-xs text-success font-semibold">✓ Already verified</div>
          )}
        </div>
      )}
    </div>
  )
}

function TruckVerificationCard({ truck, onApprove, onReject }: any) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden mb-2">
      <div className="p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">{truck.plate_number}</div>
            <div className="text-xs text-text-muted">{truck.truck_type_label} · {truck.cbm_capacity} CBM</div>
            <div className="text-xs text-text-muted">Owner: {truck.owner?.full_name} {truck.owner?.company_name ? `· ${truck.owner.company_name}` : ''}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-badge ${
              truck.verification_status === 'approved' ? 'bg-success-bg text-success border-success-border' :
              truck.verification_status === 'rejected' ? 'bg-danger-bg text-danger border-danger-border' :
              'bg-warning-bg text-warning border-warning-border'
            }`}>{truck.verification_status}</span>
            <span className="text-xs text-text-muted">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
          {/* Truck Info */}
          <div className="bg-bg-tertiary rounded-lg p-3 space-y-1.5">
            <div className="text-xs font-bold text-text-muted uppercase mb-1">🚛 Truck Details</div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">Plate</span><span className="font-bold text-text-primary">{truck.plate_number}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">Type</span><span className="font-semibold text-text-primary">{truck.truck_type_label}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">CBM</span><span className="font-semibold text-text-primary">{truck.cbm_capacity} CBM</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">Load</span><span className="font-semibold text-text-primary">{truck.load_capacity_kg} kg</span></div>
            {truck.ltfrb_number && <div className="flex justify-between text-xs"><span className="text-text-muted">LTFRB</span><span className="font-semibold text-text-primary">{truck.ltfrb_number}</span></div>}
          </div>

          {/* Owner Info */}
          <div className="bg-bg-tertiary rounded-lg p-3 space-y-1.5">
            <div className="text-xs font-bold text-text-muted uppercase mb-1">👤 Owner Details</div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">Name</span><span className="font-semibold text-text-primary">{truck.owner?.full_name}</span></div>
            {truck.owner?.company_name && <div className="flex justify-between text-xs"><span className="text-text-muted">Business</span><span className="font-semibold text-text-primary">{truck.owner.company_name}</span></div>}
            <div className="flex justify-between text-xs"><span className="text-text-muted">Contact</span><span className="font-semibold text-text-primary">{truck.owner?.contact_number}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">Email</span><span className="font-semibold text-text-primary truncate max-w-[60%]">{truck.owner?.email}</span></div>
          </div>

          {/* Owner Documents */}
          {(truck.owner?.business_permit_url || truck.owner?.valid_id_url) && (
            <div>
              <div className="text-xs font-bold text-text-muted uppercase mb-2">Owner Documents</div>
              <div className="flex gap-2 flex-wrap">
                {truck.owner?.business_permit_url && (
                  <a href={truck.owner.business_permit_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded font-semibold"
                    style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    📋 Business Permit
                  </a>
                )}
                {truck.owner?.valid_id_url && (
                  <a href={truck.owner.valid_id_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded font-semibold"
                    style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    🪪 Valid ID
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Truck Documents */}
          {truck.documents && truck.documents.length > 0 && (
            <div>
              <div className="text-xs font-bold text-text-muted uppercase mb-2">Truck Documents ({truck.documents.length})</div>
              <div className="space-y-1.5">
                {truck.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between bg-bg-tertiary rounded p-2">
                    <div>
                      <div className="text-xs font-medium text-text-primary">{doc.document_type}</div>
                      {doc.expiry_date && <div className="text-xs text-text-muted">Expires: {doc.expiry_date}</div>}
                    </div>
                    {doc.file_url ? (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-1 rounded font-semibold"
                        style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-danger">Not uploaded</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {truck.verification_status === 'pending' && (
            <div className="flex gap-2">
              <button onClick={onReject} className="btn btn-sm btn-danger flex-1">✗ Reject</button>
              <button onClick={onApprove} className="btn btn-sm btn-success flex-1">✓ Approve Truck</button>
            </div>
          )}
          {truck.verification_status === 'approved' && (
            <div className="text-xs text-success font-semibold text-center py-1">✓ Already approved</div>
          )}
          {truck.verification_status === 'rejected' && (
            <div className="flex gap-2">
              <div className="text-xs text-danger font-semibold flex-1 text-center py-1">✗ Rejected</div>
              <button onClick={onApprove} className="btn btn-sm btn-success flex-1">Re-approve</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DriverAppCard({ app, onApprove, onReject }: any) {
  const [expanded, setExpanded] = useState(false)
  const [remarks, setRemarks] = useState('')
  return (
    <div className="bg-bg-secondary border border-info-border rounded-lg overflow-hidden">
      <div className="p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">{app.driver?.full_name}</div>
            <div className="text-xs text-text-muted">Under: {app.truck_owner?.full_name}</div>
            <div className="text-xs text-text-muted">Applied: {formatDate(app.submitted_at)}</div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>Owner Approved</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
          <div className="flex gap-2">
            {app.driver_license_url && (
              <a href={app.driver_license_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                🪪 License
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
          {app.owner_remarks && <div className="text-xs text-text-muted bg-bg-tertiary p-2 rounded">Owner note: {app.owner_remarks}</div>}
          <div>
            <label className="form-label">Fleet Manager Remarks</label>
            <input className="form-input text-sm" placeholder="Optional remarks..." value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => onReject(remarks)} className="btn btn-sm btn-danger flex-1">✗ Reject</button>
            <button onClick={() => onApprove(remarks)} className="btn btn-sm btn-success flex-1">✓ Verify Driver</button>
          </div>
        </div>
      )}
    </div>
  )
}
