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

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [job, setJob] = useState<JobOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userTruck, setUserTruck] = useState<any>(null)
  const [applying, setApplying] = useState(false)
  const [myApplication, setMyApplication] = useState<any>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setUserRole(profile?.role || null)

      // Load driver's truck if they're a driver
      if (profile?.role === 'driver') {
        const { data: truck } = await supabase.from('trucks').select('*').eq('owner_id', session.user.id).eq('verification_status', 'approved').single()
        setUserTruck(truck || null)
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
    if (!userId || !userTruck) {
      toast.error('You need a verified truck to apply')
      return
    }
    setApplying(true)
    try {
      const { error } = await supabase.from('job_applicants').insert({
        job_order_id: id,
        truck_id: userTruck.id,
        driver_id: userId,
        status: 'pending',
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
    if (userRole === 'driver' && job.assigned_driver_id !== userId) {
      toast.error('Only the assigned driver can update delivery status')
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
  const isAdmin = userRole === 'admin' || userRole === 'warehouse'
  const isAssignedDriver = userRole === 'driver' && job.assigned_driver_id === userId
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

        {/* DRIVER: Apply section */}
        {userRole === 'driver' && (job.status === 'open_for_applications' || job.status === 'pending_selection' || job.status === 'posted') && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-xs font-semibold text-text-muted uppercase mb-3">Your Application</div>
            {!myApplication ? (
              <div>
                {!userTruck ? (
                  <div className="bg-warning-bg border border-warning-border rounded p-3 mb-3">
                    <p className="text-xs text-warning">⚠️ You need an approved truck to apply. <Link href="/fleet/register" className="underline">Register one</Link>.</p>
                  </div>
                ) : (
                  <div className="bg-bg-tertiary rounded p-3 mb-3 text-xs text-text-secondary">
                    Applying with: <strong className="text-text-primary">{userTruck.plate_number}</strong> · {userTruck.truck_type_label} · {userTruck.cbm_capacity} CBM
                  </div>
                )}
                <button
                  onClick={handleApply}
                  disabled={applying || !userTruck}
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

        {/* Assigned Truck */}
        {job.truck && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-xs text-text-muted font-semibold uppercase mb-2">Assigned Truck</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-bg-tertiary flex items-center justify-center text-xl flex-shrink-0">🚛</div>
              <div className="flex-1">
                <div className="font-heading text-sm font-semibold">{job.truck.owner_name}</div>
                <div className="text-xs text-text-muted">{job.truck.plate_number} · {job.truck.truck_type_label}</div>
                <div className="text-xs text-text-muted">{job.truck.driver_name}</div>
              </div>
            </div>
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
                      <div className="flex items-center gap-1 mt-1">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full border',
                          applicant.truck?.verification_status === 'approved'
                            ? 'bg-success-bg text-success border-success-border'
                            : 'bg-warning-bg text-warning border-warning-border'
                        )}>
                          {applicant.truck?.verification_status === 'approved' ? '✓ Verified' : '⚠ Unverified'}
                        </span>
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
        {(isAdmin || isAssignedDriver) && (
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
          {isAssignedDriver && (
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
