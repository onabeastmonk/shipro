'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, generatePayslipPDF, exportToCSV } from '@/lib/utils'
import type { Payslip, PayslipForm } from '@/types'
import { Plus, Printer, Download, X } from 'lucide-react'
import ContactCard from '@/components/ContactCard'
import { cn } from '@/lib/utils'

export default function PayrollPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id || null))
    loadPayslips()
  }, [])

  async function loadPayslips() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payslips')
        .select('*, driver:profiles!driver_id(id, full_name, email, contact_number), job_order:job_orders(job_number)')
        .order('created_at', { ascending: false })
      if (!error) setPayslips((data || []) as any)
    } catch { } finally { setLoading(false) }
  }

  const filtered = filter === 'all' ? payslips : payslips.filter(p => p.payment_status === filter)
  const totalPaid = payslips.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.total_amount, 0)
  const totalPending = payslips.filter(p => p.payment_status === 'pending').reduce((s, p) => s + p.total_amount, 0)

  function handleExportCSV() {
    exportToCSV(payslips.map(p => ({
      payslip_number: p.payslip_number,
      driver: (p.driver as any)?.full_name || '',
      job_order: (p.job_order as any)?.job_number || '',
      delivery_date: p.delivery_date,
      base_rate: p.base_rate,
      total_amount: p.total_amount,
      payment_status: p.payment_status,
    })), 'payslips')
    toast.success('Exported to CSV!')
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Payroll</h1>
          <p className="text-text-muted text-sm mt-0.5">Driver & trucker payouts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn btn-sm btn-outline flex items-center gap-1.5">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => setShowNewModal(true)} className="btn btn-sm btn-primary flex items-center gap-1.5">
            <Plus size={14} /> New
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-bg-secondary rounded-md p-3.5" style={{ borderLeft: '2px solid #22c55e', border: '0.5px solid #2a2a2a', borderLeftWidth: '2px', borderLeftColor: '#22c55e' }}>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Total Paid</div>
          <div className="font-heading text-xl font-bold text-success">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="bg-bg-secondary rounded-md p-3.5" style={{ borderLeft: '2px solid #f59e0b', border: '0.5px solid #2a2a2a', borderLeftWidth: '2px', borderLeftColor: '#f59e0b' }}>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Pending</div>
          <div className="font-heading text-xl font-bold text-warning">{formatCurrency(totalPending)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['all', 'pending', 'processing', 'paid'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-all',
              filter === s ? 'bg-brand text-bg-primary border-brand' : 'bg-bg-secondary border-border text-text-secondary')}>
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? Array(3).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-28 rounded-lg mb-3" />) :
       filtered.length === 0 ? (
        <div className="text-center py-12"><div className="text-4xl mb-3">💰</div><p className="text-text-secondary font-medium">No payslips found</p></div>
       ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PayslipCard key={p.id} payslip={p} onStatusChange={async (status, datePaid) => {
              await supabase.from('payslips').update({ payment_status: status, date_paid: datePaid }).eq('id', p.id)
              toast.success('Status updated')
              loadPayslips()
            }} />
          ))}
        </div>
       )}

      {showNewModal && userId && (
        <NewPayslipModal
          userId={userId}
          onClose={() => setShowNewModal(false)}
          onSave={async (form: any) => {
            const total = (form.base_rate || 0) + (form.additional_charges || 0) + (form.fuel_allowance || 0) + (form.toll_fee || 0) + (form.parking_fee || 0) - (form.deductions || 0)
            const { error } = await supabase.from('payslips').insert({
              ...form,
              total_amount: Math.max(0, total),
              created_by: userId,
            })
            if (error) throw error
            toast.success('Payslip created!')
            setShowNewModal(false)
            loadPayslips()
          }}
        />
      )}
    </div>
  )
}

