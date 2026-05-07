'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { fetchJobOrders } from '@/lib/api'
import { getJobStatusColor, formatDate, formatCurrency } from '@/lib/utils'
import { JOB_STATUS_LABELS, type JobOrder } from '@/types'
import { Search, Plus, MapPin, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

declare global {
  interface Window { google: any; initJobMap: () => void }
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'open_for_applications', label: 'Open' },
  { value: 'pending_selection', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function JobsContent() {
  const searchParams = useSearchParams()
  const [jobs, setJobs] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(searchParams.get('status') || 'all')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Map modal state
  const [mapJob, setMapJob] = useState<JobOrder | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id)
        supabase.from('profiles').select('role').eq('id', session.user.id).single()
          .then(({ data }) => setUserRole(data?.role || null))
      }
    })
  }, [])

  // Load Google Maps script
  useEffect(() => {
    if (window.google) { setMapLoaded(true); return }
    const existing = document.querySelector('script[data-maps]')
    if (existing) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initJobMap`
    script.async = true
    script.defer = true
    script.setAttribute('data-maps', '1')
    window.initJobMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Init map when modal opens
  useEffect(() => {
    if (!mapJob || !mapLoaded || !mapRef.current) return
    setTimeout(() => {
      if (!mapRef.current) return
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 11,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#a0a0a0' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111111' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        ],
        streetViewControl: false,
        mapTypeControl: false,
      })
      mapInstanceRef.current = map

      const geocoder = new window.google.maps.Geocoder()
      const directionsService = new window.google.maps.DirectionsService()
      const directionsRenderer = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#ffffff', strokeWeight: 4, strokeOpacity: 0.9 },
      })
      directionsRenderer.setMap(map)

      const geocode = (addr: string) => new Promise<any>((res, rej) => {
        geocoder.geocode({ address: `${addr}, Philippines` }, (results: any, status: any) => {
          if (status === 'OK') res(results[0].geometry.location)
          else rej(status)
        })
      })

      Promise.all([geocode(mapJob.pickup_location), geocode(mapJob.dropoff_location)])
        .then(([origin, destination]) => {
          directionsService.route(
            { origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
            (result: any, status: any) => {
              if (status === 'OK') directionsRenderer.setDirections(result)
            }
          )
          new window.google.maps.Marker({
            position: origin, map,
            icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
          })
          new window.google.maps.Marker({
            position: destination, map,
            icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
          })
          const bounds = new window.google.maps.LatLngBounds()
          bounds.extend(origin); bounds.extend(destination)
          map.fitBounds(bounds, { padding: 50 })
        }).catch(console.error)
    }, 100)
  }, [mapJob, mapLoaded])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchJobOrders({ status, search: search || undefined })
      setJobs(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [status, search])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Job Orders</h1>
          <p className="text-text-muted text-sm mt-0.5">{jobs.length} orders found</p>
        </div>
        {(userRole === 'admin' || userRole === 'fleet_manager' || userRole === 'warehouse_manager') && (
          <Link href="/jobs/new" className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={15} /> New Order
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input className="form-input" style={{ paddingLeft: "2.25rem" }} placeholder="Search by order #, client, location..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-2">
        {STATUS_FILTERS.map(f => (
          <button key={f.value} onClick={() => setStatus(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all',
              status === f.value
                ? 'bg-brand text-bg-primary border-brand'
                : 'bg-bg-secondary border-border text-text-secondary hover:border-border-secondary'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-32 rounded-lg" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-text-secondary font-medium">No job orders found</p>
          <p className="text-text-muted text-sm mt-1">Try adjusting your filters</p>
          {(userRole === 'admin' || userRole === 'fleet_manager' || userRole === 'warehouse_manager') && (
            <Link href="/jobs/new" className="btn btn-primary btn-sm mt-4 inline-flex">
              <Plus size={14} /> Create Job Order
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} userRole={userRole} userId={userId} onShowMap={() => setMapJob(job)} />
          ))}
        </div>
      )}

      {/* Map Modal */}
      {mapJob && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0">
            <div>
              <div className="text-xs text-text-muted font-mono">{mapJob.job_number}</div>
              <div className="text-sm font-semibold text-text-primary">{mapJob.client_name}</div>
            </div>
            <button onClick={() => { setMapJob(null); mapInstanceRef.current = null }}
              className="p-2 rounded-full bg-bg-tertiary hover:bg-bg-elevated transition-colors">
              <X size={18} className="text-text-primary" />
            </button>
          </div>
          <div className="flex-1 relative">
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            {!mapLoaded && (
              <div className="absolute inset-0 bg-bg-tertiary flex items-center justify-center">
                <p className="text-text-muted text-sm">Loading map...</p>
              </div>
            )}
          </div>
          <div className="bg-bg-secondary border-t border-border px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
              <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
              <span className="truncate">{mapJob.pickup_location}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
              <span className="truncate">{mapJob.dropoff_location}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function JobCard({ job, userRole, userId, onShowMap }: {
  job: JobOrder
  userRole: string | null
  userId: string | null
  onShowMap: () => void
}) {
  // Compute total CBM
  const totalCBM = job.shipment_items?.reduce((sum, item) => sum + (item.total_cbm || 0), 0)
    ?? job.total_cbm ?? 0

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden hover:border-border-secondary transition-colors animate-fade-in">
      {/* Orange date banner at top */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-0">
        <span style={{ color: '#f97316', fontSize: '13px', fontWeight: 700, letterSpacing: '0.02em' }}>
          📅 {new Date(job.delivery_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span className={`status-badge ${getJobStatusColor(job.status)}`}>
          {JOB_STATUS_LABELS[job.status]}
        </span>
      </div>

      <Link href={`/jobs/${job.id}`}>
        <div className="px-3.5 py-2.5">
          {/* Job number + client */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-xs text-text-muted font-semibold tracking-wide">{job.job_number}</div>
              <div className="font-heading text-base font-bold text-text-primary mt-0.5 leading-tight">{job.client_name}</div>
            </div>
            <div className="text-right">
              <div className="font-heading text-sm font-bold text-text-primary">
                {job.total_rate
                  ? formatCurrency(job.total_rate)
                  : (job as any).rate_per_cbm
                  ? `₱${Number((job as any).rate_per_cbm).toLocaleString()}/CBM`
                  : (job as any).base_rate
                  ? formatCurrency((job as any).base_rate)
                  : '—'}
              </div>
              {totalCBM > 0 && (
                <div style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', borderRadius: '6px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, marginTop: '3px', display: 'inline-block' }}>
                  {totalCBM.toFixed(2)} CBM
                </div>
              )}
            </div>
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-tertiary rounded px-2.5 py-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
            <span className="flex-1 truncate">{job.pickup_location}</span>
            <span className="text-text-muted flex-shrink-0">→</span>
            <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
            <span className="flex-1 truncate text-right">{job.dropoff_location}</span>
          </div>

          {/* Applicants alert banner - very visible for admin */}
          {job.applicants && job.applicants.filter((a: any) => a.status === 'pending').length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.1))',
              border: '1.5px solid #f97316',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🙋</span>
                <div>
                  <div style={{ color: '#f97316', fontWeight: 800, fontSize: '14px', lineHeight: 1 }}>
                    {job.applicants.filter((a: any) => a.status === 'pending').length} Driver{job.applicants.filter((a: any) => a.status === 'pending').length > 1 ? 's' : ''} Applied!
                  </div>
                  <div style={{ color: '#f97316', fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                    Tap to review and assign
                  </div>
                </div>
              </div>
              <div style={{
                background: '#f97316',
                color: '#000',
                borderRadius: '999px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '14px',
                flexShrink: 0,
              }}>
                {job.applicants.filter((a: any) => a.status === 'pending').length}
              </div>
            </div>
          )}

          {/* Truck / applicants */}
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              {job.truck
                ? `🚛 ${job.truck.plate_number} · ${job.truck.truck_type_label}`
                : job.required_truck_type_label
                  ? `🔍 ${job.required_truck_type_label}`
                  : '⏳ No truck assigned'}
            </span>
            {job.applicants && job.applicants.filter((a: any) => a.status === 'approved').length > 0 && (
              <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '11px' }}>
                ✓ Driver assigned
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Map button */}
      <div className="px-3.5 pb-3">
        <button
          onClick={e => { e.preventDefault(); onShowMap() }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-border text-xs text-text-muted hover:bg-bg-tertiary transition-colors"
        >
          <MapPin size={12} /> View Route on Map
        </button>
      </div>
    </div>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="p-4 space-y-3">
        {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-32 rounded-lg" />)}
      </div>
    }>
      <JobsContent />
    </Suspense>
  )
}
