'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Plus, MapPin, Search, Edit, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false })

// ─── Constants ────────────────────────────────────────────────────────────────

const WAREHOUSE_TYPES = [
  { value: 'main',   label: 'Main Warehouse', icon: '🏭' },
  { value: 'branch', label: 'Branch',          icon: '🏢' },
  { value: 'hub',    label: 'Hub / Depot',     icon: '🔄' },
  { value: 'client', label: 'Client Location', icon: '📍' },
]

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  in_warehouse: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)' },
  reserved:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)' },
  loading:      { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  loaded:       { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)' },
  in_transit:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.3)' },
  delivered:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' },
  returned:     { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  cancelled:    { color: '#71717a', bg: 'rgba(113,113,122,0.12)', border: 'rgba(113,113,122,0.3)' },
}

const STATUS_LABELS: Record<string, string> = {
  in_warehouse: 'In Warehouse', reserved: 'Reserved', loading: 'Loading',
  loaded: 'Loaded', in_transit: 'In Transit', delivered: 'Delivered',
  returned: 'Returned', cancelled: 'Cancelled',
}

const EMPTY_FORM = {
  name: '', address: '', lat: '', lng: '',
  contact_person: '', contact_number: '', email: '',
  type: 'main', status: 'active',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WarehousePage() {
  const router = useRouter()
  const [warehouses, setWarehouses]             = useState<any[]>([])
  const [wmAssignedIds, setWmAssignedIds]       = useState<string[]>([])   // IDs assigned to current WM
  const [allManagers, setAllManagers]           = useState<any[]>([])       // profiles with role=warehouse_manager
  const [assignments, setAssignments]           = useState<Record<string, any[]>>({}) // warehouseId → [{manager_id, id, manager:{full_name}}]
  const [loading, setLoading]                   = useState(true)
  const [showForm, setShowForm]                 = useState(false)
  const [editId, setEditId]                     = useState<string | null>(null)
  const [userId, setUserId]                     = useState<string | null>(null)
  const [userRole, setUserRole]                 = useState<string | null>(null)
  const [saving, setSaving]                     = useState(false)
  const [search, setSearch]                     = useState('')
  const [showMapPicker, setShowMapPicker]       = useState(false)
  const [form, setForm]                         = useState({ ...EMPTY_FORM })
  // Assign-manager state inside the form modal
  const [assignManagerId, setAssignManagerId]   = useState('')
  const [savingAssign, setSavingAssign]         = useState(false)

  // ── Auth + load ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function boot() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', uid).single()
      const role = profile?.role || null
      setUserRole(role)

      if (role === 'driver' || role === 'truck_owner' || role === 'client') {
        router.push('/dashboard'); return
      }

      if (role === 'warehouse_manager') {
        // WM: only load their assigned warehouses
        const { data: wmaRows } = await supabase
          .from('warehouse_manager_assignments')
          .select('warehouse_id')
          .eq('manager_id', uid)
        const ids = (wmaRows || []).map((r: any) => r.warehouse_id)
        setWmAssignedIds(ids)
        await loadWarehouses(ids, role)
      } else {
        // FM/Admin: load all warehouses + all WM profiles + current assignments
        await Promise.all([
          loadWarehouses([], role),
          loadManagerProfiles(),
          loadAllAssignments(),
        ])
      }
    }
    boot()
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadWarehouses(wmIds: string[], role: string) {
    let query = supabase
      .from('warehouses')
      .select(
        '*, inventory:warehouse_inventory(id, quantity, cbm_per_unit, status),' +
        'outbound:warehouse_movements!from_warehouse_id(id, status),' +
        'inbound:warehouse_movements!to_warehouse_id(id, status)'
      )
      .order('created_at', { ascending: false })

    if (role === 'warehouse_manager') {
      if (wmIds.length === 0) { setWarehouses([]); setLoading(false); return }
      query = query.in('id', wmIds)
    }

    const { data, error } = await query
    if (error) console.error('Warehouse load error:', error)
    setWarehouses(data || [])
    setLoading(false)
  }

  async function loadManagerProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, contact_number')
      .eq('role', 'warehouse_manager')
      .order('full_name')
    setAllManagers(data || [])
  }

  async function loadAllAssignments() {
    const { data } = await supabase
      .from('warehouse_manager_assignments')
      .select('id, warehouse_id, manager_id, manager:profiles!manager_id(full_name, contact_number)')
    const map: Record<string, any[]> = {}
    ;(data || []).forEach((row: any) => {
      if (!map[row.warehouse_id]) map[row.warehouse_id] = []
      map[row.warehouse_id].push(row)
    })
    setAssignments(map)
  }

  // ── Warehouse CRUD ────────────────────────────────────────────────────────

  function openAdd() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setAssignManagerId('')
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
    setAssignManagerId('')
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.address.trim()) {
      toast.error('Name and address are required'); return
    }
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
      await Promise.all([loadWarehouses([], userRole || ''), loadAllAssignments()])
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  // ── Assignment CRUD ───────────────────────────────────────────────────────

  async function handleAssignManager() {
    if (!assignManagerId || !editId) return
    // Prevent duplicate
    const current = assignments[editId] || []
    if (current.some((r: any) => r.manager_id === assignManagerId)) {
      toast('Already assigned to this warehouse'); return
    }
    setSavingAssign(true)
    try {
      const { error } = await supabase.from('warehouse_manager_assignments').insert({
        warehouse_id: editId,
        manager_id: assignManagerId,
        assigned_by: userId,
      })
      if (error) throw error
      toast.success('Manager assigned!')
      setAssignManagerId('')
      await loadAllAssignments()
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSavingAssign(false) }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!confirm('Remove this manager from warehouse?')) return
    const { error } = await supabase
      .from('warehouse_manager_assignments')
      .delete()
      .eq('id', assignmentId)
    if (error) { toast.error(error.message); return }
    toast.success('Assignment removed')
    await loadAllAssignments()
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const globalStats = useMemo(() => {
    let totalSkus = 0, totalUnits = 0, totalInTransit = 0
    const allStatuses: Record<string, number> = {}
    warehouses.forEach(w => {
      totalSkus += w.inventory?.length || 0
      w.inventory?.forEach((i: any) => {
        totalUnits += i.quantity || 0
        const st = i.status || 'in_warehouse'
        allStatuses[st] = (allStatuses[st] || 0) + 1
      })
      totalInTransit +=
        (w.outbound?.filter((m: any) => m.status === 'in_transit').length || 0) +
        (w.inbound?.filter((m: any)  => m.status === 'in_transit').length || 0)
    })
    return { totalSkus, totalUnits, totalInTransit, allStatuses }
  }, [warehouses])

  const filtered = warehouses.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.address.toLowerCase().includes(search.toLowerCase())
  )

  const isFleetAdmin = userRole === 'admin' || userRole === 'fleet_manager'
  const isWM        = userRole === 'warehouse_manager'

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="skeleton h-8 w-48 rounded mb-5" />
        <div className="skeleton h-24 rounded-xl mb-5" />
        {Array(3).fill(0).map((_: any, i: number) => (
          <div key={i} className="skeleton h-32 rounded-xl mb-3" />
        ))}
      </div>
    )
  }

  // ── WM with no assignment ─────────────────────────────────────────────────

  if (isWM && wmAssignedIds.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-6xl mb-4">🏭</div>
        <h1 className="font-heading text-xl font-bold text-text-primary mb-2">
          No Warehouse Assigned
        </h1>
        <p className="text-text-muted text-sm max-w-xs leading-relaxed">
          You have not been assigned to any warehouse yet. Please contact the Fleet Manager or Admin to get assigned.
        </p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            {isWM ? 'My Warehouse' : 'Warehouses'}
          </h1>
          <p className="text-text-muted text-sm mt-0.5">
            {isWM ? 'Inventory command center' : 'Manage locations & inventory'}
          </p>
        </div>
        {isFleetAdmin && (
          <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={14} /> Add Warehouse
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-px bg-border rounded-xl overflow-hidden mb-5">
        {[
          { label: 'Locations',  value: warehouses.length,         color: 'text-info' },
          { label: 'SKUs',       value: globalStats.totalSkus,     color: 'text-text-primary' },
          { label: 'Total Units',value: globalStats.totalUnits,    color: 'text-success' },
          { label: 'In Transit', value: globalStats.totalInTransit, color: 'text-warning' },
        ].map(s => (
          <div key={s.label} className="bg-bg-secondary p-3 text-center">
            <div className={cn('font-heading text-2xl font-bold', s.color)}>{s.value}</div>
            <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Global status breakdown */}
      {Object.keys(globalStats.allStatuses).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Object.entries(globalStats.allStatuses).map(([status, count]) => {
            const s = STATUS_COLORS[status]
            if (!s) return null
            return (
              <span key={status} className="text-xs px-2 py-1 rounded-full font-semibold"
                style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                {STATUS_LABELS[status] || status} · {count}
              </span>
            )
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input className="form-input pl-9" placeholder="Search warehouses…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Warehouse list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">🏭</div>
          <p className="text-text-secondary font-medium">No warehouses found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(wh => {
            const typeInfo    = WAREHOUSE_TYPES.find(t => t.value === wh.type) || WAREHOUSE_TYPES[0]
            const totalQty    = wh.inventory?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0
            const whCBM       = wh.inventory?.reduce((s: number, i: any) => s + ((i.quantity * i.cbm_per_unit) || 0), 0) || 0
            const inTransit   = (wh.outbound?.filter((m: any) => m.status === 'in_transit').length || 0) +
                                (wh.inbound?.filter((m: any)  => m.status === 'in_transit').length || 0)
            const skuCount    = wh.inventory?.length || 0
            const whManagers  = assignments[wh.id] || []
            const whStatuses: Record<string, number> = {}
            wh.inventory?.forEach((i: any) => {
              const st = i.status || 'in_warehouse'
              whStatuses[st] = (whStatuses[st] || 0) + 1
            })
            const hasReserved = (whStatuses['reserved'] || 0) > 0
            const hasLoading  = (whStatuses['loading'] || 0) > 0 || (whStatuses['loaded'] || 0) > 0

            return (
              <div key={wh.id} className="bg-bg-secondary border border-border rounded-xl overflow-hidden hover:border-border-secondary transition-colors">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/warehouse/${wh.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-2xl flex-shrink-0">{typeInfo.icon}</span>
                      <div className="min-w-0">
                        <div className="font-heading text-sm font-bold text-text-primary truncate">{wh.name}</div>
                        <div className="text-xs text-text-muted">{typeInfo.label}</div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {inTransit > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                          🚛 {inTransit}
                        </span>
                      )}
                      {isFleetAdmin && (
                        <button onClick={() => openEdit(wh)}
                          className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors"
                          title="Edit warehouse & manage assignments">
                          <Edit size={15} className="text-text-muted" />
                        </button>
                      )}
                    </div>
                  </div>

                  <Link href={`/warehouse/${wh.id}`} className="block">
                    <div className="flex items-center gap-1.5 text-xs text-text-muted mb-3">
                      <MapPin size={11} />
                      <span className="truncate">{wh.address}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                        <div className="font-bold text-sm text-text-primary">{skuCount}</div>
                        <div className="text-xs text-text-muted">SKUs</div>
                      </div>
                      <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                        <div className="font-bold text-sm text-text-primary">{totalQty}</div>
                        <div className="text-xs text-text-muted">Units</div>
                      </div>
                      <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                        <div className="font-bold text-sm" style={{ color: '#60a5fa' }}>{whCBM.toFixed(1)}</div>
                        <div className="text-xs text-text-muted">CBM</div>
                      </div>
                    </div>

                    {Object.keys(whStatuses).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(whStatuses).map(([status, count]) => {
                          const s = STATUS_COLORS[status]
                          if (!s) return null
                          return (
                            <span key={status} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                              {STATUS_LABELS[status] || status} {count}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </Link>

                  {/* Assigned managers — only visible to FM/Admin */}
                  {isFleetAdmin && whManagers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border">
                      <span className="text-[10px] text-text-muted self-center">Managers:</span>
                      {whManagers.map((r: any) => (
                        <span key={r.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
                          🏭 {r.manager?.full_name || 'Unknown'}
                        </span>
                      ))}
                    </div>
                  )}
                  {isFleetAdmin && whManagers.length === 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <span className="text-[10px] text-text-muted italic">No manager assigned</span>
                    </div>
                  )}

                  {/* Alerts */}
                  {(hasLoading || hasReserved) && (
                    <div className="mt-2 pt-2 border-t border-border flex flex-wrap gap-2">
                      {hasLoading && <span className="text-xs text-warning">⚡ Items loading/loaded</span>}
                      {hasReserved && (
                        <span className="text-xs" style={{ color: '#a78bfa' }}>
                          🔖 {whStatuses['reserved']} reserved
                        </span>
                      )}
                    </div>
                  )}

                  {wh.contact_person && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <span className="text-xs text-text-muted">👤 {wh.contact_person}</span>
                      {wh.contact_number && (
                        <a href={`tel:${wh.contact_number}`} onClick={e => e.stopPropagation()}
                          className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                          📞 {wh.contact_number}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══════════════════ ADD / EDIT MODAL ═══════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">
                {editId ? '✏️ Edit Warehouse' : '🏭 Add Warehouse'}
              </h2>
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
                        form.type === t.value
                          ? 'border-brand bg-bg-elevated text-text-primary'
                          : 'border-border bg-bg-tertiary text-text-secondary')}>
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">Address / Location *</label>
                <div className="flex gap-2">
                  <input className="form-input flex-1" placeholder="Address"
                    value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
                  <button type="button" onClick={() => setShowMapPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(96,165,250,0.15)', border: '1.5px solid #60a5fa', color: '#60a5fa' }}>
                    <MapPin size={14} /> Pick
                  </button>
                </div>
                {form.lat && form.lng && (
                  <p className="text-xs text-success mt-1">
                    ✓ GPS: {parseFloat(form.lat).toFixed(4)}, {parseFloat(form.lng).toFixed(4)}
                  </p>
                )}
              </div>

              <div className="h-px bg-border" />
              <div className="text-xs font-bold text-text-muted uppercase text-center tracking-widest">
                CONTACT INFORMATION
              </div>

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
                  <input className="form-input" type="email"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* ── Warehouse Manager Assignments — FM/Admin only, edit mode ── */}
              {isFleetAdmin && editId && (
                <>
                  <div className="h-px bg-border" />
                  <div className="text-xs font-bold text-text-muted uppercase text-center tracking-widest">
                    WAREHOUSE MANAGER ASSIGNMENT
                  </div>

                  {/* Current managers */}
                  {(assignments[editId] || []).length > 0 ? (
                    <div className="space-y-2">
                      {(assignments[editId] || []).map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2.5">
                          <div>
                            <div className="text-sm font-semibold text-text-primary">
                              🏭 {r.manager?.full_name || 'Unknown'}
                            </div>
                            {r.manager?.contact_number && (
                              <div className="text-xs text-text-muted">{r.manager.contact_number}</div>
                            )}
                          </div>
                          <button type="button" onClick={() => handleRemoveAssignment(r.id)}
                            className="p-1.5 rounded-md hover:bg-danger-bg transition-colors ml-2 flex-shrink-0"
                            title="Remove assignment">
                            <X size={14} className="text-danger" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted italic text-center py-1">
                      No manager assigned to this warehouse yet.
                    </p>
                  )}

                  {/* Assign new manager */}
                  {allManagers.length > 0 && (
                    <div className="flex gap-2">
                      <select className="form-input flex-1" value={assignManagerId}
                        onChange={e => setAssignManagerId(e.target.value)}>
                        <option value="">— Select Warehouse Manager —</option>
                        {allManagers
                          .filter(m => !(assignments[editId] || []).some((r: any) => r.manager_id === m.id))
                          .map((m: any) => (
                            <option key={m.id} value={m.id}>{m.full_name}</option>
                          ))}
                      </select>
                      <button type="button" onClick={handleAssignManager}
                        disabled={!assignManagerId || savingAssign}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0 disabled:opacity-40"
                        style={{ background: 'rgba(167,139,250,0.15)', border: '1.5px solid #a78bfa', color: '#a78bfa' }}>
                        <UserPlus size={14} />
                        {savingAssign ? '…' : 'Assign'}
                      </button>
                    </div>
                  )}
                  {allManagers.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-1">
                      No Warehouse Manager accounts found. Register one first.
                    </p>
                  )}
                </>
              )}

              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => { setShowForm(false); setEditId(null) }}
                  className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving…' : editId ? '✓ Save Changes' : '🏭 Create Warehouse'}
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
