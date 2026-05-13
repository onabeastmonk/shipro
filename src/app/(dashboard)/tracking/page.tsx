'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getJobStatusColor, formatDate, formatCurrency } from '@/lib/utils'
import { JOB_STATUS_LABELS, DELIVERY_STEPS, type JobOrder, type JobStatus } from '@/types'
import { Search, AlertTriangle, Maximize2 } from 'lucide-react'
import ContactCard from '@/components/ContactCard'
import { cn } from '@/lib/utils'

declare global {
  interface Window { google: any; initTrackMap: () => void }
}

type LiveLoc = {
  lat: number
  lng: number
  timestamp: number
  driver_name: string
  job_number: string
  job_id: string
}

const ACTIVE_STATUSES = ['accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived', 'assigned']

const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a0a0a0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#333333' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111111' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function TrackingPage() {
  const router = useRouter()

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  // driver_id → {marker, infoWindow} for live GPS markers
  const liveMarkersRef = useRef<Map<string, { marker: any; infoWindow: any }>>(new Map())
  // pickup/drop-off markers for currently selected trip (cleaned up on selection change)
  const routeMarkersRef = useRef<any[]>([])
  // alert_id → marker for emergency markers
  const emergencyMarkersRef = useRef<Map<string, any>>(new Map())
  // kept in sync with jobs state so broadcast handler can read latest without stale closure
  const jobsRef = useRef<JobOrder[]>([])

  const [jobs, setJobs] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)
  const [detailJob, setDetailJob] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [liveLocations, setLiveLocations] = useState<Map<string, LiveLoc>>(new Map())
  const [activeEmergencies, setActiveEmergencies] = useState<any[]>([])
  // tick forces "X ago" labels to re-render every 30s without other state changes
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Google Maps script ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.google) { setMapLoaded(true); return }
    if (document.querySelector('script[data-gmap="track"]')) return
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initTrackMap`
    script.async = true
    script.defer = true
    script.setAttribute('data-gmap', 'track')
    window.initTrackMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // ── Init map — depends on loading so map div is mounted ─────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 14.5995, lng: 120.9842 },
      zoom: 11,
      styles: MAP_STYLES,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: true,
    })
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#60a5fa', strokeWeight: 4, strokeOpacity: 0.75 },
    })
    directionsRendererRef.current.setMap(mapInstanceRef.current)
  }, [mapLoaded, loading])

  // ── Auth + data load ─────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).single()
      const role = profile?.role || null
      setUserRole(role)

      if (role === 'driver') { router.push('/my-trips'); return }

      let query = supabase.from('job_orders')
        .select('*, truck:trucks(id, plate_number, truck_type_label, driver_name), driver:profiles!assigned_driver_id(id, full_name, contact_number)')
        .order('delivery_date', { ascending: true })

      if (role === 'truck_owner') {
        const { data: myTrucks } = await supabase.from('trucks').select('id').eq('owner_id', uid)
        const truckIds = (myTrucks || []).map((t: any) => t.id)
        if (truckIds.length > 0) {
          query = query.in('assigned_truck_id', truckIds)
        } else {
          setJobs([]); setLoading(false); return
        }
      }

      const { data } = await query
      const allJobs = (data || []) as JobOrder[]
      setJobs(allJobs)
      jobsRef.current = allJobs

      const firstActive = allJobs.find(j => ACTIVE_STATUSES.includes(j.status))
      if (firstActive) setSelectedJobId(firstActive.id)
      setLoading(false)
    }
    load()
  }, [router])

  // ── Emergency alerts (fleet/admin only) ─────────────────────
  useEffect(() => {
    if (!userRole || (userRole !== 'admin' && userRole !== 'fleet_manager')) return
    supabase.from('emergency_alerts')
      .select('*, reporter:profiles!reported_by(full_name)')
      .eq('status', 'active')
      .then(({ data }) => setActiveEmergencies(data || []))
  }, [userRole])

  // ── Place emergency markers ──────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.google) return
    activeEmergencies.forEach(alert => {
      if (!alert.location_lat || !alert.location_lng) return
      if (emergencyMarkersRef.current.has(alert.id)) return
      const pos = { lat: alert.location_lat, lng: alert.location_lng }
      const marker = new window.google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 17, fillColor: '#ef4444', fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 3,
        },
        label: { text: '!', color: '#fff', fontSize: '13px', fontWeight: 'bold' },
        title: `🚨 Emergency — ${alert.reporter?.full_name || 'Driver'}`,
        zIndex: 9999,
      })
      const iw = new window.google.maps.InfoWindow({
        content: `<div style="color:#111;padding:4px;min-width:150px;font-family:system-ui,sans-serif">
          <div style="font-weight:700;color:#dc2626;font-size:13px;margin-bottom:4px">🚨 EMERGENCY</div>
          <div style="font-size:12px;color:#333">${alert.reporter?.full_name || 'Driver'}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">${new Date(alert.created_at).toLocaleTimeString('en-PH')}</div>
        </div>`,
      })
      marker.addListener('click', () => iw.open(mapInstanceRef.current, marker))
      emergencyMarkersRef.current.set(alert.id, marker)
    })
  }, [activeEmergencies, mapLoaded])

  // ── Real-time driver location broadcast ─────────────────────
  useEffect(() => {
    if (!userRole || !mapLoaded) return

    const channel = supabase.channel('driver-locations')
      .on('broadcast', { event: 'driver-location' }, ({ payload }: { payload: any }) => {
        if (!mapInstanceRef.current || !window.google) return
        const { driver_id, driver_name, job_number, job_id, lat, lng, timestamp } = payload
        const pos = { lat, lng }
        const ts = timestamp || Date.now()

        setLiveLocations(prev => new Map(prev).set(driver_id, { lat, lng, timestamp: ts, driver_name, job_number, job_id }))

        const existing = liveMarkersRef.current.get(driver_id)
        if (existing) {
          existing.marker.setPosition(pos)
          const job = jobsRef.current.find(j => j.id === job_id)
          existing.infoWindow.setContent(buildMarkerInfo(driver_name, job_number, job, ts))
        } else {
          // Strip "JO-" prefix and leading zeros for the compact label
          const shortLabel = job_number.replace(/^JO-?0*/i, '') || job_number
          const marker = new window.google.maps.Marker({
            position: pos,
            map: mapInstanceRef.current,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 14, fillColor: '#3b82f6', fillOpacity: 1,
              strokeColor: '#fff', strokeWeight: 2.5,
            },
            label: { text: shortLabel, color: '#fff', fontSize: '9px', fontWeight: 'bold' },
            title: `${driver_name} · ${job_number}`,
            zIndex: 1000,
          })
          const job = jobsRef.current.find(j => j.id === job_id)
          const infoWindow = new window.google.maps.InfoWindow({
            content: buildMarkerInfo(driver_name, job_number, job, ts),
          })
          marker.addListener('click', () => {
            liveMarkersRef.current.forEach(({ infoWindow: iw }) => iw.close())
            infoWindow.open(mapInstanceRef.current, marker)
            if (job_id) setSelectedJobId(job_id)
          })
          liveMarkersRef.current.set(driver_id, { marker, infoWindow })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userRole, mapLoaded])

  function buildMarkerInfo(driverName: string, jobNumber: string, job: JobOrder | undefined, ts: number) {
    const truck = (job?.truck as any)
    const status = job ? (JOB_STATUS_LABELS[job.status as JobStatus] || job.status) : ''
    return `<div style="color:#111;padding:4px 2px;min-width:160px;font-family:system-ui,sans-serif">
      <div style="font-weight:700;font-size:13px;margin-bottom:3px">${jobNumber}</div>
      <div style="font-size:12px;color:#444;margin-bottom:2px">👤 ${driverName}</div>
      ${truck?.plate_number ? `<div style="font-size:12px;color:#444;margin-bottom:2px">🚛 ${truck.plate_number}</div>` : ''}
      ${status ? `<div style="font-size:11px;color:#555;margin-bottom:2px">📦 ${status}</div>` : ''}
      <div style="font-size:11px;color:#888">Updated ${timeAgo(ts)}</div>
    </div>`
  }

  // ── Draw route for selected job ──────────────────────────────
  useEffect(() => {
    if (!selectedJobId || !mapLoaded || !mapInstanceRef.current || !window.google) return
    const job = jobs.find(j => j.id === selectedJobId)
    if (job) showRouteForJob(job)
  }, [selectedJobId, mapLoaded, jobs])

  async function showRouteForJob(job: JobOrder) {
    if (!mapInstanceRef.current || !window.google) return
    setRouteInfo(null)

    routeMarkersRef.current.forEach(m => m.setMap(null))
    routeMarkersRef.current = []
    directionsRendererRef.current?.setDirections({ routes: [] })

    if (!job.pickup_location || !job.dropoff_location) return

    const geocoder = new window.google.maps.Geocoder()
    const geocode = (addr: string) => new Promise<any>((res, rej) =>
      geocoder.geocode({ address: `${addr}, Philippines` }, (results: any, status: any) =>
        status === 'OK' ? res(results[0].geometry.location) : rej(status)
      )
    )

    try {
      const [origin, dest] = await Promise.all([
        geocode(job.pickup_location),
        geocode(job.dropoff_location),
      ])

      new window.google.maps.DirectionsService().route(
        { origin, destination: dest, travelMode: window.google.maps.TravelMode.DRIVING },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text })
          }
        }
      )

      const mkO = new window.google.maps.Marker({
        position: origin, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: `Pickup: ${job.pickup_location}`, zIndex: 5,
      })
      const mkD = new window.google.maps.Marker({
        position: dest, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: `Drop-off: ${job.dropoff_location}`, zIndex: 5,
      })
      routeMarkersRef.current = [mkO, mkD]

      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(origin)
      bounds.extend(dest)
      const liveEntry = liveLocations.get((job as any).assigned_driver_id || '')
      if (liveEntry) bounds.extend({ lat: liveEntry.lat, lng: liveEntry.lng })
      mapInstanceRef.current.fitBounds(bounds, { top: 80, right: 40, bottom: 80, left: 40 })
    } catch { /* ignore geocode errors */ }
  }

  // ── Fit all live markers in view ─────────────────────────────
  function fitAll() {
    if (!mapInstanceRef.current) return
    const positions: { lat: number; lng: number }[] = []
    liveMarkersRef.current.forEach(({ marker }) => {
      const pos = marker.getPosition()
      if (pos) positions.push({ lat: pos.lat(), lng: pos.lng() })
    })
    if (positions.length === 0) {
      mapInstanceRef.current.panTo({ lat: 14.5995, lng: 120.9842 })
      mapInstanceRef.current.setZoom(11)
      return
    }
    const bounds = new window.google.maps.LatLngBounds()
    positions.forEach(p => bounds.extend(p))
    mapInstanceRef.current.fitBounds(bounds, { top: 80, right: 60, bottom: 80, left: 60 })
  }

  // ── Load full job detail for popup ───────────────────────────
  async function loadJobDetail(job: JobOrder) {
    setLoadingDetail(true)
    const { data } = await supabase.from('job_orders')
      .select(`*,
        truck:trucks(
          id, plate_number, truck_type_label, driver_name, driver_contact,
          owner_name, business_name, contact_number, email, owner_id,
          owner:profiles!owner_id(id, full_name, contact_number, email, role, company_name)
        ),
        driver:profiles!assigned_driver_id(id, full_name, contact_number, email, role),
        creator:profiles!created_by(id, full_name, contact_number, email, role, company_name),
        shipment_items(*),
        status_logs:delivery_status_logs(*, logged_by_profile:profiles!logged_by(full_name))`)
      .eq('id', job.id).single()
    setDetailJob(data)
    setLoadingDetail(false)
  }

  // ── Derived state ────────────────────────────────────────────
  const isFleetAdmin = userRole === 'admin' || userRole === 'fleet_manager'
  const activeJobs = jobs.filter(j => ACTIVE_STATUSES.includes(j.status))
  const inTransitCount = jobs.filter(j => j.status === 'in_transit').length
  const atPickupCount = jobs.filter(j => j.status === 'at_pickup').length
  const liveCount = liveLocations.size
  const emergencyCount = activeEmergencies.length

  const FILTERS = [
    { value: 'active', label: 'Active' },
    { value: 'all', label: 'All' },
    { value: 'in_transit', label: 'In Transit' },
    { value: 'at_pickup', label: 'At Pickup' },
    { value: 'delivered', label: 'Delivered' },
    ...(isFleetAdmin && emergencyCount > 0 ? [{ value: 'emergency', label: '🚨 Emergency' }] : []),
  ]

  const filtered = jobs.filter(j => {
    const matchFilter =
      filter === 'all' ? true :
      filter === 'active' ? ACTIVE_STATUSES.includes(j.status) :
      filter === 'delivered' ? ['delivered', 'completed'].includes(j.status) :
      filter === 'emergency' ? activeEmergencies.some(e => e.job_order_id === j.id || e.reported_by === (j as any).assigned_driver_id) :
      j.status === filter
    const matchSearch = !search ||
      j.job_number.toLowerCase().includes(search.toLowerCase()) ||
      j.client_name.toLowerCase().includes(search.toLowerCase()) ||
      ((j as any).driver?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      ((j.truck as any)?.plate_number || '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col" style={{ minHeight: '100vh' }}>
        <div className="px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0">
          <div className="skeleton h-6 w-44 rounded mb-1" />
          <div className="skeleton h-4 w-56 rounded" />
        </div>
        <div className="skeleton" style={{ height: '55vh', minHeight: '340px' }} />
        <div className="p-3 space-y-2">
          {[0,1,2].map(i => <div key={i} className="skeleton h-24 rounded-lg" />)}
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-bg-primary" style={{ minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0">
        <div>
          <h1 className="font-heading text-lg font-bold text-text-primary">
            {isFleetAdmin ? '🗺️ Fleet Command' : '📡 Tracking'}
          </h1>
          <p className="text-[11px] text-text-muted mt-0.5">
            {isFleetAdmin
              ? `${activeJobs.length} active · ${liveCount} live GPS${emergencyCount > 0 ? ` · 🚨 ${emergencyCount} emergency` : ''}`
              : `${activeJobs.length} active trip${activeJobs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFleetAdmin && emergencyCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger-bg border border-danger-border">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              <span className="text-xs font-bold text-danger">{emergencyCount} SOS</span>
            </div>
          )}
          {isFleetAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-tertiary border border-border">
              <span className={cn('w-1.5 h-1.5 rounded-full', liveCount > 0 ? 'bg-success animate-pulse' : 'bg-text-muted')} />
              <span className="text-xs font-semibold text-text-muted">{liveCount} live</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats bar (fleet/admin only) ── */}
      {isFleetAdmin && (
        <div className="grid grid-cols-4 gap-px bg-border flex-shrink-0">
          {[
            { label: 'Active', value: activeJobs.length, accent: 'text-brand' },
            { label: 'In Transit', value: inTransitCount, accent: 'text-info' },
            { label: 'At Pickup', value: atPickupCount, accent: 'text-warning' },
            { label: 'Emergency', value: emergencyCount, accent: emergencyCount > 0 ? 'text-danger' : 'text-text-muted' },
          ].map(stat => (
            <button
              key={stat.label}
              onClick={() => stat.label === 'Emergency' && emergencyCount > 0 ? setFilter('emergency') : setFilter(stat.label === 'Active' ? 'active' : stat.label === 'In Transit' ? 'in_transit' : stat.label === 'At Pickup' ? 'at_pickup' : 'active')}
              className="bg-bg-secondary px-2 py-2.5 text-center hover:bg-bg-elevated transition-colors"
            >
              <div className={`font-heading text-2xl font-bold leading-none ${stat.accent}`}>{stat.value}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">{stat.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── Main: map + list (side by side on desktop) ── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:h-[calc(100vh-11rem)]">

        {/* ── Map ── */}
        <div
          className="relative flex-shrink-0 lg:flex-1 lg:h-full border-b border-border lg:border-b-0 lg:border-r lg:border-border"
          style={{ height: '52vh', minHeight: '320px' }}
        >
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {/* Loading overlay */}
          {!mapLoaded && (
            <div className="absolute inset-0 bg-bg-tertiary flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <p className="text-text-muted text-sm">Loading map…</p>
            </div>
          )}

          {/* Map legend */}
          {mapLoaded && (
            <div className="absolute top-2 right-2 bg-bg-secondary/90 backdrop-blur border border-border rounded-lg px-2.5 py-2 flex flex-col gap-1.5 pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white flex-shrink-0" />
                <span className="text-[11px] text-text-secondary">Driver (live)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 border border-white flex-shrink-0" />
                <span className="text-[11px] text-text-secondary">Pickup</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white flex-shrink-0" />
                <span className="text-[11px] text-text-secondary">Drop-off</span>
              </div>
              {emergencyCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-white flex-shrink-0" style={{ background: '#ef4444' }} />
                  <span className="text-[11px] text-danger font-bold">Emergency</span>
                </div>
              )}
            </div>
          )}

          {/* Selected trip route info */}
          {mapLoaded && routeInfo && jobs.find(j => j.id === selectedJobId) && (() => {
            const job = jobs.find(j => j.id === selectedJobId)!
            return (
              <div className="absolute bottom-12 left-2 right-2 bg-bg-secondary/95 border border-border rounded-lg px-3 py-1.5 pointer-events-none">
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <span className="font-mono font-bold text-text-secondary flex-shrink-0">{job.job_number}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  <span className="truncate">{job.pickup_location}</span>
                  <span className="flex-shrink-0">→</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                  <span className="truncate">{job.dropoff_location}</span>
                  <span className="flex-shrink-0 ml-auto font-bold text-text-primary">{routeInfo.distance}</span>
                  <span className="flex-shrink-0 text-text-muted">· {routeInfo.duration}</span>
                </div>
              </div>
            )
          })()}

          {/* Fit All button */}
          {mapLoaded && (
            <button
              onClick={fitAll}
              className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-secondary/95 border border-border active:scale-95 transition-transform text-xs font-semibold text-text-secondary"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              <Maximize2 size={13} className="text-brand" />
              Fit All
            </button>
          )}

          {/* No live GPS notice */}
          {mapLoaded && isFleetAdmin && liveCount === 0 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-secondary/90 border border-border rounded-xl px-4 py-3 text-center pointer-events-none">
              <p className="text-sm text-text-muted font-semibold">No live GPS signals</p>
              <p className="text-[11px] text-text-muted mt-0.5">Markers appear when drivers start their trip</p>
            </div>
          )}
        </div>

        {/* ── Trip list panel ── */}
        <div className="flex flex-col lg:w-80 xl:w-96 min-h-0">

          {/* Search + filters */}
          <div className="px-3 py-2.5 bg-bg-secondary border-b border-border flex-shrink-0 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="form-input pl-8 text-sm py-1.5"
                placeholder="JO#, client, driver, plate…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all flex-shrink-0',
                    filter === f.value
                      ? 'bg-brand text-bg-primary border-brand'
                      : 'bg-bg-tertiary border-border text-text-secondary'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Job cards */}
          <div className="flex-1 overflow-y-auto lg:max-h-none" style={{ maxHeight: '45vh' }}>
            {filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="text-3xl mb-2">📡</div>
                <p className="text-text-secondary text-sm font-medium">No trips match filter</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(job => {
                  const isSelected = selectedJobId === job.id
                  const assignedDriverId = (job as any).assigned_driver_id
                  const liveData = assignedDriverId ? liveLocations.get(assignedDriverId) : null
                  const hasLive = !!liveData
                  const isEmergency = activeEmergencies.some(
                    e => e.job_order_id === job.id || e.reported_by === assignedDriverId
                  )
                  const driverName = (job as any).driver?.full_name || (job.truck as any)?.driver_name || '—'
                  const plateTrunk = (job.truck as any)?.plate_number || '—'
                  const stepIndex = DELIVERY_STEPS.indexOf(job.status as JobStatus)
                  const progress = stepIndex >= 0 ? Math.round(((stepIndex + 1) / DELIVERY_STEPS.length) * 100) : 0

                  return (
                    <div
                      key={job.id}
                      className={cn(
                        'p-3 cursor-pointer transition-colors border-l-2',
                        isSelected ? 'bg-bg-elevated border-l-brand' : 'bg-bg-primary hover:bg-bg-secondary border-l-transparent',
                        isEmergency && !isSelected && 'bg-danger-bg/10 border-l-danger',
                        isEmergency && isSelected && 'bg-danger-bg/20 border-l-danger',
                      )}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      {/* Row 1: JO# + live dot + status badge */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {isEmergency && <AlertTriangle size={12} className="text-danger flex-shrink-0" />}
                          <span className="text-xs font-mono text-text-muted flex-shrink-0">{job.job_number}</span>
                          {hasLive && (
                            <span className="flex items-center gap-0.5 text-[10px] text-success font-semibold flex-shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <span className={`status-badge text-[10px] flex-shrink-0 ${getJobStatusColor(job.status)}`}>
                          {JOB_STATUS_LABELS[job.status as JobStatus]}
                        </span>
                      </div>

                      {/* Row 2: client name */}
                      <div className="font-heading text-sm font-bold text-text-primary truncate mb-0.5">
                        {job.client_name}
                      </div>

                      {/* Row 3: driver + truck */}
                      <div className="text-xs text-text-muted mb-1.5">
                        👤 {driverName} · 🚛 {plateTrunk}
                      </div>

                      {/* Row 4: pickup → dropoff */}
                      <div className="flex items-center gap-1 text-[11px] text-text-muted mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                        <span className="truncate flex-1">{job.pickup_location}</span>
                        <span className="flex-shrink-0">→</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                        <span className="truncate flex-1 text-right">{job.dropoff_location}</span>
                      </div>

                      {/* Row 5: progress + last update + details button */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="h-1 rounded-full overflow-hidden bg-bg-tertiary flex-shrink-0" style={{ width: 52 }}>
                            <div className="h-full bg-brand rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[10px] text-text-muted flex-shrink-0">{progress}%</span>
                          {hasLive && liveData && (
                            <span className="text-[10px] text-success truncate">
                              {timeAgo(liveData.timestamp)}
                            </span>
                          )}
                          {!hasLive && ACTIVE_STATUSES.includes(job.status) && (
                            <span className="text-[10px] text-text-muted truncate">No GPS yet</span>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setDetailJob(null); loadJobDetail(job) }}
                          className="text-[11px] text-info font-semibold flex-shrink-0 hover:underline"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Job detail popup ── */}
      {(detailJob || loadingDetail) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            {loadingDetail ? (
              <div className="p-8 text-center space-y-3">
                {[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
              </div>
            ) : detailJob && (() => {
              // ── Resolve party data ──────────────────────────────────
              const truck = detailJob.truck

              // Client: JO text fields are always present. creator profile
              // may exist if the client has a portal account (role='client').
              const clientName        = detailJob.client_name
              const clientContact     = detailJob.contact_person
              const clientPhone       = detailJob.contact_number
              const creatorProfile    = detailJob.creator
              // Use creator profile for chat only when they're actually a client user
              const clientUserId      = creatorProfile?.role === 'client' ? creatorProfile.id : null
              const clientEmail       = creatorProfile?.role === 'client' ? creatorProfile.email : null

              // Truck Owner: prefer joined profile (has email + verified contact),
              // fall back to truck text fields
              const ownerProfile      = truck?.owner
              const ownerName         = ownerProfile?.full_name || truck?.owner_name || null
              const ownerCompany      = ownerProfile?.company_name || truck?.business_name || null
              const ownerPhone        = ownerProfile?.contact_number || truck?.contact_number || null
              const ownerEmail        = ownerProfile?.email || truck?.email || null
              const ownerUserId       = ownerProfile?.id || truck?.owner_id || null

              // Driver: prefer joined profile, fall back to truck text fields
              const driverProfile     = detailJob.driver
              const driverName        = driverProfile?.full_name || truck?.driver_name || null
              const driverPhone       = driverProfile?.contact_number || truck?.driver_contact || null
              const driverEmail       = driverProfile?.email || null
              const driverUserId      = detailJob.assigned_driver_id || driverProfile?.id || null

              // Live GPS for this job
              const liveEntry         = driverUserId ? liveLocations.get(driverUserId) : null

              return (
                <>
                  {/* Sticky header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="text-xs text-text-muted font-mono">{detailJob.job_number}</div>
                      <h2 className="font-heading text-base font-bold truncate">{clientName}</h2>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`status-badge ${getJobStatusColor(detailJob.status as any)}`}>
                        {JOB_STATUS_LABELS[detailJob.status as JobStatus]}
                      </span>
                      <button
                        onClick={() => setDetailJob(null)}
                        style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: 16 }}
                      >✕</button>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">

                    {/* ── JO summary ── */}
                    <div className="bg-bg-tertiary rounded-xl p-3.5 space-y-3">
                      {/* Route */}
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0 mt-1" />
                          <div>
                            <div className="text-[10px] text-text-muted uppercase font-bold">Pickup</div>
                            <div className="text-sm text-text-primary leading-snug">{detailJob.pickup_location}</div>
                          </div>
                        </div>
                        <div className="ml-1 w-px h-3 bg-border ml-[5px]" />
                        <div className="flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-danger flex-shrink-0 mt-1" />
                          <div>
                            <div className="text-[10px] text-text-muted uppercase font-bold">Drop-off</div>
                            <div className="text-sm text-text-primary leading-snug">{detailJob.dropoff_location}</div>
                          </div>
                        </div>
                      </div>
                      {/* Info row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-border text-xs text-text-muted">
                        <span>📅 {formatDate(detailJob.delivery_date)}{detailJob.delivery_time ? ` · ${detailJob.delivery_time}` : ''}</span>
                        {detailJob.total_rate && <span>💰 {formatCurrency(detailJob.total_rate)}</span>}
                        {detailJob.shipment_items?.length > 0 && <span>📦 {detailJob.shipment_items.length} item{detailJob.shipment_items.length > 1 ? 's' : ''}</span>}
                        {detailJob.total_cbm && <span>📐 {Number(detailJob.total_cbm).toFixed(2)} CBM</span>}
                      </div>
                    </div>

                    {/* ── Live GPS status ── */}
                    {liveEntry && (
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border"
                        style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}>
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-success">Live GPS Active</span>
                          <span className="text-xs text-text-muted ml-2">Updated {timeAgo(liveEntry.timestamp)}</span>
                        </div>
                        <span className="text-[10px] text-text-muted font-mono flex-shrink-0">
                          {liveEntry.lat.toFixed(4)}, {liveEntry.lng.toFixed(4)}
                        </span>
                      </div>
                    )}
                    {!liveEntry && ACTIVE_STATUSES.includes(detailJob.status) && (
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border bg-bg-tertiary">
                        <span className="w-2 h-2 rounded-full bg-text-muted flex-shrink-0" />
                        <span className="text-xs text-text-muted">No live GPS — driver has not started broadcasting</span>
                      </div>
                    )}

                    {/* ── Parties ── */}
                    <div>
                      <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Parties Involved</div>
                      <div className="space-y-2.5">

                        {/* Client / Requester */}
                        <ContactCard
                          userId={clientUserId}
                          name={clientName}
                          role={clientUserId ? 'client' : undefined}
                          contactNumber={clientPhone}
                          email={clientEmail}
                          label={`👁️ Client / Requester${clientContact && clientContact !== clientName ? ` · ${clientContact}` : ''}`}
                        />

                        {/* Truck Owner */}
                        {(ownerName || truck) && (
                          <ContactCard
                            userId={ownerUserId}
                            name={ownerName || truck?.owner_name || 'Unknown Owner'}
                            role="truck_owner"
                            contactNumber={ownerPhone}
                            email={ownerEmail}
                            label={`🚛 Truck Owner${ownerCompany ? ` · ${ownerCompany}` : ''}`}
                          />
                        )}

                        {/* Driver */}
                        {(driverName || truck) && (
                          <ContactCard
                            userId={driverUserId}
                            name={driverName || 'Unassigned'}
                            role="driver"
                            contactNumber={driverPhone}
                            email={driverEmail}
                            label="👤 Driver"
                          />
                        )}
                      </div>
                    </div>

                    {/* ── Assigned truck ── */}
                    {truck && (
                      <div className="bg-bg-tertiary rounded-xl p-3.5">
                        <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Assigned Truck</div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-heading text-sm font-bold text-text-primary">🚛 {truck.plate_number}</div>
                            <div className="text-xs text-text-muted mt-0.5">{truck.truck_type_label}</div>
                          </div>
                          {liveEntry && (
                            <span className="text-[10px] px-2 py-1 rounded-full font-bold"
                              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                              Live
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Delivery progress ── */}
                    <div>
                      <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Delivery Progress</div>
                      {(() => {
                        const currentIdx = DELIVERY_STEPS.indexOf(detailJob.status as JobStatus)
                        return DELIVERY_STEPS.map((step, i) => {
                          const isDone = i < currentIdx
                          const isCurrent = i === currentIdx
                          const log = (detailJob.status_logs || []).find((l: any) => l.status === step)
                          return (
                            <div key={step} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${isDone ? 'bg-success' : isCurrent ? 'bg-brand' : 'bg-border-secondary'}`} />
                                {i < DELIVERY_STEPS.length - 1 && (
                                  <div className={`w-px flex-1 mt-0.5 min-h-[20px] ${isDone ? 'bg-success' : 'bg-border'}`} />
                                )}
                              </div>
                              <div className="flex-1 pb-3">
                                <div className={`text-sm font-medium ${isDone ? 'text-text-secondary' : isCurrent ? 'text-text-primary' : 'text-text-muted'}`}>
                                  {JOB_STATUS_LABELS[step]}
                                  {isCurrent && <span className="ml-2 text-xs text-warning animate-pulse">← Current</span>}
                                </div>
                                {log && (
                                  <div className="text-xs text-text-muted mt-0.5">
                                    {formatDate(log.logged_at, 'MMM dd h:mm a')}
                                    {log.note && ` · ${log.note}`}
                                  </div>
                                )}
                                {log?.proof_url && (
                                  <a href={log.proof_url} target="_blank" className="text-xs text-info underline mt-0.5 block">
                                    View proof
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>

                    {/* ── Shipment items ── */}
                    {detailJob.shipment_items?.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                          Shipment Items ({detailJob.shipment_items.length})
                        </div>
                        <div className="bg-bg-tertiary rounded-xl divide-y divide-border overflow-hidden">
                          {detailJob.shipment_items.map((item: any) => (
                            <div key={item.id} className="flex justify-between items-center px-3.5 py-2.5">
                              <div>
                                <div className="text-sm font-medium text-text-primary">{item.item_name}</div>
                                {item.is_fragile && <span className="text-xs text-warning">⚠️ Fragile</span>}
                                {item.requires_special_handling && <span className="text-xs text-info ml-1">🔧 Special handling</span>}
                              </div>
                              <div className="text-right flex-shrink-0 ml-3">
                                <div className="text-sm font-semibold text-text-primary">×{item.quantity}</div>
                                {item.total_cbm > 0 && <div className="text-xs text-info">{Number(item.total_cbm).toFixed(3)} CBM</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Special instructions */}
                    {detailJob.special_instructions && (
                      <div className="bg-warning-bg border border-warning-border rounded-xl p-3.5">
                        <div className="text-xs font-bold text-warning uppercase mb-1">Special Instructions</div>
                        <p className="text-sm text-warning leading-relaxed">{detailJob.special_instructions}</p>
                      </div>
                    )}

                    <button onClick={() => setDetailJob(null)} className="btn btn-secondary btn-full">Close</button>
                  </div>
                </>
              )
            })()}
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
