'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { JOB_STATUS_LABELS, type JobOrder, type JobStatus } from '@/types'
import { getJobStatusColor, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { AlertTriangle, MessageCircle, Phone, Navigation, MapPin, Package, Truck, Clock } from 'lucide-react'

declare global {
  interface Window { google: any; initTodayDriveMap: () => void }
}

// Statuses driver is allowed to self-update
const DRIVER_ALLOWED_STATUSES: JobStatus[] = ['accepted', 'arrived', 'delivered']

const STATUS_LABELS: Partial<Record<JobStatus, string>> = {
  accepted: '✅ Accept Trip',
  arrived: '📍 Arrived at Drop-off',
  delivered: '📦 Mark Delivered',
}

export default function TodayDrivePage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)
  const broadcastChannelRef = useRef<any>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [job, setJob] = useState<JobOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'capturing' | 'captured' | 'denied'>('idle')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)

  // Load Google Maps
  useEffect(() => {
    if (window.google) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initTodayDriveMap`
    script.async = true; script.defer = true
    window.initTodayDriveMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Init map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 14.5995, lng: 120.9842 },
      zoom: 12,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#a0a0a0' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111111' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      ],
      streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
    })
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#60a5fa', strokeWeight: 4, strokeOpacity: 0.9 },
    })
    directionsRendererRef.current.setMap(mapInstanceRef.current)
  }, [mapLoaded])

  // Load session + job
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
      setUserProfile(profile)

      // Redirect non-drivers away
      if (profile?.role && profile.role !== 'driver') {
        router.push('/tracking')
        return
      }

      // Find today's active assigned job
      const today = new Date().toISOString().split('T')[0]
      const { data: jobs } = await supabase.from('job_orders')
        .select(`*, truck:trucks(plate_number, truck_type_label), shipment_items(*)`)
        .eq('assigned_driver_id', uid)
        .not('status', 'in', '("completed","cancelled","delivered")')
        .order('delivery_date', { ascending: true })
        .limit(1)

      if (jobs && jobs.length > 0) {
        setJob(jobs[0] as JobOrder)
      }
      setLoading(false)
    }
    load()
  }, [router])

  // Auto-capture GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('denied')
      return
    }
    setGpsStatus('capturing')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsCoords(coords)
        setGpsStatus('captured')
      },
      () => {
        setGpsStatus('denied')
        toast.error('Location access denied. Enable GPS for full trip tracking.')
      },
      { timeout: 15000, enableHighAccuracy: true }
    )
  }, [])

  // Draw route when job + map are both ready
  const drawRoute = useCallback(async (currentJob: JobOrder) => {
    if (!mapInstanceRef.current || !window.google) return
    const geocoder = new window.google.maps.Geocoder()
    const directionsService = new window.google.maps.DirectionsService()
    const geocode = (addr: string) => new Promise<any>((res, rej) => {
      geocoder.geocode({ address: `${addr}, Philippines` }, (results: any, status: any) => {
        if (status === 'OK') res(results[0].geometry.location)
        else rej(status)
      })
    })
    try {
      const [origin, destination] = await Promise.all([
        geocode(currentJob.pickup_location),
        geocode(currentJob.dropoff_location),
      ])

      directionsService.route(
        { origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text })
          }
        }
      )

      // Pickup marker (green)
      new window.google.maps.Marker({
        position: origin, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Pickup',
      })
      // Drop-off marker (red)
      new window.google.maps.Marker({
        position: destination, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Drop-off',
      })

      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(origin); bounds.extend(destination)
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 })
    } catch (err) {
      console.error('Route error:', err)
    }
  }, [])

  useEffect(() => {
    if (job && mapLoaded) drawRoute(job)
  }, [job, mapLoaded, drawRoute])

  // Update driver dot on map when GPS changes
  useEffect(() => {
    if (!gpsCoords || !mapInstanceRef.current || !window.google) return
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setPosition(gpsCoords)
    } else {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: gpsCoords,
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12, fillColor: '#3b82f6', fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 3,
        },
        title: 'Your Location',
        zIndex: 999,
      })
    }
  }, [gpsCoords])

  // Real-time GPS broadcast + continuous watch during active trip
  useEffect(() => {
    if (!userId || !job) return
    const activeInTransit = ['accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'].includes(job.status)
    if (!activeInTransit) return

    // Setup broadcast channel
    const channel = supabase.channel('driver-locations')
    broadcastChannelRef.current = channel

    const broadcastLocation = (lat: number, lng: number) => {
      channel.send({
        type: 'broadcast',
        event: 'driver-location',
        payload: {
          driver_id: userId,
          driver_name: userProfile?.full_name || 'Driver',
          job_id: job.id,
          job_number: job.job_number,
          lat, lng,
          timestamp: Date.now(),
        },
      })
    }

    channel.subscribe()

    // Watch position continuously
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setGpsCoords(coords)
          broadcastLocation(coords.lat, coords.lng)
        },
        () => { },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      )
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (broadcastChannelRef.current) supabase.removeChannel(broadcastChannelRef.current)
    }
  }, [userId, job, userProfile])

  async function updateStatus(newStatus: JobStatus) {
    if (!job || !userId || updatingStatus) return
    setUpdatingStatus(true)
    try {
      const { error } = await supabase.from('job_orders').update({ status: newStatus }).eq('id', job.id)
      if (error) throw error

      await supabase.from('delivery_status_logs').insert({
        job_order_id: job.id,
        status: newStatus,
        logged_by: userId,
        location: gpsCoords ? `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}` : null,
        note: `Status updated by driver`,
        logged_at: new Date().toISOString(),
      })

      setJob(prev => prev ? { ...prev, status: newStatus } : prev)
      toast.success(`Status updated: ${JOB_STATUS_LABELS[newStatus]}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const nextDriverStatus = DRIVER_ALLOWED_STATUSES.find(s => {
    if (!job) return false
    const order: JobStatus[] = ['assigned', 'accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived', 'delivered']
    const currentIdx = order.indexOf(job.status as JobStatus)
    const nextIdx = order.indexOf(s)
    return nextIdx > currentIdx
  })

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="skeleton h-8 w-48 rounded mb-2" />
        <div className="skeleton h-64 rounded-lg mb-4" />
        <div className="skeleton h-32 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-6">
      <div className="mb-4">
        <h1 className="font-heading text-2xl font-bold text-text-primary flex items-center gap-2">
          <Navigation size={22} className="text-brand" /> Today's Drive
        </h1>
        {gpsStatus === 'captured' && (
          <p className="text-xs text-success mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block animate-pulse" />
            GPS active — your location is being shared
          </p>
        )}
        {gpsStatus === 'denied' && (
          <p className="text-xs text-warning mt-0.5">⚠️ Location access denied — enable GPS for tracking</p>
        )}
        {gpsStatus === 'capturing' && (
          <p className="text-xs text-text-muted mt-0.5">Acquiring GPS location...</p>
        )}
      </div>

      {!job ? (
        /* Empty state */
        <div className="text-center py-16 bg-bg-secondary border border-border rounded-xl">
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>🚛</div>
          <h2 className="font-heading text-lg font-bold text-text-primary mb-2">No Assigned Trip Today</h2>
          <p className="text-text-muted text-sm mb-6 px-8">
            You don't have an active trip right now. Check your job list for upcoming assignments.
          </p>
          <Link href="/jobs" className="btn btn-primary">View My Jobs</Link>
        </div>
      ) : (
        <>
          {/* Status badge */}
          <div className="flex items-center justify-between mb-3">
            <span className={`status-badge text-sm px-3 py-1 ${getJobStatusColor(job.status)}`}>
              {JOB_STATUS_LABELS[job.status as JobStatus]}
            </span>
            <span className="text-xs text-text-muted font-mono">{job.job_number}</span>
          </div>

          {/* Map */}
          <div className="relative rounded-xl overflow-hidden border border-border mb-3" style={{ height: '240px' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            {!mapLoaded && (
              <div className="absolute inset-0 bg-bg-tertiary flex items-center justify-center">
                <p className="text-text-muted text-sm">Loading map...</p>
              </div>
            )}
          </div>

          {/* Route info */}
          {routeInfo && (
            <div className="bg-bg-secondary border border-border rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Clock size={14} />
                <span>{routeInfo.duration}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <MapPin size={14} />
                <span>{routeInfo.distance}</span>
              </div>
            </div>
          )}

          {/* Trip details */}
          <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-3 space-y-3">
            <div className="text-xs font-bold text-text-muted uppercase mb-1">Trip Details</div>

            <div className="flex gap-3 items-start">
              <span className="w-2 h-2 rounded-full bg-success flex-shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-muted">Pickup</div>
                <div className="text-sm font-semibold text-text-primary">{job.pickup_location}</div>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-muted">Drop-off</div>
                <div className="text-sm font-semibold text-text-primary">{job.dropoff_location}</div>
              </div>
            </div>

            <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-text-muted">Client</div>
                <div className="text-sm font-semibold text-text-primary truncate">{job.client_name}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Delivery Date</div>
                <div className="text-sm font-semibold text-text-primary">{formatDate(job.delivery_date)}</div>
              </div>
              {job.contact_number && (
                <div className="col-span-2">
                  <div className="text-xs text-text-muted">Contact</div>
                  <a href={`tel:${job.contact_number}`} className="text-sm font-semibold text-info">
                    📞 {job.contact_number}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Truck info */}
          {job.truck && (
            <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
              <Truck size={20} className="text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">{(job.truck as any).plate_number}</div>
                <div className="text-xs text-text-muted">{(job.truck as any).truck_type_label}</div>
              </div>
            </div>
          )}

          {/* Cargo summary */}
          {job.shipment_items && job.shipment_items.length > 0 && (
            <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Package size={16} className="text-text-muted" />
                <div className="text-xs font-bold text-text-muted uppercase">Cargo ({job.shipment_items.length} items)</div>
              </div>
              <div className="space-y-1">
                {job.shipment_items.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-text-secondary truncate flex-1">{item.item_name}</span>
                    <span className="text-text-muted ml-2">×{item.quantity}</span>
                    {item.is_fragile && <span className="ml-2 text-warning text-xs">⚠️</span>}
                  </div>
                ))}
              </div>
              {job.special_instructions && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="text-xs text-warning">📋 {job.special_instructions}</div>
                </div>
              )}
            </div>
          )}

          {/* Status update button */}
          {nextDriverStatus && job.status !== 'delivered' && job.status !== 'completed' && (
            <button
              onClick={() => updateStatus(nextDriverStatus)}
              disabled={updatingStatus}
              className="w-full py-4 rounded-xl font-heading font-bold text-base mb-3 transition-all"
              style={{
                background: updatingStatus ? '#2a2a2a' : '#22c55e',
                color: '#fff',
                border: 'none',
                cursor: updatingStatus ? 'not-allowed' : 'pointer',
                boxShadow: updatingStatus ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
              }}>
              {updatingStatus ? 'Updating...' : STATUS_LABELS[nextDriverStatus] || `Mark as ${JOB_STATUS_LABELS[nextDriverStatus]}`}
            </button>
          )}

          {(job.status === 'delivered' || job.status === 'completed') && (
            <div className="w-full py-4 rounded-xl text-center bg-success-bg border border-success-border mb-3">
              <div className="text-success font-bold">✅ Trip Delivered</div>
              <div className="text-xs text-text-muted mt-1">Awaiting fleet manager confirmation</div>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-3">
            <Link href="/emergency"
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-danger-bg border border-danger-border text-danger text-center">
              <Phone size={20} />
              <span className="text-xs font-bold">SOS</span>
            </Link>
            <Link href="/incidents"
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center">
              <AlertTriangle size={20} />
              <span className="text-xs font-bold">Incident</span>
            </Link>
            <Link href="/chat"
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center">
              <MessageCircle size={20} />
              <span className="text-xs font-bold">Messages</span>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
