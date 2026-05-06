'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { TRUCK_TYPE_LABELS, type TruckType } from '@/types'
import { ChevronLeft } from 'lucide-react'

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({
    pickup_location: '',
    dropoff_location: '',
    client_name: '',
    contact_person: '',
    contact_number: '',
    shipment_category: 'appliances',
    goods_description: '',
    total_cbm: '',
    estimated_weight_kg: '',
    required_truck_type: '',
    delivery_date: '',
    delivery_time: '',
    special_instructions: '',
    base_rate: '',
    other_charges: '',
    status: 'draft',
    remarks: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data, error } = await supabase
        .from('job_orders')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) { toast.error('Job order not found'); router.push('/jobs'); return }

      setForm({
        pickup_location: data.pickup_location || '',
        dropoff_location: data.dropoff_location || '',
        client_name: data.client_name || '',
        contact_person: data.contact_person || '',
        contact_number: data.contact_number || '',
        shipment_category: data.shipment_category || 'appliances',
        goods_description: data.goods_description || '',
        total_cbm: data.total_cbm || '',
        estimated_weight_kg: data.estimated_weight_kg || '',
        required_truck_type: data.required_truck_type || '',
        delivery_date: data.delivery_date || '',
        delivery_time: data.delivery_time || '',
        special_instructions: data.special_instructions || '',
        base_rate: data.base_rate || '',
        other_charges: data.other_charges || '',
        status: data.status || 'draft',
        remarks: data.remarks || '',
      })
      setLoading(false)
    }
    load()
  }, [id, router])

  function update(key: string, value: string) {
    setForm((f: any) => ({ ...f, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase
        .from('job_orders')
        .update({
          ...form,
          total_cbm: form.total_cbm ? parseFloat(form.total_cbm) : null,
          estimated_weight_kg: form.estimated_weight_kg ? parseFloat(form.estimated_weight_kg) : null,
          base_rate: form.base_rate ? parseFloat(form.base_rate) : null,
          other_charges: form.other_charges ? parseFloat(form.other_charges) : null,
          required_truck_type_label: form.required_truck_type ? TRUCK_TYPE_LABELS[form.required_truck_type as TruckType] : null,
        })
        .eq('id', id)

      if (error) throw error
      toast.success('Job order updated!')
      router.push(`/jobs/${id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="p-4 space-y-4">
      {Array(5).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-12 rounded-lg" />)}
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-2xl mx-auto">
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href={`/jobs/${id}`} className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <h1 className="font-heading text-base font-semibold flex-1">Edit Job Order</h1>
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <Section title="DELIVERY ROUTE">
          <Field label="Pickup Location *">
            <input className="form-input" required value={form.pickup_location} onChange={e => update('pickup_location', e.target.value)} />
          </Field>
          <Field label="Drop-off Location *">
            <input className="form-input" required value={form.dropoff_location} onChange={e => update('dropoff_location', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery Date *">
              <input className="form-input" type="date" required value={form.delivery_date} onChange={e => update('delivery_date', e.target.value)} />
            </Field>
            <Field label="Delivery Time">
              <input className="form-input" type="time" value={form.delivery_time} onChange={e => update('delivery_time', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="CLIENT INFO">
          <Field label="Client Name *">
            <input className="form-input" required value={form.client_name} onChange={e => update('client_name', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Person *">
              <input className="form-input" required value={form.contact_person} onChange={e => update('contact_person', e.target.value)} />
            </Field>
            <Field label="Contact Number *">
              <input className="form-input" required value={form.contact_number} onChange={e => update('contact_number', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="SHIPMENT">
          <Field label="Category">
            <select className="form-input" value={form.shipment_category} onChange={e => update('shipment_category', e.target.value)}>
              <option value="appliances">Appliances</option>
              <option value="electronics">Electronics</option>
              <option value="furniture">Furniture</option>
              <option value="general_cargo">General Cargo</option>
              <option value="others">Others</option>
            </select>
          </Field>
          <Field label="Goods Description">
            <textarea className="form-input" rows={3} value={form.goods_description} onChange={e => update('goods_description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total CBM">
              <input className="form-input" type="number" step="0.01" value={form.total_cbm} onChange={e => update('total_cbm', e.target.value)} />
            </Field>
            <Field label="Weight (kg)">
              <input className="form-input" type="number" value={form.estimated_weight_kg} onChange={e => update('estimated_weight_kg', e.target.value)} />
            </Field>
          </div>
          <Field label="Required Truck Type">
            <select className="form-input" value={form.required_truck_type} onChange={e => update('required_truck_type', e.target.value)}>
              <option value="">— Any truck —</option>
              {Object.entries(TRUCK_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="RATES">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base Rate (₱)">
              <input className="form-input" type="number" step="0.01" value={form.base_rate} onChange={e => update('base_rate', e.target.value)} />
            </Field>
            <Field label="Other Charges (₱)">
              <input className="form-input" type="number" step="0.01" value={form.other_charges} onChange={e => update('other_charges', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="ADDITIONAL INFO">
          <Field label="Special Instructions">
            <textarea className="form-input" rows={3} value={form.special_instructions} onChange={e => update('special_instructions', e.target.value)} />
          </Field>
          <Field label="Remarks">
            <textarea className="form-input" rows={2} value={form.remarks} onChange={e => update('remarks', e.target.value)} />
          </Field>
          <Field label="Status">
            <select className="form-input" value={form.status} onChange={e => update('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="open_for_applications">Open for Applications</option>
              <option value="pending_selection">Pending Selection</option>
              <option value="assigned">Assigned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </Section>

        <div className="flex gap-3 pb-6">
          <Link href={`/jobs/${id}`} className="btn btn-secondary flex-1 text-center justify-center">Cancel</Link>
          <button type="submit" disabled={saving} className="btn btn-primary flex-1">
            {saving ? 'Saving...' : '✓ Save Changes'}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}
