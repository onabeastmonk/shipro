'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { fetchTruck, uploadTruckDocument, updateTruckVerification } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { checkDocumentStatus, getDocumentStatusColor, formatDate } from '@/lib/utils'
import type { Truck } from '@/types'
import { ChevronLeft, Upload, Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const AVAILABILITY_COLOR = {
  available: 'bg-success-bg text-success border-success-border',
  on_job: 'bg-warning-bg text-warning border-warning-border',
  under_maintenance: 'bg-danger-bg text-danger border-danger-border',
  inactive: 'bg-bg-tertiary text-text-muted border-border',
}

const VERIFICATION_COLOR = {
  approved: 'bg-success-bg text-success border-success-border',
  pending: 'bg-warning-bg text-warning border-warning-border',
  for_review: 'bg-info-bg text-info border-info-border',
  rejected: 'bg-danger-bg text-danger border-danger-border',
  expired: 'bg-danger-bg text-danger border-danger-border',
}

export default function TruckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [truck, setTruck] = useState<Truck | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      setUserId(session?.user.id || null)
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
        setUserRole(profile?.role || null)
      }
      try {
        const data = await fetchTruck(id)
        setTruck(data)
      } catch { toast.error('Truck not found') }
      finally { setLoading(false) }
    }
    load()
  }, [id])

  async function handleDocUpload(docType: string, file: File, expiry?: string) {
    if (!truck) return
    try {
      await uploadTruckDocument(truck.id, docType, file, expiry)
      toast.success(`${docType} uploaded!`)
      const updated = await fetchTruck(id)
      setTruck(updated)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (loading) return (
    <div className="p-4 space-y-4">
      <div className="skeleton h-14 rounded-lg" />
      <div className="skeleton h-48 rounded-lg" />
      <div className="skeleton h-64 rounded-lg" />
    </div>
  )

  if (!truck) return <div className="text-center p-8 text-text-muted">Truck not found</div>

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href="/fleet" className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="flex-1">
          <div className="font-heading text-sm font-semibold leading-tight">{truck.plate_number}</div>
          <div className="text-xs text-text-muted">{truck.truck_type_label}</div>
        </div>
        <span className={`status-badge ${VERIFICATION_COLOR[truck.verification_status]}`}>
          {truck.verification_status}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Main info card */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-lg bg-bg-tertiary flex items-center justify-center text-3xl flex-shrink-0">🚛</div>
            <div>
              <div className="font-heading text-xl font-bold">{truck.plate_number}</div>
              <div className="text-sm text-text-secondary">{truck.truck_type_label}</div>
              <div className="flex gap-2 mt-1.5">
                <span className={`status-badge text-[10px] ${AVAILABILITY_COLOR[truck.availability]}`}>
                  {truck.availability.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <InfoRow label="Owner" value={truck.owner_name} />
            <InfoRow label="Business" value={truck.business_name || '—'} />
            <InfoRow label="Contact" value={truck.contact_number} />
            <InfoRow label="Email" value={truck.email} />
            <InfoRow label="Driver" value={truck.driver_name} />
            <InfoRow label="Driver Contact" value={truck.driver_contact} />
            <InfoRow label="CBM Capacity" value={`${truck.cbm_capacity} CBM`} />
            <InfoRow label="Load Capacity" value={`${truck.load_capacity_kg} kg`} />
            {truck.ltfrb_number && <InfoRow label="LTFRB #" value={truck.ltfrb_number} />}
          </div>

          {truck.admin_remarks && (
            <div className="mt-3 pt-3 border-t border-border bg-warning-bg border border-warning-border rounded p-2.5">
              <div className="text-xs font-semibold text-warning mb-0.5">Admin Remarks</div>
              <div className="text-xs text-text-secondary">{truck.admin_remarks}</div>
            </div>
          )}
        </div>

        {/* Admin actions */}
        {(userRole === 'admin') && truck.verification_status !== 'approved' && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-xs font-semibold text-text-muted uppercase mb-3">Admin Actions</div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!userId) return
                  await updateTruckVerification(truck.id, 'rejected', 'Rejected by admin', userId)
                  toast.error('Truck rejected')
                  const updated = await fetchTruck(id)
                  setTruck(updated)
                }}
                className="btn btn-sm btn-danger flex-1"
              >
                ✗ Reject
              </button>
              <button
                onClick={async () => {
                  if (!userId) return
                  await updateTruckVerification(truck.id, 'approved', '', userId)
                  toast.success('Truck approved!')
                  const updated = await fetchTruck(id)
                  setTruck(updated)
                }}
                className="btn btn-sm btn-success flex-1"
              >
                ✓ Approve
              </button>
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="text-xs font-semibold text-text-muted uppercase mb-3">
            Documents ({(truck.documents || []).length})
          </div>
          <div className="space-y-3">
            {(truck.documents || []).map(doc => {
              const status = doc.expiry_date ? checkDocumentStatus(doc.expiry_date) : doc.status
              return (
                <div key={doc.id} className="bg-bg-tertiary border border-border rounded-md p-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="font-medium text-sm">{doc.document_type}</div>
                    <span className={`status-badge ${getDocumentStatusColor(status)}`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  {doc.expiry_date && (
                    <div className="text-xs text-text-muted mb-2">
                      Expires: {formatDate(doc.expiry_date)}
                    </div>
                  )}
                  <div className="flex gap-2">
                    {doc.file_url ? (
                      <a href={doc.file_url} target="_blank" className="btn btn-sm btn-outline flex items-center gap-1.5 flex-1 justify-center">
                        <ExternalLink size={12} /> View File
                      </a>
                    ) : (
                      <div className="text-xs text-text-muted italic flex-1">No file uploaded</div>
                    )}
                    <label className="btn btn-sm btn-secondary cursor-pointer flex items-center gap-1.5">
                      <Upload size={12} /> Replace
                      <input type="file" className="hidden" accept="image/*,application/pdf"
                        onChange={async e => {
                          const file = e.target.files?.[0]
                          if (file) await handleDocUpload(doc.document_type, file)
                        }} />
                    </label>
                  </div>
                </div>
              )
            })}

            {/* Upload new document */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-semibold text-text-muted uppercase mb-2">Upload New Document</div>
              <NewDocUpload onUpload={handleDocUpload} />
            </div>
          </div>
        </div>

        {/* Availability control */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="text-xs font-semibold text-text-muted uppercase mb-3">Availability</div>
          <div className="grid grid-cols-2 gap-2">
            {(['available', 'under_maintenance', 'inactive'] as const).map(a => (
              <button
                key={a}
                disabled={truck.availability === a}
                onClick={async () => {
                  await supabase.from('trucks').update({ availability: a }).eq('id', truck.id)
                  toast.success(`Status set to ${a.replace('_', ' ')}`)
                  const updated = await fetchTruck(id)
                  setTruck(updated)
                }}
                className={cn(
                  'btn btn-sm capitalize',
                  truck.availability === a ? 'btn-primary' : 'btn-outline'
                )}
              >
                {a.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm font-medium text-text-primary mt-0.5 truncate">{value}</div>
    </div>
  )
}

function NewDocUpload({ onUpload }: { onUpload: (docType: string, file: File, expiry?: string) => Promise<void> }) {
  const [docType, setDocType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [expiry, setExpiry] = useState('')

  async function handleUpload() {
    if (!docType || !file) { toast.error('Select document type and file'); return }
    await onUpload(docType, file, expiry || undefined)
    setDocType(''); setFile(null); setExpiry('')
  }

  return (
    <div className="space-y-2">
      <input className="form-input" placeholder="Document type (e.g. Barangay Clearance)"
        value={docType} onChange={e => setDocType(e.target.value)} />
      <div className="flex gap-2">
        <label className="btn btn-sm btn-outline flex-1 cursor-pointer flex items-center gap-1.5">
          <Upload size={12} />
          {file ? file.name.slice(0, 20) + '...' : 'Choose file'}
          <input type="file" className="hidden" accept="image/*,application/pdf"
            onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <input className="form-input text-xs" type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
          style={{ maxWidth: '120px' }} />
      </div>
      {(docType && file) && (
        <button onClick={handleUpload} className="btn btn-primary btn-sm btn-full flex items-center gap-1.5">
          <Check size={12} /> Upload Document
        </button>
      )}
    </div>
  )
}