function PayslipCard({ payslip, onStatusChange }: { payslip: Payslip; onStatusChange: (status: string, datePaid?: string) => void }) {
  const driverName = (payslip.driver as any)?.full_name || 'Unknown Driver'
  const driverContact = (payslip.driver as any)?.contact_number || null
  const driverId = (payslip.driver as any)?.id || null
  const jobNum = (payslip.job_order as any)?.job_number || '—'
  const statusColor = {
    paid: 'bg-success-bg text-success border-success-border',
    processing: 'bg-info-bg text-info border-info-border',
    pending: 'bg-warning-bg text-warning border-warning-border',
  }[payslip.payment_status] || 'bg-bg-tertiary text-text-muted border-border'

  async function handlePrint() {
    await generatePayslipPDF({
      payslip_number: payslip.payslip_number,
      driver_name: driverName,
      job_number: jobNum,
      delivery_date: payslip.delivery_date,
      pickup_location: payslip.pickup_location,
      dropoff_location: payslip.dropoff_location,
      truck_type_label: payslip.truck_type_label,
      base_rate: payslip.base_rate,
      additional_charges: payslip.additional_charges,
      fuel_allowance: payslip.fuel_allowance,
      toll_fee: payslip.toll_fee,
      parking_fee: payslip.parking_fee,
      deductions: payslip.deductions,
      total_amount: payslip.total_amount,
      payment_status: payslip.payment_status,
      remarks: payslip.remarks,
    })
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs text-text-muted font-mono">{payslip.payslip_number}</div>
          <div className="font-heading text-sm font-semibold mt-0.5">{driverName}</div>
          <div className="text-xs text-text-muted mt-0.5">{jobNum} · {formatDate(payslip.delivery_date)}</div>
        </div>
        <span className={`status-badge ${statusColor}`}>{payslip.payment_status}</span>
      </div>
      <div className="font-heading text-2xl font-bold my-2">{formatCurrency(payslip.total_amount)}</div>
      <ContactCard
        userId={driverId}
        name={driverName}
        contactNumber={driverContact}
        label="Truck Owner / Driver"
        compact
      />
      <div className="flex gap-2 mt-2">
        <button onClick={handlePrint} className="btn btn-sm btn-outline flex items-center gap-1.5 flex-1">
          <Printer size={12} /> Print PDF
        </button>
        {payslip.payment_status === 'pending' && (
          <button onClick={() => onStatusChange('processing')} className="btn btn-sm btn-secondary flex-1">Process</button>
        )}
        {payslip.payment_status === 'processing' && (
          <button onClick={() => onStatusChange('paid', new Date().toISOString().split('T')[0])} className="btn btn-sm btn-success flex-1">Mark Paid</button>
        )}
      </div>
    </div>
  )
}

