'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import {
  ChevronLeft, Plus, ArrowRight, MapPin, Trash2, Search, X,
  Package, TrendingUp, AlertCircle, CheckCircle2, ChevronDown,
  Edit2, ClipboardList, Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type InventoryItem = {
  id: string
  warehouse_id: string
  item_name: string
  sku: string | null
  quantity: number
  unit: string
  cbm_per_unit: number
  category: string | null
  notes: string | null
  status: string
  date_received: string | null
  supplier: string | null
  batch_number: string | null
  weight_kg: number | null
  job_order_id: string | null
  last_updated: string | null
  created_at: string
}

type Movement = {
  id: string
  from_warehouse_id: string | null
  to_warehouse_id: string | null
  item_name: string
  quantity: number
  cbm: number | null
  movement_type: string
  status: string
  job_order_id: string | null
  notes: string | null
  created_at: string
  from_wh?: { name: string }
  to_wh?: { name: string }
  job?: { job_number: string; client_name: string } | null
  mover?: { full_name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INVENTORY_STATUSES = [
  { value: 'in_warehouse', label: 'In Warehouse', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)' },
  { value: 'reserved',    label: 'Reserved',     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)' },
  { value: 'loading',     label: 'Loading',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  { value: 'loaded',      label: 'Loaded',       color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)' },
  { value: 'in_transit',  label: 'In Transit',   color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.3)' },
  { value: 'delivered',   label: 'Delivered',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' },
  { value: 'returned',    label: 'Returned',     color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  { value: 'cancelled',   label: 'Cancelled',    color: '#71717a', bg: 'rgba(113,113,122,0.12)', border: 'rgba(113,113,122,0.3)' },
]

const WM_UPDATABLE_STATUSES = ['in_warehouse', 'reserved', 'loading', 'loaded']

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const s = INVENTORY_STATUSES.find(x => x.value === status) || INVENTORY_STATUSES[0]
  return (
    <span className={cn('inline-flex items-center rounded-full font-semibold', small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1')}
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

const EMPTY_ITEM_FORM = {
  item_name: '', sku: '', quantity: '', unit: 'pcs',
  cbm_per_unit: '', category: '', notes: '',
  status: 'in_warehouse', date_received: '', supplier: '', batch_number: '', weight_kg: '',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [warehouse, setWarehouse] = useState<any>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [allWarehouses, setAllWarehouses] = useState<any[]>([])
  const [activeJobs, setActiveJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'inventory' | 'movements'>('inventory')

  // Search / filter
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Modals
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddMovement, setShowAddMovement] = useState(false)
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_ITEM_FORM })

  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM_FORM })

  const [movForm, setMovForm] = useState({
    movement_type: 'outbound',
    to_warehouse_id: '',
    item_name: '', quantity: '', cbm: '',
    job_order_id: '', notes: '',
  })

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      const role = profile?.role || null
      setUserRole(role)

      if (role === 'driver' || role === 'truck_owner' || role === 'client') {
        router.push('/dashboard'); return
      }

      // WM: verify this warehouse is assigned to them before loading anything
      if (role === 'warehouse_manager') {
        const { data: wmaRows } = await supabase
          .from('warehouse_manager_assignments')
          .select('warehouse_id')
          .eq('manager_id', session.user.id)
        const assignedIds = (wmaRows || []).map((r: any) => r.warehouse_id)
        if (!assignedIds.includes(id)) {
          setUnauthorized(true)
          setLoading(false)
          return
        }
      }

      await fetchData()
    }
    load()
  }, [id, router])

  async function fetchData() {
    const [whRes, invRes, movRes, allWhRes, jobsRes] = await Promise.all([
      supabase.from('warehouses').select('*').eq('id', id).single(),
      supabase.from('warehouse_inventory').select('*').eq('warehouse_id', id).order('item_name'),
      supabase.from('warehouse_movements')
        .select('*, from_wh:warehouses!from_warehouse_id(name), to_wh:warehouses!to_warehouse_id(name), job:job_orders(job_number, client_name), mover:profiles!moved_by(full_name)')
        .or(`from_warehouse_id.eq.${id},to_warehouse_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('warehouses').select('id, name').eq('status', 'active').neq('id', id),
      supabase.from('job_orders').select('id, job_number, client_name')
        .in('status', ['assigned', 'accepted', 'at_pickup', 'loaded', 'pending'])
        .order('created_at', { ascending: false }).limit(30),
    ])

    setWarehouse(whRes.data)
    setInventory(invRes.data || [])
    setMovements(movRes.data || [])
    setAllWarehouses(allWhRes.data || [])
    setActiveJobs(jobsRes.data || [])
    setLoading(false)
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalCBM = inventory.reduce((s, i) => s + (i.quantity * i.cbm_per_unit || 0), 0)
    const totalUnits = inventory.reduce((s, i) => s + i.quantity, 0)
    const inTransit = movements.filter(m => m.status === 'in_transit').length
    const byStatus: Record<string, number> = {}
    inventory.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1 })
    return { totalCBM, totalUnits, inTransit, byStatus, skus: inventory.length }
  }, [inventory, movements])

  // ── Filtered inventory ────────────────────────────────────────────────────

  const filteredInventory = useMemo(() => {
    const q = search.toLowerCase()
    return inventory.filter(item => {
      const matchSearch = !q
        || item.item_name.toLowerCase().includes(q)
        || (item.sku || '').toLowerCase().includes(q)
        || (item.category || '').toLowerCase().includes(q)
        || (item.supplier || '').toLowerCase().includes(q)
        || (item.batch_number || '').toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || item.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [inventory, search, statusFilter])

  // ── Item movements (for detail modal) ────────────────────────────────────

  const itemMovements = useMemo(() => {
    if (!detailItem) return []
    return movements.filter(m =>
      m.item_name.toLowerCase() === detailItem.item_name.toLowerCase()
    )
  }, [detailItem, movements])

  // ── Add Item ──────────────────────────────────────────────────────────────

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!itemForm.item_name.trim()) { toast.error('Item name required'); return }
    setSaving(true)
    try {
      const existing = inventory.find(i => i.item_name.toLowerCase() === itemForm.item_name.toLowerCase())
      if (existing) {
        await supabase.from('warehouse_inventory').update({
          quantity: existing.quantity + (parseInt(itemForm.quantity) || 0),
          last_updated: new Date().toISOString(),
        }).eq('id', existing.id)
        toast.success('Item quantity updated!')
      } else {
        const { error } = await supabase.from('warehouse_inventory').insert({
          warehouse_id: id,
          item_name: itemForm.item_name,
          sku: itemForm.sku || null,
          quantity: parseInt(itemForm.quantity) || 0,
          unit: itemForm.unit,
          cbm_per_unit: parseFloat(itemForm.cbm_per_unit) || 0,
          category: itemForm.category || null,
          notes: itemForm.notes || null,
          status: itemForm.status || 'in_warehouse',
          date_received: itemForm.date_received || null,
          supplier: itemForm.supplier || null,
          batch_number: itemForm.batch_number || null,
          weight_kg: parseFloat(itemForm.weight_kg) || null,
        })
        if (error) throw error
        toast.success('Item added to inventory!')
      }
      setShowAddItem(false)
      setItemForm({ ...EMPTY_ITEM_FORM })
      const { data } = await supabase.from('warehouse_inventory').select('*').eq('warehouse_id', id).order('item_name')
      setInventory(data || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // ── Edit Item ─────────────────────────────────────────────────────────────

  function openEdit(item: InventoryItem) {
    setEditItem(item)
    setEditForm({
      item_name: item.item_name,
      sku: item.sku || '',
      quantity: item.quantity.toString(),
      unit: item.unit,
      cbm_per_unit: item.cbm_per_unit?.toString() || '',
      category: item.category || '',
      notes: item.notes || '',
      status: item.status || 'in_warehouse',
      date_received: item.date_received || '',
      supplier: item.supplier || '',
      batch_number: item.batch_number || '',
      weight_kg: item.weight_kg?.toString() || '',
    })
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    setSaving(true)
    try {
      const { error } = await supabase.from('warehouse_inventory').update({
        item_name: editForm.item_name,
        sku: editForm.sku || null,
        quantity: parseInt(editForm.quantity) || 0,
        unit: editForm.unit,
        cbm_per_unit: parseFloat(editForm.cbm_per_unit) || 0,
        category: editForm.category || null,
        notes: editForm.notes || null,
        status: editForm.status,
        date_received: editForm.date_received || null,
        supplier: editForm.supplier || null,
        batch_number: editForm.batch_number || null,
        weight_kg: parseFloat(editForm.weight_kg) || null,
        last_updated: new Date().toISOString(),
      }).eq('id', editItem.id)
      if (error) throw error
      toast.success('Item updated!')
      setEditItem(null)
      const { data } = await supabase.from('warehouse_inventory').select('*').eq('warehouse_id', id).order('item_name')
      setInventory(data || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // ── Quick status update ───────────────────────────────────────────────────

  async function quickSetStatus(item: InventoryItem, newStatus: string) {
    if (!WM_UPDATABLE_STATUSES.includes(newStatus) && userRole === 'warehouse_manager') {
      toast.error('You can only set statuses up to Loaded'); return
    }
    const { error } = await supabase.from('warehouse_inventory').update({
      status: newStatus, last_updated: new Date().toISOString(),
    }).eq('id', item.id)
    if (error) { toast.error(error.message); return }
    setInventory(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    if (detailItem?.id === item.id) setDetailItem(prev => prev ? { ...prev, status: newStatus } : null)
    toast.success(`Status updated to ${INVENTORY_STATUSES.find(s => s.value === newStatus)?.label}`)
  }

  // ── Reserve for JO ────────────────────────────────────────────────────────

  async function reserveForJO(item: InventoryItem, jobOrderId: string) {
    const { error } = await supabase.from('warehouse_inventory').update({
      status: 'reserved', job_order_id: jobOrderId, last_updated: new Date().toISOString(),
    }).eq('id', item.id)
    if (error) { toast.error(error.message); return }
    const job = activeJobs.find(j => j.id === jobOrderId)
    setInventory(prev => prev.map(i => i.id === item.id ? { ...i, status: 'reserved', job_order_id: jobOrderId } : i))
    if (detailItem?.id === item.id) setDetailItem(prev => prev ? { ...prev, status: 'reserved', job_order_id: jobOrderId } : null)
    toast.success(`Reserved for ${job?.job_number || 'JO'}`)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteItem(itemId: string) {
    if (!confirm('Remove this item from inventory?')) return
    await supabase.from('warehouse_inventory').delete().eq('id', itemId)
    setInventory(prev => prev.filter(i => i.id !== itemId))
    toast.success('Item removed')
  }

  // ── Add Movement ──────────────────────────────────────────────────────────

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!movForm.item_name || !movForm.quantity) { toast.error('Item and quantity required'); return }
    setSaving(true)
    try {
      const isOutbound = movForm.movement_type === 'outbound' || movForm.movement_type === 'transfer'

      const { error } = await supabase.from('warehouse_movements').insert({
        from_warehouse_id: isOutbound ? id : (movForm.to_warehouse_id || null),
        to_warehouse_id: isOutbound ? (movForm.to_warehouse_id || null) : id,
        item_name: movForm.item_name,
        quantity: parseInt(movForm.quantity),
        cbm: parseFloat(movForm.cbm) || null,
        movement_type: movForm.movement_type,
        status: 'in_transit',
        job_order_id: movForm.job_order_id || null,
        notes: movForm.notes || null,
        moved_by: userId,
      })
      if (error) throw error

      const invItem = inventory.find(i => i.item_name.toLowerCase() === movForm.item_name.toLowerCase())
      if (invItem) {
        const qty = parseInt(movForm.quantity)
        const newQty = isOutbound ? Math.max(0, invItem.quantity - qty) : invItem.quantity + qty
        await supabase.from('warehouse_inventory').update({ quantity: newQty, last_updated: new Date().toISOString() }).eq('id', invItem.id)
      }

      toast.success('Movement logged!')
      setShowAddMovement(false)
      setMovForm({ movement_type: 'outbound', to_warehouse_id: '', item_name: '', quantity: '', cbm: '', job_order_id: '', notes: '' })
      await fetchData()
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="p-4 space-y-3">
      {Array(5).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-16 rounded-lg" />)}
    </div>
  )

  if (unauthorized) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="text-5xl mb-4">🚫</div>
      <h2 className="font-heading text-xl font-bold text-text-primary mb-2">Unauthorized Access</h2>
      <p className="text-sm text-text-muted max-w-xs mb-6">
        You are not assigned to this warehouse. Contact your Fleet Manager or Admin to get access.
      </p>
      <Link href="/warehouse"
        className="btn btn-primary flex items-center gap-2">
        <ChevronLeft size={16} /> Back to My Warehouses
      </Link>
    </div>
  )

  if (!warehouse) return <div className="text-center p-8 text-text-muted">Warehouse not found</div>

  const canEditStatus = userRole === 'admin' || userRole === 'fleet_manager' || userRole === 'warehouse_manager'
  const canFullStatus = userRole === 'admin' || userRole === 'fleet_manager'

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href="/warehouse" className="p-1.5 rounded-md hover:bg-bg-tertiary">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-muted uppercase tracking-wider">{warehouse.type?.replace('_', ' ')}</div>
          <h1 className="font-heading text-sm font-semibold truncate">{warehouse.name}</h1>
        </div>
        {warehouse.lat && warehouse.lng && (
          <a href={`https://maps.google.com/?q=${warehouse.lat},${warehouse.lng}`} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-md hover:bg-bg-tertiary">
            <MapPin size={18} className="text-info" />
          </a>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* ── Address & Contact ── */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-start gap-2 mb-2">
            <MapPin size={14} className="text-text-muted flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">{warehouse.address}</p>
          </div>
          {warehouse.contact_person && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">👤 {warehouse.contact_person}{warehouse.contact_number && ` · ${warehouse.contact_number}`}</span>
              {warehouse.contact_number && (
                <a href={`tel:${warehouse.contact_number}`}
                  className="text-xs font-bold px-2 py-1 rounded-md"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                  📞 Call
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-px bg-border rounded-xl overflow-hidden">
          {[
            { label: 'SKUs', value: stats.skus, color: 'text-info' },
            { label: 'Units', value: stats.totalUnits, color: 'text-success' },
            { label: 'CBM', value: stats.totalCBM.toFixed(1), color: 'text-[#60a5fa]' },
            { label: 'In Transit', value: stats.inTransit, color: 'text-warning' },
          ].map(s => (
            <div key={s.label} className="bg-bg-secondary p-3 text-center">
              <div className={cn('font-heading text-xl font-bold', s.color)}>{s.value}</div>
              <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Status summary pills ── */}
        {inventory.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {INVENTORY_STATUSES.filter(s => stats.byStatus[s.value]).map(s => (
              <button key={s.value}
                onClick={() => setStatusFilter(statusFilter === s.value ? 'all' : s.value)}
                className="text-xs px-2 py-1 rounded-full font-semibold transition-all"
                style={{
                  color: s.color,
                  background: statusFilter === s.value ? s.bg : 'transparent',
                  border: `1px solid ${statusFilter === s.value ? s.border : 'transparent'}`,
                  opacity: statusFilter !== 'all' && statusFilter !== s.value ? 0.4 : 1,
                }}>
                {s.label} · {stats.byStatus[s.value]}
              </button>
            ))}
            {statusFilter !== 'all' && (
              <button onClick={() => setStatusFilter('all')} className="text-xs px-2 py-1 rounded-full text-text-muted border border-border">
                Clear
              </button>
            )}
          </div>
        )}

        {stats.inTransit > 0 && (
          <div className="bg-warning-bg border border-warning-border rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-warning font-semibold">🚛 {stats.inTransit} shipment{stats.inTransit > 1 ? 's' : ''} in transit</span>
            <button onClick={() => setTab('movements')} className="text-xs text-warning underline">View →</button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-2">
          {(['inventory', 'movements'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all',
                tab === t ? 'bg-brand text-bg-primary' : 'bg-bg-secondary border border-border text-text-secondary')}>
              {t === 'inventory' ? `📦 Inventory (${inventory.length})` : `🔄 Movements (${movements.length})`}
            </button>
          ))}
        </div>

        {/* ─────────────── INVENTORY TAB ─────────────── */}
        {tab === 'inventory' && (
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input className="form-input pl-9 text-sm" placeholder="Search by name, SKU, supplier…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X size={13} className="text-text-muted" />
                  </button>
                )}
              </div>
              {canEditStatus && (
                <button onClick={() => setShowAddItem(true)}
                  className="btn btn-sm btn-primary flex items-center gap-1 flex-shrink-0">
                  <Plus size={13} /> Add
                </button>
              )}
            </div>

            {filteredInventory.length === 0 ? (
              <div className="text-center py-10 text-text-muted text-sm">
                {inventory.length === 0 ? 'No items in inventory. Add your first item!' : 'No items match your search.'}
              </div>
            ) : (
              <>
                {/* Desktop/Tablet: Table */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-tertiary">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-text-muted uppercase">Item</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase">SKU</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-text-muted uppercase">Qty</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-text-muted uppercase">CBM</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase">Status</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-text-muted uppercase">Supplier</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredInventory.map(item => (
                        <tr key={item.id} className="hover:bg-bg-tertiary transition-colors cursor-pointer"
                          onClick={() => setDetailItem(item)}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-text-primary">{item.item_name}</div>
                            {item.category && <div className="text-xs text-text-muted">{item.category}</div>}
                          </td>
                          <td className="px-3 py-3 text-xs text-text-muted font-mono">{item.sku || '—'}</td>
                          <td className="px-3 py-3 text-right font-bold text-text-primary whitespace-nowrap">
                            {item.quantity} <span className="text-text-muted font-normal text-xs">{item.unit}</span>
                          </td>
                          <td className="px-3 py-3 text-right text-xs" style={{ color: '#60a5fa' }}>
                            {item.cbm_per_unit > 0 ? (item.quantity * item.cbm_per_unit).toFixed(2) : '—'}
                          </td>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            {canEditStatus ? (
                              <StatusDropdown item={item} userRole={userRole} onSet={quickSetStatus} activeJobs={activeJobs} onReserve={reserveForJO} />
                            ) : (
                              <StatusBadge status={item.status} />
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-text-muted truncate max-w-[120px]">{item.supplier || '—'}</td>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openEdit(item)}
                                className="p-1.5 rounded hover:bg-bg-elevated" title="Edit item">
                                <Edit2 size={13} className="text-text-muted" />
                              </button>
                              {(userRole === 'admin' || userRole === 'fleet_manager') && (
                                <button onClick={() => deleteItem(item.id)}
                                  className="p-1.5 rounded hover:bg-danger-bg" title="Delete item">
                                  <Trash2 size={13} className="text-danger" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-2">
                  {filteredInventory.map(item => (
                    <div key={item.id} className="bg-bg-secondary border border-border rounded-xl p-3"
                      onClick={() => setDetailItem(item)}>
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="font-heading text-sm font-semibold text-text-primary truncate">{item.item_name}</div>
                          <div className="flex gap-2 text-xs text-text-muted mt-0.5">
                            {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                            {item.category && <span>{item.category}</span>}
                          </div>
                        </div>
                        <StatusBadge status={item.status} small />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-3">
                          <span className="text-sm font-bold text-text-primary">{item.quantity} <span className="text-xs font-normal text-text-muted">{item.unit}</span></span>
                          {item.cbm_per_unit > 0 && (
                            <span className="text-xs" style={{ color: '#60a5fa' }}>{(item.quantity * item.cbm_per_unit).toFixed(2)} CBM</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {canEditStatus && (
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-bg-elevated">
                              <Edit2 size={13} className="text-text-muted" />
                            </button>
                          )}
                        </div>
                      </div>
                      {item.supplier && (
                        <div className="text-xs text-text-muted mt-1">Supplier: {item.supplier}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─────────────── MOVEMENTS TAB ─────────────── */}
        {tab === 'movements' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-text-muted uppercase">Movement Log</div>
              {canEditStatus && (
                <button onClick={() => setShowAddMovement(true)}
                  className="btn btn-sm btn-primary flex items-center gap-1">
                  <Plus size={12} /> Log Movement
                </button>
              )}
            </div>
            {movements.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">No movements recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const groups: Record<string, Movement[]> = {}
                  movements.forEach(mov => {
                    const key = mov.job_order_id || `solo-${mov.id}`
                    if (!groups[key]) groups[key] = []
                    groups[key].push(mov)
                  })
                  return Object.entries(groups).map(([key, items]) => {
                    const first = items[0]
                    const isOut = first.from_warehouse_id === id
                    const allCompleted = items.every(m => m.status === 'completed')
                    const anyInTransit = items.some(m => m.status === 'in_transit')
                    const overallStatus = allCompleted ? 'completed' : anyInTransit ? 'in_transit' : first.status
                    const statusColor = overallStatus === 'completed' ? 'text-success' : overallStatus === 'in_transit' ? 'text-warning' : overallStatus === 'cancelled' ? 'text-danger' : 'text-text-muted'
                    const totalCbm = items.reduce((s, m) => s + (parseFloat(String(m.cbm)) || 0), 0)
                    return (
                      <div key={key} className="bg-bg-secondary border border-border rounded-xl p-3.5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{isOut ? '📤' : '📥'}</span>
                            <div>
                              {first.job ? (
                                <div className="text-sm font-semibold text-text-primary">🚛 {first.job.job_number}</div>
                              ) : (
                                <div className="text-sm font-semibold text-text-primary capitalize">{first.movement_type} movement</div>
                              )}
                              {first.job?.client_name && <div className="text-xs text-text-muted">{first.job.client_name}</div>}
                            </div>
                          </div>
                          <span className={cn('text-xs font-semibold capitalize', statusColor)}>
                            {overallStatus?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                          <span>{first.from_wh?.name || 'External'}</span>
                          <ArrowRight size={11} />
                          <span>{first.to_wh?.name || 'External'}</span>
                          {totalCbm > 0 && <span className="ml-auto font-bold" style={{ color: '#60a5fa' }}>{totalCbm.toFixed(3)} CBM</span>}
                        </div>
                        <div className="space-y-1 border-t border-border pt-2">
                          {items.map(m => (
                            <div key={m.id} className="flex items-center justify-between text-xs">
                              <span className="text-text-secondary">{m.item_name}</span>
                              <div className="flex items-center gap-2 text-text-muted">
                                <span>×{m.quantity}</span>
                                {m.cbm && Number(m.cbm) > 0 && <span style={{ color: '#60a5fa' }}>{m.cbm} CBM</span>}
                                <span className={cn('capitalize font-medium',
                                  m.status === 'completed' ? 'text-success' : m.status === 'in_transit' ? 'text-warning' : 'text-text-muted')}>
                                  {m.status?.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border">
                          <span className="text-xs text-text-muted">
                            {formatDate(first.created_at)}{first.mover?.full_name && ` · ${first.mover.full_name}`}
                          </span>
                          {anyInTransit && canEditStatus && (
                            <button onClick={async () => {
                              const ids = items.filter(m => m.status === 'in_transit').map(m => m.id)
                              for (const mid of ids) {
                                await supabase.from('warehouse_movements').update({ status: 'completed' }).eq('id', mid)
                              }
                              setMovements(prev => prev.map(m => ids.includes(m.id) ? { ...m, status: 'completed' } : m))
                              toast.success('Delivery completed')
                            }} className="text-xs font-bold px-2 py-0.5 rounded"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                              ✓ Mark Complete
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─────────────────── ADD ITEM MODAL ─────────────────── */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">📦 Add Inventory Item</h2>
              <button onClick={() => { setShowAddItem(false); setItemForm({ ...EMPTY_ITEM_FORM }) }}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>✕</button>
            </div>
            <form onSubmit={handleAddItem} className="p-5 space-y-4">
              <div>
                <label className="form-label">Item Name *</label>
                <input className="form-input" placeholder="e.g. Split Type Aircon 1.5HP" required
                  value={itemForm.item_name} onChange={e => setItemForm(f => ({ ...f, item_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">SKU / Code</label>
                  <input className="form-input font-mono" placeholder="SKU-001" value={itemForm.sku}
                    onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <input className="form-input" placeholder="Appliances" value={itemForm.category}
                    onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Quantity *</label>
                  <input className="form-input" type="number" placeholder="0" required
                    value={itemForm.quantity} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <select className="form-input" value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}>
                    {['pcs', 'boxes', 'kg', 'sets', 'pallets', 'bags', 'rolls', 'liters'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">CBM per Unit</label>
                  <input className="form-input" type="number" step="0.001" placeholder="0.000"
                    value={itemForm.cbm_per_unit} onChange={e => setItemForm(f => ({ ...f, cbm_per_unit: e.target.value }))} />
                  {itemForm.quantity && itemForm.cbm_per_unit && (
                    <p className="text-xs text-info mt-1">Total: {(parseFloat(itemForm.quantity) * parseFloat(itemForm.cbm_per_unit)).toFixed(3)} CBM</p>
                  )}
                </div>
                <div>
                  <label className="form-label">Weight (kg)</label>
                  <input className="form-input" type="number" step="0.001" placeholder="0.000"
                    value={itemForm.weight_kg} onChange={e => setItemForm(f => ({ ...f, weight_kg: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Supplier</label>
                  <input className="form-input" placeholder="Supplier name" value={itemForm.supplier}
                    onChange={e => setItemForm(f => ({ ...f, supplier: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Batch Number</label>
                  <input className="form-input font-mono" placeholder="BATCH-001" value={itemForm.batch_number}
                    onChange={e => setItemForm(f => ({ ...f, batch_number: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Date Received</label>
                  <input className="form-input" type="date" value={itemForm.date_received}
                    onChange={e => setItemForm(f => ({ ...f, date_received: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={itemForm.status} onChange={e => setItemForm(f => ({ ...f, status: e.target.value }))}>
                    {INVENTORY_STATUSES.filter(s => canFullStatus || WM_UPDATABLE_STATUSES.includes(s.value)).map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={itemForm.notes}
                  onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => { setShowAddItem(false); setItemForm({ ...EMPTY_ITEM_FORM }) }} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────── EDIT ITEM MODAL ─────────────────── */}
      {editItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">✏️ Edit Item</h2>
              <button onClick={() => setEditItem(null)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="form-label">Item Name *</label>
                <input className="form-input" required
                  value={editForm.item_name} onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">SKU / Code</label>
                  <input className="form-input font-mono" value={editForm.sku}
                    onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <input className="form-input" value={editForm.category}
                    onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Quantity</label>
                  <input className="form-input" type="number"
                    value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <select className="form-input" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}>
                    {['pcs', 'boxes', 'kg', 'sets', 'pallets', 'bags', 'rolls', 'liters'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">CBM per Unit</label>
                  <input className="form-input" type="number" step="0.001"
                    value={editForm.cbm_per_unit} onChange={e => setEditForm(f => ({ ...f, cbm_per_unit: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Weight (kg)</label>
                  <input className="form-input" type="number" step="0.001"
                    value={editForm.weight_kg} onChange={e => setEditForm(f => ({ ...f, weight_kg: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Supplier</label>
                  <input className="form-input" value={editForm.supplier}
                    onChange={e => setEditForm(f => ({ ...f, supplier: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Batch Number</label>
                  <input className="form-input font-mono" value={editForm.batch_number}
                    onChange={e => setEditForm(f => ({ ...f, batch_number: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Date Received</label>
                  <input className="form-input" type="date" value={editForm.date_received}
                    onChange={e => setEditForm(f => ({ ...f, date_received: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {INVENTORY_STATUSES.filter(s => canFullStatus || WM_UPDATABLE_STATUSES.includes(s.value)).map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {activeJobs.length > 0 && (
                <div>
                  <label className="form-label">Reserve for Job Order</label>
                  <select className="form-input" value={editForm.status === 'reserved' ? (editItem.job_order_id || '') : ''}
                    onChange={e => {
                      if (e.target.value) {
                        setEditForm(f => ({ ...f, status: 'reserved' }))
                        setEditItem(prev => prev ? { ...prev, job_order_id: e.target.value } : null)
                      }
                    }}>
                    <option value="">— No JO link —</option>
                    {activeJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} · {j.client_name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => setEditItem(null)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────── ITEM DETAIL MODAL ─────────────────── */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setDetailItem(null)}>
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[85vh] overflow-y-auto scrollbar-hide"
            onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <div>
                <h2 className="font-heading text-base font-bold">{detailItem.item_name}</h2>
                {detailItem.sku && <p className="text-xs text-text-muted font-mono">SKU: {detailItem.sku}</p>}
              </div>
              <button onClick={() => setDetailItem(null)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Status & quick actions */}
              <div className="flex items-center justify-between">
                <StatusBadge status={detailItem.status} />
                {canEditStatus && (
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {INVENTORY_STATUSES
                      .filter(s => s.value !== detailItem.status && (canFullStatus || WM_UPDATABLE_STATUSES.includes(s.value)))
                      .slice(0, 3)
                      .map(s => (
                        <button key={s.value} onClick={() => quickSetStatus(detailItem, s.value)}
                          className="text-xs px-2 py-1 rounded-full font-semibold"
                          style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                          → {s.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Quantity', value: `${detailItem.quantity} ${detailItem.unit}` },
                  { label: 'CBM Total', value: detailItem.cbm_per_unit > 0 ? `${(detailItem.quantity * detailItem.cbm_per_unit).toFixed(3)} CBM` : '—' },
                  { label: 'Weight', value: detailItem.weight_kg ? `${detailItem.weight_kg} kg` : '—' },
                  { label: 'Category', value: detailItem.category || '—' },
                  { label: 'Supplier', value: detailItem.supplier || '—' },
                  { label: 'Batch #', value: detailItem.batch_number || '—' },
                  { label: 'Received', value: detailItem.date_received ? formatDate(detailItem.date_received) : '—' },
                  { label: 'Last Updated', value: detailItem.last_updated ? formatDate(detailItem.last_updated) : '—' },
                ].map(row => (
                  <div key={row.label} className="bg-bg-tertiary rounded-lg p-2.5">
                    <div className="text-xs text-text-muted mb-0.5">{row.label}</div>
                    <div className="text-sm font-semibold text-text-primary">{row.value}</div>
                  </div>
                ))}
              </div>

              {detailItem.notes && (
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <div className="text-xs text-text-muted mb-1">Notes</div>
                  <p className="text-sm text-text-secondary">{detailItem.notes}</p>
                </div>
              )}

              {/* Reserve for JO */}
              {canEditStatus && activeJobs.length > 0 && detailItem.status !== 'delivered' && detailItem.status !== 'cancelled' && (
                <div>
                  <label className="form-label">Reserve for Job Order</label>
                  <select className="form-input"
                    value={detailItem.job_order_id || ''}
                    onChange={e => { if (e.target.value) reserveForJO(detailItem, e.target.value) }}>
                    <option value="">— Select JO to reserve —</option>
                    {activeJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} · {j.client_name}</option>)}
                  </select>
                </div>
              )}

              {/* Movement history */}
              <div>
                <div className="text-xs font-bold text-text-muted uppercase mb-2">Movement History</div>
                {itemMovements.length === 0 ? (
                  <p className="text-xs text-text-muted py-2">No movements for this item yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {itemMovements.map(m => {
                      const isOut = m.from_warehouse_id === id
                      const statusColor = m.status === 'completed' ? 'text-success' : m.status === 'in_transit' ? 'text-warning' : 'text-text-muted'
                      return (
                        <div key={m.id} className="flex items-start gap-2.5 bg-bg-tertiary rounded-lg px-3 py-2">
                          <span className="text-sm flex-shrink-0">{isOut ? '📤' : '📥'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-text-primary capitalize">
                                {m.movement_type}{m.job ? ` · ${m.job.job_number}` : ''}
                              </span>
                              <span className={cn('text-xs font-semibold capitalize flex-shrink-0', statusColor)}>
                                {m.status?.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-text-muted mt-0.5">
                              <span>{m.from_wh?.name || 'External'}</span>
                              <ArrowRight size={10} />
                              <span>{m.to_wh?.name || 'External'}</span>
                              <span className="ml-auto">×{m.quantity}</span>
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">{formatDate(m.created_at)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Edit button */}
              {canEditStatus && (
                <button onClick={() => { setDetailItem(null); openEdit(detailItem) }}
                  className="btn btn-secondary w-full flex items-center justify-center gap-2">
                  <Edit2 size={14} /> Edit Item Details
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── LOG MOVEMENT MODAL ─────────────────── */}
      {showAddMovement && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[85vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">🔄 Log Movement</h2>
              <button onClick={() => setShowAddMovement(false)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>✕</button>
            </div>
            <form onSubmit={handleAddMovement} className="p-5 space-y-4">
              <div>
                <label className="form-label">Movement Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'outbound', label: '📤 Outbound', desc: 'Leaving this warehouse' },
                    { value: 'inbound', label: '📥 Inbound', desc: 'Arriving here' },
                    { value: 'transfer', label: '🔄 Transfer', desc: 'To another warehouse' },
                    { value: 'return', label: '↩️ Return', desc: 'Returned item' },
                  ].map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setMovForm(f => ({ ...f, movement_type: t.value }))}
                      className={cn('p-2.5 rounded-lg border text-left transition-all',
                        movForm.movement_type === t.value ? 'border-brand bg-bg-elevated' : 'border-border bg-bg-tertiary')}>
                      <div className="text-xs font-bold text-text-primary">{t.label}</div>
                      <div className="text-xs text-text-muted mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {(movForm.movement_type === 'outbound' || movForm.movement_type === 'transfer') && allWarehouses.length > 0 && (
                <div>
                  <label className="form-label">Destination Warehouse</label>
                  <select className="form-input" value={movForm.to_warehouse_id} onChange={e => setMovForm(f => ({ ...f, to_warehouse_id: e.target.value }))}>
                    <option value="">— Select destination —</option>
                    {allWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="form-label">Item *</label>
                <select className="form-input" value={movForm.item_name} onChange={e => setMovForm(f => ({ ...f, item_name: e.target.value }))} required>
                  <option value="">— Select item —</option>
                  {inventory.map(i => <option key={i.id} value={i.item_name}>{i.item_name} (Stock: {i.quantity} {i.unit})</option>)}
                  <option value="__custom">Other (type below)</option>
                </select>
                {movForm.item_name === '__custom' && (
                  <input className="form-input mt-2" placeholder="Item name" onChange={e => setMovForm(f => ({ ...f, item_name: e.target.value }))} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Quantity *</label>
                  <input className="form-input" type="number" placeholder="0" required
                    value={movForm.quantity} onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">CBM</label>
                  <input className="form-input" type="number" step="0.01" placeholder="0.00"
                    value={movForm.cbm} onChange={e => setMovForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="form-label">Link to Job Order (optional)</label>
                <select className="form-input" value={movForm.job_order_id} onChange={e => setMovForm(f => ({ ...f, job_order_id: e.target.value }))}>
                  <option value="">— Select job order —</option>
                  {activeJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} · {j.client_name}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={movForm.notes}
                  onChange={e => setMovForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => setShowAddMovement(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : '🔄 Log Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status Dropdown Component ────────────────────────────────────────────────

function StatusDropdown({ item, userRole, onSet, activeJobs, onReserve }: {
  item: InventoryItem
  userRole: string | null
  onSet: (item: InventoryItem, status: string) => void
  activeJobs: any[]
  onReserve: (item: InventoryItem, joId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const canFull = userRole === 'admin' || userRole === 'fleet_manager'
  const current = INVENTORY_STATUSES.find(s => s.value === item.status) || INVENTORY_STATUSES[0]

  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2 py-1"
        style={{ color: current.color, background: current.bg, border: `1px solid ${current.border}` }}>
        {current.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-bg-secondary border border-border rounded-xl shadow-xl min-w-[140px] py-1 overflow-hidden">
            {INVENTORY_STATUSES
              .filter(s => s.value !== item.status && (canFull || WM_UPDATABLE_STATUSES.includes(s.value)))
              .map(s => (
                <button key={s.value}
                  onClick={e => { e.stopPropagation(); onSet(item, s.value); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-bg-tertiary transition-colors"
                  style={{ color: s.color }}>
                  {s.label}
                </button>
              ))}
            {activeJobs.length > 0 && item.status !== 'reserved' && (
              <>
                <div className="h-px bg-border mx-2 my-1" />
                <div className="px-3 py-1 text-[10px] text-text-muted uppercase font-bold">Reserve for JO</div>
                {activeJobs.slice(0, 5).map(j => (
                  <button key={j.id}
                    onClick={e => { e.stopPropagation(); onReserve(item, j.id); setOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary transition-colors truncate">
                    {j.job_number}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
