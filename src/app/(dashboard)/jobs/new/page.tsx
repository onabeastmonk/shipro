'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { createJobOrder } from '@/lib/api'
import { TRUCK_TYPE_LABELS, type TruckType, type ShipmentItemForm } from '@/types'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const TRUCK_TYPES = Object.entries(TRUCK_TYPE_LABELS) as [TruckType, string][]

export default function NewJobPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ShipmentItemForm[]>([])
  const [form, setForm] = useState({
    pickup_location: '',
    dropoff_location: '',
    client_name: '',
    contact_person: '',
    contact_number: '',
    shipment_category: 'appliances' as const,
    goods_description: '',
    total_cbm: '',
    estimated_weight_kg: '',
    required_truck_type: '' as TruckType | '',
    delivery_date: '',
    delivery_time: '',
    special_instructions: '',
    base_rate: '',
    other_charges: '',
    status: 'draft' as const,
    remarks: '',
    origin_warehouse_id: '',
    destination_warehouse_id: '',
    rate_per_cbm: '',
    pricing_mode: 'fixed',
  })
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [warehouseInventory, setWarehouseInventory] = useState<any[]>([])
  const [showInventoryPicker, setShowInventoryPicker] = useState(false)
  const [pickerQtys, setPickerQtys] = useState<Record<string, number>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
    supabase.from('warehouses').select('id, name, address').then(({ data }) => setWarehouses(data || []))
  }, [router])

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function addItem() {
    setItems(prev => [...prev, {
      item_name: '', quantity: 1, cbm_per_item: 0,
      is_fragile: false, requires_special_handling: false, remarks: '',
    }])
  }

  function updateItem(i: number, key: string, value: string | number | boolean) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: value } : item))
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.pickup_location || !form.dropoff_location || !form.client_name || !form.delivery_date) {
      toast.error('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Auto-calculate total CBM from items if not manually set
      const computedCBM = totalCBM > 0 ? totalCBM : (form.total_cbm ? parseFloat(form.total_cbm) : 0)
      const computedRate = form.pricing_mode === 'per_cbm' && form.rate_per_cbm
        ? parseFloat(form.rate_per_cbm) * computedCBM
        : form.base_rate ? parseFloat(form.base_rate) : 0

      const jobData = {
        ...form,
        total_cbm: computedCBM || undefined,
        estimated_weight_kg: form.estimated_weight_kg ? parseFloat(form.estimated_weight_kg) : undefined,
        base_rate: form.pricing_mode !== 'per_cbm' && form.base_rate ? parseFloat(form.base_rate) : undefined,
        rate_per_cbm: form.pricing_mode === 'per_cbm' && form.rate_per_cbm ? parseFloat(form.rate_per_cbm) : undefined,
        total_rate: computedRate || undefined,
        other_charges: form.other_charges ? parseFloat(form.other_charges) : undefined,
        required_truck_type: (form.required_truck_type || undefined) as TruckType | undefined,
        required_truck_type_label: form.required_truck_type ? TRUCK_TYPE_LABELS[form.required_truck_type as TruckType] : undefined,
        shipment_items: items.filter(i => i.item_name.trim()),
      }

      const job = await createJobOrder(jobData as any, session.user.id)

      // Auto-log warehouse movements for inventory items
      const inventoryItems = items.filter((i: any) => i.from_inventory && i.inventory_id)
      if (inventoryItems.length > 0 && form.origin_warehouse_id) {
        for (const item of inventoryItems as any[]) {
          // Log movement as pending (will be completed when job is delivered)
          await supabase.from('warehouse_movements').insert({
            job_order_id: job.id,
            from_warehouse_id: form.origin_warehouse_id,
            to_warehouse_id: form.destination_warehouse_id || null,
            item_name: item.item_name,
            quantity: item.quantity,
            cbm: (item.cbm_per_item || 0) * item.quantity,
            movement_type: form.destination_warehouse_id ? 'transfer' : 'outbound',
            status: 'pending',
            moved_by: session.user.id,
          })
          // Reserve stock — reduce available quantity
          const { data: inv } = await supabase.from('warehouse_inventory').select('quantity').eq('id', item.inventory_id).single()
          if (inv) {
            await supabase.from('warehouse_inventory').update({
              quantity: Math.max(0, inv.quantity - item.quantity),
              last_updated: new Date().toISOString(),
            }).eq('id', item.inventory_id)
          }
        }
        toast.success(`Job order ${job.job_number} created! ${inventoryItems.length} item(s) reserved from warehouse.`)
      } else {
        toast.success(`Job order ${job.job_number} created!`)
      }
      router.push(`/jobs/${job.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create job order')
    } finally {
      setLoading(false)
    }
  }

  const totalCBM = items.reduce((sum, item) => sum + (item.cbm_per_item || 0) * item.quantity, 0)
  const totalRate = (parseFloat(form.base_rate || '0') + parseFloat(form.other_charges || '0'))

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href="/jobs" className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-base font-semibold">New Job Order</h1>
        </div>
        <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-1 rounded font-mono">
          Auto-generated
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* ROUTE */}
        <Section title="DELIVERY ROUTE">
          {/* Origin Warehouse */}
          <FormGroup label="Origin Warehouse (optional)">
            <select className="form-input mb-2" value={form.origin_warehouse_id}
              onChange={e => {
                const wh = warehouses.find((w: any) => w.id === e.target.value)
                update('origin_warehouse_id', e.target.value)
                if (wh) update('pickup_location', wh.address)
                // Load inventory for this warehouse
                if (e.target.value) {
                  supabase.from('warehouse_inventory').select('*').eq('warehouse_id', e.target.value).gt('quantity', 0).then(({ data }) => setWarehouseInventory(data || []))
                } else {
                  setWarehouseInventory([])
                }
              }}>
              <option value="">— Select warehouse or type manually below —</option>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>🏭 {w.name}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Pickup Location *">
            <input className="form-input" placeholder="e.g. Pasig Warehouse, Ortigas Ave."
              value={form.pickup_location} onChange={e => update('pickup_location', e.target.value)} required />
          </FormGroup>

          {/* Destination Warehouse */}
          <FormGroup label="Destination Warehouse (optional)">
            <select className="form-input mb-2" value={form.destination_warehouse_id}
              onChange={e => {
                const wh = warehouses.find((w: any) => w.id === e.target.value)
                update('destination_warehouse_id', e.target.value)
                if (wh) update('dropoff_location', wh.address)
              }}>
              <option value="">— Select warehouse or type manually below —</option>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>🏭 {w.name}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Drop-off Location *">
            <input className="form-input" placeholder="e.g. SM Makati, Ayala Avenue"
              value={form.dropoff_location} onChange={e => update('dropoff_location', e.target.value)} required />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Delivery Date *">
              <input className="form-input" type="date"
                value={form.delivery_date} onChange={e => update('delivery_date', e.target.value)} required />
            </FormGroup>
            <FormGroup label="Delivery Time">
              <input className="form-input" type="time"
                value={form.delivery_time} onChange={e => update('delivery_time', e.target.value)} />
            </FormGroup>
          </div>
        </Section>

        {/* CLIENT */}
        <Section title="CLIENT INFORMATION">
          <FormGroup label="Client / Consignee Name *">
            <input className="form-input" placeholder="Full name or company"
              value={form.client_name} onChange={e => update('client_name', e.target.value)} required />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Contact Person *">
              <input className="form-input" placeholder="Name"
                value={form.contact_person} onChange={e => update('contact_person', e.target.value)} required />
            </FormGroup>
            <FormGroup label="Contact Number *">
              <input className="form-input" type="tel" placeholder="+63 9XX XXX XXXX"
                value={form.contact_number} onChange={e => update('contact_number', e.target.value)} required />
            </FormGroup>
          </div>
        </Section>

        {/* SHIPMENT */}
        <Section title="SHIPMENT DETAILS">
          <FormGroup label="Shipment Category">
            <select className="form-input" value={form.shipment_category} onChange={e => update('shipment_category', e.target.value)}>
              <option value="appliances">Appliances</option>
              <option value="electronics">Electronics</option>
              <option value="furniture">Furniture</option>
              <option value="general_cargo">General Cargo</option>
              <option value="others">Others</option>
            </select>
          </FormGroup>
          <FormGroup label="Description of Goods">
            <textarea className="form-input" rows={3} placeholder="e.g. 2 units refrigerator, 1 unit washing machine..."
              value={form.goods_description} onChange={e => update('goods_description', e.target.value)} />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Total CBM">
              <input className="form-input" type="number" step="0.01" placeholder="0.00"
                value={form.total_cbm} onChange={e => update('total_cbm', e.target.value)} />
            </FormGroup>
            <FormGroup label="Est. Weight (kg)">
              <input className="form-input" type="number" placeholder="Optional"
                value={form.estimated_weight_kg} onChange={e => update('estimated_weight_kg', e.target.value)} />
            </FormGroup>
          </div>

          {/* Shipment Items Table */}
          <div className="bg-bg-tertiary border border-border rounded-md p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Shipment Items {items.length > 0 && `(${items.length})`}
              </span>
              <div className="flex gap-2">
                {warehouseInventory.length > 0 && (
                  <button type="button" onClick={() => setShowInventoryPicker(true)}
                    className="btn btn-sm flex items-center gap-1"
                    style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid #60a5fa', color: '#60a5fa' }}>
                    🏭 From Warehouse
                  </button>
                )}
                <button type="button" onClick={addItem} className="btn btn-sm btn-secondary flex items-center gap-1">
                  <Plus size={12} /> Add Manual
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center text-text-muted text-xs py-4">
                {form.origin_warehouse_id ? 'Click "🏭 From Warehouse" to select items from inventory' : 'Select an origin warehouse above or click "+ Add Manual"'}
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-text-primary">{item.item_name}</div>
                        {(item as any).from_inventory && (
                          <div className="text-xs" style={{ color: '#60a5fa' }}>🏭 From warehouse inventory</div>
                        )}
                      </div>
                      <button type="button" onClick={() => removeItem(i)}
                        className="p-1 rounded hover:bg-danger-bg ml-2">
                        <Trash2 size={13} className="text-danger" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <input className="form-input text-xs col-span-2" placeholder="Item name"
                        value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)} />
                      <div className="bg-bg-tertiary rounded-md flex items-center justify-center text-xs font-bold text-info px-2">
                        {((item.cbm_per_item || 0) * item.quantity).toFixed(3)} CBM
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div>
                        <div className="text-xs text-text-muted mb-1">Quantity</div>
                        <input className="form-input text-xs" type="number" min="1"
                          max={(item as any).max_quantity || undefined}
                          value={item.quantity}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 1
                            const max = (item as any).max_quantity
                            if (max && val > max) { toast.error(`Only ${max} units available in warehouse`); return }
                            updateItem(i, 'quantity', val)
                          }} />
                        {(item as any).max_quantity && (
                          <div className="text-xs text-text-muted mt-0.5">Max: {(item as any).max_quantity}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-text-muted mb-1">CBM/unit</div>
                        <input className="form-input text-xs" type="number" step="0.001"
                          value={item.cbm_per_item || ''}
                          readOnly={(item as any).from_inventory}
                          style={(item as any).from_inventory ? { opacity: 0.7 } : {}}
                          onChange={e => updateItem(i, 'cbm_per_item', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div>
                        <div className="text-xs text-text-muted mb-1">Unit</div>
                        <input className="form-input text-xs" placeholder="pcs"
                          value={(item as any).unit || 'pcs'}
                          onChange={e => updateItem(i, 'unit', e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                          <input type="checkbox" checked={item.is_fragile}
                            onChange={e => updateItem(i, 'is_fragile', e.target.checked)} />
                          Fragile
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                          <input type="checkbox" checked={item.requires_special_handling}
                            onChange={e => updateItem(i, 'requires_special_handling', e.target.checked)} />
                          Special Handling
                        </label>
                      </div>
                      <button type="button" onClick={() => removeItem(i)} className="text-danger/70 hover:text-danger transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {items.length > 0 && (
                  <div className="text-xs text-text-muted text-right pt-1">
                    Total CBM from items: <strong className="text-text-primary">{totalCBM.toFixed(3)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* TRUCK */}
        <Section title="TRUCK REQUIREMENTS">
          <FormGroup label="Required Truck Type">
            <select className="form-input" value={form.required_truck_type} onChange={e => update('required_truck_type', e.target.value)}>
              <option value="">— Select truck type —</option>
              {TRUCK_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FormGroup>
        </Section>

        {/* RATES */}
        <Section title="RATES & FEES">
          {/* Pricing mode toggle */}
          <div className="grid grid-cols-2 gap-2 mb-1">
            <button type="button"
              onClick={() => update('pricing_mode', 'fixed')}
              className="p-2.5 rounded-lg border text-left transition-all"
              style={{
                border: form.pricing_mode !== 'per_cbm' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                background: form.pricing_mode !== 'per_cbm' ? 'rgba(96,165,250,0.1)' : 'transparent',
              }}>
              <div className="text-xs font-bold" style={{ color: form.pricing_mode !== 'per_cbm' ? '#60a5fa' : '#a0a0a0' }}>Fixed Rate</div>
              <div className="text-xs text-text-muted mt-0.5">Flat amount</div>
            </button>
            <button type="button"
              onClick={() => update('pricing_mode', 'per_cbm')}
              className="p-2.5 rounded-lg border text-left transition-all"
              style={{
                border: form.pricing_mode === 'per_cbm' ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
                background: form.pricing_mode === 'per_cbm' ? 'rgba(34,197,94,0.1)' : 'transparent',
              }}>
              <div className="text-xs font-bold" style={{ color: form.pricing_mode === 'per_cbm' ? '#22c55e' : '#a0a0a0' }}>Per CBM</div>
              <div className="text-xs text-text-muted mt-0.5">Rate × CBM loaded</div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {form.pricing_mode === 'per_cbm' ? (
              <FormGroup label="Rate per CBM (₱/CBM)">
                <input className="form-input" type="number" step="0.01" placeholder="e.g. 500"
                  value={form.rate_per_cbm} onChange={e => update('rate_per_cbm', e.target.value)} />
              </FormGroup>
            ) : (
              <FormGroup label="Base Rate (₱)">
                <input className="form-input" type="number" step="0.01" placeholder="0.00"
                  value={form.base_rate} onChange={e => update('base_rate', e.target.value)} />
              </FormGroup>
            )}
            <FormGroup label="Other Charges (₱)">
              <input className="form-input" type="number" step="0.01" placeholder="0.00"
                value={form.other_charges} onChange={e => update('other_charges', e.target.value)} />
            </FormGroup>
          </div>

          {form.pricing_mode === 'per_cbm' && form.rate_per_cbm && totalCBM > 0 && (
            <div className="bg-success-bg border border-success-border rounded-md p-3 text-xs">
              <div className="text-success font-semibold mb-1">💰 Estimated Pay</div>
              <div className="text-text-secondary">
                ₱{parseFloat(form.rate_per_cbm).toLocaleString()} × {totalCBM.toFixed(3)} CBM = <strong className="text-text-primary">₱{(parseFloat(form.rate_per_cbm) * totalCBM).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="text-text-muted mt-0.5">Final pay depends on actual CBM loaded</div>
            </div>
          )}

          {totalRate > 0 && form.pricing_mode !== 'per_cbm' && (
            <div className="bg-bg-tertiary rounded-md p-3 text-center">
              <div className="text-xs text-text-muted mb-1">ESTIMATED TOTAL</div>
              <div className="font-heading text-xl font-bold text-text-primary">
                ₱{totalRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
        </Section>

        {/* MISC */}
        <Section title="ADDITIONAL INFO">
          <FormGroup label="Special Instructions">
            <textarea className="form-input" rows={3} placeholder="Handle with care, fragile items, delivery time window, etc."
              value={form.special_instructions} onChange={e => update('special_instructions', e.target.value)} />
          </FormGroup>
          <FormGroup label="Remarks">
            <textarea className="form-input" rows={2} placeholder="Internal notes..."
              value={form.remarks} onChange={e => update('remarks', e.target.value)} />
          </FormGroup>
          <FormGroup label="Initial Status">
            <select className="form-input" value={form.status} onChange={e => update('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="posted">Posted (visible to drivers)</option>
              <option value="pending_assignment">Pending Assignment</option>
            </select>
          </FormGroup>
        </Section>

        {/* Submit */}
        <div className="flex gap-3 pb-6">
          <Link href="/jobs" className="btn btn-secondary flex-1 text-center justify-center">Cancel</Link>
          <button type="submit" disabled={loading} className="btn btn-primary flex-2 flex-1">
            {loading ? 'Creating...' : '✓ Create Job Order'}
          </button>
        </div>
      </div>

      {/* Warehouse Inventory Picker Modal */}
      {showInventoryPicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[80vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <div>
                <h2 className="font-heading text-base font-bold">🏭 Select from Warehouse Inventory</h2>
                <p className="text-xs text-text-muted mt-0.5">Tap items to add them to this job order</p>
              </div>
              <button onClick={() => setShowInventoryPicker(false)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2">
              {warehouseInventory.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">No items in warehouse inventory</div>
              ) : (
                warehouseInventory.map((inv: any) => {
                  const alreadyAdded = items.find(i => (i as any).inventory_id === inv.id)
                  const pickerQty = pickerQtys[inv.id] ?? 1
                  return (
                    <div key={inv.id}
                      className="p-3 rounded-lg transition-all"
                      style={{
                        background: alreadyAdded ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                        border: alreadyAdded ? '1.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                      }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-text-primary">{inv.item_name}</div>
                          <div className="flex gap-3 mt-0.5">
                            <span className="text-xs text-text-muted">Stock: <strong className="text-text-secondary">{inv.quantity} {inv.unit}</strong></span>
                            {inv.cbm_per_unit > 0 && <span className="text-xs text-info">{inv.cbm_per_unit} CBM/unit</span>}
                            {inv.sku && <span className="text-xs text-text-muted">SKU: {inv.sku}</span>}
                          </div>
                        </div>
                        {alreadyAdded ? (
                          <button type="button" onClick={() => setItems(prev => prev.filter(i => (i as any).inventory_id !== inv.id))}
                            className="text-xs font-bold px-2 py-1 rounded-full ml-3 flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                            ✕ Remove
                          </button>
                        ) : null}
                      </div>
                      {!alreadyAdded && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1 flex-1">
                            <label className="text-xs text-text-muted whitespace-nowrap">Qty:</label>
                            <input
                              type="number" min="1" max={inv.quantity}
                              value={pickerQty}
                              onClick={e => e.stopPropagation()}
                              onChange={e => {
                                const val = Math.min(parseInt(e.target.value) || 1, inv.quantity)
                                setPickerQtys(prev => ({ ...prev, [inv.id]: val }))
                              }}
                              className="form-input text-xs"
                              style={{ width: '70px' }}
                            />
                            <span className="text-xs text-text-muted">/ {inv.quantity} {inv.unit}</span>
                          </div>
                          <button type="button"
                            onClick={() => {
                              const qty = pickerQtys[inv.id] ?? 1
                              if (qty > inv.quantity) { toast.error(`Only ${inv.quantity} units available`); return }
                              setItems(prev => [...prev, {
                                item_name: inv.item_name,
                                quantity: qty,
                                cbm_per_item: inv.cbm_per_unit || 0,
                                is_fragile: false,
                                requires_special_handling: false,
                                remarks: '',
                                inventory_id: inv.id,
                                from_inventory: true,
                                max_quantity: inv.quantity,
                                unit: inv.unit || 'pcs',
                                warehouse_id: inv.warehouse_id,
                              } as any])
                            }}
                            className="text-xs font-bold px-3 py-1 rounded-full flex-shrink-0"
                            style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.4)' }}>
                            + Add
                          </button>
                        </div>
                      )}
                      {alreadyAdded && (
                        <div className="text-xs mt-1" style={{ color: '#60a5fa' }}>
                          {(items.find(i => (i as any).inventory_id === inv.id) as any)?.quantity} {inv.unit} selected
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <div className="pt-2">
                <button onClick={() => setShowInventoryPicker(false)} className="btn btn-primary btn-full">
                  Done — {items.filter((i: any) => i.from_inventory).length} items selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
        <div className="flex-1 h-px bg-border" />
        {title}
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}
