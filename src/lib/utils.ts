import { format, isAfter, isBefore, addDays, parseISO } from 'date-fns'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { JobStatus, DocumentStatus } from '@/types'

// ── Class merging ──────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Formatting ────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date, fmt = 'MMM dd, yyyy'): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, fmt)
  } catch {
    return String(date)
  }
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'MMM dd, yyyy h:mm a')
}

export function formatRelative(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(d)
  } catch {
    return String(date)
  }
}

export function generateJobNumber(): string {
  const year = new Date().getFullYear()
  const seq = String(Math.floor(Math.random() * 9000) + 1000)
  return `JO-${year}-${seq}`
}

export function generatePayslipNumber(): string {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 900) + 100)
  return `PS-${year}${month}-${seq}`
}

// ── Status helpers ─────────────────────────────────────────

export function getJobStatusColor(status: JobStatus): string {
  const colors: Record<JobStatus, string> = {
    draft: 'bg-bg-tertiary text-text-secondary border-border',
    posted: 'bg-info-bg text-info border-info-border',
open_for_applications: 'bg-info-bg text-info border-info-border',
pending_selection: 'bg-warning-bg text-warning border-warning-border',
pending_assignment: 'bg-warning-bg text-warning border-warning-border',
    assigned: 'bg-bg-elevated text-text-primary border-border-secondary',
    accepted: 'bg-bg-elevated text-text-primary border-border-secondary',
    at_pickup: 'bg-warning-bg text-warning border-warning-border',
    loaded: 'bg-warning-bg text-warning border-warning-border',
    in_transit: 'bg-bg-elevated text-brand border-border-secondary',
    arrived: 'bg-success-bg text-success border-success-border',
    delivered: 'bg-success-bg text-success border-success-border',
    completed: 'bg-success-bg text-success border-success-border',
    cancelled: 'bg-danger-bg text-danger border-danger-border',
  }
  return colors[status] || colors.draft
}

export function getDocumentStatusColor(status: DocumentStatus): string {
  const colors: Record<DocumentStatus, string> = {
    valid: 'bg-success-bg text-success border-success-border',
    expiring_soon: 'bg-warning-bg text-warning border-warning-border',
    expired: 'bg-danger-bg text-danger border-danger-border',
    pending_upload: 'bg-bg-tertiary text-text-muted border-border',
  }
  return colors[status] || colors.pending_upload
}

export function checkDocumentStatus(expiryDate: string | null, warningDays = 30): DocumentStatus {
  if (!expiryDate) return 'pending_upload'
  const expiry = parseISO(expiryDate)
  const now = new Date()
  if (isBefore(expiry, now)) return 'expired'
  if (isBefore(expiry, addDays(now, warningDays))) return 'expiring_soon'
  return 'valid'
}

export function getJobStatusStep(status: JobStatus): number {
  const steps: Record<JobStatus, number> = {
    draft: 0, posted: 0, open_for_applications: 0, pending_selection: 0, pending_assignment: 0, assigned: 0,
    accepted: 1, at_pickup: 2, loaded: 3, in_transit: 4,
    arrived: 5, delivered: 6, completed: 7, cancelled: -1,
  }
  return steps[status] ?? 0
}

// ── File helpers ───────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

export function isImageFile(filename: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getFileExtension(filename))
}

// ── PDF Generation ─────────────────────────────────────────

