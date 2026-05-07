'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, getJobStatusColor } from '@/lib/utils'
import { JOB_STATUS_LABELS, DELIVERY_STEPS, type JobOrder, type JobStatus } from '@/types'
import { ChevronLeft, CheckCircle, Circle, Clock, Upload, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContactCard from '@/components/ContactCard'

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [job, setJob] = useState<JobOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userTrucks, setUserTrucks] = useState<any[]>([])
  const [selectedTruckId, setSelectedTruckId] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [myApplication, setMyApplication] = useState<any>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState<any>(null)
  const [viewTruckDetails, setViewTruckDetails] = useState<any>(null)
  const [myDrivers, setMyDrivers] = useState<any[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [helperName, setHelperName] = useState<string>('')
  const [helperContact, setHelperContact] = useState<string>('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setUserRole(profile?.role || null)

      // Load all driver's approved and available trucks
      if (profile?.role === 'truck_owner') {
        const { data: trucks } = await supabase
          .from('trucks')
          .select('*')
          .eq('owner_id', session.user.id)
          .eq('verification_status', 'approved')
          .eq('availability', 'available')
        setUserTrucks(trucks || [])
        if (trucks && trucks.length > 0) setSelectedTruckId(trucks[0].id)

        const { data: drivers } = await supabase
          .from('truck_drivers')
          .select('*')
          .eq('owner_id', session.user.id)
          .eq('status', 'active')
        setMyDrivers(drivers || [])
      }

      await loadJob(session.user.id)
    }
    load()
  }, [id, router])

  async function loadJob(uid?: string) {
    try {
      const { data, error } = await supabase
        .from('job_orders')
        .select(`
          *,
          truck:trucks(id, plate_number, truck_type_label, driver_name, owner_name, contact_number),
          driver:profiles!assigned_driver_id(id, full_name, contact_number, email),
          shipment_items(*),
          status_logs:delivery_status_logs(*, logged_by_profile:profiles!logged_by(full_name)),
          applicants:job_applicants(
            *,
            truck:trucks(id, plate_number, truck_type_label, owner_name, driver_name, cbm_capacity, verification_status),
            driver:profiles!driver_id(id, full_name, contact_number)
          )
        `)
        .eq('id', id)
        .single()

      if (error) { toast.error('Job order not found'); return }
      setJob(data as any)

      // Find my application
      const myUid = uid || userId
      if (myUid && data.applicants) {
        const mine = data.applicants.find((a: any) => a.driver_id === myUid)
        setMyApplication(mine || null)
      }
    } catch { toast.error('Failed to load job') }
    finally { setLoading(false) }
  }

  async function handleApply() {
    if (!userId || !selectedTruckId) {
      toast.error('Please select a truck to apply with')
      return
    }
    if (userTrucks.length === 0) {
      toast.error('You need an approved available truck to apply')
      return
    }
    setApplying(true)
    try {
      const { error } = await supabase.from('job_applicants').insert({
        job_order_id: id,
        truck_id: selectedTruckId,
        driver_id: userId,
        status: 'pending',
        selected_driver_id: selectedDriverId || null,
        selected_helper_name: helperName || null,
        selected_helper_contact: helperContact || null,
      })
      if (error) throw error

      // Update job status to pending_selection if it's open
      await supabase.from('job_orders').update({ status: 'pending_selection' }).eq('id', id).eq('status', 'open_for_applications')

      toast.success('Application submitted!')
      await loadJob()
    } catch (err: any) {
      toast.error(err.message?.includes('unique') ? 'You already applied to this job' : err.message)
    } finally { setApplying(false) }
  }

  async function handleWithdraw() {
    if (!myApplication) return
    await supabase.from('job_applicants').update({ status: 'withdrawn' }).eq('id', myApplication.id)
    toast.success('Application withdrawn')
    await loadJob()
  }

  async function handleApproveApplicant(applicant: any) {
    if (!userId || !job) return
    setUpdatingStatus(true)
    try {
      // Approve selected applicant
      await supabase.from('job_applicants').update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() }).eq('id', applicant.id)

      // Reject all others
      await supabase.from('job_applicants').update({ status: 'rejected' })
        .eq('job_order_id', id).neq('id', applicant.id)

      // Assign to job
      await supabase.from('job_orders').update({
        status: 'assigned',
        assigned_truck_id: applicant.truck_id,
        assigned_driver_id: applicant.driver_id,
      }).eq('id', id)

      // Mark truck as on_job
      await supabase.from('trucks').update({ availability: 'on_job' }).eq('id', applicant.truck_id)

      // Log activity
      await supabase.from('delivery_status_logs').insert({
        job_order_id: id, status: 'assigned',
        note: `Assigned to ${applicant.truck?.owner_name || 'driver'}`,
        logged_by: userId,
      })

      toast.success(`✅ ${applicant.truck?.owner_name} assigned to this job!`)
      setShowApproveConfirm(null)
      await loadJob()
    } catch (err: any) {
      toast.error(err.message)
    } finally { setUpdatingStatus(false) }
  }

  async function handleRejectApplicant(applicantId: string) {
    await supabase.from('job_applicants').update({ status: 'rejected' }).eq('id', applicantId)
    toast.success('Applicant rejected')
    await loadJob()
  }

  async function handleStatusUpdate(newStatus: JobStatus) {
    if (!userId || !job) return

    // Only assigned driver or admin can update status
    if (userRole === 'truck_owner' && job.assigned_driver_id !== userId) {
      toast.error('Only the assigned truck owner can update delivery status')
      return
    }

    setUpdatingStatus(true)
    try {
      await supabase.from('job_orders').update({ status: newStatus }).eq('id', id)
      await supabase.from('delivery_status_logs').insert({
        job_order_id: id, status: newStatus, logged_by: userId,
      })

      // Free truck when completed
      if (newStatus === 'completed' && job.assigned_truck_id) {
        await supabase.from('trucks').update({ availability: 'available' }).eq('id', job.assigned_truck_id)
      }

      setJob(prev => prev ? { ...prev, status: newStatus } : null)
      toast.success(`Status updated to ${JOB_STATUS_LABELS[newStatus]}`)
      setShowStatusModal(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally { setUpdatingStatus(false) }
  }

  async function handlePostJob() {
    await supabase.from('job_orders').update({ status: 'open_for_applications' }).eq('id', id)
    toast.success('Job posted! Drivers can now apply.')
    await loadJob()
  }

  async function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId || !job) return
    const path = `proof/${id}/${Date.now()}.${file.name.split('.').pop()}`
    const { error: uploadError } = await supabase.storage.from('shipro-documents').upload(path, file)
    if (uploadError) { toast.error('Upload failed'); return }
    const { data: { publicUrl } } = supabase.storage.from('shipro-documents').getPublicUrl(path)
    await supabase.from('delivery_status_logs').insert({
      job_order_id: id, status: 'delivered', proof_url: publicUrl,
      note: 'Proof of delivery uploaded', logged_by: userId,
    })
    await supabase.from('job_orders').update({ status: 'delivered' }).eq('id', id)
    toast.success('Proof of delivery uploaded!')
    await loadJob()
  }

  if (loading) return <DetailSkeleton />
  if (!job) return <div className="text-center p-8 text-text-muted">Job order not found</div>

  const currentStepIndex = DELIVERY_STEPS.indexOf(job.status as JobStatus)
  const statusLog = job.status_logs || []
  const totalCBM = job.shipment_items?.reduce((sum: number, item: any) => sum + (item.total_cbm || 0), 0) ?? job.total_cbm ?? 0
  const isAdmin = userRole === 'admin' || userRole === 'fleet_manager'
  const isTruckOwner = userRole === 'truck_owner'
  const isAssignedTruckOwner = isTruckOwner && job.assigned_driver_id === userId
  const pendingApplicants = (job.applicants || []).filter((a: any) => a.status === 'pending')

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href="/jobs" className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="flex-1">
          <div className="text-xs text-text-muted font-mono">{job.job_number}</div>
          <h1 className="font-heading text-sm font-semibold leading-tight">{job.client_name}</h1>
        </div>
        <span className={`status-badge ${getJobStatusColor(job.status)}`}>
          {JOB_STATUS_LABELS[job.status]}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Route + date card */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          {/* Orange date */}
          <div className="mb-3" style={{ color: '#f97316', fontSize: '15px', fontWeight: 700 }}>
            📅 {new Date(job.delivery_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {job.delivery_time && <span className="ml-2 text-sm">· {job.delivery_time}</span>}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-xs text-text-muted font-semibold uppercase">Pickup</span>
              </div>
              <p className="text-sm text-text-primary leading-snug">{job.pickup_location}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-danger" />
                <span className="text-xs text-text-muted font-semibold uppercase">Drop-off</span>
              </div>
              <p className="text-sm text-text-primary leading-snug">{job.dropoff_location}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border text-xs">
            <div>
              <span className="text-text-muted">Total Rate</span>
              <p className="font-heading text-base font-bold text-text-primary mt-0.5">
                {job.total_rate ? formatCurrency(job.total_rate) : '—'}
              </p>
            </div>
            <div>
              <span className="text-text-muted">Category</span>
              <p className="text-text-primary font-medium mt-0.5 capitalize">{job.shipment_category}</p>
            </div>
            <div>
              <span className="text-text-muted">Total CBM</span>
              <p style={{ color: '#60a5fa', fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                {totalCBM > 0 ? `${totalCBM.toFixed(2)} CBM` : '—'}
              </p>
            </div>
          </div>

          {job.goods_description && (
            <div className="mt-3 pt-3 border-t border-border">
              <span className="text-xs text-text-muted">Goods</span>
              <p className="text-sm text-text-secondary mt-0.5">{job.goods_description}</p>
            </div>
          )}
          {job.special_instructions && (
            <div className="mt-2 bg-warning-bg border border-warning-border rounded p-2.5">
              <span className="text-xs font-semibold text-warning">⚠️ Special Instructions</span>
              <p className="text-xs text-text-secondary mt-1">{job.special_instructions}</p>
            </div>
          )}
        </div>

        {/* ADMIN: Post job button */}
        {isAdmin && job.status === 'draft' && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <p className="text-sm text-text-secondary mb-3">This job is a draft. Post it so drivers can apply.</p>
            <button onClick={handlePostJob} className="btn btn-primary btn-full">
              📢 Post Job — Open for Applications
            </button>
          </div>
        )}

        {/* TRUCK OWNER: Apply section */}
        {userRole === 'truck_owner' && (job.status === 'open_for_applications' || job.status === 'pending_selection' || job.status === 'posted') && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-xs font-semibold text-text-muted uppercase mb-3">Your Application</div>
            {!myApplication ? (
              <div>
                {userTrucks.length === 0 ? (
                  <div className="bg-warning-bg border border-warning-border rounded p-3 mb-3">
                    <p className="text-xs text-warning">⚠️ You need an approved available truck to apply. <Link href="/fleet/register" className="underline">Register one</Link>.</p>
                    <p className="text-xs text-text-muted mt-1">Note: Trucks currently on a job are not available until the job is completed.</p>
                  </div>
                ) : (
                  <div className="mb-3">
                    <label className="text-xs text-text-muted font-semibold uppercase mb-2 block">Select Truck to Apply With</label>
                    <div className="space-y-2">
                      {userTrucks.map((truck: any) => (
                        <div
                          key={truck.id}
                          onClick={() => setSelectedTruckId(truck.id)}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all',
                            selectedTruckId === truck.id
                              ? 'border-brand bg-bg-elevated'
                              : 'border-border bg-bg-tertiary hover:border-border-secondary'
                          )}
                        >
                          <div className={cn(
                            'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                            selectedTruckId === truck.id ? 'border-brand' : 'border-border-secondary'
                          )}>
                            {selectedTruckId === truck.id && <div className="w-2 h-2 rounded-full bg-brand" />}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-text-primary">{truck.plate_number}</div>
                            <div className="text-xs text-text-muted">{truck.truck_type_label} · {truck.cbm_capacity} CBM</div>
                          </div>
                          <span className="text-xs text-success font-medium">● Available</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Driver selection */}
                {myDrivers.length > 0 && (
                  <div className="mb-3">
                    <label className="text-xs text-text-muted font-semibold uppercase mb-2 block">Select Driver for this Trip</label>
                    <select className="form-input" value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)}>
                      <option value="">— Select driver —</option>
                      {myDrivers.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.full_name} · {d.contact_number || '—'}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Helper */}
                <div className="mb-3">
                  <label className="text-xs text-text-muted font-semibold uppercase mb-2 block">Helper / Pahinante (Optional)</label>
                  <input className="form-input mb-2" placeholder="Helper full name" value={helperName} onChange={e => setHelperName(e.target.value)} />
                  <input className="form-input" placeholder="Helper contact number" value={helperContact} onChange={e => setHelperContact(e.target.value)} />
                </div>

                <button
                  onClick={handleApply}
                  disabled={applying || userTrucks.length === 0 || !selectedTruckId}
                  className="btn btn-primary btn-full"
                >
                  {applying ? 'Submitting...' : '✋ Apply for this Job'}
                </button>
              </div>
            ) : (
              <div>
                <div className={cn(
                  'rounded-md p-3 mb-3 text-sm font-semibold text-center',
                  myApplication.status === 'approved' ? 'bg-success-bg text-success border border-success-border' :
                  myApplication.status === 'rejected' ? 'bg-danger-bg text-danger border border-danger-border' :
                  myApplication.status === 'withdrawn' ? 'bg-bg-tertiary text-text-muted border border-border' :
                  'bg-warning-bg text-warning border border-warning-border'
                )}>
                  {myApplication.status === 'approved' ? '✅ You are assigned to this job!' :
                   myApplication.status === 'rejected' ? '❌ Application not selected' :
                   myApplication.status === 'withdrawn' ? '↩️ Application withdrawn' :
                   '⏳ Application pending admin review'}
                </div>
                {myApplication.status === 'pending' && (
                  <button onClick={handleWithdraw} className="btn btn-outline btn-sm btn-full">
                    Withdraw Application
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Assigned Truck + Contact */}
        {job.truck && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-3">
            <div className="text-xs text-text-muted font-semibold uppercase">Assigned Truck</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-bg-tertiary flex items-center justify-center text-xl flex-shrink-0">🚛</div>
              <div className="flex-1">
                <div className="font-heading text-sm font-semibold">{job.truck.plate_number}</div>
                <div className="text-xs text-text-muted">{job.truck.truck_type_label}</div>
              </div>
            </div>
            {job.driver && (
              <ContactCard
                userId={job.assigned_driver_id}
                name={(job.driver as any).full_name}
                role="truck_owner"
                contactNumber={(job.driver as any).contact_number}
                email={(job.driver as any).email}
                label="Truck Owner / Driver"
              />
            )}
            {!job.driver && job.truck.owner_name && (
              <ContactCard
                name={job.truck.owner_name}
                contactNumber={job.truck.contact_number}
                label="Truck Owner"
              />
            )}
          </div>
        )}

        {/* ADMIN: Applicants list */}
        {isAdmin && (job.applicants || []).length > 0 && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-text-muted font-semibold uppercase">
                Applicants ({(job.applicants || []).length})
              </div>
              {pendingApplicants.length > 0 && (
                <span style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '999px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>
                  {pendingApplicants.length} pending
                </span>
              )}
            </div>
            <div className="space-y-3">
              {(job.applicants || []).map((applicant: any) => (
                <div key={applicant.id} className={cn(
                  'rounded-md p-3 border',
                  applicant.status === 'approved' ? 'bg-success-bg border-success-border' :
                  applicant.status === 'rejected' ? 'bg-danger-bg border-danger-border opacity-60' :
                  applicant.status === 'withdrawn' ? 'bg-bg-tertiary border-border opacity-50' :
                  'bg-bg-tertiary border-border-secondary'
                )}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="font-heading text-sm font-semibold">{applicant.truck?.owner_name || applicant.driver?.full_name}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {applicant.truck?.plate_number} · {applicant.truck?.truck_type_label} · {applicant.truck?.cbm_capacity} CBM
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        📞 {applicant.driver?.contact_number || '—'}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full border',
                          applicant.truck?.verification_status === 'approved'
                            ? 'bg-success-bg text-success border-success-border'
                            : 'bg-warning-bg text-warning border-warning-border'
                        )}>
                          {applicant.truck?.verification_status === 'approved' ? '✓ Verified' : '⚠ Unverified'}
                        </span>
                        <button
                          onClick={() => setViewTruckDetails(applicant)}
                          style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)', color: '#60a5fa', borderRadius: '999px', padding: '1px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          🔍 View Full Details
                        </button>
                      </div>
                    </div>
                    <span className={cn(
                      'status-badge flex-shrink-0',
                      applicant.status === 'approved' ? 'bg-success-bg text-success border-success-border' :
                      applicant.status === 'rejected' ? 'bg-danger-bg text-danger border-danger-border' :
                      applicant.status === 'withdrawn' ? 'bg-bg-tertiary text-text-muted border-border' :
                      'bg-warning-bg text-warning border-warning-border'
                    )}>
                      {applicant.status}
                    </span>
                  </div>

                  {applicant.status === 'pending' && job.status !== 'assigned' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleRejectApplicant(applicant.id)}
                        className="btn btn-sm btn-danger flex-1"
                      >
                        ✗ Reject
                      </button>
                      <button
                        onClick={() => setShowApproveConfirm(applicant)}
                        disabled={applicant.truck?.verification_status !== 'approved'}
                        className="btn btn-sm btn-success flex-1"
                      >
                        ✓ Assign
                      </button>
                    </div>
                  )}
                  {applicant.status === 'pending' && applicant.truck?.verification_status !== 'approved' && (
                    <p className="text-xs text-warning mt-1">⚠️ Truck not yet verified — approve with caution</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delivery Timeline */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="text-xs text-text-muted font-semibold uppercase mb-3">Delivery Progress</div>
          <div className="space-y-0">
            {DELIVERY_STEPS.map((step, i) => {
              const isDone = i < currentStepIndex
              const isCurrent = i === currentStepIndex
              const log = statusLog.find((l: any) => l.status === step)
              return (
                <div key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${isDone ? 'bg-success' : isCurrent ? 'bg-brand pulse-ring' : 'bg-border-secondary'}`} />
                    {i < DELIVERY_STEPS.length - 1 && (
                      <div className={`w-px flex-1 mt-0.5 min-h-[20px] ${isDone ? 'bg-success' : 'bg-border'}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className={`text-sm font-medium ${isDone ? 'text-text-secondary' : isCurrent ? 'text-text-primary' : 'text-text-muted'}`}>
                      {JOB_STATUS_LABELS[step]}
                    </div>
                    {log && (
                      <div className="text-xs text-text-muted mt-0.5">
                        {formatDate(log.logged_at, 'MMM dd h:mm a')}
                        {log.note && ` · ${log.note}`}
                      </div>
                    )}
                    {isCurrent && <div className="text-xs text-warning mt-0.5 animate-pulse">In progress...</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Shipment Items */}
        {job.shipment_items && job.shipment_items.length > 0 && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-xs text-text-muted font-semibold uppercase mb-3">Shipment Items</div>
            <div className="divide-y divide-border">
              {job.shipment_items.map((item: any) => (
                <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{item.item_name}</div>
                    <div className="flex gap-2 mt-0.5">
                      {item.is_fragile && <span className="text-xs text-warning">⚠️ Fragile</span>}
                      {item.requires_special_handling && <span className="text-xs text-info">🔧 Special Handling</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-text-primary">×{item.quantity}</div>
                    <div className="text-xs" style={{ color: '#60a5fa' }}>{item.total_cbm?.toFixed(3)} CBM</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs">
              <span className="text-text-muted">Total CBM</span>
              <span style={{ color: '#60a5fa', fontWeight: 700 }}>{totalCBM.toFixed(3)} CBM</span>
            </div>
          </div>
        )}

        {/* Proof of Delivery */}
        {(isAdmin || isAssignedTruckOwner) && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-xs text-text-muted font-semibold uppercase mb-3">Proof of Delivery</div>
            {statusLog.find((l: any) => l.proof_url) ? (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle size={16} />
                <span>Proof uploaded</span>
                <a href={statusLog.find((l: any) => l.proof_url)?.proof_url} target="_blank" className="ml-auto text-xs text-text-muted underline">View</a>
              </div>
            ) : (
              <label className="border border-dashed border-border-secondary rounded-md p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-border-active transition-colors">
                <Upload size={24} className="text-text-muted" />
                <span className="text-sm text-text-secondary">Upload proof of delivery</span>
                <span className="text-xs text-text-muted">Photo or PDF</span>
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofUpload} />
              </label>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          {isAdmin && (
            <button onClick={() => setShowStatusModal(true)} className="btn btn-primary flex-1">
              Update Status
            </button>
          )}
          {isAssignedTruckOwner && (
            <button onClick={() => setShowStatusModal(true)} className="btn btn-primary flex-1">
              Update Delivery Status
            </button>
          )}
          {isAdmin && (
            <Link href={`/jobs/${id}/edit`} className="btn btn-secondary flex-1 justify-center text-center">
              Edit Order
            </Link>
          )}
        </div>
      </div>

      {/* Truck Details Popup */}
      {viewTruckDetails && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[85vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-heading text-base font-bold text-text-primary">🚛 Truck Details</h2>
                <p className="text-xs text-text-muted mt-0.5">Applicant information</p>
              </div>
              <button
                onClick={() => setViewTruckDetails(null)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', color: '#a0a0a0' }}
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* Verification status banner */}
              <div style={{
                background: viewTruckDetails.truck?.verification_status === 'approved' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                border: `1px solid ${viewTruckDetails.truck?.verification_status === 'approved' ? '#16532d' : '#713f12'}`,
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <span style={{ fontSize: '20px' }}>{viewTruckDetails.truck?.verification_status === 'approved' ? '✅' : '⚠️'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: viewTruckDetails.truck?.verification_status === 'approved' ? '#22c55e' : '#f59e0b' }}>
                    {viewTruckDetails.truck?.verification_status === 'approved' ? 'Verified Truck' : 'Not Yet Verified'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#a0a0a0', marginTop: '1px' }}>
                    {viewTruckDetails.truck?.verification_status === 'approved' ? 'Documents checked and approved by admin' : 'Pending admin verification'}
                  </div>
                </div>
              </div>

              {/* Owner Info */}
              <div>
                <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Owner Information</div>
                <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
                  <DetailRow label="Owner Name" value={viewTruckDetails.truck?.owner_name || '—'} />
                  <DetailRow label="Contact Number" value={viewTruckDetails.driver?.contact_number || '—'} />
                  <DetailRow label="Email" value={viewTruckDetails.driver?.full_name || '—'} />
                </div>
              </div>

              {/* Truck Info */}
              <div>
                <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Truck Information</div>
                <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
                  <DetailRow label="Plate Number" value={viewTruckDetails.truck?.plate_number || '—'} highlight />
                  <DetailRow label="Truck Type" value={viewTruckDetails.truck?.truck_type_label || '—'} />
                  <DetailRow label="CBM Capacity" value={viewTruckDetails.truck?.cbm_capacity ? `${viewTruckDetails.truck.cbm_capacity} CBM` : '—'} highlight />
                  <DetailRow label="Driver Name" value={viewTruckDetails.truck?.driver_name || '—'} />
                </div>
              </div>

              {/* Job requirement comparison */}
              {job?.required_truck_type_label && (
                <div>
                  <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Job Requirements Match</div>
                  <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-text-muted">Required Truck</span>
                      <span className="text-xs font-semibold text-text-primary">{job.required_truck_type_label}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-text-muted">Applicant Truck</span>
                      <span className="text-xs font-semibold text-text-primary">{viewTruckDetails.truck?.truck_type_label}</span>
                    </div>
                    {job.total_cbm && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted">Required CBM</span>
                          <span className="text-xs font-semibold text-text-primary">{job.total_cbm} CBM</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted">Truck CBM</span>
                          <span className={`text-xs font-bold ${viewTruckDetails.truck?.cbm_capacity >= job.total_cbm ? 'text-success' : 'text-danger'}`}>
                            {viewTruckDetails.truck?.cbm_capacity} CBM {viewTruckDetails.truck?.cbm_capacity >= job.total_cbm ? '✓ Sufficient' : '✗ Insufficient'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {viewTruckDetails.status === 'pending' && job?.status !== 'assigned' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { handleRejectApplicant(viewTruckDetails.id); setViewTruckDetails(null) }}
                    className="btn btn-danger flex-1"
                  >
                    ✗ Reject
                  </button>
                  <button
                    onClick={() => { setShowApproveConfirm(viewTruckDetails); setViewTruckDetails(null) }}
                    className="btn btn-success flex-1"
                  >
                    ✓ Assign This Truck
                  </button>
                </div>
              )}
              <button onClick={() => setViewTruckDetails(null)} className="btn btn-secondary btn-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirm Dialog */}
      {showApproveConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-secondary border border-border rounded-xl p-5 max-w-sm w-full">
            <h3 className="font-heading text-base font-bold mb-2">Confirm Assignment</h3>
            <p className="text-sm text-text-secondary mb-4">
              Assign <strong className="text-text-primary">{showApproveConfirm.truck?.owner_name}</strong> ({showApproveConfirm.truck?.plate_number}) to this job order? All other applicants will be rejected.
            </p>
            {showApproveConfirm.truck?.verification_status !== 'approved' && (
              <div className="bg-warning-bg border border-warning-border rounded p-2.5 mb-3 flex gap-2">
                <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-warning">This truck is not fully verified. Proceed with caution.</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowApproveConfirm(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => handleApproveApplicant(showApproveConfirm)}
                disabled={updatingStatus}
                className="btn btn-success flex-1"
              >
                {updatingStatus ? 'Assigning...' : 'Confirm Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="bg-bg-secondary w-full rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-4" />
            <div className="px-4 pb-2 font-heading text-base font-semibold border-b border-border mb-3">
              Update Delivery Status
            </div>
            <div className="p-4 space-y-2">
              {DELIVERY_STEPS.map(step => (
                <button
                  key={step}
                  onClick={() => handleStatusUpdate(step)}
                  disabled={updatingStatus}
                  className="w-full flex items-center justify-between p-3 rounded-md bg-bg-tertiary hover:bg-bg-elevated transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {DELIVERY_STEPS.indexOf(step) < currentStepIndex ? (
                      <CheckCircle size={16} className="text-success" />
                    ) : step === job.status ? (
                      <Clock size={16} className="text-brand" />
                    ) : (
                      <Circle size={16} className="text-text-muted" />
                    )}
                    <span className="text-sm font-medium">{JOB_STATUS_LABELS[step]}</span>
                  </div>
                  <span className="text-text-muted">›</span>
                </button>
              ))}
              <button onClick={() => setShowStatusModal(false)} className="btn btn-secondary btn-full mt-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="skeleton h-14 rounded-lg" />
      <div className="skeleton h-48 rounded-lg" />
      <div className="skeleton h-44 rounded-lg" />
      <div className="skeleton h-56 rounded-lg" />
    </div>
  )
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? 'text-text-primary' : 'text-text-secondary'}`}>{value}</span>
    </div>
  )
}
