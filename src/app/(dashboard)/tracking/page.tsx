'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getJobStatusColor, formatDate, formatCurrency } from '@/lib/utils'
import { JOB_STATUS_LABELS, DELIVERY_STEPS, type JobOrder, type JobStatus } from '@/types'
import { Search, X, MapPin, CheckCircle, Circle, Clock } from 'lucide-react'
import ContactCard from '@/components/ContactCard'
import { cn } from '@/lib/utils'

declare global {
  interface Window { google: any; initTrackMap: () => void }
}

export default function TrackingPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const [jobs, setJobs] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<JobOrder | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)
  const [detailJob, setDetailJob] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    if (window.google) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initTrackMap`
    script.async = true; script.defer = true
    window.initTrackMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
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
      streetViewControl: false, mapTypeControl: false,
    })
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#ffffff', strokeWeight: 4, strokeOpacity: 0.9 },
    })
    directionsRendererRef.current.setMap(mapInstanceRef.current)
  }, [mapLoaded])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('job_orders')
        .select('*, truck:trucks(id, plate_number, truck_type_label, driver_name)')
        .order('created_at', { ascending: false })
      setJobs((data || []) as JobOrder[])
      if (data && data.length > 0) setSelectedJob(data[0] as JobOrder)
      setLoading(false)
    }
    load()
  }, [])

  const showRoute = useCallback(async (job: JobOrder) => {
    if (!mapInstanceRef.current || !window.google) return
    setRouteInfo(null)
    const geocoder = new window.google.maps.Geocoder()
    const directionsService = new window.google.maps.DirectionsService()
    const geocode = (addr: string) => new Promise<any>((res, rej) => {
      geocoder.geocode({ address: `${addr}, Philippines` }, (results: any, status: any) => {
        if (status === 'OK') res(results[0].geometry.location)
        else rej(status)
      })
    })
    try {
      const [origin, destination] = await Promise.all([geocode(job.pickup_location), geocode(job.dropoff_location)])
      directionsService.route({ origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text })
          }
        })
      new window.google.maps.Marker({ position: origin, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 } })
      new window.google.maps.Marker({ position: destination, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 } })
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(origin); bounds.extend(destination)
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 })
    } catch (err) { console.error(err) }
  }, [])

  useEffect(() => {
    if (selectedJob && mapLoaded) showRoute(selectedJob)
  }, [selectedJob, mapLoaded, showRoute])

  async function loadJobDetail(job: JobOrder) {
    setLoadingDetail(true)
    const { data } = await supabase.from('job_orders')
      .select(`*, truck:trucks(id, plate_number, truck_type_label, driver_name, owner_name, contact_number),
        driver:profiles!assigned_driver_id(id, full_name, contact_number),
        shipment_items(*),
        status_logs:delivery_status_logs(*, logged_by_profile:profiles!logged_by(full_name))`)
      .eq('id', job.id).single()
    setDetailJob(data)
    setLoadingDetail(false)
  }

  const activeStatuses = ['accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived', 'assigned']
  const filtered = jobs.filter(j => {
    const matchFilter = filter === 'all' ? true :
      filter === 'active' ? activeStatuses.includes(j.status) :
      filter === 'delivered' ? ['delivered', 'completed'].includes(j.status) :
      j.status === filter
    const matchSearch = !search ||
      j.job_number.toLowerCase().includes(search.toLowerCase()) ||
      j.client_name.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'in_transit', label: 'In Transit' },
    { value: 'at_pickup', label: 'At Pickup' },
    { value: 'delivered', label: 'Delivered' },
  ]

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-4">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Tracking</h1>
        <p className="text-text-muted text-sm mt-0.5">Tap any delivery to view details & route</p>
      </div>

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border border-border mb-2" style={{ height: '260px' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!mapLoaded && (
          <div className="absolute inset-0 bg-bg-tertiary flex items-center justify-center">
            <p className="text-text-muted text-sm">Loading map...</p>
          </div>
        )}
      </div>

      {/* Route info */}
      {selectedJob && routeInfo && (
        <div className="bg-bg-secondary border border-border rounded-lg p-3 mb-3 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-muted">{selectedJob.job_number} · {selectedJob.client_name}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="truncate">{selectedJob.pickup_location}</span>
              <span>→</span>
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              <span className="truncate">{selectedJob.dropoff_location}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-3">
            <div className="font-heading text-sm font-bold text-text-primary">{routeInfo.distance}</div>
            <div className="text-xs text-text-muted">{routeInfo.duration}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input className="form-input pl-9" placeholder="Search deliveries..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-3">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all',
              filter === f.value ? 'bg-brand text-bg-primary border-brand' : 'bg-bg-secondary border-border text-text-secondary')}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Job cards */}
      {loading ? Array(3).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-32 rounded-lg mb-3" />) :
       filtered.length === 0 ? (
        <div className="text-center py-12"><div className="text-4xl mb-3">📡</div><p className="text-text-secondary font-medium">No deliveries found</p></div>
       ) : (
        <div className="space-y-2">
          {filtered.map(job => {
            const stepIndex = DELIVERY_STEPS.indexOf(job.status as JobStatus)
            const progress = stepIndex >= 0 ? ((stepIndex + 1) / DELIVERY_STEPS.length) * 100 : 0
            const isSelected = selectedJob?.id === job.id
            return (
              <div key={job.id} className={cn('border rounded-lg p-4 cursor-pointer transition-all',
                isSelected ? 'bg-bg-elevated border-border-active' : 'bg-bg-secondary border-border hover:border-border-secondary')}>
                <div className="flex justify-between items-start mb-2" onClick={() => setSelectedJob(job)}>
                  <div>
                    <div className="text-xs text-text-muted font-mono">{job.job_number}</div>
                    <div className="font-heading text-sm font-semibold mt-0.5">{job.client_name}</div>
                    <div className="text-xs text-text-muted">{formatDate(job.delivery_date)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`status-badge ${getJobStatusColor(job.status)}`}>{JOB_STATUS_LABELS[job.status]}</span>
                    {isSelected && <span className="text-xs text-success">● On map</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-tertiary rounded px-2.5 py-2 mb-2" onClick={() => setSelectedJob(job)}>
                  <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  <span className="flex-1 truncate">{job.pickup_location}</span>
                  <span>→</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                  <span className="flex-1 truncate text-right">{job.dropoff_location}</span>
                </div>
                {job.truck && <div className="text-xs text-text-muted mb-2" onClick={() => setSelectedJob(job)}>🚛 {job.truck.plate_number} · {job.truck.driver_name}</div>}
                <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden mb-1" onClick={() => setSelectedJob(job)}>
                  <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-text-muted">{Math.round(progress)}% complete</span>
                  <button
                    onClick={() => { setDetailJob(null); loadJobDetail(job) }}
                    style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', borderRadius: '999px', padding: '2px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    📋 View Progress
                  </button>
                </div>
              </div>
            )
          })}
        </div>
       )}

      {/* Job Detail Popup */}
      {(detailJob || loadingDetail) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            {loadingDetail ? (
              <div className="p-8 text-center text-text-muted">Loading...</div>
            ) : detailJob && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
                  <div>
                    <div className="text-xs text-text-muted font-mono">{detailJob.job_number}</div>
                    <h2 className="font-heading text-base font-bold">{detailJob.client_name}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`status-badge ${getJobStatusColor(detailJob.status as any)}`}>{((JOB_STATUS_LABELS as any)[detailJob.status])}</span>
                    <button onClick={() => setDetailJob(null)}
                      style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                      ✕
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Route */}
                  <div className="bg-bg-tertiary rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                      <span className="text-sm text-text-primary">{detailJob.pickup_location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                      <span className="text-sm text-text-primary">{detailJob.dropoff_location}</span>
                    </div>
                  </div>

                  {/* Key info */}
                  <div className="grid grid-cols-2 gap-3">
                    <InfoBox label="Delivery Date" value={formatDate(detailJob.delivery_date)} />
                    <InfoBox label="Total Rate" value={detailJob.total_rate ? formatCurrency(detailJob.total_rate) : '—'} />
                    <InfoBox label="Client" value={detailJob.client_name} />
                    <InfoBox label="Contact" value={detailJob.contact_number} />
                  </div>

                  {/* Assigned truck + contact */}
                  {detailJob.truck && (
                    <div className="space-y-2">
                      <div className="bg-bg-tertiary rounded-lg p-3">
                        <div className="text-xs text-text-muted uppercase font-semibold mb-1">Assigned Truck</div>
                        <div className="text-sm font-semibold">{detailJob.truck.plate_number}</div>
                        <div className="text-xs text-text-muted">{detailJob.truck.truck_type_label} · Driver: {detailJob.truck.driver_name}</div>
                      </div>
                      <ContactCard
                        userId={detailJob.assigned_driver_id}
                        name={detailJob.truck.owner_name || detailJob.truck.driver_name}
                        contactNumber={detailJob.truck.contact_number}
                        label="Truck Owner / Driver"
                        compact
                      />
                    </div>
                  )}

                  {/* Delivery Timeline */}
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold mb-3">Delivery Progress</div>
                    {(() => {
                      const currentStepIndex = DELIVERY_STEPS.indexOf(detailJob.status as JobStatus)
                      return DELIVERY_STEPS.map((step, i) => {
                        const isDone = i < currentStepIndex
                        const isCurrent = i === currentStepIndex
                        const log = (detailJob.status_logs || []).find((l: any) => l.status === step)
                        return (
                          <div key={step} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${isDone ? 'bg-success' : isCurrent ? 'bg-brand' : 'bg-border-secondary'}`} />
                              {i < DELIVERY_STEPS.length - 1 && <div className={`w-px flex-1 mt-0.5 min-h-[20px] ${isDone ? 'bg-success' : 'bg-border'}`} />}
                            </div>
                            <div className="flex-1 pb-3">
                              <div className={`text-sm font-medium ${isDone ? 'text-text-secondary' : isCurrent ? 'text-text-primary' : 'text-text-muted'}`}>
                                {JOB_STATUS_LABELS[step]}
                                {isCurrent && <span className="ml-2 text-xs text-warning animate-pulse">← Current</span>}
                              </div>
                              {log && <div className="text-xs text-text-muted mt-0.5">{formatDate(log.logged_at, 'MMM dd h:mm a')}{log.note && ` · ${log.note}`}</div>}
                              {log?.proof_url && <a href={log.proof_url} target="_blank" className="text-xs text-info underline mt-0.5 block">View proof</a>}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>

                  {/* Shipment items */}
                  {detailJob.shipment_items && detailJob.shipment_items.length > 0 && (
                    <div>
                      <div className="text-xs text-text-muted uppercase font-semibold mb-2">
                        Shipment Items ({detailJob.shipment_items.length})
                      </div>
                      <div className="bg-bg-tertiary rounded-lg divide-y divide-border">
                        {detailJob.shipment_items.map((item: any) => (
                          <div key={item.id} className="flex justify-between items-center px-3 py-2.5">
                            <div>
                              <div className="text-sm font-medium">{item.item_name}</div>
                              {item.is_fragile && <span className="text-xs text-warning">⚠️ Fragile</span>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold">×{item.quantity}</div>
                              <div className="text-xs text-info">{item.total_cbm?.toFixed(3)} CBM</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => setDetailJob(null)} className="btn btn-secondary btn-full">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-tertiary rounded-lg p-3">
      <div className="text-xs text-text-muted mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-text-primary truncate">{value}</div>
    </div>
  )
}
