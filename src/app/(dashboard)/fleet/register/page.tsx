'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { registerTruck, uploadTruckDocument } from '@/lib/api'
import { TRUCK_TYPE_LABELS, DOCUMENT_TYPES, type TruckType } from '@/types'
import { ChevronLeft, Upload, Check } from 'lucide-react'

const REQUIRED_DOCS = ['OR/CR', 'LTFRB Permit', 'Insurance', "Driver's License", 'Medical Certificate', 'Vehicle Photos']
const OPTIONAL_DOCS = ['Business Permit', 'BIR Registration', 'DTI / SEC Registration']

export default function RegisterTruckPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [truckId, setTruckId] = useState<string | null>(null)
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, File>>({})
  const [docExpiry, setDocExpiry] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    owner_name: '', business_name: '', contact_person: '',
    contact_number: '', email: '', driver_name: '', driver_contact: '',
    plate_number: '', truck_type: '' as TruckType | '',
    truck_type_label: '', cbm_capacity: '', load_capacity_kg: '', ltfrb_number: '',
  })

  function update(key: string, value: string) {
    setForm(f => {
      const next = { ...f, [key]: value }
      if (key === 'truck_type') next.truck_type_label = TRUCK_TYPE_LABELS[value as TruckType] || ''
      return next
    })
  }

  function handleDocFile(docType: string, file: File) {
    setUploadedDocs(prev => ({ ...prev, [docType]: file }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const required = ['owner_name', 'contact_person', 'contact_number', 'email', 'driver_name', 'driver_contact', 'plate_number', 'truck_type', 'cbm_capacity', 'load_capacity_kg']
    for (const field of required) {
      if (!form[field as keyof typeof form]) {
        toast.error('Please fill in all required fields')
        return
      }
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Step 1: Register the truck
      toast.loading('Registering truck...', { id: 'register' })
      const { data: truck, error: truckError } = await supabase
        .from('trucks')
        .insert({
          owner_name: form.owner_name,
          business_name: form.business_name || null,
          contact_person: form.contact_person,
          contact_number: form.contact_number,
          email: form.email,
          driver_name: form.driver_name,
          driver_contact: form.driver_contact,
          plate_number: form.plate_number,
          truck_type: form.truck_type,
          truck_type_label: TRUCK_TYPE_LABELS[form.truck_type as TruckType],
          cbm_capacity: parseFloat(form.cbm_capacity),
          load_capacity_kg: parseFloat(form.load_capacity_kg),
          ltfrb_number: form.ltfrb_number || null,
          owner_id: session.user.id,
          verification_status: 'pending',
        })
        .select()
        .single()

      if (truckError) throw new Error(truckError.message)

      // Step 2: Upload documents one by one
      const uploads = Object.entries(uploadedDocs)
      if (uploads.length > 0) {
        toast.loading(`Uploading ${uploads.length} document(s)...`, { id: 'register' })
        for (const [docType, file] of uploads) {
          try {
            await uploadTruckDocument(truck.id, docType, file, docExpiry[docType])
          } catch (docErr: any) {
            console.error(`Failed to upload ${docType}:`, docErr)
            // Don't block registration if document upload fails
          }
        }
      }

      toast.success('Truck registered! Pending admin review.', { id: 'register' })
      router.push('/fleet')
    } catch (err: any) {
      toast.error(err.message || 'Registration failed', { id: 'register' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="sticky top-0 bg-bg-secondary border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <Link href="/fleet" className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <h1 className="font-heading text-base font-semibold flex-1">Register Truck</h1>
      </div>

      <div className="p-4 space-y-6">
        {/* OWNER */}
        <Section title="OWNER INFORMATION">
          <FormGroup label="Truck Owner / Company Name *">
            <input className="form-input" placeholder="Full name or company" required
              value={form.owner_name} onChange={e => update('owner_name', e.target.value)} />
          </FormGroup>
          <FormGroup label="Business Name">
            <input className="form-input" placeholder="Registered business name"
              value={form.business_name} onChange={e => update('business_name', e.target.value)} />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Contact Person *">
              <input className="form-input" placeholder="Name" required
                value={form.contact_person} onChange={e => update('contact_person', e.target.value)} />
            </FormGroup>
            <FormGroup label="Contact Number *">
              <input className="form-input" type="tel" placeholder="+63" required
                value={form.contact_number} onChange={e => update('contact_number', e.target.value)} />
            </FormGroup>
          </div>
          <FormGroup label="Email Address *">
            <input className="form-input" type="email" placeholder="email@example.com" required
              value={form.email} onChange={e => update('email', e.target.value)} />
          </FormGroup>
        </Section>

        {/* DRIVER */}
        <Section title="DRIVER INFORMATION">
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Driver Name *">
              <input className="form-input" placeholder="Full name" required
                value={form.driver_name} onChange={e => update('driver_name', e.target.value)} />
            </FormGroup>
            <FormGroup label="Driver Contact *">
              <input className="form-input" type="tel" placeholder="+63" required
                value={form.driver_contact} onChange={e => update('driver_contact', e.target.value)} />
            </FormGroup>
          </div>
        </Section>

        {/* TRUCK */}
        <Section title="TRUCK DETAILS">
          <FormGroup label="Plate Number *">
            <input className="form-input uppercase tracking-widest font-heading" placeholder="ABC 1234" required
              value={form.plate_number}
              onChange={e => update('plate_number', e.target.value.toUpperCase())} />
          </FormGroup>
          <FormGroup label="Truck Type *">
            <select className="form-input" required value={form.truck_type} onChange={e => update('truck_type', e.target.value)}>
              <option value="">— Select truck type —</option>
              {Object.entries(TRUCK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="CBM Capacity *">
              <input className="form-input" type="number" step="0.01" placeholder="0.00" required
                value={form.cbm_capacity} onChange={e => update('cbm_capacity', e.target.value)} />
            </FormGroup>
            <FormGroup label="Load Capacity (kg) *">
              <input className="form-input" type="number" placeholder="0" required
                value={form.load_capacity_kg} onChange={e => update('load_capacity_kg', e.target.value)} />
            </FormGroup>
          </div>
          <FormGroup label="LTFRB Franchise / CPC Number">
            <input className="form-input" placeholder="CPC-2024-XXXXX"
              value={form.ltfrb_number} onChange={e => update('ltfrb_number', e.target.value)} />
          </FormGroup>
        </Section>

        {/* DOCUMENTS */}
        <Section title="REQUIRED DOCUMENTS">
          <p className="text-xs text-text-muted -mt-1 mb-2">Upload documents now or later. Admin will review all submissions.</p>
          <div className="space-y-3">
            {REQUIRED_DOCS.map(docType => (
              <DocUploadRow
                key={docType}
                label={docType}
                required
                file={uploadedDocs[docType]}
                expiry={docExpiry[docType]}
                onFile={f => handleDocFile(docType, f)}
                onExpiry={d => setDocExpiry(prev => ({ ...prev, [docType]: d }))}
              />
            ))}
          </div>
        </Section>

        <Section title="OPTIONAL DOCUMENTS">
          <div className="space-y-3">
            {OPTIONAL_DOCS.map(docType => (
              <DocUploadRow
                key={docType}
                label={`${docType} (optional)`}
                file={uploadedDocs[docType]}
                expiry={docExpiry[docType]}
                onFile={f => handleDocFile(docType, f)}
                onExpiry={d => setDocExpiry(prev => ({ ...prev, [docType]: d }))}
              />
            ))}
          </div>
        </Section>

        {/* Submit */}
        <div className="flex gap-3 pb-6">
          <Link href="/fleet" className="btn btn-secondary flex-1 text-center justify-center">Cancel</Link>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? 'Submitting...' : '✓ Submit for Review'}
          </button>
        </div>
      </div>
    </form>
  )
}

function DocUploadRow({ label, file, expiry, required, onFile, onExpiry }: {
  label: string; file?: File; expiry?: string; required?: boolean
  onFile: (f: File) => void; onExpiry: (d: string) => void
}) {
  return (
    <div className="bg-bg-tertiary border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {file && <Check size={14} className="text-success" />}
      </div>
      <div className="flex gap-2">
        <label className="btn btn-sm btn-outline flex-1 cursor-pointer text-center">
          <Upload size={12} />
          {file ? file.name.substring(0, 20) + (file.name.length > 20 ? '...' : '') : 'Choose file'}
          <input type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <input className="form-input flex-1 text-xs" type="date"
          placeholder="Expiry date" value={expiry || ''}
          onChange={e => onExpiry(e.target.value)}
          style={{ maxWidth: '130px' }} />
      </div>
    </div>
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
