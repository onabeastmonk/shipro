'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, generatePayslipPDF, exportToCSV } from '@/lib/utils'
import type { Payslip, PayslipForm } from '@/types'
import { Plus, Printer, Download, X, Users, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'
import ContactCard from '@/components/ContactCard'
import { cn } from '@/lib/utils'

type ViewMode = 'by_owner' | 'all'
type PeriodFilter = 'all_unpaid' | '15days' | 'this_month' | 'last_month' | 'all'

export default function PayrollPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('by_owner')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all_unpaid')
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null)
  const [processingBatch, setProcessingBatch] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id || null))
    loadPayslips()
  }, [])

  async function loadPayslips() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payslips')
        .select('*, driver:profiles!driver_id(id, full_name, email, contact_number, company_name, owner_id, role), job_order:job_orders(job_number, client_name), job_order_id, actual_cbm, target_cbm, rate_per_cbm')
        .order('delivery_date', { ascending: false })
      if (!error) setPayslips((data || []) as any)
    } catch { } finally { setLoading(false) }
  }

  // Filter by period
  function filterByPeriod(slips: Payslip[]) {
    const now = new Date()
    if (periodFilter === 'all_unpaid') return slips.filter(p => p.payment_status !== 'paid')
    if (periodFilter === '15days') {
      const cutoff = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
      return slips.filter(p => p.payment_status !== 'paid' && new Date(p.delivery_date) >= cutoff)
    }
    if (periodFilter === 'this_month') {
      return slips.filter(p => {
        const d = new Date(p.delivery_date)
        return p.payment_status !== 'paid' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
    }
    if (periodFilter === 'last_month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return slips.filter(p => {
        const d = new Date(p.delivery_date)
        return p.payment_status !== 'paid' && d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear()
      })
    }
    return slips
  }

  // Group by truck owner
  function groupByOwner(slips: Payslip[]) {
    const groups: Record<string, { owner: any; payslips: Payslip[] }> = {}
    for (const slip of slips) {
      const driver = (slip as any).driver
      const ownerId = driver?.owner_id || driver?.id || 'unknown'
      const ownerName = driver?.company_name || driver?.full_name || 'Unknown'
      if (!groups[ownerId]) groups[ownerId] = { owner: driver, payslips: [] }
      groups[ownerId].payslips.push(slip)
    }
    return Object.entries(groups).map(([id, g]) => ({ id, ...g }))
  }

  async function markAllPaid(slipIds: string[], ownerId: string) {
    if (!confirm(`Mark ${slipIds.length} payslip(s) as PAID?`)) return
    setProcessingBatch(true)
    try {
      for (const sid of slipIds) {
        await supabase.from('payslips').update({ payment_status: 'paid', date_paid: new Date().toISOString().split('T')[0] }).eq('id', sid)
      }

      // Send chat message to truck owner
      if (userId && ownerId && ownerId !== 'unknown') {
        const total = filteredSlips.filter(p => slipIds.includes(p.id)).reduce((s, p) => s + p.total_amount, 0)
        const msg = `💰 Payment Released!\n\n${slipIds.length} payslip(s) have been marked as PAID.\nTotal: ${formatCurrency(total)}\nDate: ${new Date().toLocaleDateString('en-PH')}\n\nThank you for your service! 🚛`
        await supabase.from('messages').insert({ sender_id: userId, receiver_id: ownerId, content: msg })
        await supabase.from('notifications').insert({
          user_id: ownerId, type: 'general',
          title: '💰 Payment Released!',
          body: `${slipIds.length} payslip(s) paid. Total: ${formatCurrency(total)}`,
        })
      }

      toast.success('Payment released and truck owner notified!')
      await loadPayslips()
    } catch (err: any) {
      toast.error(err.message)
    } finally { setProcessingBatch(false) }
  }

  const filteredSlips = filterByPeriod(payslips)
  const ownerGroups = groupByOwner(filteredSlips)
  const totalPaid = payslips.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.total_amount, 0)
  const totalPending = filteredSlips.filter(p => p.payment_status !== 'paid').reduce((s, p) => s + p.total_amount, 0)
  const totalAll = filteredSlips.reduce((s, p) => s + p.total_amount, 0)

  const PERIOD_LABELS: Record<PeriodFilter, string> = {
    all_unpaid: 'All Unpaid',
    '15days': 'Last 15 Days (Unpaid)',
    this_month: 'This Month (Unpaid)',
    last_month: 'Last Month (Unpaid)',
    all: 'All Payslips',
  }

  function handleExportCSV() {
    exportToCSV(filteredSlips.map(p => ({
      payslip_number: p.payslip_number,
      driver: (p.driver as any)?.full_name || '',
      job_order: (p.job_order as any)?.job_number || '',
      delivery_date: p.delivery_date,
      target_cbm: (p as any).target_cbm || '',
      actual_cbm: (p as any).actual_cbm || '',
      base_rate: p.base_rate,
      deductions: p.deductions,
      total_amount: p.total_amount,
      payment_status: p.payment_status,
      remarks: p.remarks,
    })), 'payslips')
    toast.success('Exported!')
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Payroll</h1>
          <p className="text-text-muted text-sm mt-0.5">Truck owner payouts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn btn-sm btn-outline flex items-center gap-1.5">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => setShowNewModal(true)} className="btn btn-sm btn-secondary flex items-center gap-1.5">
            <Plus size={14} /> Manual
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-bg-secondary rounded-md p-3.5" style={{ borderLeft: '3px solid #22c55e' }}>
          <div className="text-xs text-text-muted uppercase mb-1">Total Paid (All Time)</div>
          <div className="font-heading text-xl font-bold text-success">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="bg-bg-secondary rounded-md p-3.5" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div className="text-xs text-text-muted uppercase mb-1">To Release</div>
          <div className="font-heading text-xl font-bold text-warning">{formatCurrency(totalPending)}</div>
          <div className="text-xs text-text-muted">{filteredSlips.filter(p => p.payment_status !== 'paid').length} payslips</div>
        </div>
      </div>

      {/* Period filter */}
      <div className="bg-bg-secondary border border-border rounded-lg p-3 mb-4">
        <div className="text-xs font-bold text-text-muted uppercase mb-2">Payment Period</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map(p => (
            <button key={p} onClick={() => setPeriodFilter(p)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                periodFilter === p ? 'bg-brand text-bg-primary border-brand' : 'bg-bg-tertiary border-border text-text-secondary')}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {periodFilter !== 'all' && (
          <div className="mt-2 text-xs text-text-muted">
            Showing {filteredSlips.length} payslip(s) · Total: <strong className="text-text-primary">{formatCurrency(totalAll)}</strong>
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setViewMode('by_owner')}
          className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
            viewMode === 'by_owner' ? 'bg-brand text-bg-primary' : 'bg-bg-secondary border border-border text-text-secondary')}>
          <Users size={13} /> By Truck Owner
        </button>
        <button onClick={() => setViewMode('all')}
          className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
            viewMode === 'all' ? 'bg-brand text-bg-primary' : 'bg-bg-secondary border border-border text-text-secondary')}>
          All Payslips
        </button>
      </div>

      {loading ? Array(3).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-24 rounded-lg mb-3" />) :
        viewMode === 'by_owner' ? (
          /* BY OWNER VIEW */
          <div className="space-y-3">
            {ownerGroups.length === 0 ? (
              <div className="text-center py-12"><div className="text-4xl mb-3">💰</div><p className="text-text-secondary font-medium">No unpaid payslips</p></div>
            ) : ownerGroups.map(group => {
              const unpaid = group.payslips.filter(p => p.payment_status !== 'paid')
              const unpaidTotal = unpaid.reduce((s, p) => s + p.total_amount, 0)
              const isExpanded = expandedOwner === group.id
              const ownerId = group.owner?.owner_id || group.id

              return (
                <div key={group.id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
                  {/* Owner header */}
                  <div className="p-4 cursor-pointer" onClick={() => setExpandedOwner(isExpanded ? null : group.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center font-bold text-text-secondary">
                          {group.owner?.full_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-heading text-sm font-bold text-text-primary">
                            {group.owner?.company_name || group.owner?.full_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-text-muted">{group.payslips.length} payslip(s)</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-heading text-lg font-bold text-warning">{formatCurrency(unpaidTotal)}</div>
                        <div className="text-xs text-text-muted">{unpaid.length} unpaid</div>
                      </div>
                    </div>

                    {/* Release payment button */}
                    {unpaid.length > 0 && (
                      <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => markAllPaid(unpaid.map(p => p.id), ownerId)}
                          disabled={processingBatch}
                          className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg text-sm font-bold"
                          style={{ background: 'rgba(34,197,94,0.15)', border: '1.5px solid #22c55e', color: '#22c55e' }}>
                          <CheckCircle size={14} />
                          {processingBatch ? 'Processing...' : `Release ₱${unpaidTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${unpaid.length} payslips)`}
                        </button>
                        <button onClick={() => setExpandedOwner(isExpanded ? null : group.id)}
                          className="p-2.5 rounded-lg bg-bg-tertiary border border-border">
                          {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded payslips list */}
                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {group.payslips.map(p => (
                        <PayslipRow key={p.id} payslip={p} onStatusChange={async (status) => {
                          await supabase.from('payslips').update({ payment_status: status, date_paid: status === 'paid' ? new Date().toISOString().split('T')[0] : null }).eq('id', p.id)
                          toast.success('Updated')
                          await loadPayslips()
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* ALL PAYSLIPS VIEW */
          <div className="space-y-3">
            {filteredSlips.length === 0 ? (
              <div className="text-center py-12"><div className="text-4xl mb-3">💰</div><p className="text-text-secondary font-medium">No payslips found</p></div>
            ) : filteredSlips.map(p => (
              <PayslipCard key={p.id} payslip={p} onStatusChange={async (status) => {
                await supabase.from('payslips').update({ payment_status: status, date_paid: status === 'paid' ? new Date().toISOString().split('T')[0] : null }).eq('id', p.id)
                toast.success('Updated')
                await loadPayslips()
              }} />
            ))}
          </div>
        )
      }

      {showNewModal && userId && (
        <NewPayslipModal
          userId={userId}
          onClose={() => setShowNewModal(false)}
          onSave={async (form: any) => {
            const total = (form.base_rate || 0) + (form.additional_charges || 0) + (form.fuel_allowance || 0) + (form.toll_fee || 0) + (form.parking_fee || 0) - (form.deductions || 0)
            const psNum = `PS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
            const { error } = await supabase.from('payslips').insert({
              ...form,
              payslip_number: psNum,
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

function PayslipRow({ payslip, onStatusChange }: { payslip: Payslip; onStatusChange: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const jobNum = (payslip.job_order as any)?.job_number || '—'
  const statusColor = { paid: 'text-success', processing: 'text-info', pending: 'text-warning' }[payslip.payment_status] || 'text-text-muted'

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div>
          <div className="text-xs font-mono text-text-muted">{jobNum} · {formatDate(payslip.delivery_date)}</div>
          <div className="font-heading text-sm font-bold">{formatCurrency(payslip.total_amount)}</div>
          {(payslip as any).actual_cbm > 0 && (
            <div className="text-xs text-text-muted">{(payslip as any).actual_cbm} CBM × ₱{(payslip as any).rate_per_cbm?.toLocaleString()}</div>
          )}
        </div>
        <span className={`text-xs font-bold capitalize ${statusColor}`}>{payslip.payment_status}</span>
      </div>
      {expanded && payslip.remarks && (
        <div className="mt-2 p-2 bg-bg-tertiary rounded text-xs text-text-secondary whitespace-pre-line">{payslip.remarks}</div>
      )}
    </div>
  )
}

function PayslipCard({ payslip, onStatusChange }: { payslip: Payslip; onStatusChange: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const driverName = (payslip.driver as any)?.full_name || 'Unknown'
  const jobNum = (payslip.job_order as any)?.job_number || '—'
  const statusColor = { paid: 'bg-success-bg text-success border-success-border', processing: 'bg-info-bg text-info border-info-border', pending: 'bg-warning-bg text-warning border-warning-border' }[payslip.payment_status] || 'bg-bg-tertiary text-text-muted border-border'

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-xs text-text-muted font-mono">{payslip.payslip_number}</div>
            <div className="font-heading text-sm font-semibold">{driverName}</div>
            <div className="text-xs text-text-muted">{jobNum} · {formatDate(payslip.delivery_date)}</div>
          </div>
          <span className={`status-badge ${statusColor}`}>{payslip.payment_status}</span>
        </div>
        <div className="font-heading text-2xl font-bold my-1">{formatCurrency(payslip.total_amount)}</div>
        {(payslip as any).actual_cbm > 0 && (
          <div className="text-xs text-text-muted">
            {(payslip as any).actual_cbm} CBM × ₱{(payslip as any).rate_per_cbm?.toLocaleString()}/CBM
            {(payslip as any).target_cbm > (payslip as any).actual_cbm && (
              <span className="text-warning ml-2">(-{((payslip as any).target_cbm - (payslip as any).actual_cbm).toFixed(3)} CBM deducted)</span>
            )}
          </div>
        )}
      </div>
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-2 space-y-3">
          {payslip.remarks && (
            <div className="bg-bg-tertiary rounded p-2.5 text-xs text-text-secondary whitespace-pre-line">{payslip.remarks}</div>
          )}
          <div className="flex gap-2">
            <button onClick={async () => {
              // Fetch shipment items for this job
              let items: any[] = []
              if ((payslip as any).job_order_id) {
                const { data } = await supabase.from('shipment_items').select('item_name, quantity, cbm_per_item, total_cbm').eq('job_order_id', (payslip as any).job_order_id)
                items = data || []
              }
              await generatePayslipPDF({
                payslip_number: payslip.payslip_number, driver_name: driverName, job_number: jobNum,
                delivery_date: payslip.delivery_date, pickup_location: payslip.pickup_location,
                dropoff_location: payslip.dropoff_location, truck_type_label: payslip.truck_type_label,
                base_rate: payslip.base_rate, additional_charges: payslip.additional_charges,
                fuel_allowance: payslip.fuel_allowance, toll_fee: payslip.toll_fee, parking_fee: payslip.parking_fee,
                deductions: payslip.deductions, total_amount: payslip.total_amount,
                payment_status: payslip.payment_status, remarks: payslip.remarks,
                actual_cbm: (payslip as any).actual_cbm, target_cbm: (payslip as any).target_cbm,
                rate_per_cbm: (payslip as any).rate_per_cbm, items,
              })
            }}
              className="btn btn-sm btn-outline flex items-center gap-1 flex-1">
              <Printer size={12} /> Print
            </button>
            {payslip.payment_status === 'pending' && <button onClick={() => onStatusChange('processing')} className="btn btn-sm btn-secondary flex-1">Process</button>}
            {payslip.payment_status === 'processing' && <button onClick={() => onStatusChange('paid')} className="btn btn-sm btn-success flex-1">Mark Paid</button>}
            {payslip.payment_status === 'paid' && <div className="text-xs text-success font-semibold flex-1 text-center py-2">✓ Paid {payslip.date_paid ? formatDate(payslip.date_paid) : ''}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function NewPayslipModal({ userId, onClose, onSave }: { userId: string; onClose: () => void; onSave: (form: any) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [completedJobs, setCompletedJobs] = useState<any[]>([])
  const [pricingMode, setPricingMode] = useState<'fixed' | 'per_cbm'>('fixed')
  const [form, setForm] = useState<any>({
    driver_id: '', job_order_id: '', delivery_date: '', pickup_location: '', dropoff_location: '',
    truck_type_label: '', base_rate: 0, rate_per_cbm: 0, target_cbm: 0, actual_cbm: 0,
    additional_charges: 0, fuel_allowance: 0, toll_fee: 0, parking_fee: 0, deductions: 0,
    payment_status: 'pending', remarks: '', items_count: 0,
  })

  useEffect(() => {
    supabase.from('job_orders')
      .select('*, truck:trucks(truck_type_label), shipment_items(*)')
      .in('status', ['completed', 'delivered'])
      .order('delivery_date', { ascending: false })
      .then(({ data }) => setCompletedJobs(data || []))
  }, [])

  function update(key: string, value: any) { setForm((f: any) => ({ ...f, [key]: value })) }

  function handleJobSelect(jobId: string) {
    update('job_order_id', jobId)
    if (!jobId) return
    const job = completedJobs.find(j => j.id === jobId)
    if (job) {
      const itemCount = (job.shipment_items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0)
      const totalCBM = (job.shipment_items || []).reduce((s: number, i: any) => s + ((i.cbm_per_item || 0) * (i.quantity || 1)), 0) || job.total_cbm || 0
      const actualCBM = job.actual_cbm || totalCBM
      update('delivery_date', job.delivery_date || '')
      update('pickup_location', job.pickup_location || '')
      update('dropoff_location', job.dropoff_location || '')
      update('truck_type_label', job.truck?.truck_type_label || '')
      update('driver_id', job.assigned_driver_id || '')
      update('items_count', itemCount)
      update('target_cbm', parseFloat(totalCBM.toFixed(3)))
      update('actual_cbm', parseFloat(actualCBM.toFixed(3)))
      if (job.pricing_mode === 'per_cbm' && job.rate_per_cbm) {
        setPricingMode('per_cbm')
        update('rate_per_cbm', job.rate_per_cbm)
        update('base_rate', 0)
      } else {
        setPricingMode('fixed')
        update('base_rate', job.base_rate || 0)
      }
      if (actualCBM < totalCBM) {
        update('remarks', `CBM shortfall: ${(totalCBM - actualCBM).toFixed(3)} CBM`)
      }
    }
  }

  const basePay = pricingMode === 'per_cbm' ? (form.rate_per_cbm || 0) * (form.actual_cbm || 0) : (form.base_rate || 0)
  const cbmPercent = form.target_cbm > 0 ? Math.round((form.actual_cbm / form.target_cbm) * 100) : 100
  const cbmShortfall = form.target_cbm > 0 ? Math.max(0, form.target_cbm - form.actual_cbm) : 0
  const total = basePay + (form.additional_charges || 0) + (form.fuel_allowance || 0) + (form.toll_fee || 0) + (form.parking_fee || 0) - (form.deductions || 0)

  async function handleSave() {
    if (!form.job_order_id) { toast.error('Please select a completed job order'); return }
    setSaving(true)
    try { await onSave({ ...form, base_rate: basePay, pricing_mode: pricingMode }) }
    catch (err: any) { toast.error(err.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="bg-bg-secondary w-full rounded-t-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1" />
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-bg-secondary z-10">
          <h2 className="font-heading text-base font-semibold">Manual Payslip</h2>
          <button onClick={onClose}><X size={18} className="text-text-muted" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="form-label">Select Completed Job Order *</label>
            {completedJobs.length === 0
              ? <div className="bg-warning-bg border border-warning-border rounded p-3 text-xs text-warning">⚠️ No completed jobs without a payslip yet.</div>
              : <select className="form-input" value={form.job_order_id} onChange={e => handleJobSelect(e.target.value)}>
                  <option value="">— Select a completed job —</option>
                  {completedJobs.map((job: any) => <option key={job.id} value={job.id}>{job.job_number} · {job.client_name} · {job.delivery_date}</option>)}
                </select>
            }
          </div>

          {form.job_order_id && (
            <div className="bg-bg-tertiary border border-border rounded-lg p-3 space-y-1.5">
              <div className="text-xs font-bold text-text-muted uppercase mb-1">Auto-filled Job Details</div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Date</span><span className="font-medium">{form.delivery_date}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">From</span><span className="font-medium truncate max-w-[60%] text-right">{form.pickup_location}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">To</span><span className="font-medium truncate max-w-[60%] text-right">{form.dropoff_location}</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Items</span><span className="font-bold" style={{ color: '#60a5fa' }}>{form.items_count} items</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Target CBM</span><span className="font-bold">{form.target_cbm} CBM</span></div>
              <div className="flex justify-between text-xs"><span className="text-text-muted">Actual CBM</span><span className="font-bold text-success">{form.actual_cbm} CBM</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPricingMode('fixed')} className="p-2.5 rounded-lg border text-left" style={{ border: pricingMode !== 'per_cbm' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)', background: pricingMode !== 'per_cbm' ? 'rgba(96,165,250,0.1)' : 'transparent' }}>
              <div className="text-xs font-bold" style={{ color: pricingMode !== 'per_cbm' ? '#60a5fa' : '#a0a0a0' }}>Fixed Rate</div>
            </button>
            <button type="button" onClick={() => setPricingMode('per_cbm')} className="p-2.5 rounded-lg border text-left" style={{ border: pricingMode === 'per_cbm' ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.08)', background: pricingMode === 'per_cbm' ? 'rgba(34,197,94,0.1)' : 'transparent' }}>
              <div className="text-xs font-bold" style={{ color: pricingMode === 'per_cbm' ? '#22c55e' : '#a0a0a0' }}>Per CBM</div>
            </button>
          </div>

          {pricingMode === 'fixed'
            ? <div><label className="form-label">Base Rate (₱)</label><input className="form-input" type="number" step="0.01" value={form.base_rate || ''} onChange={e => update('base_rate', parseFloat(e.target.value) || 0)} /></div>
            : <div className="space-y-2">
                <div><label className="form-label">Rate per CBM (₱/CBM)</label><input className="form-input" type="number" step="0.01" value={form.rate_per_cbm || ''} onChange={e => update('rate_per_cbm', parseFloat(e.target.value) || 0)} /></div>
                <div className="bg-bg-tertiary rounded p-2 text-xs text-text-muted">{form.rate_per_cbm} × {form.actual_cbm} CBM = <strong className="text-text-primary">{formatCurrency(basePay)}</strong></div>
              </div>
          }

          <div className="grid grid-cols-2 gap-3">
            {[['additional_charges','Additional (₱)'],['fuel_allowance','Fuel (₱)'],['toll_fee','Toll (₱)'],['parking_fee','Parking (₱)'],['deductions','Deductions (₱)']].map(([k, l]) => (
              <div key={k}><label className="form-label">{l}</label><input className="form-input" type="number" step="0.01" placeholder="0.00" value={form[k] || ''} onChange={e => update(k, parseFloat(e.target.value) || 0)} /></div>
            ))}
          </div>

          <div className="bg-bg-tertiary rounded-lg p-4 text-center">
            <div className="text-xs text-text-muted mb-1">NET TOTAL</div>
            <div className="font-heading text-3xl font-bold">₱{Math.max(0, total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>

          <div><label className="form-label">Remarks</label><textarea className="form-input" rows={2} value={form.remarks} onChange={e => update('remarks', e.target.value)} /></div>

          <div className="flex gap-3 pb-6">
            <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.job_order_id} className="btn btn-primary flex-1">
              {saving ? 'Saving...' : 'Save Payslip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