function NewPayslipModal({ userId, onClose, onSave }: {
  userId: string
  onClose: () => void
  onSave: (form: any) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [completedJobs, setCompletedJobs] = useState<any[]>([])
  const [pricingMode, setPricingMode] = useState<'fixed' | 'per_cbm'>('fixed')
  const [form, setForm] = useState<any>({
    driver_id: '', job_order_id: '', delivery_date: '',
    pickup_location: '', dropoff_location: '', truck_type_label: '',
    base_rate: 0, additional_charges: 0, fuel_allowance: 0,
    toll_fee: 0, parking_fee: 0, deductions: 0,
    payment_status: 'pending', remarks: '', items_count: 0,
  })

  useEffect(() => {
    supabase
      .from('job_orders')
      .select('id, job_number, client_name, delivery_date, assigned_driver_id, base_rate, pickup_location, dropoff_location, shipment_items(*), truck:trucks(truck_type_label)')
      .eq('status', 'completed')
      .order('delivery_date', { ascending: false })
      .then(({ data }) => setCompletedJobs(data || []))
  }, [])

  function update(key: string, value: any) {
    setForm((f: any) => ({ ...f, [key]: value }))
  }

  function handleJobSelect(jobId: string) {
    update('job_order_id', jobId)
    if (!jobId) return
    const job = completedJobs.find(j => j.id === jobId)
    if (job) {
      update('delivery_date', job.delivery_date || '')
      update('pickup_location', job.pickup_location || '')
      update('dropoff_location', job.dropoff_location || '')
      update('truck_type_label', (job.truck as any)?.truck_type_label || '')
      update('driver_id', job.assigned_driver_id || '')
      update('base_rate', job.base_rate || 0)
      const itemCount = (job.shipment_items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0)
      update('items_count', itemCount)
    }
  }

  // Computed values
  const basePay = pricingMode === 'per_cbm'
    ? (form.rate_per_cbm || 0) * (form.actual_cbm || 0)
    : (form.base_rate || 0)
  const cbmPercent = form.target_cbm > 0 ? Math.round((form.actual_cbm / form.target_cbm) * 100) : 100
  const cbmShortfall = form.target_cbm > 0 ? Math.max(0, form.target_cbm - form.actual_cbm) : 0
  const total = basePay + (form.additional_charges || 0) + (form.fuel_allowance || 0) + (form.toll_fee || 0) + (form.parking_fee || 0) - (form.deductions || 0)

  async function handleSave() {
    if (!form.job_order_id) { toast.error('Please select a completed job order'); return }
    if (!form.pickup_location || !form.dropoff_location) { toast.error('Job details missing'); return }
    setSaving(true)
    try {
      await onSave(form)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save payslip')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="bg-bg-secondary w-full rounded-t-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1" />
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-bg-secondary z-10">
          <h2 className="font-heading text-base font-semibold">New Payslip</h2>
          <button onClick={onClose}><X size={18} className="text-text-muted" /></button>
        </div>
        <div className="p-4 space-y-4">

          <div>
            <label className="form-label">Select Completed Job Order *</label>
            {completedJobs.length === 0 ? (
              <div className="bg-warning-bg border border-warning-border rounded-md p-3 text-xs text-warning">
                ⚠️ No completed job orders found. Only completed deliveries can generate payslips.
              </div>
            ) : (
              <select className="form-input" value={form.job_order_id} onChange={e => handleJobSelect(e.target.value)}>
                <option value="">— Select a completed job —</option>
                {completedJobs.map((job: any) => (
                  <option key={job.id} value={job.id}>
                    {job.job_number} · {job.client_name} · {job.delivery_date}
                  </option>
                ))}
              </select>
            )}
          </div>

          {form.job_order_id && form.pickup_location && (
            <div className="bg-bg-tertiary border border-border rounded-lg p-3 space-y-1.5">
              <div className="text-xs text-text-muted font-bold uppercase tracking-wide mb-2">Job Details</div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Date</span><span className="text-text-primary font-medium">{form.delivery_date}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">From</span><span className="text-text-primary font-medium text-right max-w-[60%] truncate">{form.pickup_location}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">To</span><span className="text-text-primary font-medium text-right max-w-[60%] truncate">{form.dropoff_location}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Truck</span><span className="text-text-primary font-medium">{form.truck_type_label || '—'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Items Delivered</span><span className="font-bold" style={{ color: '#60a5fa' }}>{form.items_count} items</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Target CBM</span><span className="font-bold text-text-primary">{form.target_cbm} CBM</span></div>
            </div>
          )}

          {/* CBM Section */}
          {form.job_order_id && (
            <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-3">
              <div className="text-xs font-bold text-text-muted uppercase tracking-widest text-center mb-1">📦 CBM TRACKING</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Target CBM (from job order)</label>
                  <input className="form-input opacity-60" type="number" step="0.001" readOnly
                    value={form.target_cbm || ''} />
                </div>
                <div>
                  <label className="form-label">Actual CBM Transported *</label>
                  <input className="form-input" type="number" step="0.001" placeholder="0.000"
                    value={form.actual_cbm || ''}
                    onChange={e => update('actual_cbm', parseFloat(e.target.value) || 0)} />
                </div>
              </div>

              {/* CBM Progress bar */}
              {form.target_cbm > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">CBM Completion</span>
                    <span className={`font-bold ${cbmPercent >= 100 ? 'text-success' : cbmPercent >= 80 ? 'text-warning' : 'text-danger'}`}>
                      {cbmPercent}%
                    </span>
                  </div>
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, cbmPercent)}%`,
                        background: cbmPercent >= 100 ? '#22c55e' : cbmPercent >= 80 ? '#f59e0b' : '#ef4444'
                      }} />
                  </div>
                  {cbmShortfall > 0 && (
                    <div className="text-xs text-warning mt-1">
                      ⚠️ Shortfall: {cbmShortfall.toFixed(3)} CBM not transported
                    </div>
                  )}
                  {form.actual_cbm > form.target_cbm && (
                    <div className="text-xs text-success mt-1">
                      ✓ Extra: {(form.actual_cbm - form.target_cbm).toFixed(3)} CBM above target
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="h-px bg-border" />
          <div className="text-xs font-bold text-text-muted uppercase tracking-widest text-center">💰 PRICING MODE</div>

          {/* Pricing Mode Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPricingMode('fixed')}
              className="p-3 rounded-lg border text-left transition-all"
              style={{
                border: pricingMode === 'fixed' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                background: pricingMode === 'fixed' ? 'rgba(96,165,250,0.1)' : 'transparent',
              }}>
              <div className="text-sm font-bold" style={{ color: pricingMode === 'fixed' ? '#60a5fa' : '#a0a0a0' }}>Fixed Rate</div>
              <div className="text-xs text-text-muted mt-0.5">Set a flat amount regardless of CBM</div>
            </button>
            <button type="button" onClick={() => setPricingMode('per_cbm')}
              className="p-3 rounded-lg border text-left transition-all"
              style={{
                border: pricingMode === 'per_cbm' ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
                background: pricingMode === 'per_cbm' ? 'rgba(34,197,94,0.1)' : 'transparent',
              }}>
              <div className="text-sm font-bold" style={{ color: pricingMode === 'per_cbm' ? '#22c55e' : '#a0a0a0' }}>Per CBM</div>
              <div className="text-xs text-text-muted mt-0.5">Rate × actual CBM transported</div>
            </button>
          </div>

          {pricingMode === 'fixed' ? (
            <div>
              <label className="form-label">Base Rate (₱)</label>
              <input className="form-input" type="number" step="0.01" placeholder="0.00"
                value={form.base_rate || ''}
                onChange={e => update('base_rate', parseFloat(e.target.value) || 0)} />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="form-label">Rate per CBM (₱/CBM)</label>
                <input className="form-input" type="number" step="0.01" placeholder="e.g. 500"
                  value={form.rate_per_cbm || ''}
                  onChange={e => update('rate_per_cbm', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="bg-bg-tertiary rounded-lg p-3">
                <div className="text-xs text-text-muted mb-1">Calculation Preview</div>
                <div className="text-sm">
                  ₱{(form.rate_per_cbm || 0).toLocaleString()} × {form.actual_cbm || 0} CBM = <strong className="text-text-primary">₱{basePay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                </div>
                {cbmShortfall > 0 && (
                  <div className="text-xs text-warning mt-1">
                    Deducted: ₱{((form.rate_per_cbm || 0) * cbmShortfall).toLocaleString('en-PH', { minimumFractionDigits: 2 })} for {cbmShortfall.toFixed(3)} CBM shortfall
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs font-bold text-text-muted uppercase tracking-widest text-center">OTHER CHARGES</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['additional_charges', 'Additional Charges (₱)'],
              ['fuel_allowance', 'Fuel Allowance (₱)'],
              ['toll_fee', 'Toll Fee (₱)'],
              ['parking_fee', 'Parking Fee (₱)'],
              ['deductions', 'Other Deductions (₱)'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" type="number" step="0.01" placeholder="0.00"
                  value={form[key] || ''}
                  onChange={e => update(key, parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>

          {/* Total breakdown */}
          <div className="bg-bg-tertiary rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{pricingMode === 'per_cbm' ? `Base (${form.actual_cbm} CBM × ₱${form.rate_per_cbm})` : 'Base Rate'}</span>
              <span className="font-semibold">₱{basePay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
            {(form.additional_charges > 0 || form.fuel_allowance > 0 || form.toll_fee > 0 || form.parking_fee > 0) && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">+ Other Charges</span>
                <span className="font-semibold text-success">+₱{((form.additional_charges || 0) + (form.fuel_allowance || 0) + (form.toll_fee || 0) + (form.parking_fee || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {form.deductions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">- Deductions</span>
                <span className="font-semibold text-danger">-₱{form.deductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="h-px bg-border my-1" />
            <div className="text-center pt-1">
              <div className="text-xs text-text-muted mb-1">NET TOTAL PAYOUT</div>
              <div className="font-heading text-3xl font-bold">₱{Math.max(0, total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              {pricingMode === 'per_cbm' && cbmShortfall > 0 && (
                <div className="text-xs text-warning mt-1">CBM shortfall deducted from pay</div>
              )}
            </div>
          </div>

          <div>
            <label className="form-label">Payment Status</label>
            <select className="form-input" value={form.payment_status} onChange={e => update('payment_status', e.target.value)}>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div>
            <label className="form-label">Remarks</label>
            <textarea className="form-input" rows={2} placeholder="Optional notes" value={form.remarks} onChange={e => update('remarks', e.target.value)} />
          </div>

          <div className="flex gap-3 pb-6">
            <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.job_order_id}
              className="btn btn-primary flex-1"
            >
              {saving ? 'Saving...' : 'Save Payslip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
