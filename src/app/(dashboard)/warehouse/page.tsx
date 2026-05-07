'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Plus, MapPin, Package, TrendingUp, ArrowRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const WAREHOUSE_TYPES = [
  { value: 'main', label: 'Main Warehouse', icon: '🏭' },
  { value: 'branch', label: 'Branch', icon: '🏢' },
  { value: 'hub', label: 'Hub / Depot', icon: '🔄' },
  { value: 'client', label: 'Client Location', icon: '📍' },
]

declare global { interface Window { google: any; initWarehouseMap: () => void } }

export default function WarehousePage() {
  const router = useRouter()
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [form, setForm] = useState({
    name: '', address: '', lat: '', lng: '',
    contact_person: '', contact_number: '', email: '',
    type: 'main', status: 'active',
  })
 
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setUserRole(profile?.role || null)
      await loadWarehouses()
    }
    load()
  }, [router])

  async function loadWarehouses() {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*, inventory:warehouse_inventory(id, quantity, cbm_per_unit), movements:warehouse_movements(id, status)')
      .order('created_at', { ascending: false })
    if (error) console.error('Warehouse load error:', error)
    setWarehouses(data || [])
    setLoading(false)
  }

  function loadMap() {
    if (window.google) { setMapLoaded(true); return }
    const existing = document.querySelector('script[src*="maps.googleapis"]')
    if (existing) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initWarehouseMap`
    script.async = true
    window.initWarehouseMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }

  useEffect(() => {
    if (showForm) loadMap()
  }, [showForm])

  useEffect(() => {
    if (!mapLoaded || !showForm) return
    const input = document.getElementById('warehouse-address-input') as HTMLInputElement
    if (!input) return
    const autocomplete = new window.google.maps.places.Autocomplete(input, { componentRestrictions: { country: 'ph' } })
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (place.geometry) {
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        setForm(f => ({ ...f, address: place.formatted_address || '', lat: lat.toString(), lng: lng.toString() }))
      }
    })
  }, [mapLoaded, showForm])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.address.trim()) { toast.error('Name and address are required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('warehouses').insert({
        ...form,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        created_by: userId,
      })
      if (error) throw error
      toast.success('Warehouse created!')
      setShowForm(false)
      setForm({ name: '', address: '', lat: '', lng: '', contact_person: '', contact_number: '', email: '', type: 'main', status: 'active' })
      await loadWarehouses()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const filtered = warehouses.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.address.toLowerCase().includes(search.toLowerCase())
  )

  const totalItems = warehouses.reduce((s, w) => s + (w.inventory?.length || 0), 0)
  const totalCBM = warehouses.reduce((s, w) =>
    s + (w.inventory?.reduce((ss: number, i: any) => ss + (i.quantity * i.cbm_per_unit || 0), 0) || 0), 0)
  const activeMovements = warehouses.reduce((s, w) =>
    s + (w.movements?.filter((m: any) => m.status === 'in_transit').length || 0), 0)

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Warehouses</h1>
          <p className="text-text-muted text-sm mt-0.5">Manage locations & inventory</p>
        </div>
        {(userRole === 'admin' || userRole === 'fleet_manager') && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={14} /> Add Warehouse
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
          <div className="font-heading text-2xl font-bold text-info">{warehouses.length}</div>
          <div className="text-xs text-text-muted mt-0.5">Locations</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
          <div className="font-heading text-2xl font-bold text-success">{totalItems}</div>
          <div className="text-xs text-text-muted mt-0.5">Items</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
          <div className="font-heading text-2xl font-bold text-warning">{activeMovements}</div>
          <div className="text-xs text-text-muted mt-0.5">In Transit</div>
        </div>
      </div>

      {/* Total CBM */}
      {totalCBM > 0 && (
        <div className="bg-info-bg border border-info-border rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-info font-semibold">Total CBM in all warehouses</span>
          <span className="font-heading text-lg font-bold text-info">{totalCBM.toFixed(2)} CBM</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input className="form-input pl-9" placeholder="Search warehouses..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Warehouse list */}
      {loading ? (
        Array(3).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-28 rounded-lg mb-3" />)
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">🏭</div>
          <p className="text-text-secondary font-medium">No warehouses yet</p>
          <p className="text-text-muted text-sm mt-1">Add your first warehouse to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(wh => {
            const typeInfo = WAREHOUSE_TYPES.find(t => t.value === wh.type) || WAREHOUSE_TYPES[0]
            const itemCount = wh.inventory?.length || 0
            const totalQty = wh.inventory?.reduce((s: number, i: any) => s + i.quantity, 0) || 0
            const whCBM = wh.inventory?.reduce((s: number, i: any) => s + (i.quantity * i.cbm_per_unit || 0), 0) || 0
            const inTransit = wh.movements?.filter((m: any) => m.status === 'in_transit').length || 0

            return (
              <Link key={wh.id} href={`/warehouse/${wh.id}`}>
                <div className="bg-bg-secondary border border-border rounded-lg p-4 hover:border-border-secondary transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{typeInfo.icon}</span>
                      <div>
                        <div className="font-heading text-sm font-bold text-text-primary">{wh.name}</div>
                        <div className="text-xs text-text-muted">{typeInfo.label}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      {inTransit > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                          {inTransit} in transit
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-text-muted mb-3">
                    <MapPin size={11} />
                    <span className="truncate">{wh.address}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-bg-tertiary rounded-md p-2 text-center">
                      <div className="font-bold text-sm text-text-primary">{itemCount}</div>
                      <div className="text-xs text-text-muted">Items</div>
                    </div>
                    <div className="bg-bg-tertiary rounded-md p-2 text-center">
                      <div className="font-bold text-sm text-text-primary">{totalQty}</div>
                      <div className="text-xs text-text-muted">Units</div>
                    </div>
                    <div className="bg-bg-tertiary rounded-md p-2 text-center">
                      <div className="font-bold text-sm" style={{ color: '#60a5fa' }}>{whCBM.toFixed(1)}</div>
                      <div className="text-xs text-text-muted">CBM</div>
                    </div>
                  </div>

                  {wh.contact_person && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <span className="text-xs text-text-muted">👤 {wh.contact_person}</span>
                      {wh.contact_number && (
                        <a href={`tel:${wh.contact_number}`} onClick={e => e.stopPropagation()}
                          className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                          📞 Call
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Add Warehouse Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">🏭 Add Warehouse</h2>
              <button onClick={() => setShowForm(false)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="form-label">Warehouse Name *</label>
                <input className="form-input" placeholder="e.g. Main Warehouse Laguna" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {WAREHOUSE_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={cn('flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all',
                        form.type === t.value ? 'border-brand bg-bg-elevated text-text-primary' : 'border-border bg-bg-tertiary text-text-secondary')}>
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Address / Location *</label>
                <input id="warehouse-address-input" className="form-input"
                  placeholder="Search address or type location..."
                  value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
                {form.lat && form.lng && (
                  <p className="text-xs text-success mt-1">✓ GPS: {parseFloat(form.lat).toFixed(4)}, {parseFloat(form.lng).toFixed(4)}</p>
                )}
                {!mapLoaded && <p className="text-xs text-text-muted mt-1">Loading address search...</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Latitude (optional)</label>
                  <input className="form-input" type="number" step="any" placeholder="14.5995"
                    value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Longitude (optional)</label>
                  <input className="form-input" type="number" step="any" placeholder="120.9842"
                    value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} />
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="text-xs font-bold text-text-muted uppercase text-center tracking-widest">CONTACT INFORMATION</div>
              <div>
                <label className="form-label">Contact Person</label>
                <input className="form-input" placeholder="Person in charge"
                  value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Contact Number</label>
                  <input className="form-input" placeholder="+63 9XX XXX XXXX"
                    value={form.contact_number} onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" placeholder="warehouse@email.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : '🏭 Create Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