export async function generatePayslipPDF(payslip: {
  payslip_number: string
  driver_name: string
  job_number: string
  delivery_date: string
  pickup_location: string
  dropoff_location: string
  truck_type_label: string
  base_rate: number
  additional_charges: number
  fuel_allowance: number
  toll_fee: number
  parking_fee: number
  deductions: number
  total_amount: number
  payment_status: string
  remarks?: string
  actual_cbm?: number
  target_cbm?: number
  rate_per_cbm?: number
  items?: { item_name: string; quantity: number; cbm_per_item: number; total_cbm: number }[]
  assigned_driver_name?: string
  assigned_driver_contact?: string
  helper_name?: string
  helper_contact?: string
}) {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF()
  const pageW = 210
  const margin = 14
  const contentW = pageW - margin * 2

  // Header
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('shiPRO', margin, 20)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text('Fleet Management & Logistics', margin, 27)
  doc.text('shiPRO Logistics Corp. | admin@shipro.ph', margin, 32)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('PAYSLIP', pageW - margin, 20, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(payslip.payslip_number, pageW - margin, 27, { align: 'right' })
  doc.text(formatDate(new Date()), pageW - margin, 32, { align: 'right' })

  doc.setDrawColor(180)
  doc.line(margin, 37, pageW - margin, 37)

  // Info grid — two columns, text wrapped
  let y = 46
  const col1 = margin
  const col2 = margin + contentW / 2 + 4
  const colW = contentW / 2 - 4

  function label(text: string, x: number, cy: number) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120)
    doc.text(text, x, cy)
  }
  function value(text: string, x: number, cy: number, maxW: number): number {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0)
    const lines = doc.splitTextToSize(text || '-', maxW)
    doc.text(lines, x, cy)
    return lines.length
  }

  label('TRUCK OWNER / COMPANY', col1, y)
  label('JOB ORDER', col2, y)
  y += 5
  const r1 = value(payslip.driver_name, col1, y, colW)
  value(payslip.job_number, col2, y, colW)
  y += Math.max(r1, 1) * 5 + 4

  label('DELIVERY DATE', col1, y)
  label('TRUCK TYPE', col2, y)
  y += 5
  value(formatDate(payslip.delivery_date), col1, y, colW)
  value(payslip.truck_type_label, col2, y, colW)
  y += 9

  label('PICKUP LOCATION', col1, y)
  label('DROP-OFF LOCATION', col2, y)
  y += 5
  const r3 = value(payslip.pickup_location, col1, y, colW)
  const r4 = value(payslip.dropoff_location, col2, y, colW)
  y += Math.max(r3, r4) * 5 + 6

  // Driver & Helper row (if available)
  if (payslip.assigned_driver_name || payslip.helper_name) {
    label('DRIVER', col1, y)
    if (payslip.helper_name) label('HELPER / PAHINANTE', col2, y)
    y += 5
    const driverText = [payslip.assigned_driver_name, payslip.assigned_driver_contact].filter(Boolean).join(' · ') || '-'
    const r5 = value(driverText, col1, y, colW)
    if (payslip.helper_name) {
      const helperText = [payslip.helper_name, payslip.helper_contact].filter(Boolean).join(' · ')
      value(helperText, col2, y, colW)
    }
    y += Math.max(r5, 1) * 5 + 4
  }

  doc.setDrawColor(180)
  doc.line(margin, y, pageW - margin, y)
  y += 6

  // Inventory items table (if provided)
  if (payslip.items && payslip.items.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0)
    doc.text('CARGO / INVENTORY', margin, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Qty', 'CBM/Unit', 'Total CBM']],
      body: payslip.items.map(it => [
        it.item_name,
        String(it.quantity),
        it.cbm_per_item.toFixed(3),
        it.total_cbm.toFixed(3),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // Rate breakdown table
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('RATE BREAKDOWN', margin, y)
  y += 2

  const rateBody: string[][] = []
  if (payslip.actual_cbm && payslip.rate_per_cbm) {
    rateBody.push([`CBM Rate (${payslip.actual_cbm} CBM × ₱${payslip.rate_per_cbm.toLocaleString()}/CBM)`, formatCurrency(payslip.actual_cbm * payslip.rate_per_cbm)])
    if (payslip.target_cbm && payslip.target_cbm > payslip.actual_cbm) {
      const shortfall = (payslip.target_cbm - payslip.actual_cbm).toFixed(3)
      rateBody.push([`CBM Shortfall Deduction (-${shortfall} CBM)`, `(${formatCurrency(payslip.deductions)})`])
    }
  } else {
    rateBody.push(['Base Rate', formatCurrency(payslip.base_rate)])
    if (payslip.deductions > 0) rateBody.push(['Deductions', `(${formatCurrency(payslip.deductions)})`])
  }
  if (payslip.additional_charges > 0) rateBody.push(['Additional Charges', formatCurrency(payslip.additional_charges)])
  if (payslip.fuel_allowance > 0) rateBody.push(['Fuel Allowance', formatCurrency(payslip.fuel_allowance)])
  if (payslip.toll_fee > 0) rateBody.push(['Toll Fee', formatCurrency(payslip.toll_fee)])
  if (payslip.parking_fee > 0) rateBody.push(['Parking Fee', formatCurrency(payslip.parking_fee)])

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: rateBody,
    foot: [['TOTAL NET PAYOUT', formatCurrency(payslip.total_amount)]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
    footStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: margin },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text(`Payment Status: ${payslip.payment_status.toUpperCase()}`, margin, finalY)

  if (payslip.remarks) {
    const remarkLines = doc.splitTextToSize(`Remarks: ${payslip.remarks}`, contentW)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(remarkLines, margin, finalY + 7)
  }

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('This document is computer-generated. No signature required.', margin, 287)
  doc.text('shiPRO Fleet Management System', pageW - margin, 287, { align: 'right' })

  doc.save(`${payslip.payslip_number}.pdf`)
}

// ── Export helpers ─────────────────────────────────────────

export function exportToCSV<T extends Record<string, unknown>>(data: T[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${format(new Date(), 'yyyyMMdd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
