'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Plus, MapPin, Search, Edit } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false })

const WAREHOUSE_TYPES = [
  { value: 'main', label: 'Main Warehouse', icon: '🏭' },
  { value: 'branch', label: 'Branch', icon: '🏢' },
  { value: 'hub', label: 'Hub / Depot', icon: '🔄' },
  { value: 'client', label: 'Client Location', icon: '📍' },
]

const EMPTY_FORM = {
  name: '', address: '', lat: '', lng: '',
  contact_person: '', contact_number: '', email: '',
  type: 'main', status: 'active',
}

export default function WarehousePage() {
  const router = useRouter()
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      const role = profile?.role || null
      setUserRole(role)

      // Only admin, fleet_manager, warehouse_manager may access warehouse
      if (role === 'driver' || role === 'truck_owner' || role === 'client') {
        router.push('/dashboard')
        return
      }
      await loadWarehouses()
    }
    load()
  }, [router])

  async function loadWarehouses() {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*, inventory:warehouse_inventory(id, quantity, cbm_per_unit), outbound:warehouse_movements!from_warehouse_id(id, status), inbound:warehouse_movements!to_warehouse_id(id, status)')
      .order('created_at', { ascending: false })
    if (error) console.error('Warehouse load error:', error)
    setWarehouses(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEdit(wh: any) {
    setEditId(wh.id)
    setForm({
      name: wh.name || '',
      address: wh.address || '',
      lat: wh.lat?.toString() || '',
      lng: wh.lng?.toString() || '',
      contact_person: wh.contact_person || '',
      contact_number: wh.contact_number || '',
      email: wh.email || '',
      type: wh.type || 'main',
      status: wh.status || 'active',
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.address.trim()) { toast.error('Name and address are required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
      }

      if (editId) {
        const { error } = await supabase.from('warehouses').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Warehouse updated!')
      } else {
        const { error } = await supabase.from('warehouses').insert({ ...payload, created_by: userId })
        if (error) throw error
        toast.success('Warehouse created!')
      }

      setShowForm(false)
      setEditId(null)
      setForm({ ...EMPTY_FORM })
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
  const activeMovements = warehouses.reduce((s, w) =>
    s + (w.outbound?.filter((m: any) => m.status === 'in_transit').length || 0)
    + (w.inbound?.filter((m: any) => m.status === 'in_transit').length || 0), 0)

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Warehouses</h1>
          <p className="text-text-muted text-sm mt-0.5">Manage locations & inventory</p>
        </div>
        {(userRole === 'admin' || userRole === 'fleet_manager' || userRole === 'warehouse_manager') && (
          <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
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
            const inTransit = (wh.outbound?.filter((m: any) => m.status === 'in_transit').length || 0) + (wh.inbound?.filter((m: any) => m.status === 'in_transit').length || 0)

            return (
              <div key={wh.id} className="bg-bg-secondary border border-border rounded-lg p-4 hover:border-border-secondary transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <Link href={`/warehouse/${wh.id}`} className="flex items-center gap-2 flex-1">
                    <span className="text-2xl">{typeInfo.icon}</span>
                    <div>
                      <div className="font-heading text-sm font-bold text-text-primary">{wh.name}</div>
                      <div className="text-xs text-text-muted">{typeInfo.label}</div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {inTransit > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                        {inTransit} in transit
                      </span>
                    )}
                    {(userRole === 'admin' || userRole === 'fleet_manager' || userRole === 'warehouse_manager') && (
                      <button onClick={() => openEdit(wh)}
                        className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
                        <Edit size={15} className="text-text-muted" />
                      </button>
                    )}
                  </div>
                </div>

                <Link href={`/warehouse/${wh.id}`}>
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
                        <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                          📞 {wh.contact_number}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Warehouse Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">{editId ? '✏️ Edit Warehouse' : '🏭 Add Warehouse'}</h2>
              <button onClick={() => { setShowForm(false); setEditId(null) }}
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

              {/* Address with Map Picker */}
              <div>
                <label className="form-label">Address / Location *</label>
                <div className="flex gap-2">
                  <input className="form-input flex-1" placeholder="Address"
                    value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
                  <button type="button" onClick={() => setShowMapPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(96,165,250,0.15)', border: '1.5px solid #60a5fa', color: '#60a5fa' }}>
                    <MapPin size={14} /> Pick on Map
                  </button>
                </div>
                {form.lat && form.lng && (
                  <p className="text-xs text-success mt-1">✓ GPS: {parseFloat(form.lat).toFixed(4)}, {parseFloat(form.lng).toFixed(4)}</p>
                )}
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

              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : editId ? '✓ Save Changes' : '🏭 Create Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Picker */}
      {showMapPicker && (
        <MapPicker
          initialAddress={form.address}
          onClose={() => setShowMapPicker(false)}
          onSelect={(address, lat, lng) => {
            setForm(f => ({ ...f, address, lat: lat.toString(), lng: lng.toString() }))
            setShowMapPicker(false)
          }}
        />
      )}
    </div>
  )
}
