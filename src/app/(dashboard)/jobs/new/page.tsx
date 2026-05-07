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
  })
  const [warehouses, setWarehouses] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
    supabase.from('warehouses').select('id, name, address').eq('status', 'active').then(({ data }) => setWarehouses(data || []))
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

      const jobData = {
        ...form,
        total_cbm: form.total_cbm ? parseFloat(form.total_cbm) : undefined,
        estimated_weight_kg: form.estimated_weight_kg ? parseFloat(form.estimated_weight_kg) : undefined,
        base_rate: form.base_rate ? parseFloat(form.base_rate) : undefined,
        other_charges: form.other_charges ? parseFloat(form.other_charges) : undefined,
        required_truck_type: (form.required_truck_type || undefined) as TruckType | undefined,
        required_truck_type_label: form.required_truck_type ? TRUCK_TYPE_LABELS[form.required_truck_type as TruckType] : undefined,
        shipment_items: items.filter(i => i.item_name.trim()),
      }

      const job = await createJobOrder(jobData as any, session.user.id)
      toast.success(`Job order ${job.job_number} created!`)
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
          <FormGroup label="Warehouse / Pickup Location *">
            <input className="form-input" placeholder="e.g. Pasig Warehouse, Ortigas Ave."
              value={form.pickup_location} onChange={e => update('pickup_location', e.target.value)} required />
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
              <button type="button" onClick={addItem} className="btn btn-sm btn-secondary flex items-center gap-1">
                <Plus size={12} /> Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-center text-text-muted text-xs py-4">No items added yet. Click "+ Add Item"</div>
            ) : (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded p-3">
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <input className="form-input text-xs col-span-3" placeholder="Item name (e.g. Refrigerator - LG 2-door)"
                        value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)} />
                      <input className="form-input text-xs" type="number" placeholder="Qty"
                        value={item.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} />
                      <input className="form-input text-xs" type="number" step="0.01" placeholder="CBM/unit"
                        value={item.cbm_per_item || ''} onChange={e => updateItem(i, 'cbm_per_item', parseFloat(e.target.value) || 0)} />
                      <div className="text-xs text-text-muted flex items-center">
                        = {((item.cbm_per_item || 0) * item.quantity).toFixed(3)} CBM
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
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Base Rate (₱)">
              <input className="form-input" type="number" step="0.01" placeholder="0.00"
                value={form.base_rate} onChange={e => update('base_rate', e.target.value)} />
            </FormGroup>
            <FormGroup label="Other Charges (₱)">
              <input className="form-input" type="number" step="0.01" placeholder="0.00"
                value={form.other_charges} onChange={e => update('other_charges', e.target.value)} />
            </FormGroup>
          </div>
          {totalRate > 0 && (
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
