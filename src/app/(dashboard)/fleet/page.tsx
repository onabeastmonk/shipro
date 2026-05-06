'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { fetchTrucks, fetchDrivers, updateTruckVerification } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { checkDocumentStatus, getDocumentStatusColor, formatDate } from '@/lib/utils'
import type { Truck } from '@/types'
import { Search, Plus, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'trucks' | 'drivers' | 'pending' | 'documents'

function FleetContent() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'trucks')
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id || null)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, d] = await Promise.all([fetchTrucks({ search: search || undefined }), fetchDrivers()])
      setTrucks(t)
      setDrivers(d)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  const pendingTrucks = trucks.filter(t => t.verification_status === 'pending' || t.verification_status === 'for_review')
  const approvedTrucks = trucks.filter(t => t.verification_status === 'approved')

  const expiringDocs = trucks.flatMap(t =>
    (t.documents || []).filter(d => d.expiry_date && checkDocumentStatus(d.expiry_date) !== 'valid')
      .map(d => ({ ...d, truck: t }))
  )

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'trucks', label: 'Trucks', count: approvedTrucks.length },
    { key: 'drivers', label: 'Drivers', count: drivers.length },
    { key: 'pending', label: 'Pending Review', count: pendingTrucks.length },
    { key: 'documents', label: 'Documents', count: expiringDocs.length || undefined },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="p-4 pb-0 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Fleet</h1>
          <p className="text-text-muted text-sm mt-0.5">Trucks, drivers & documents</p>
        </div>
        <Link href="/fleet/register" className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={15} /> Register Truck
        </Link>
      </div>

      <div className="relative mx-4 mt-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input className="form-input pl-9" placeholder="Search fleet..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-2 px-4 mt-3 overflow-x-auto scrollbar-hide pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all flex items-center gap-1.5',
              tab === t.key
                ? 'bg-brand text-bg-primary border-brand'
                : 'bg-bg-secondary border-border text-text-secondary hover:border-border-secondary'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('px-1.5 py-0.5 rounded-full text-xs leading-none', tab === t.key ? 'bg-black/20' : 'bg-bg-tertiary text-text-muted')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-2">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)
        ) : (
          <>
            {tab === 'trucks' && (
              approvedTrucks.length === 0
                ? <EmptyState icon="🚛" text="No approved trucks yet" />
                : approvedTrucks.map(truck => <TruckCard key={truck.id} truck={truck} />)
            )}

            {tab === 'drivers' && (
              drivers.length === 0
                ? <EmptyState icon="👤" text="No drivers registered yet" />
                : drivers.map(driver => <DriverCard key={driver.id} driver={driver} />)
            )}

            {tab === 'pending' && (
              pendingTrucks.length === 0
                ? <EmptyState icon="✅" text="No pending registrations" />
                : pendingTrucks.map(truck => (
                    <PendingTruckCard
                      key={truck.id}
                      truck={truck}
                      onApprove={async () => {
                        if (!userId) return
                        await updateTruckVerification(truck.id, 'approved', '', userId)
                        toast.success('Truck approved!')
                        load()
                      }}
                      onReject={async () => {
                        if (!userId) return
                        await updateTruckVerification(truck.id, 'rejected', 'Rejected by admin', userId)
                        toast.error('Truck rejected')
                        load()
                      }}
                    />
                  ))
            )}

            {tab === 'documents' && (
              expiringDocs.length === 0
                ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-text-secondary font-medium">All documents are valid</p>
                    <p className="text-text-muted text-sm mt-1">No expiring documents found</p>
                  </div>
                )
                : (
                  <div>
                    <div className="bg-warning-bg border border-warning-border rounded-md p-3 mb-3 flex gap-2">
                      <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-warning">{expiringDocs.length} document{expiringDocs.length > 1 ? 's' : ''} require attention</p>
                    </div>
                    {expiringDocs.map(doc => {
                      const status = checkDocumentStatus(doc.expiry_date || null)
                      return (
                        <div key={doc.id} className="bg-bg-secondary border border-border rounded-lg p-3.5 mb-2 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-text-primary">{doc.document_type}</div>
                            <div className="text-xs text-text-muted mt-0.5">
                              🚛 {(doc as any).truck?.plate_number} · {(doc as any).truck?.owner_name}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">
                              Expires: {formatDate(doc.expiry_date!)}
                            </div>
                          </div>
                          <span className={`status-badge ${getDocumentStatusColor(status)}`}>
                            {status === 'expiring_soon' ? 'Expiring Soon' : 'Expired'}
                          </span>
                        </div>
                      )
                    })}
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-text-secondary mb-3">All Truck Documents</h3>
                      {trucks.slice(0, 10).map(truck => (
                        <div key={truck.id} className="bg-bg-secondary border border-border rounded-lg p-3.5 mb-2">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base">🚛</span>
                            <div>
                              <div className="text-sm font-semibold">{truck.plate_number}</div>
                              <div className="text-xs text-text-muted">{truck.owner_name}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(truck.documents || []).map(doc => {
                              const s = checkDocumentStatus(doc.expiry_date || null)
                              return (
                                <div key={doc.id} className="flex items-center justify-between bg-bg-tertiary rounded p-1.5">
                                  <span className="text-xs text-text-muted truncate">{doc.document_type}</span>
                                  <span className={`status-badge text-[9px] px-1.5 py-0.5 ${getDocumentStatusColor(s)}`}>
                                    {s === 'valid' ? '✓' : s === 'expiring_soon' ? '⚠' : s === 'expired' ? '✗' : '?'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TruckCard({ truck }: { truck: Truck }) {
  const availabilityColor = {
    available: 'text-success',
    on_job: 'text-warning',
    under_maintenance: 'text-danger',
    inactive: 'text-text-muted',
  }[truck.availability]

  return (
    <Link href={`/fleet/${truck.id}`}>
      <div className="bg-bg-secondary border border-border rounded-lg p-3.5 hover:border-border-secondary transition-colors flex items-start gap-3">
        <div className="w-11 h-11 rounded-md bg-bg-tertiary flex items-center justify-center text-xl flex-shrink-0">🚛</div>
        <div className="flex-1 min-w-0">
          <div className="font-heading text-sm font-semibold truncate">{truck.owner_name}</div>
          <div className="text-xs text-text-muted mt-0.5">{truck.plate_number} · {truck.truck_type_label}</div>
          <div className="text-xs text-text-muted mt-0.5">Driver: {truck.driver_name}</div>
          <div className="flex gap-2 mt-1.5">
            <span className={`text-xs font-medium capitalize ${availabilityColor}`}>
              ● {truck.availability.replace('_', ' ')}
            </span>
            <span className="text-xs text-text-muted">{truck.cbm_capacity} CBM</span>
          </div>
        </div>
        <ChevronRight size={16} className="text-text-muted flex-shrink-0 mt-1" />
      </div>
    </Link>
  )
}

function DriverCard({ driver }: { driver: any }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3.5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center font-heading text-sm font-bold text-text-secondary flex-shrink-0">
        {driver.full_name?.charAt(0) || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-heading text-sm font-semibold">{driver.full_name}</div>
        <div className="text-xs text-text-muted mt-0.5">{driver.company_name || 'Individual Driver'}</div>
        <div className="text-xs text-text-muted mt-0.5">{driver.contact_number || driver.email}</div>
      </div>
      <span className={`status-badge ${driver.is_verified ? 'bg-success-bg text-success border-success-border' : 'bg-warning-bg text-warning border-warning-border'}`}>
        {driver.is_verified ? 'Verified' : 'Pending'}
      </span>
    </div>
  )
}

function PendingTruckCard({ truck, onApprove, onReject }: { truck: Truck; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3.5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-md bg-bg-tertiary flex items-center justify-center text-xl flex-shrink-0">🚛</div>
        <div className="flex-1">
          <div className="font-heading text-sm font-semibold">{truck.owner_name}</div>
          <div className="text-xs text-text-muted mt-0.5">{truck.plate_number} · {truck.truck_type_label}</div>
          <div className="text-xs text-text-muted mt-0.5">{truck.email} · {truck.contact_number}</div>
          <div className="text-xs text-text-muted mt-0.5">Driver: {truck.driver_name} · {truck.driver_contact}</div>
          <div className="text-xs text-text-muted mt-0.5">CBM: {truck.cbm_capacity} · Load: {truck.load_capacity_kg}kg</div>
          {truck.ltfrb_number && <div className="text-xs text-text-muted mt-0.5">LTFRB: {truck.ltfrb_number}</div>}
        </div>
        <span className="status-badge bg-warning-bg text-warning border-warning-border">Pending</span>
      </div>

      {(truck.documents || []).length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-text-muted uppercase mb-2">Uploaded Documents</div>
          <div className="space-y-1.5">
            {(truck.documents || []).map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between bg-bg-tertiary rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary">{doc.document_type}</div>
                  {doc.expiry_date && (
                    <div className="text-xs text-text-muted">Expires: {doc.expiry_date}</div>
                  )}
                </div>
                {doc.file_url ? (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-outline text-xs px-2 py-1 ml-2 flex-shrink-0"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-xs text-danger ml-2">Not uploaded</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/fleet/${truck.id}`} className="block text-center text-xs text-text-muted mb-3 hover:text-text-secondary">
        View full details →
      </Link>

      <div className="flex gap-2">
        <button onClick={onReject} className="btn btn-sm btn-danger flex-1">✗ Reject</button>
        <button onClick={onApprove} className="btn btn-sm btn-success flex-1">✓ Approve</button>
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-text-secondary font-medium">{text}</p>
    </div>
  )
}

export default function FleetPage() {
  return (
    <Suspense fallback={
      <div className="p-4 space-y-3">
        {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
      </div>
    }>
      <FleetContent />
    </Suspense>
  )
}
