'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, X, Check } from 'lucide-react'

declare global { interface Window { google: any; initMapPicker: () => void } }

interface MapPickerProps {
  onSelect: (address: string, lat: number, lng: number) => void
  onClose: () => void
  initialAddress?: string
}

export default function MapPicker({ onSelect, onClose, initialAddress }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState(initialAddress || '')
  const [selectedLat, setSelectedLat] = useState<number | null>(null)
  const [selectedLng, setSelectedLng] = useState<number | null>(null)

  useEffect(() => {
    if (window.google) { setMapLoaded(true); return }
    const existing = document.querySelector('script[src*="maps.googleapis"]')
    if (existing) {
      const check = setInterval(() => { if (window.google) { clearInterval(check); setMapLoaded(true) } }, 200)
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMapPicker`
    script.async = true
    window.initMapPicker = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    // Default center: Philippines
    const center = { lat: 14.5995, lng: 120.9842 }

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 12,
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
      fullscreenControl: false,
    })

    // Draggable marker
    markerRef.current = new window.google.maps.Marker({
      map: mapInstanceRef.current,
      draggable: true,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#ef4444',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2.5,
      },
    })

    // Click on map to move marker
    mapInstanceRef.current.addListener('click', (e: any) => {
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      markerRef.current.setPosition(e.latLng)
      reverseGeocode(lat, lng)
    })

    // Drag marker
    markerRef.current.addListener('dragend', (e: any) => {
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      reverseGeocode(lat, lng)
    })

    // Autocomplete on search input
    if (inputRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'ph' },
      })
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.geometry) {
          const lat = place.geometry.location.lat()
          const lng = place.geometry.location.lng()
          const addr = place.formatted_address || inputRef.current?.value || ''
          mapInstanceRef.current.setCenter({ lat, lng })
          mapInstanceRef.current.setZoom(16)
          markerRef.current.setPosition({ lat, lng })
          setSelectedAddress(addr)
          setSelectedLat(lat)
          setSelectedLng(lng)
        }
      })
    }

    // If initial address, geocode it
    if (initialAddress) {
      const geocoder = new window.google.maps.Geocoder()
      geocoder.geocode({ address: initialAddress }, (results: any, status: any) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location
          mapInstanceRef.current.setCenter(loc)
          mapInstanceRef.current.setZoom(16)
          markerRef.current.setPosition(loc)
          setSelectedLat(loc.lat())
          setSelectedLng(loc.lng())
        }
      })
    }
  }, [mapLoaded, initialAddress])

  function reverseGeocode(lat: number, lng: number) {
    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
      if (status === 'OK' && results[0]) {
        setSelectedAddress(results[0].formatted_address)
        if (inputRef.current) inputRef.current.value = results[0].formatted_address
      }
    })
    setSelectedLat(lat)
    setSelectedLng(lng)
  }

  function handleConfirm() {
    if (selectedAddress && selectedLat && selectedLng) {
      onSelect(selectedAddress, selectedLat, selectedLng)
    } else if (selectedAddress) {
      onSelect(selectedAddress, 0, 0)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg-tertiary">
          <X size={20} className="text-text-muted" />
        </button>
        <div className="flex-1">
          <h2 className="font-heading text-sm font-semibold">Select Location</h2>
          <p className="text-xs text-text-muted">Search, tap on map, or drag the pin</p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={!selectedAddress}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50"
          style={{ background: '#22c55e', color: '#000' }}>
          <Check size={14} /> Confirm
        </button>
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 bg-bg-secondary border-b border-border flex-shrink-0">
        <input
          ref={inputRef}
          className="form-input w-full"
          placeholder="Search address in Philippines..."
          defaultValue={initialAddress}
        />
      </div>

      {/* Map */}
      <div ref={mapRef} className="flex-1" style={{ minHeight: '300px' }}>
        {!mapLoaded && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading map...
          </div>
        )}
      </div>

      {/* Selected address bar */}
      <div className="px-4 py-3 bg-bg-secondary border-t border-border flex-shrink-0">
        <div className="flex items-start gap-2">
          <MapPin size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-xs text-text-muted mb-0.5">Selected location</div>
            <p className="text-sm text-text-primary">
              {selectedAddress || 'Tap on the map or search to select a location'}
            </p>
            {selectedLat && selectedLng && (
              <p className="text-xs text-text-muted mt-0.5">
                {selectedLat.toFixed(5)}, {selectedLng.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
