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
  Package, Clock, ChevronRight, CheckCircle, Crosshair,
  Play, Square, Route,
} from 'lucide-react'

declare global {
  interface Window { google: any; initMyTripsMap: () => void }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

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
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111111' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

// ─── component ────────────────────────────────────────────────────────────────

export default function TripGuidePage() {
  const router = useRouter()

  // ── DOM / map refs (never cause re-renders) ──────────────────────────────
  const mapRef              = useRef<HTMLDivElement>(null)
  const mapInstanceRef      = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const driverMarkerRef     = useRef<any>(null)
  const driverInfoWindowRef = useRef<any>(null)
  const watchIdRef          = useRef<number | null>(null)
  const broadcastChannelRef = useRef<any>(null)
  const routeMarkersRef     = useRef<any[]>([])
  const routeInfoWindowsRef = useRef<any[]>([])
  const wakeLockRef         = useRef<any>(null)

  // ── Stable refs — read latest value without being deps ──────────────────
  //    This is the KEY fix: gpsRef lets drawRoute read the current GPS
  //    without gpsCoords being in its useCallback dependency array.
  const gpsRef         = useRef<{ lat: number; lng: number } | null>(null)
  const followRef      = useRef<boolean>(false)   // true = Follow mode active
  const lastBroadcastRef = useRef<number>(0)       // throttle: ms of last broadcast
  const userInteractedRef = useRef<boolean>(false) // track manual pan/zoom

  // ── React state (UI only) ────────────────────────────────────────────────
  const [userId, setUserId]           = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [trips, setTrips]             = useState<JobOrder[]>([])
  const [activeTrip, setActiveTrip]   = useState<JobOrder | null>(null)
  const [loading, setLoading]         = useState(true)
  const [mapLoaded, setMapLoaded]     = useState(false)
  const [gpsStatus, setGpsStatus]     = useState<'idle' | 'capturing' | 'captured' | 'denied'>('idle')
  const [followMode, setFollowMode]   = useState(false)   // UI state for button
  const [sendingNotice, setSendingNotice] = useState(false)
  const [routeInfo, setRouteInfo]     = useState<{ distance: string; duration: string } | null>(null)
  const [routeError, setRouteError]   = useState<string | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [showAll, setShowAll]         = useState(false)
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean | null>(null)
  const [wakeLockActive, setWakeLockActive]       = useState(false)

  // ── Selected trip (derived) ──────────────────────────────────────────────
  const trips_ref = useRef<JobOrder[]>([])
  trips_ref.current = trips
  const selectedTrip    = trips.find(t => t.id === selectedTripId) || null
  const activeTrips     = trips.filter(t => !['completed', 'delivered', 'cancelled'].includes(t.status))
  const completedTrips  = trips.filter(t => ['completed', 'delivered'].includes(t.status))
  const displayTrips    = showAll ? trips : activeTrips

  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE MAPS SCRIPT LOAD
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP INITIALIZATION — runs exactly ONCE after script + div are ready
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 14.5995, lng: 120.9842 },
      zoom: 13,
      styles: MAP_STYLES,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: false,          // custom buttons for driver safety
      gestureHandling: 'greedy',   // single-finger scroll on mobile
    })
    mapInstanceRef.current = map

    const renderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#60a5fa', strokeWeight: 6, strokeOpacity: 0.95 },
    })
    renderer.setMap(map)
    directionsRendererRef.current = renderer

    // When driver drags/zooms manually → disable follow so map doesn't fight back
    map.addListener('dragstart', () => {
      userInteractedRef.current = true
      if (followRef.current) {
        followRef.current = false
        setFollowMode(false)
      }
    })
  }, [mapLoaded, loading])

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH + TRIPS LOAD
  // ═══════════════════════════════════════════════════════════════════════════
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

    const { data: contactApps } = await supabase
      .from('job_applicants')
      .select('job_order_id')
      .eq('status', 'approved')
      .ilike('selected_helper_contact', `%profile:${uid}%`)

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

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIAL ONE-SHOT GPS (before watchPosition kicks in)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('denied'); return }
    setGpsStatus('capturing')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        gpsRef.current = c
        setGpsStatus('captured')
        // Place initial driver marker if map already ready
        placeOrMoveDriverMarker(c)
        // Center map on driver if no trip selected yet
        if (!selectedTripId && mapInstanceRef.current) {
          mapInstanceRef.current.panTo(c)
          mapInstanceRef.current.setZoom(15)
        }
      },
      () => setGpsStatus('denied'),
      { timeout: 15000, enableHighAccuracy: true }
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW ROUTE — only when selectedTripId or mapLoaded changes
  // NOT when GPS changes — this was the core zoom-loop bug
  // ═══════════════════════════════════════════════════════════════════════════
  const drawRoute = useCallback(async (trip: JobOrder) => {
    if (!mapInstanceRef.current || !window.google) return
    setRouteInfo(null)
    setRouteError(null)

    // Clear previous route markers
    routeMarkersRef.current.forEach(m => m.setMap(null))
    routeMarkersRef.current = []
    routeInfoWindowsRef.current.forEach(iw => iw.close())
    routeInfoWindowsRef.current = []
    directionsRendererRef.current?.setDirections({ routes: [] })

    if (!trip.pickup_location || !trip.dropoff_location) {
      setRouteError('Pickup or drop-off location missing.')
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

      ds.route(
        { origin, destination: dest, travelMode: window.google.maps.TravelMode.DRIVING },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRendererRef.current?.setDirections(result)
            const leg = result.routes[0].legs[0]
            setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text })
          } else {
            setRouteError('Route unavailable — showing pickup & drop-off only.')
          }
        }
      )

      // Pickup marker
      const mkPickup = new window.google.maps.Marker({
        position: origin,
        map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Pickup',
        zIndex: 10,
      })
      const iwPickup = new window.google.maps.InfoWindow({
        content: `<div style="color:#111;font-size:13px;font-weight:700">🟢 Pickup</div><div style="color:#333;font-size:12px;margin-top:2px;max-width:200px">${trip.pickup_location}</div>`,
      })
      mkPickup.addListener('click', () => { routeInfoWindowsRef.current.forEach(iw => iw.close()); iwPickup.open(mapInstanceRef.current, mkPickup) })

      // Drop-off marker
      const mkDrop = new window.google.maps.Marker({
        position: dest,
        map: mapInstanceRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: 'Drop-off',
        zIndex: 10,
      })
      const iwDrop = new window.google.maps.InfoWindow({
        content: `<div style="color:#111;font-size:13px;font-weight:700">🔴 Drop-off</div><div style="color:#333;font-size:12px;margin-top:2px;max-width:200px">${trip.dropoff_location}</div>`,
      })
      mkDrop.addListener('click', () => { routeInfoWindowsRef.current.forEach(iw => iw.close()); iwDrop.open(mapInstanceRef.current, mkDrop) })

      routeMarkersRef.current = [mkPickup, mkDrop]
      routeInfoWindowsRef.current = [iwPickup, iwDrop]

      // fitBounds ONLY here — on trip selection — never on GPS update
      fitRouteBounds(origin, dest)
    } catch {
      setRouteError('Could not find one of the locations — check addresses.')
    }
  }, []) // ← no gpsCoords dep = no zoom loop

  function fitRouteBounds(origin?: any, dest?: any) {
    if (!mapInstanceRef.current || !window.google) return
    const bounds = new window.google.maps.LatLngBounds()
    if (origin) bounds.extend(origin)
    if (dest) bounds.extend(dest)
    // Include driver position if known
    if (gpsRef.current) bounds.extend(gpsRef.current)
    // Include existing route markers
    routeMarkersRef.current.forEach(m => { const p = m.getPosition(); if (p) bounds.extend(p) })
    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds, { top: 80, right: 40, bottom: 160, left: 40 })
    }
  }

  // Triggered only when selectedTripId changes or map first loads — not on GPS
  useEffect(() => {
    if (loading || !mapLoaded) return
    const trip = trips_ref.current.find(t => t.id === selectedTripId)
    if (trip) drawRoute(trip)
  }, [selectedTripId, mapLoaded, drawRoute, loading])

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIVER MARKER — pure position update, no camera movement
  // Camera movement only happens in follow mode or when user taps Recenter
  // ═══════════════════════════════════════════════════════════════════════════
  function placeOrMoveDriverMarker(coords: { lat: number; lng: number }) {
    if (!mapInstanceRef.current || !window.google) return
    if (driverMarkerRef.current) {
      // Just move the marker — no fitBounds, no zoom, no pan
      driverMarkerRef.current.setPosition(coords)
    } else {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: coords,
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 15,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3.5,
        },
        title: 'You',
        zIndex: 999,
      })
      driverInfoWindowRef.current = new window.google.maps.InfoWindow({
        content: '<div style="color:#111;font-size:13px;font-weight:700;padding:2px 0">📍 You are here</div>',
      })
      driverMarkerRef.current.addListener('click', () => {
        routeInfoWindowsRef.current.forEach(iw => iw.close())
        driverInfoWindowRef.current?.open(mapInstanceRef.current, driverMarkerRef.current)
      })
    }

    // If follow mode is on → smooth pan to driver, keep current zoom
    if (followRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.panTo(coords)
      // Ensure we're at a driving-sensible zoom level
      const z = mapInstanceRef.current.getZoom()
      if (z < 14) mapInstanceRef.current.setZoom(15)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GPS WATCH + BROADCAST — throttled, only updates marker position
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!userId || !activeTrip) return
    const broadcasting = ['accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'].includes(activeTrip.status)

    let channel: any = null
    if (broadcasting) {
      channel = supabase.channel('driver-locations')
      broadcastChannelRef.current = channel
      channel.subscribe()
    }

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          gpsRef.current = c        // always update ref
          setGpsStatus('captured')  // update status badge (no GPS coords in state = no map re-render loop)

          // Move driver marker (and pan if follow mode active)
          placeOrMoveDriverMarker(c)

          // Throttled broadcast — max once every 5 seconds
          if (broadcasting && channel) {
            const now = Date.now()
            if (now - lastBroadcastRef.current >= 5000) {
              lastBroadcastRef.current = now
              channel.send({
                type: 'broadcast',
                event: 'driver-location',
                payload: {
                  driver_id: userId,
                  driver_name: userProfile?.full_name || 'Driver',
                  job_id: activeTrip.id,
                  job_number: activeTrip.job_number,
                  lat: c.lat, lng: c.lng,
                  timestamp: now,
                },
              })
            }
          }
        },
        () => setGpsStatus('denied'),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
      )
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current)
        broadcastChannelRef.current = null
      }
    }
  }, [userId, activeTrip, userProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN WAKE LOCK
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    setWakeLockSupported('wakeLock' in navigator)
  }, [])

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      setWakeLockActive(true)
      wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false))
    } catch {
      // permission denied or not supported — silently fail
    }
  }

  function releaseWakeLock() {
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
      wakeLockRef.current = null
      setWakeLockActive(false)
    }
  }

  // Re-acquire wake lock if page becomes visible again (e.g. tab switch back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && followRef.current) {
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Release on unmount
  useEffect(() => {
    return () => releaseWakeLock()
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLOW MODE TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════
  function toggleFollow() {
    const next = !followRef.current
    followRef.current = next
    setFollowMode(next)

    if (next) {
      // Immediately pan to driver when enabling follow
      if (gpsRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.panTo(gpsRef.current)
        mapInstanceRef.current.setZoom(15)
      }
      acquireWakeLock()
      toast('Follow mode ON — map will follow your location', { icon: '🧭', duration: 2000 })
    } else {
      releaseWakeLock()
      toast('Follow mode OFF — pan and zoom freely', { icon: '🗺️', duration: 2000 })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECENTER — manual tap
  // ═══════════════════════════════════════════════════════════════════════════
  function recenter() {
    if (!mapInstanceRef.current) return
    userInteractedRef.current = false
    if (gpsRef.current) {
      mapInstanceRef.current.panTo(gpsRef.current)
      mapInstanceRef.current.setZoom(15)
    } else if (routeMarkersRef.current.length > 0) {
      const bounds = new window.google.maps.LatLngBounds()
      routeMarkersRef.current.forEach(m => { const p = m.getPosition(); if (p) bounds.extend(p) })
      mapInstanceRef.current.fitBounds(bounds, { top: 80, right: 40, bottom: 160, left: 40 })
    } else {
      toast('No location available', { icon: '📍' })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIT ROUTE BUTTON
  // ═══════════════════════════════════════════════════════════════════════════
  function fitRoute() {
    if (!mapInstanceRef.current || !window.google) return
    // Disable follow so it doesn't fight the fitBounds
    followRef.current = false
    setFollowMode(false)
    fitRouteBounds()
    if (routeMarkersRef.current.length === 0) {
      toast('No route on map yet', { icon: '🗺️' })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARRIVAL NOTICE — unchanged logic
  // ═══════════════════════════════════════════════════════════════════════════
  async function sendArrivalNotice(locationType: 'pickup' | 'dropoff') {
    if (!selectedTrip || !userId || sendingNotice) return
    setSendingNotice(true)
    try {
      const truck = (selectedTrip.truck as any)
      const truckLabel = truck?.plate_number
        ? `${truck.plate_number}${truck.truck_type_label ? ` (${truck.truck_type_label})` : ''}`
        : 'N/A'
      const currentGps = gpsRef.current
      const gpsText = currentGps
        ? `${currentGps.lat.toFixed(5)}, ${currentGps.lng.toFixed(5)}`
        : 'Not available'
      const locationLabel = locationType === 'pickup' ? 'Pickup Location' : 'Drop-off Location'
      const statusText = locationType === 'pickup'
        ? 'I am now at the pickup location and ready for loading.'
        : 'I am now at the drop-off location.'
      const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })

      const noticeBody = [
        `Driver arrival notice:`,
        `JO No.: ${selectedTrip.job_number}`,
        `Driver: ${userProfile?.full_name || 'Driver'}`,
        `Truck: ${truckLabel}`,
        `Location: ${locationLabel}`,
        `Status: ${statusText}`,
        `Time: ${now}`,
        `GPS: ${gpsText}`,
      ].join('\n')

      const recipientIds = new Set<string>()
      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'fleet_manager', 'warehouse_manager'])
      ;(managers || []).forEach((m: any) => recipientIds.add(m.id))

      const assignedTruckId = (selectedTrip as any).assigned_truck_id
      if (assignedTruckId) {
        const { data: truckRow } = await supabase.from('trucks').select('owner_id').eq('id', assignedTruckId).single()
        if (truckRow?.owner_id) recipientIds.add(truckRow.owner_id)
      }
      recipientIds.delete(userId)

      if (recipientIds.size > 0) {
        await supabase.from('notifications').insert(
          Array.from(recipientIds).map(uid => ({
            user_id: uid,
            title: `Driver at ${locationLabel} — ${selectedTrip.job_number}`,
            message: noticeBody,
            type: 'info',
            link: `/jobs/${selectedTrip.id}`,
          }))
        )
      }

      await supabase.from('delivery_status_logs').insert({
        job_order_id: selectedTrip.id,
        status: locationType === 'pickup' ? 'driver_at_pickup' : 'driver_at_dropoff',
        logged_by: userId,
        location: currentGps ? `${currentGps.lat.toFixed(5)}, ${currentGps.lng.toFixed(5)}` : null,
        note: noticeBody,
        logged_at: new Date().toISOString(),
      })

      toast.success('Arrival notice sent!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to send arrival notice')
    } finally {
      setSendingNotice(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING SKELETON
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border">
          <div className="skeleton h-6 w-32 rounded" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="skeleton rounded-none" style={{ height: '52vh', minHeight: '320px' }} />
        <div className="p-4 space-y-3">
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-28 rounded-xl" />
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
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
        {/* GPS status + wake lock */}
        <div className="flex items-center gap-2">
          {wakeLockActive && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
              🔆 Screen On
            </span>
          )}
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
      </div>

      {/* ── Trip summary card (compact) ── */}
      {selectedTrip ? (
        <div className="bg-bg-elevated border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3 mb-2">
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
          {/* Route strip */}
          <div className="flex items-center gap-1.5 bg-bg-tertiary rounded-lg px-2.5 py-2">
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
            <span className="text-xs text-text-muted truncate flex-1">{selectedTrip.pickup_location}</span>
            <span className="text-text-muted text-xs flex-shrink-0">→</span>
            <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
            <span className="text-xs text-text-muted truncate flex-1 text-right">{selectedTrip.dropoff_location}</span>
          </div>
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-bg-elevated border-b border-border px-4 py-2.5 text-center">
          <p className="text-xs text-text-muted">No assigned trips — your location is shown below</p>
        </div>
      ) : null}

      {/* ── ETA bar ── */}
      {routeInfo && (
        <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border">
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
            <div className="flex items-center gap-1 text-xs text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ MAP AREA ═══════════════════ */}
      <div className="relative border-b border-border" style={{ height: '52vh', minHeight: '320px', background: '#1a1a1a' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Map loading overlay */}
        {!mapLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-tertiary">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-text-muted text-sm">Loading map…</p>
          </div>
        )}

        {/* GPS denied */}
        {mapLoaded && gpsStatus === 'denied' && (
          <div className="absolute top-2 left-2 right-2 bg-danger-bg border border-danger-border rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-danger flex-shrink-0" />
            <p className="text-xs text-danger leading-snug">GPS denied — enable location in browser settings</p>
          </div>
        )}

        {/* Legend */}
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

        {/* ── Map overlay controls — large, driver-safe ── */}
        {mapLoaded && (
          <div className="absolute bottom-3 left-3 flex flex-col gap-2">
            {/* Recenter */}
            <button
              onClick={recenter}
              className="flex items-center justify-center rounded-xl bg-bg-secondary/95 border border-border active:scale-95 transition-transform"
              style={{ width: 52, height: 52, boxShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
              title="Recenter on my location"
            >
              <Crosshair size={22} className="text-brand" />
            </button>

            {/* Follow toggle */}
            <button
              onClick={toggleFollow}
              className="flex items-center justify-center rounded-xl border active:scale-95 transition-transform"
              style={{
                width: 52, height: 52,
                boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
                background: followMode ? 'rgba(59,130,246,0.9)' : 'rgba(18,18,18,0.95)',
                borderColor: followMode ? '#3b82f6' : '#333',
              }}
              title={followMode ? 'Follow ON — tap to turn off' : 'Follow OFF — tap to follow'}
            >
              {followMode
                ? <Navigation size={22} className="text-white" />
                : <Navigation size={22} className="text-text-muted" />
              }
            </button>

            {/* Fit Route */}
            {selectedTrip && (
              <button
                onClick={fitRoute}
                className="flex items-center justify-center rounded-xl bg-bg-secondary/95 border border-border active:scale-95 transition-transform"
                style={{ width: 52, height: 52, boxShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
                title="Show full route"
              >
                <Route size={20} className="text-text-secondary" />
              </button>
            )}
          </div>
        )}

        {/* Follow mode label */}
        {mapLoaded && followMode && (
          <div className="absolute bottom-3 left-20 bg-blue-600/90 border border-blue-500 rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-bold text-white">Following</span>
          </div>
        )}

        {/* Route error */}
        {mapLoaded && routeError && !followMode && (
          <div className="absolute bottom-3 left-20 right-2 bg-bg-secondary/95 border border-border rounded-lg px-3 py-2">
            <p className="text-xs text-text-muted">⚠️ {routeError}</p>
          </div>
        )}

        {/* No trips GPS hint */}
        {mapLoaded && trips.length === 0 && gpsStatus === 'captured' && (
          <div className="absolute bottom-3 left-20 right-2 bg-bg-secondary/90 border border-border rounded-full px-3 py-1.5 text-center">
            <p className="text-xs text-text-muted">📍 Tap your marker to confirm GPS</p>
          </div>
        )}
      </div>

      {/* ─── Body ─────────────────────────────────────────────── */}
      <div className="p-4 pb-8 space-y-4">

        {/* Wake lock nudge — shown if browser doesn't support it */}
        {wakeLockSupported === false && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <span className="text-sm">💡</span>
            <p className="text-xs text-warning leading-snug">
              Keep your screen awake in device settings while driving.
            </p>
          </div>
        )}

        {/* Delivered banner */}
        {selectedTrip && ['delivered', 'completed'].includes(selectedTrip.status) && (
          <div className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-success-bg border border-success-border">
            <CheckCircle size={18} className="text-success" />
            <span className="text-success font-bold text-sm">Trip Delivered — Awaiting confirmation</span>
          </div>
        )}

        {/* ── Arrival notice buttons ── */}
        {selectedTrip && !['delivered', 'completed', 'cancelled'].includes(selectedTrip.status) && (
          <div className="space-y-2">
            <p className="text-[11px] text-text-muted uppercase tracking-wide font-bold px-0.5">
              Notify fleet &amp; team
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => sendArrivalNotice('pickup')}
                disabled={sendingNotice}
                className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border text-center active:scale-95 transition-transform disabled:opacity-50"
                style={{ background: '#0f2744', borderColor: '#3b82f6', color: '#60a5fa' }}
              >
                <MapPin size={24} />
                <span className="text-sm font-bold leading-tight">I'm at Pickup</span>
              </button>
              <button
                onClick={() => sendArrivalNotice('dropoff')}
                disabled={sendingNotice}
                className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border text-center active:scale-95 transition-transform disabled:opacity-50"
                style={{ background: '#0f2744', borderColor: '#3b82f6', color: '#60a5fa' }}
              >
                <MapPin size={24} />
                <span className="text-sm font-bold leading-tight">I'm at Drop-off</span>
              </button>
            </div>
            {sendingNotice && (
              <p className="text-xs text-text-muted text-center">Sending notice…</p>
            )}
          </div>
        )}

        {/* ── Quick action buttons — large for safe driving use ── */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/emergency"
            className="flex flex-col items-center gap-2 py-5 px-2 rounded-xl bg-danger-bg border border-danger-border text-danger text-center active:scale-95 transition-transform">
            <Phone size={26} />
            <span className="text-sm font-bold">SOS</span>
          </Link>
          <Link href="/incidents"
            className="flex flex-col items-center gap-2 py-5 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center active:scale-95 transition-transform">
            <AlertTriangle size={26} />
            <span className="text-sm font-bold">Incident</span>
          </Link>
          <Link href="/chat"
            className="flex flex-col items-center gap-2 py-5 px-2 rounded-xl bg-bg-secondary border border-border text-text-secondary text-center active:scale-95 transition-transform">
            <MessageCircle size={26} />
            <span className="text-sm font-bold">Messages</span>
          </Link>
        </div>

        {/* Client contact */}
        {selectedTrip?.contact_number && (
          <a href={`tel:${selectedTrip.contact_number}`}
            className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary border border-border active:bg-bg-elevated transition-colors">
            <Phone size={18} className="text-info flex-shrink-0" />
            <span className="text-sm font-semibold text-text-primary">{selectedTrip.contact_person || 'Client'}</span>
            <span className="ml-auto text-xs text-text-muted">{selectedTrip.contact_number}</span>
          </a>
        )}

        {/* Cargo */}
        {selectedTrip?.shipment_items && selectedTrip.shipment_items.length > 0 && (
          <div className="bg-bg-secondary border border-border rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <Package size={14} className="text-text-muted" />
              <span className="text-xs font-bold text-text-muted uppercase tracking-wide">
                Cargo · {selectedTrip.shipment_items.length} item{selectedTrip.shipment_items.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {selectedTrip.shipment_items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
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
          <div className="bg-warning-bg border border-warning-border rounded-xl p-3.5">
            <p className="text-sm text-warning leading-relaxed">📋 {selectedTrip.special_instructions}</p>
          </div>
        )}

        {/* View full details link */}
        {selectedTrip && (
          <Link href={`/jobs/${selectedTrip.id}`}
            className="flex items-center justify-center gap-1 text-sm text-text-muted py-2 hover:text-text-secondary transition-colors">
            View full job details <ChevronRight size={13} />
          </Link>
        )}

        {/* Empty state */}
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

        {/* Trip selector list */}
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
                  <div key={trip.id}
                    className={cn(
                      'border rounded-xl overflow-hidden transition-all',
                      isSelected ? 'border-brand bg-bg-elevated' : 'border-border bg-bg-secondary',
                      isCancelled && 'opacity-60'
                    )}>
                    <button
                      className="w-full text-left p-4"
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
                          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
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
                      <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-bg-tertiary/40">
                        <span className="text-xs text-text-muted">Tap map markers for addresses</span>
                        <Link href={`/jobs/${trip.id}`} className="flex items-center gap-0.5 text-xs text-brand font-semibold">
                          Full details <ChevronRight size={11} />
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

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
