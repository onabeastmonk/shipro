'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { ChevronLeft, Plus, Package, ArrowRight, ArrowLeft, TrendingUp, MapPin, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [warehouse, setWarehouse] = useState<any>(null)
  const [inventory, setInventory] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [allWarehouses, setAllWarehouses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'inventory' | 'movements'>('inventory')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddMovement, setShowAddMovement] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [itemForm, setItemForm] = useState({
    item_name: '', sku: '', quantity: '', unit: 'pcs',
    cbm_per_unit: '', category: '', notes: '',
  })

  const [movForm, setMovForm] = useState({
    movement_type: 'outbound',
    to_warehouse_id: '',
    item_name: '', quantity: '', cbm: '',
    job_order_id: '', notes: '',
  })

  const [activeJobs, setActiveJobs] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const [whRes, invRes, movRes, allWhRes, jobsRes] = await Promise.all([
        supabase.from('warehouses').select('*').eq('id', id).single(),
        supabase.from('warehouse_inventory').select('*').eq('warehouse_id', id).order('item_name'),
        supabase.from('warehouse_movements')
          .select('*, from_wh:warehouses!from_warehouse_id(name), to_wh:warehouses!to_warehouse_id(name), job:job_orders(job_number, client_name), mover:profiles!moved_by(full_name)')
          .or(`from_warehouse_id.eq.${id},to_warehouse_id.eq.${id}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('warehouses').select('id, name').eq('status', 'active').neq('id', id),
        supabase.from('job_orders').select('id, job_number, client_name').in('status', ['assigned', 'accepted', 'at_pickup', 'loaded']).order('created_at', { ascending: false }).limit(20),
      ])

      setWarehouse(whRes.data)
      setInventory(invRes.data || [])
      setMovements(movRes.data || [])
      setAllWarehouses(allWhRes.data || [])
      setActiveJobs(jobsRes.data || [])
      setLoading(false)
    }
    load()
  }, [id, router])

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
        })
        if (error) throw error
        toast.success('Item added to inventory!')
      }
      setShowAddItem(false)
      setItemForm({ item_name: '', sku: '', quantity: '', unit: 'pcs', cbm_per_unit: '', category: '', notes: '' })
      const { data } = await supabase.from('warehouse_inventory').select('*').eq('warehouse_id', id).order('item_name')
      setInventory(data || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!movForm.item_name || !movForm.quantity) { toast.error('Item and quantity required'); return }
    setSaving(true)
    try {
      const isOutbound = movForm.movement_type === 'outbound' || movForm.movement_type === 'transfer'
      const isInbound = movForm.movement_type === 'inbound'

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

      // Update inventory quantity
      const invItem = inventory.find(i => i.item_name.toLowerCase() === movForm.item_name.toLowerCase())
      if (invItem) {
        const qty = parseInt(movForm.quantity)
        const newQty = isOutbound ? Math.max(0, invItem.quantity - qty) : invItem.quantity + qty
        await supabase.from('warehouse_inventory').update({ quantity: newQty, last_updated: new Date().toISOString() }).eq('id', invItem.id)
      }

      toast.success('Movement logged!')
      setShowAddMovement(false)
      setMovForm({ movement_type: 'outbound', to_warehouse_id: '', item_name: '', quantity: '', cbm: '', job_order_id: '', notes: '' })

      const [invRes, movRes] = await Promise.all([
        supabase.from('warehouse_inventory').select('*').eq('warehouse_id', id).order('item_name'),
        supabase.from('warehouse_movements')
          .select('*, from_wh:warehouses!from_warehouse_id(name), to_wh:warehouses!to_warehouse_id(name), job:job_orders(job_number, client_name), mover:profiles!moved_by(full_name)')
          .or(`from_warehouse_id.eq.${id},to_warehouse_id.eq.${id}`)
          .order('created_at', { ascending: false }).limit(50),
      ])
      setInventory(invRes.data || [])
      setMovements(movRes.data || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Remove this item from inventory?')) return
    await supabase.from('warehouse_inventory').delete().eq('id', itemId)
    setInventory(prev => prev.filter(i => i.id !== itemId))
    toast.success('Item removed')
  }

  if (loading) return <div className="p-4 space-y-3">{Array(5).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
  if (!warehouse) return <div className="text-center p-8 text-text-muted">Warehouse not found</div>

  const totalCBM = inventory.reduce((s, i) => s + (i.quantity * i.cbm_per_unit || 0), 0)
  const totalItems = inventory.reduce((s, i) => s + i.quantity, 0)
  const inTransitCount = movements.filter(m => m.status === 'in_transit').length

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href="/warehouse" className="p-1.5 rounded-md hover:bg-bg-tertiary">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="flex-1">
          <div className="text-xs text-text-muted">{warehouse.type?.toUpperCase()}</div>
          <h1 className="font-heading text-sm font-semibold">{warehouse.name}</h1>
        </div>
        {warehouse.lat && warehouse.lng && (
          <a href={`https://maps.google.com/?q=${warehouse.lat},${warehouse.lng}`} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-md hover:bg-bg-tertiary">
            <MapPin size={18} className="text-info" />
          </a>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Address & Contact */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-start gap-2 mb-2">
            <MapPin size={14} className="text-text-muted flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">{warehouse.address}</p>
          </div>
          {warehouse.contact_person && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">👤 {warehouse.contact_person} {warehouse.contact_number && `· ${warehouse.contact_number}`}</span>
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
            <div className="font-heading text-xl font-bold text-text-primary">{inventory.length}</div>
            <div className="text-xs text-text-muted">SKUs</div>
          </div>
          <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
            <div className="font-heading text-xl font-bold text-success">{totalItems}</div>
            <div className="text-xs text-text-muted">Total Units</div>
          </div>
          <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
            <div className="font-heading text-xl font-bold" style={{ color: '#60a5fa' }}>{totalCBM.toFixed(1)}</div>
            <div className="text-xs text-text-muted">CBM</div>
          </div>
        </div>

        {inTransitCount > 0 && (
          <div className="bg-warning-bg border border-warning-border rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-warning font-semibold">🚛 {inTransitCount} shipment{inTransitCount > 1 ? 's' : ''} in transit</span>
            <button onClick={() => setTab('movements')} className="text-xs text-warning underline">View →</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {(['inventory', 'movements'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all',
                tab === t ? 'bg-brand text-bg-primary' : 'bg-bg-secondary border border-border text-text-secondary')}>
              {t === 'inventory' ? `📦 Inventory (${inventory.length})` : `🔄 Movements (${movements.length})`}
            </button>
          ))}
        </div>

        {/* Inventory Tab */}
        {tab === 'inventory' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-text-muted uppercase">Stock List</div>
              <button onClick={() => setShowAddItem(true)}
                className="btn btn-sm btn-primary flex items-center gap-1">
                <Plus size={12} /> Add Item
              </button>
            </div>
            {inventory.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">No items in inventory. Add your first item!</div>
            ) : (
              <div className="space-y-2">
                {inventory.map(item => (
                  <div key={item.id} className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-heading text-sm font-semibold text-text-primary">{item.item_name}</div>
                      <div className="flex gap-3 mt-0.5">
                        {item.sku && <span className="text-xs text-text-muted">SKU: {item.sku}</span>}
                        {item.category && <span className="text-xs text-text-muted">{item.category}</span>}
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs font-bold text-text-primary">{item.quantity} {item.unit}</span>
                        {item.cbm_per_unit > 0 && (
                          <span className="text-xs" style={{ color: '#60a5fa' }}>
                            {(item.quantity * item.cbm_per_unit).toFixed(2)} CBM
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <div className={cn('text-xs px-2 py-1 rounded-full font-bold',
                        item.quantity === 0 ? 'bg-danger-bg text-danger' :
                        item.quantity < 5 ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success')}>
                        {item.quantity === 0 ? 'Empty' : item.quantity < 5 ? 'Low' : 'OK'}
                      </div>
                      <button onClick={() => deleteItem(item.id)} className="p-1 rounded hover:bg-danger-bg">
                        <Trash2 size={13} className="text-danger" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Movements Tab */}
        {tab === 'movements' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-text-muted uppercase">Movement Log</div>
              <button onClick={() => setShowAddMovement(true)}
                className="btn btn-sm btn-primary flex items-center gap-1">
                <Plus size={12} /> Log Movement
              </button>
            </div>
            {movements.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">No movements recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {movements.map(mov => {
                  const isOut = mov.from_warehouse_id === id
                  const statusColor = mov.status === 'completed' ? 'text-success' : mov.status === 'in_transit' ? 'text-warning' : mov.status === 'cancelled' ? 'text-danger' : 'text-text-muted'
                  return (
                    <div key={mov.id} className="bg-bg-secondary border border-border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{isOut ? '📤' : '📥'}</span>
                          <div>
                            <span className="text-sm font-semibold text-text-primary">{mov.item_name}</span>
                            <span className="text-xs text-text-muted ml-2">×{mov.quantity}</span>
                            {mov.cbm && <span className="text-xs ml-2" style={{ color: '#60a5fa' }}>{mov.cbm} CBM</span>}
                          </div>
                        </div>
                        <span className={`text-xs font-semibold capitalize ${statusColor}`}>{mov.status?.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>{mov.from_wh?.name || 'External'}</span>
                        <ArrowRight size={11} />
                        <span>{mov.to_wh?.name || 'External'}</span>
                      </div>
                      {mov.job && <div className="text-xs text-text-muted mt-0.5">🚛 {mov.job.job_number} · {mov.job.client_name}</div>}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-text-muted">{formatDate(mov.created_at)} {mov.mover?.full_name && `· ${mov.mover.full_name}`}</span>
                        {mov.status === 'in_transit' && (
                          <button onClick={async () => {
                            await supabase.from('warehouse_movements').update({ status: 'completed' }).eq('id', mov.id)
                            setMovements(prev => prev.map(m => m.id === mov.id ? { ...m, status: 'completed' } : m))
                            toast.success('Marked as completed')
                          }} className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                            ✓ Complete
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[85vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">📦 Add Inventory Item</h2>
              <button onClick={() => setShowAddItem(false)}
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
                  <input className="form-input" placeholder="SKU-001" value={itemForm.sku}
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
                    <option value="pcs">pcs</option>
                    <option value="boxes">boxes</option>
                    <option value="kg">kg</option>
                    <option value="sets">sets</option>
                    <option value="pallets">pallets</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">CBM per Unit</label>
                <input className="form-input" type="number" step="0.001" placeholder="0.000"
                  value={itemForm.cbm_per_unit} onChange={e => setItemForm(f => ({ ...f, cbm_per_unit: e.target.value }))} />
                {itemForm.quantity && itemForm.cbm_per_unit && (
                  <p className="text-xs text-info mt-1">Total CBM: {(parseFloat(itemForm.quantity) * parseFloat(itemForm.cbm_per_unit)).toFixed(3)}</p>
                )}
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={itemForm.notes}
                  onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pb-4">
                <button type="button" onClick={() => setShowAddItem(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Movement Modal */}
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
