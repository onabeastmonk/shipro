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
  Package, Truck, Clock, ChevronRight, CheckCircle
} from 'lucide-react'

declare global {
  interface Window { google: any; initMyTripsMap: () => void }
}

// Statuses the driver can self-update
const DRIVER_ALLOWED_STATUSES: JobStatus[] = ['accepted', 'arrived', 'delivered']

const NEXT_STATUS_LABEL: Partial<Record<JobStatus, string>> = {
  accepted:  '✅ Accept Trip',
  arrived:   '📍 Arrived at Drop-off',
  delivered: '📦 Mark as Delivered',
}

// Sort order: active in-progress > upcoming assigned > completed/delivered > cancelled
function sortOrder(status: string): number {
  if (['in_transit', 'at_pickup', 'loaded'].includes(status)) return 0
  if (['accepted'].includes(status)) return 1
  if (['assigned'].includes(status)) return 2
  if (['arrived'].includes(status)) return 3
  if (['delivered', 'completed'].includes(status)) return 4
  if (['cancelled'].includes(status)) return 5
  return 6
}

export default function TripGuidePage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)
  const broadcastChannelRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

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
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Load Google Maps
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.google) { setMapLoaded(true); return }
    if (document.querySelector('script[data-gmap="my-trips"]')) return
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMyTripsMap`
    script.async = true; script.defer = true
    script.setAttribute('data-gmap', 'my-trips')
    window.initMyTripsMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Init map instance
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return
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

  // Load auth + trips
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
      setUserProfile(profile)

      // Only drivers can access this page
      if (profile?.role && profile.role !== 'driver') {
        router.push('/tracking')
        return
      }

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

    // Primary query: jobs directly assigned to this driver via assigned_driver_id
    const { data: directJobs } = await supabase
      .from('job_orders')
      .select(jobSelectFields)
      .eq('assigned_driver_id', uid)
      .not('status', 'in', '(cancelled)')
      .order('delivery_date', { ascending: true })

    const directIds = new Set((directJobs || []).map((j: any) => j.id))

    // Path 2: approved applicants where this driver's UUID is in selected_helper_contact
    // e.g. "profile:DRIVER_UUID|phone|..." — truck owner applied and selected this driver
    const { data: contactApps } = await supabase
      .from('job_applicants')
      .select('job_order_id')
      .eq('status', 'approved')
      .ilike('selected_helper_contact', `%profile:${uid}%`)

    // Path 3: approved applicants matched by driver full name (last resort for manual/non-profile entries)
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

    // Deduplicate
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
    // Sort: active first, then upcoming, then completed
    allTrips.sort((a, b) => sortOrder(a.status) - sortOrder(b.status) || new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime())

    setTrips(allTrips)

    // Active trip = first one that isn't completed/cancelled/delivered
    const active = allTrips.find(t => !['completed', 'delivered', 'cancelled'].includes(t.status)) || null
    setActiveTrip(active)
    if (active) setSelectedTripId(active.id)

    setLoading(false)
  }

  // Auto-capture GPS on mount
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

  // Draw route for selected trip
  const drawRoute = useCallback(async (trip: JobOrder) => {
    if (!mapInstanceRef.current || !window.google) return
    setRouteInfo(null)

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    const geocoder = new window.google.maps.Geocoder()
    const ds = new window.google.maps.DirectionsService()

    const geocode = (addr: string) => new Promise<any>((res, rej) =>
      geocoder.geocode({ address: `${addr}, Philippines` }, (results: any, status: any) =>
        status === 'OK' ? res(results[0].geometry.location) : rej(status)
      )
    )

    try {
      const [origin, dest] = await Promise.all([geocode(trip.pickup_location), geocode(trip.dropoff_location)])

      ds.route({ origin, destination: dest, travelMode: window.google.maps.TravelMode.DRIVING },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text })
          }
        })

      const mkPickup = new window.google.maps.Marker({
        position: origin, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Pickup',
      })
      const mkDrop = new window.google.maps.Marker({
        position: dest, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Drop-off',
      })
      markersRef.current = [mkPickup, mkDrop]

      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(origin); bounds.extend(dest)
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 })
    } catch (err) { console.error('Route draw error:', err) }
  }, [])

  // Update selected trip's route when map is ready
  useEffect(() => {
    const trip = trips.find(t => t.id === selectedTripId)
    if (trip && mapLoaded) drawRoute(trip)
  }, [selectedTripId, mapLoaded, drawRoute, trips])

  // Update driver dot on map
  useEffect(() => {
    if (!gpsCoords || !mapInstanceRef.current || !window.google) return
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setPosition(gpsCoords)
    } else {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: gpsCoords, map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        title: 'Your Location', zIndex: 999,
      })
    }
  }, [gpsCoords])

  // Realtime location broadcast during active trip
  useEffect(() => {
    if (!userId || !activeTrip) return
    const broadcasting = ['accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'].includes(activeTrip.status)
    if (!broadcasting) return

    const channel = supabase.channel('driver-locations')
    broadcastChannelRef.current = channel

    const broadcast = (lat: number, lng: number) => {
      channel.send({
        type: 'broadcast', event: 'driver-location',
        payload: { driver_id: userId, driver_name: userProfile?.full_name || 'Driver', job_id: activeTrip.id, job_number: activeTrip.job_number, lat, lng, timestamp: Date.now() },
      })
    }

    channel.subscribe()

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => { const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setGpsCoords(c); broadcast(c.lat, c.lng) },
        () => { },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      )
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (broadcastChannelRef.current) supabase.removeChannel(broadcastChannelRef.current)
    }
  }, [userId, activeTrip, userProfile])

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

  const activeTrips = trips.filter(t => !['completed', 'delivered', 'cancelled'].includes(t.status))
  const completedTrips = trips.filter(t => ['completed', 'delivered'].includes(t.status))
  const displayTrips = showAll ? trips : activeTrips

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="skeleton h-8 w-48 rounded mb-4" />
        <div className="skeleton h-48 rounded-lg mb-3" />
        <div className="skeleton h-32 rounded-lg mb-3" />
        <div className="skeleton h-32 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-heading text-2xl font-bold text-text-primary flex items-center gap-2">
          <Navigation size={22} className="text-brand" /> Trip Guide
        </h1>
        <div className="flex items-center gap-3 mt-1">
          {gpsStatus === 'captured' && (
            <p className="text-xs text-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block animate-pulse" />
              GPS active
            </p>
          )}
          {gpsStatus === 'denied' && (
            <p className="text-xs text-warning">⚠️ GPS denied — enable for tracking</p>
          )}
          {activeTrips.length > 0 && (
            <span className="text-xs text-text-muted">{activeTrips.length} active trip{activeTrips.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Empty state */}
      {trips.length === 0 && (
        <div className="text-center py-16 bg-bg-secondary border border-border rounded-xl">
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>🚛</div>
          <h2 className="font-heading text-lg font-bold text-text-primary mb-2">No Assigned Trips Yet</h2>
          <p className="text-text-muted text-sm mb-6 px-8">
            Once a fleet manager assigns a trip to you, it will appear here — even for future dates.
          </p>
          <Link href="/jobs" className="btn btn-primary">Browse Open Jobs</Link>
        </div>
      )}

      {/* Map — shows route for the selected/active trip */}
      {trips.length > 0 && (
        <>
          <div className="relative rounded-xl overflow-hidden border border-border mb-3" style={{ height: '220px' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            {!mapLoaded && (
              <div className="absolute inset-0 bg-bg-tertiary flex items-center justify-center">
                <p className="text-text-muted text-sm">Loading map...</p>
              </div>
            )}
          </div>

          {/* Route info bar */}
          {routeInfo && (() => {
            const displayTrip = trips.find(t => t.id === selectedTripId)
            return displayTrip ? (
              <div className="bg-bg-secondary border border-border rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
                <div className="text-xs text-text-muted truncate flex-1 mr-2">
                  {displayTrip.pickup_location} → {displayTrip.dropoff_location}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="flex items-center gap-1 text-xs text-text-muted"><Clock size={12} />{routeInfo.duration}</span>
                  <span className="flex items-center gap-1 text-xs text-text-muted"><MapPin size={12} />{routeInfo.distance}</span>
                </div>
              </div>
            ) : null
          })()}
        </>
      )}

      {/* Quick actions */}
      {trips.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
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
      )}

      {/* Trip list header */}
      {trips.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-sm font-bold text-text-muted uppercase tracking-wide">
            {showAll ? `All Trips (${trips.length})` : `Active & Upcoming (${activeTrips.length})`}
          </h2>
          {completedTrips.length > 0 && (
            <button onClick={() => setShowAll(v => !v)} className="text-xs text-brand font-semibold">
              {showAll ? 'Hide completed' : `+${completedTrips.length} completed`}
            </button>
          )}
        </div>
      )}

      {/* Trip cards */}
      <div className="space-y-3">
        {displayTrips.map(trip => {
          const isSelected = selectedTripId === trip.id
          const nextStatus = getNextDriverStatus(trip.status)
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
              {/* Card header — tap to select/show on map */}
              <button
                className="w-full text-left p-4"
                onClick={() => { setSelectedTripId(trip.id); drawRoute(trip) }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-text-muted font-mono">{trip.job_number}</span>
                      {isSelected && <span className="text-xs text-brand font-semibold">● On map</span>}
                    </div>
                    <div className="font-heading text-sm font-bold text-text-primary">{trip.client_name}</div>
                    <div className="text-xs text-text-muted mt-0.5">📅 {formatDate(trip.delivery_date)}{trip.delivery_time && ` · ${trip.delivery_time}`}</div>
                  </div>
                  <span className={`status-badge flex-shrink-0 ${getJobStatusColor(trip.status)}`}>
                    {JOB_STATUS_LABELS[trip.status as JobStatus]}
                  </span>
                </div>

                {/* Route */}
                <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-tertiary rounded px-2.5 py-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  <span className="flex-1 truncate">{trip.pickup_location}</span>
                  <span>→</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                  <span className="flex-1 truncate text-right">{trip.dropoff_location}</span>
                </div>

                {/* Progress bar */}
                {!isCancelled && (
                  <div>
                    <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isDone ? 'bg-success' : 'bg-brand'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-text-muted">{progress}% complete</span>
                      {(trip.truck as any)?.plate_number && (
                        <span className="text-xs text-text-muted">🚛 {(trip.truck as any).plate_number}</span>
                      )}
                    </div>
                  </div>
                )}
              </button>

              {/* Expanded detail when selected */}
              {isSelected && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                  {/* Cargo summary */}
                  {trip.shipment_items && trip.shipment_items.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Package size={13} className="text-text-muted" />
                        <span className="text-xs font-bold text-text-muted uppercase">Cargo ({trip.shipment_items.length})</span>
                      </div>
                      <div className="space-y-1">
                        {trip.shipment_items.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-xs">
                            <span className="text-text-secondary truncate flex-1">{item.item_name}</span>
                            <span className="text-text-muted ml-2">×{item.quantity}</span>
                            {item.is_fragile && <span className="ml-1.5 text-warning">⚠️</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Special instructions */}
                  {trip.special_instructions && (
                    <div className="bg-warning-bg border border-warning-border rounded-lg p-2.5">
                      <p className="text-xs text-warning">📋 {trip.special_instructions}</p>
                    </div>
                  )}

                  {/* Contact */}
                  {trip.contact_number && (
                    <a href={`tel:${trip.contact_number}`}
                      className="flex items-center gap-2 text-sm text-info bg-bg-tertiary rounded-lg px-3 py-2.5">
                      <Phone size={14} />
                      <span className="font-semibold">{trip.contact_person || 'Contact'}</span>
                      <span className="ml-auto text-xs">{trip.contact_number}</span>
                    </a>
                  )}

                  {/* Status update button */}
                  {!isDone && !isCancelled && nextStatus && (
                    <button
                      onClick={() => updateStatus(trip.id, nextStatus)}
                      disabled={updatingStatus}
                      className="w-full py-3.5 rounded-xl font-heading font-bold text-sm transition-all"
                      style={{
                        background: updatingStatus ? '#2a2a2a' : '#22c55e',
                        color: '#fff', border: 'none',
                        cursor: updatingStatus ? 'not-allowed' : 'pointer',
                        boxShadow: updatingStatus ? 'none' : '0 4px 16px rgba(34,197,94,0.3)',
                      }}>
                      {updatingStatus ? 'Updating...' : NEXT_STATUS_LABEL[nextStatus] || `Mark as ${JOB_STATUS_LABELS[nextStatus]}`}
                    </button>
                  )}

                  {isDone && (
                    <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-success-bg border border-success-border">
                      <CheckCircle size={16} className="text-success" />
                      <span className="text-success font-bold text-sm">Trip Delivered — Awaiting confirmation</span>
                    </div>
                  )}

                  {/* View full detail */}
                  <Link href={`/jobs/${trip.id}`}
                    className="flex items-center justify-center gap-1 text-xs text-text-muted py-2">
                    View full job details <ChevronRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty state for active-only view */}
      {activeTrips.length === 0 && completedTrips.length > 0 && !showAll && (
        <div className="text-center py-8 bg-bg-secondary border border-border rounded-xl">
          <CheckCircle size={32} className="text-success mx-auto mb-2" />
          <p className="text-text-secondary font-semibold text-sm">All trips completed!</p>
          <button onClick={() => setShowAll(true)} className="text-xs text-brand mt-2">View history</button>
        </div>
      )}
    </div>
  )
}
