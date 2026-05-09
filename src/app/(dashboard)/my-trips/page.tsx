'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { JOB_STATUS_LABELS, DELIVERY_STEPS, type JobOrder, type JobStatus } from '@/types'
import { getJobStatusColor, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, MessageCircle, Phone, Navigation, MapPin,
  Package, Clock, ChevronRight, CheckCircle,
} from 'lucide-react'

declare global {
  interface Window { google: any; initMyTripsMap: () => void }
}

const DRIVER_ALLOWED_STATUSES: JobStatus[] = ['accepted', 'arrived', 'delivered']

const NEXT_STATUS_LABEL: Partial<Record<JobStatus, string>> = {
  accepted:  '✅ Accept Trip',
  arrived:   '📍 Arrived at Drop-off',
  delivered: '📦 Mark as Delivered',
}

function sortOrder(status: string): number {
  if (['in_transit', 'at_pickup', 'loaded'].includes(status)) return 0
  if (['accepted'].includes(status)) return 1
  if (['assigned'].includes(status)) return 2
  if (['arrived'].includes(status)) return 3
  if (['delivered', 'completed'].includes(status)) return 4
  if (['cancelled'].includes(status)) return 5
  return 6
}

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

export default function TripGuidePage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const driverInfoWindowRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)
  const broadcastChannelRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const infoWindowsRef = useRef<any[]>([])

  const [userId, setUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [trips, setTrips] = useState<JobOrder[]>([])
  const [activeTrip, setActiveTrip] = useState<JobOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'capturing' | 'captured' | 'denied'>('idle')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // ── Google Maps script ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.google) { setMapLoaded(true); return }
    if (document.querySelector('script[data-gmap="my-trips"]')) return
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMyTripsMap`
    script.async = true
    script.defer = true
    script.setAttribute('data-gmap', 'my-trips')
    window.initMyTripsMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // ── Init map instance — always, not gated on trips ──────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 14.5995, lng: 120.9842 },
      zoom: 12,
      styles: MAP_STYLES,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: true,
    })
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#60a5fa', strokeWeight: 5, strokeOpacity: 0.9 },
    })
    directionsRendererRef.current.setMap(mapInstanceRef.current)
  }, [mapLoaded])

  // ── Auth + trips ─────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
      setUserProfile(profile)
      if (profile?.role && profile.role !== 'driver') { router.push('/tracking'); return }
      await loadTrips(uid, profile)
    }
    load()
  }, [router])

  async function loadTrips(uid: string, profile?: any) {
    const resolvedProfile = profile ?? userProfile
    const jobSelectFields = `
      id, job_number, client_name, contact_number, contact_person,
      pickup_location, dropoff_location, delivery_date, delivery_time,
      status, special_instructions, goods_description,
      total_cbm, estimated_weight_kg, base_rate, total_rate,
      assigned_driver_id, assigned_truck_id,
      truck:trucks(plate_number, truck_type_label),
      shipment_items(id, item_name, quantity, cbm_per_item, total_cbm, is_fragile, requires_special_handling, remarks)
    `
    const { data: directJobs } = await supabase
      .from('job_orders')
      .select(jobSelectFields)
      .eq('assigned_driver_id', uid)
      .not('status', 'in', '(cancelled)')
      .order('delivery_date', { ascending: true })

    const directIds = new Set((directJobs || []).map((j: any) => j.id))

    // Path 2: approved applicants where this driver's UUID is in selected_helper_contact
    const { data: contactApps } = await supabase
      .from('job_applicants')
      .select('job_order_id')
      .eq('status', 'approved')
      .ilike('selected_helper_contact', `%profile:${uid}%`)

    // Path 3: approved applicants matched by driver full name
    let nameApps: any[] = []
    if (resolvedProfile?.full_name) {
      const { data } = await supabase
        .from('job_applicants')
        .select('job_order_id')
        .eq('status', 'approved')
        .ilike('selected_helper_name', `%${resolvedProfile.full_name}%`)
      nameApps = data || []
    }

    const extraIds = [
      ...(contactApps || []).map((a: any) => a.job_order_id),
      ...nameApps.map((a: any) => a.job_order_id),
    ].filter((id: string) => id && !directIds.has(id))
    const uniqueExtraIds = Array.from(new Set(extraIds))

    let extraJobs: any[] = []
    if (uniqueExtraIds.length > 0) {
      const { data: extra } = await supabase
        .from('job_orders')
        .select(jobSelectFields)
        .in('id', uniqueExtraIds)
        .not('status', 'in', '(cancelled)')
        .order('delivery_date', { ascending: true })
      extraJobs = extra || []
    }

    const allTrips = [...(directJobs || []), ...extraJobs] as JobOrder[]
    allTrips.sort((a, b) =>
      sortOrder(a.status) - sortOrder(b.status) ||
      new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime()
    )

    setTrips(allTrips)
    const active = allTrips.find(t => !['completed', 'delivered', 'cancelled'].includes(t.status)) || null
    setActiveTrip(active)
    if (active) setSelectedTripId(active.id)
    setLoading(false)
  }

  // ── Auto-capture GPS on mount ────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('denied'); return }
    setGpsStatus('capturing')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsStatus('captured')
      },
      () => setGpsStatus('denied'),
      { timeout: 15000, enableHighAccuracy: true }
    )
  }, [])

  // ── Draw route for selected trip ─────────────────────────────
  const drawRoute = useCallback(async (trip: JobOrder) => {
    if (!mapInstanceRef.current || !window.google) return
    setRouteInfo(null)
    setRouteError(null)

    // Clear previous markers and info windows
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    infoWindowsRef.current.forEach(iw => iw.close())
    infoWindowsRef.current = []
    // Clear directions
    directionsRendererRef.current?.setDirections({ routes: [] })

    if (!trip.pickup_location || !trip.dropoff_location) {
      setRouteError('Pickup or drop-off location is missing for this trip.')
      return
    }

    const geocoder = new window.google.maps.Geocoder()
    const ds = new window.google.maps.DirectionsService()

    const geocode = (addr: string) => new Promise<any>((res, rej) =>
      geocoder.geocode({ address: `${addr}, Philippines` }, (results: any, status: any) =>
        status === 'OK' ? res(results[0].geometry.location) : rej(status)
      )
    )

    try {
      const [origin, dest] = await Promise.all([
        geocode(trip.pickup_location),
        geocode(trip.dropoff_location),
      ])

      // Route directions
      ds.route(
        { origin, destination: dest, travelMode: window.google.maps.TravelMode.DRIVING },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text })
          } else {
            setRouteError('Route directions unavailable — markers show pickup and drop-off only.')
          }
        }
      )

      // Pickup marker + info window
      const mkPickup = new window.google.maps.Marker({
        position: origin,
        map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Pickup',
        zIndex: 10,
      })
      const iwPickup = new window.google.maps.InfoWindow({
        content: `<div style="color:#111;font-size:12px;line-height:1.4;max-width:180px"><strong style="color:#16a34a">🟢 Pickup</strong><br/>${trip.pickup_location}</div>`,
      })
      mkPickup.addListener('click', () => {
        infoWindowsRef.current.forEach(iw => iw.close())
        driverInfoWindowRef.current?.close()
        iwPickup.open(mapInstanceRef.current, mkPickup)
      })

      // Drop-off marker + info window
      const mkDrop = new window.google.maps.Marker({
        position: dest,
        map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Drop-off',
        zIndex: 10,
      })
      const iwDrop = new window.google.maps.InfoWindow({
        content: `<div style="color:#111;font-size:12px;line-height:1.4;max-width:180px"><strong style="color:#dc2626">🔴 Drop-off</strong><br/>${trip.dropoff_location}</div>`,
      })
      mkDrop.addListener('click', () => {
        infoWindowsRef.current.forEach(iw => iw.close())
        driverInfoWindowRef.current?.close()
        iwDrop.open(mapInstanceRef.current, mkDrop)
      })

      markersRef.current = [mkPickup, mkDrop]
      infoWindowsRef.current = [iwPickup, iwDrop]

      // Fit map to show all points
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(origin)
      bounds.extend(dest)
      if (gpsCoords) bounds.extend(gpsCoords)
      mapInstanceRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 })
    } catch {
      setRouteError('Could not find pickup or drop-off location — check that the addresses are complete.')
    }
  }, [gpsCoords])

  // ── Redraw route when selection or map changes ───────────────
  useEffect(() => {
    const trip = trips.find(t => t.id === selectedTripId)
    if (trip && mapLoaded) drawRoute(trip)
  }, [selectedTripId, mapLoaded, drawRoute, trips])

  // ── Driver "You" marker ──────────────────────────────────────
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
          scale: 14,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        title: 'You',
        zIndex: 999,
      })
      if (!driverInfoWindowRef.current) {
        driverInfoWindowRef.current = new window.google.maps.InfoWindow({
          content: '<div style="color:#111;font-size:12px;font-weight:700;padding:2px 0">📍 You are here</div>',
        })
      }
      driverMarkerRef.current.addListener('click', () => {
        infoWindowsRef.current.forEach(iw => iw.close())
        driverInfoWindowRef.current?.close()
        driverInfoWindowRef.current?.open(mapInstanceRef.current, driverMarkerRef.current)
      })
    }

    // If no trip selected yet, center map on driver
    if (!selectedTripId && mapInstanceRef.current) {
      mapInstanceRef.current.panTo(gpsCoords)
      mapInstanceRef.current.setZoom(15)
    }
  }, [gpsCoords, selectedTripId])

  // ── Realtime broadcast during active trip ────────────────────
  useEffect(() => {
    if (!userId || !activeTrip) return
    const broadcasting = ['accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'].includes(activeTrip.status)
    if (!broadcasting) return

    const channel = supabase.channel('driver-locations')
    broadcastChannelRef.current = channel

    const broadcast = (lat: number, lng: number) => {
      channel.send({
        type: 'broadcast',
        event: 'driver-location',
        payload: {
          driver_id: userId,
          driver_name: userProfile?.full_name || 'Driver',
          job_id: activeTrip.id,
          job_number: activeTrip.job_number,
          lat, lng,
          timestamp: Date.now(),
        },
      })
    }

    channel.subscribe()

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setGpsCoords(c)
          broadcast(c.lat, c.lng)
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      )
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (broadcastChannelRef.current) supabase.removeChannel(broadcastChannelRef.current)
    }
  }, [userId, activeTrip, userProfile])

  // ── Status update ────────────────────────────────────────────
  async function updateStatus(tripId: string, newStatus: JobStatus) {
    if (!userId || updatingStatus) return
    setUpdatingStatus(true)
    try {
      const { error } = await supabase.from('job_orders').update({ status: newStatus }).eq('id', tripId)
      if (error) throw error
      await supabase.from('delivery_status_logs').insert({
        job_order_id: tripId,
        status: newStatus,
        logged_by: userId,
        location: gpsCoords ? `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}` : null,
        note: 'Status updated by driver',
        logged_at: new Date().toISOString(),
      })
      setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: newStatus } : t))
      if (activeTrip?.id === tripId) setActiveTrip(prev => prev ? { ...prev, status: newStatus } : prev)
      toast.success(`Status updated: ${JOB_STATUS_LABELS[newStatus]}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  function getNextDriverStatus(currentStatus: string): JobStatus | null {
    const order: JobStatus[] = ['assigned', 'accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived', 'delivered']
    const currentIdx = order.indexOf(currentStatus as JobStatus)
    return DRIVER_ALLOWED_STATUSES.find(s => order.indexOf(s) > currentIdx) || null
  }

  const selectedTrip = trips.find(t => t.id === selectedTripId) || null
  const activeTrips = trips.filter(t => !['completed', 'delivered', 'cancelled'].includes(t.status))
  const completedTrips = trips.filter(t => ['completed', 'delivered'].includes(t.status))
  const displayTrips = showAll ? trips : activeTrips

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border">
          <div className="skeleton h-6 w-32 rounded" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="skeleton rounded-none" style={{ height: '320px' }} />
        <div className="p-4 space-y-3">
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-28 rounded-xl" />
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border sticky top-0 z-10">
        <div>
          <h1 className="font-heading text-lg font-bold text-text-primary flex items-center gap-2">
            <Navigation size={18} className="text-brand" /> Trip Guide
          </h1>
          {activeTrips.length > 0 && (
            <p className="text-[11px] text-text-muted leading-none mt-0.5">
              {activeTrips.length} active trip{activeTrips.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
        {/* GPS status badge */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
          gpsStatus === 'captured'  ? 'bg-success-bg border-success-border text-success' :
          gpsStatus === 'capturing' ? 'bg-warning-bg border-warning-border text-warning' :
          gpsStatus === 'denied'    ? 'bg-danger-bg border-danger-border text-danger' :
                                      'bg-bg-tertiary border-border text-text-muted'
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            gpsStatus === 'captured'  ? 'bg-success animate-pulse' :
            gpsStatus === 'capturing' ? 'bg-warning animate-pulse' :
            gpsStatus === 'denied'    ? 'bg-danger' : 'bg-text-muted'
          )} />
          {gpsStatus === 'captured'  ? 'GPS Active' :
           gpsStatus === 'capturing' ? 'Getting GPS…' :
           gpsStatus === 'denied'    ? 'GPS Denied' : 'GPS Off'}
        </div>
      </div>

      {/* ── Selected trip summary card ── */}
      {selectedTrip ? (
        <div className="bg-bg-elevated border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs text-text-muted font-mono">{selectedTrip.job_number}</span>
                <span className={`status-badge ${getJobStatusColor(selectedTrip.status)}`}>
                  {JOB_STATUS_LABELS[selectedTrip.status as JobStatus]}
                </span>
              </div>
              <div className="font-heading text-sm font-bold text-text-primary truncate">{selectedTrip.client_name}</div>
              <div className="text-xs text-text-muted mt-0.5">
                📅 {formatDate(selectedTrip.delivery_date)}{selectedTrip.delivery_time && ` · ${selectedTrip.delivery_time}`}
              </div>
            </div>
            {(selectedTrip.truck as any)?.plate_number && (
              <div className="flex-shrink-0 text-right">
                <div className="text-[10px] text-text-muted uppercase tracking-wide">Truck</div>
                <div className="text-xs font-bold text-text-primary">🚛 {(selectedTrip.truck as any).plate_number}</div>
              </div>
            )}
          </div>
          {/* Route line */}
          <div className="flex items-center gap-2 mt-2 bg-bg-tertiary rounded-lg px-2.5 py-2">
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
            <span className="text-xs text-text-muted truncate flex-1">{selectedTrip.pickup_location}</span>
            <span className="text-text-muted flex-shrink-0">→</span>
            <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
            <span className="text-xs text-text-muted truncate flex-1 text-right">{selectedTrip.dropoff_location}</span>
          </div>
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-bg-elevated border-b border-border px-4 py-2.5 text-center">
          <p className="text-xs text-text-muted">No assigned trips — your location is shown on the map below</p>
        </div>
      ) : null}

      {/* ── MAP — always visible ── */}
      <div className="relative border-b border-border" style={{ height: '320px', background: '#1a1a1a' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Map loading overlay */}
        {!mapLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-tertiary">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-text-muted text-sm">Loading map…</p>
          </div>
        )}

        {/* GPS denied banner */}
        {mapLoaded && gpsStatus === 'denied' && (
          <div className="absolute top-2 left-2 right-2 bg-danger-bg border border-danger-border rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-danger flex-shrink-0" />
            <p className="text-xs text-danger leading-snug">
              Location access denied — enable GPS in your browser settings to see yourself on the map
            </p>
          </div>
        )}

        {/* Route error banner */}
        {mapLoaded && routeError && (
          <div className="absolute bottom-2 left-2 right-2 bg-bg-secondary/95 border border-border rounded-lg px-3 py-2">
            <p className="text-xs text-text-muted text-center">⚠️ {routeError}</p>
          </div>
        )}

        {/* Map legend — only when route is showing */}
        {mapLoaded && selectedTrip && (
          <div className="absolute top-2 right-2 bg-bg-secondary/90 backdrop-blur border border-border rounded-lg px-2.5 py-2 flex flex-col gap-1.5">
            {gpsStatus === 'captured' && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white flex-shrink-0" />
                <span className="text-[11px] text-text-secondary font-semibold">You</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 border border-white flex-shrink-0" />
              <span className="text-[11px] text-text-secondary">Pickup</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white flex-shrink-0" />
              <span className="text-[11px] text-text-secondary">Drop-off</span>
            </div>
          </div>
        )}

        {/* No trip — hint to tap marker */}
        {mapLoaded && trips.length === 0 && gpsStatus === 'captured' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-bg-secondary/90 border border-border rounded-full px-3 py-1.5 whitespace-nowrap">
            <p className="text-xs text-text-muted">📍 Tap your marker to confirm GPS</p>
          </div>
        )}
      </div>

      {/* ── Route info bar (ETA + distance) ── */}
      {routeInfo && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-brand" />
              <span className="font-heading text-sm font-bold text-text-primary">{routeInfo.duration}</span>
              <span className="text-xs text-text-muted">ETA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-brand" />
              <span className="font-heading text-sm font-bold text-text-primary">{routeInfo.distance}</span>
            </div>
          </div>
          {gpsStatus === 'captured' && (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live tracking
            </div>
          )}
        </div>
      )}

      {/* ── Page body ── */}
      <div className="p-4 pb-8 space-y-4">

        {/* Status update CTA */}
        {selectedTrip && !['delivered', 'completed', 'cancelled'].includes(selectedTrip.status) && (() => {
          const nextStatus = getNextDriverStatus(selectedTrip.status)
          if (!nextStatus) return null
          return (
            <button
              onClick={() => updateStatus(selectedTrip.id, nextStatus)}
              disabled={updatingStatus}
              className="w-full py-4 rounded-xl font-heading font-bold text-base transition-all"
              style={{
                background: updatingStatus ? '#2a2a2a' : '#22c55e',
                color: '#fff',
                border: 'none',
                cursor: updatingStatus ? 'not-allowed' : 'pointer',
                boxShadow: updatingStatus ? 'none' : '0 4px 20px rgba(34,197,94,0.35)',
              }}
            >
              {updatingStatus ? 'Updating…' : NEXT_STATUS_LABEL[nextStatus] || `Mark as ${JOB_STATUS_LABELS[nextStatus]}`}
            </button>
          )
        })()}

        {/* Delivered banner */}
        {selectedTrip && ['delivered', 'completed'].includes(selectedTrip.status) && (
          <div className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-success-bg border border-success-border">
            <CheckCircle size={18} className="text-success" />
            <span className="text-success font-bold text-sm">Trip Delivered — Awaiting confirmation</span>
          </div>
        )}

        {/* Quick action buttons */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/emergency"
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-xl bg-danger-bg border border-danger-border text-danger text-center active:scale-95 transition-transform">
            <Phone size={22} />
            <span className="text-xs font-bold">SOS</span>
          </Link>
          <Link href="/incidents"
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center active:scale-95 transition-transform">
            <AlertTriangle size={22} />
            <span className="text-xs font-bold">Incident</span>
          </Link>
          <Link href="/chat"
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center active:scale-95 transition-transform">
            <MessageCircle size={22} />
            <span className="text-xs font-bold">Messages</span>
          </Link>
        </div>

        {/* Client contact */}
        {selectedTrip?.contact_number && (
          <a href={`tel:${selectedTrip.contact_number}`}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-bg-secondary border border-border active:bg-bg-elevated transition-colors">
            <Phone size={16} className="text-info flex-shrink-0" />
            <span className="text-sm font-semibold text-text-primary">{selectedTrip.contact_person || 'Client'}</span>
            <span className="ml-auto text-xs text-text-muted">{selectedTrip.contact_number}</span>
          </a>
        )}

        {/* Cargo summary */}
        {selectedTrip?.shipment_items && selectedTrip.shipment_items.length > 0 && (
          <div className="bg-bg-secondary border border-border rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <Package size={13} className="text-text-muted" />
              <span className="text-xs font-bold text-text-muted uppercase tracking-wide">
                Cargo · {selectedTrip.shipment_items.length} item{selectedTrip.shipment_items.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5">
              {selectedTrip.shipment_items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary truncate flex-1">{item.item_name}</span>
                  <span className="text-text-muted ml-2 flex-shrink-0">×{item.quantity}</span>
                  {item.is_fragile && <span className="ml-1.5 text-warning flex-shrink-0">⚠️ Fragile</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special instructions */}
        {selectedTrip?.special_instructions && (
          <div className="bg-warning-bg border border-warning-border rounded-xl p-3">
            <p className="text-xs text-warning leading-relaxed">📋 {selectedTrip.special_instructions}</p>
          </div>
        )}

        {/* View full job details */}
        {selectedTrip && (
          <Link href={`/jobs/${selectedTrip.id}`}
            className="flex items-center justify-center gap-1 text-xs text-text-muted py-2 hover:text-text-secondary transition-colors">
            View full job details <ChevronRight size={12} />
          </Link>
        )}

        {/* ── Empty state ── */}
        {trips.length === 0 && (
          <div className="text-center py-10 bg-bg-secondary border border-border rounded-xl">
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>🚛</div>
            <h2 className="font-heading text-base font-bold text-text-primary mb-2">No Assigned Trips Yet</h2>
            <p className="text-text-muted text-sm mb-5 px-8 leading-relaxed">
              Once a fleet manager assigns a trip to you, it will appear here. The map above shows your current location.
            </p>
            <Link href="/jobs" className="btn btn-primary">Browse Open Jobs</Link>
          </div>
        )}

        {/* ── Trip selector list ── */}
        {trips.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-xs font-bold text-text-muted uppercase tracking-wide">
                {showAll ? `All Trips (${trips.length})` : `Active & Upcoming (${activeTrips.length})`}
              </h2>
              {completedTrips.length > 0 && (
                <button onClick={() => setShowAll(v => !v)} className="text-xs text-brand font-semibold">
                  {showAll ? 'Hide completed' : `+${completedTrips.length} completed`}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {displayTrips.map(trip => {
                const isSelected = selectedTripId === trip.id
                const isDone = ['delivered', 'completed'].includes(trip.status)
                const isCancelled = trip.status === 'cancelled'
                const stepIndex = DELIVERY_STEPS.indexOf(trip.status as JobStatus)
                const progress = stepIndex >= 0 ? Math.round(((stepIndex + 1) / DELIVERY_STEPS.length) * 100) : 0

                return (
                  <div
                    key={trip.id}
                    className={cn(
                      'border rounded-xl overflow-hidden transition-all',
                      isSelected ? 'border-brand bg-bg-elevated' : 'border-border bg-bg-secondary',
                      isCancelled && 'opacity-60'
                    )}
                  >
                    <button
                      className="w-full text-left p-3.5"
                      onClick={() => { setSelectedTripId(trip.id); drawRoute(trip) }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-text-muted font-mono">{trip.job_number}</span>
                            {isSelected && <span className="text-[10px] text-brand font-bold">● On map</span>}
                          </div>
                          <div className="font-heading text-sm font-bold text-text-primary truncate">{trip.client_name}</div>
                          <div className="text-xs text-text-muted mt-0.5">📅 {formatDate(trip.delivery_date)}</div>
                        </div>
                        <span className={`status-badge flex-shrink-0 ${getJobStatusColor(trip.status)}`}>
                          {JOB_STATUS_LABELS[trip.status as JobStatus]}
                        </span>
                      </div>
                      {!isCancelled && (
                        <div>
                          <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isDone ? 'bg-success' : 'bg-brand'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-text-muted">{progress}% complete</span>
                            {(trip.truck as any)?.plate_number && (
                              <span className="text-[10px] text-text-muted">🚛 {(trip.truck as any).plate_number}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </button>
                    {isSelected && (
                      <div className="border-t border-border px-3.5 py-2 flex items-center justify-between bg-bg-tertiary/40">
                        <span className="text-[10px] text-text-muted">Tap map markers to see addresses</span>
                        <Link href={`/jobs/${trip.id}`} className="flex items-center gap-0.5 text-xs text-brand font-semibold">
                          Full details <ChevronRight size={11} />
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* All-completed empty state */}
            {activeTrips.length === 0 && completedTrips.length > 0 && !showAll && (
              <div className="text-center py-8 bg-bg-secondary border border-border rounded-xl">
                <CheckCircle size={32} className="text-success mx-auto mb-2" />
                <p className="text-text-secondary font-semibold text-sm">All trips completed!</p>
                <button onClick={() => setShowAll(true)} className="text-xs text-brand mt-2 block mx-auto">
                  View history
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
