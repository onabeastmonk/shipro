'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchJobOrders } from '@/lib/api'
import { getJobStatusColor, formatDate } from '@/lib/utils'
import { JOB_STATUS_LABELS, DELIVERY_STEPS, type JobOrder } from '@/types'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    google: any
    initMap: () => void
  }
}

export default function TrackingPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const directionsRendererRef = useRef<any>(null)

  const [jobs, setJobs] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<JobOrder | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)

  // Load Google Maps script
  useEffect(() => {
    if (window.google) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap`
    script.async = true
    script.defer = true
    window.initMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Initialize map
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
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111111' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#333333' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111111' }] },
        { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
      ],
      streetViewControl: false,
      mapTypeControl: false,
    })

    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#ffffff',
        strokeWeight: 4,
        strokeOpacity: 0.9,
      },
    })
    directionsRendererRef.current.setMap(mapInstanceRef.current)
  }, [mapLoaded])

  // Load jobs
  useEffect(() => {
    async function load() {
      try {
        const all = await fetchJobOrders()
        setJobs(all)
        if (all.length > 0) setSelectedJob(all[0])
      } catch { }
      finally { setLoading(false) }
    }
    load()
  }, [])

  // Show route on map
  const showRoute = useCallback(async (job: JobOrder) => {
    if (!mapInstanceRef.current || !window.google) return

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    setRouteInfo(null)

    const geocoder = new window.google.maps.Geocoder()
    const directionsService = new window.google.maps.DirectionsService()

    const geocode = (address: string): Promise<any> =>
      new Promise((resolve, reject) => {
        geocoder.geocode(
          { address: `${address}, Philippines` },
          (results: any, status: any) => {
            if (status === 'OK') resolve(results[0].geometry.location)
            else reject(status)
          }
        )
      })

    try {
      const [origin, destination] = await Promise.all([
        geocode(job.pickup_location),
        geocode(job.dropoff_location),
      ])

      directionsService.route(
        {
          origin,
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({
              distance: leg.distance.text,
              duration: leg.duration.text,
            })
          }
        }
      )

      // Green pickup marker
      const pickupMarker = new window.google.maps.Marker({
        position: origin,
        map: mapInstanceRef.current,
        title: job.pickup_location,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#22c55e',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
      })

      new window.google.maps.InfoWindow({
        content: `<div style="color:#000;font-size:12px;font-weight:600;">📦 Pickup<br/>${job.pickup_location}</div>`,
      }).open(mapInstanceRef.current, pickupMarker)

      // Red dropoff marker
      const dropoffMarker = new window.google.maps.Marker({
        position: destination,
        map: mapInstanceRef.current,
        title: job.dropoff_location,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
      })

      markersRef.current = [pickupMarker, dropoffMarker]

      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(origin)
      bounds.extend(destination)
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 })

    } catch (err) {
      console.error('Map error:', err)
    }
  }, [])

  useEffect(() => {
    if (selectedJob && mapLoaded) showRoute(selectedJob)
  }, [selectedJob, mapLoaded, showRoute])

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
        <p className="text-text-muted text-sm mt-0.5">Tap any delivery to show route on map</p>
      </div>

      {/* Google Map */}
      <div className="relative rounded-lg overflow-hidden border border-border mb-2" style={{ height: '300px' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {!mapLoaded && (
          <div className="absolute inset-0 bg-bg-tertiary flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl mb-2">🗺️</div>
              <p className="text-text-muted text-sm">Loading Google Maps...</p>
            </div>
          </div>
        )}
      </div>

      {/* Route info bar */}
      {selectedJob && (
        <div className="bg-bg-secondary border border-border rounded-lg p-3 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text-muted mb-1">
                {selectedJob.job_number} · {selectedJob.client_name}
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                <span className="truncate">{selectedJob.pickup_location}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                <span className="truncate">{selectedJob.dropoff_location}</span>
              </div>
            </div>
            {routeInfo && (
              <div className="text-right flex-shrink-0 ml-3">
                <div className="font-heading text-sm font-bold text-text-primary">{routeInfo.distance}</div>
                <div className="text-xs text-text-muted">{routeInfo.duration}</div>
              </div>
            )}
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
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all',
              filter === f.value
                ? 'bg-brand text-bg-primary border-brand'
                : 'bg-bg-secondary border-border text-text-secondary'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Delivery cards */}
      {loading ? (
        Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-32 rounded-lg mb-3" />)
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📡</div>
          <p className="text-text-secondary font-medium">No deliveries found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(job => {
            const stepIndex = DELIVERY_STEPS.indexOf(job.status as any)
            const progress = stepIndex >= 0 ? ((stepIndex + 1) / DELIVERY_STEPS.length) * 100 : 0
            const isSelected = selectedJob?.id === job.id

            return (
              <div
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className={cn(
                  'border rounded-lg p-4 cursor-pointer transition-all',
                  isSelected
                    ? 'bg-bg-elevated border-border-active'
                    : 'bg-bg-secondary border-border hover:border-border-secondary'
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-xs text-text-muted font-mono">{job.job_number}</div>
                    <div className="font-heading text-sm font-semibold mt-0.5">{job.client_name}</div>
                    <div className="text-xs text-text-muted">{formatDate(job.delivery_date)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`status-badge ${getJobStatusColor(job.status)}`}>
                      {JOB_STATUS_LABELS[job.status]}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-success">● On map</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-tertiary rounded px-2.5 py-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  <span className="flex-1 truncate">{job.pickup_location}</span>
                  <span>→</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                  <span className="flex-1 truncate text-right">{job.dropoff_location}</span>
                </div>

                {job.truck && (
                  <div className="text-xs text-text-muted mb-1.5">
                    🚛 {job.truck.plate_number} · {job.truck.driver_name}
                  </div>
                )}

                <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between text-xs text-text-muted mt-1">
                  <span>{JOB_STATUS_LABELS[job.status]}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
