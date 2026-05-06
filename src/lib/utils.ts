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
    draft: 0, posted: 0, pending_assignment: 0, assigned: 0,
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
}) {
  // Dynamic import to avoid SSR issues
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('shiPRO', 14, 20)
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text('Fleet Management & Logistics', 14, 27)
  doc.text('shiPRO Logistics Corp. | admin@shipro.ph', 14, 33)

  // Payslip title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('PAYSLIP', 196, 20, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(payslip.payslip_number, 196, 27, { align: 'right' })
  doc.text(formatDate(new Date()), 196, 33, { align: 'right' })

  // Divider
  doc.setDrawColor(200)
  doc.line(14, 40, 196, 40)

  // Driver & Job Info
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.text('DRIVER / TRUCKING COMPANY', 14, 50)
  doc.setFont('helvetica', 'normal')
  doc.text(payslip.driver_name, 14, 57)

  doc.setFont('helvetica', 'bold')
  doc.text('JOB ORDER', 120, 50)
  doc.setFont('helvetica', 'normal')
  doc.text(payslip.job_number, 120, 57)

  doc.setFont('helvetica', 'bold')
  doc.text('DELIVERY DATE', 14, 67)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(payslip.delivery_date), 14, 74)

  doc.setFont('helvetica', 'bold')
  doc.text('TRUCK TYPE', 120, 67)
  doc.setFont('helvetica', 'normal')
  doc.text(payslip.truck_type_label, 120, 74)

  doc.setFont('helvetica', 'bold')
  doc.text('PICKUP', 14, 84)
  doc.setFont('helvetica', 'normal')
  doc.text(payslip.pickup_location, 14, 91)

  doc.setFont('helvetica', 'bold')
  doc.text('DROP-OFF', 120, 84)
  doc.setFont('helvetica', 'normal')
  doc.text(payslip.dropoff_location, 120, 91)

  doc.line(14, 98, 196, 98)

  // Rate Breakdown table
  autoTable(doc, {
    startY: 104,
    head: [['Description', 'Amount']],
    body: [
      ['Base Rate', formatCurrency(payslip.base_rate)],
      ['Additional Charges', formatCurrency(payslip.additional_charges)],
      ['Fuel Allowance', formatCurrency(payslip.fuel_allowance)],
      ['Toll Fee', formatCurrency(payslip.toll_fee)],
      ['Parking Fee', formatCurrency(payslip.parking_fee)],
      ['Deductions', `(${formatCurrency(payslip.deductions)})`],
    ],
    foot: [['TOTAL NET PAYOUT', formatCurrency(payslip.total_amount)]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255] },
    footStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 12 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10

  // Payment status
  doc.setFont('helvetica', 'bold')
  doc.text(`Payment Status: ${payslip.payment_status.toUpperCase()}`, 14, finalY)

  if (payslip.remarks) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Remarks: ${payslip.remarks}`, 14, finalY + 8)
  }

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('This document is computer-generated. No signature required.', 14, 280)
  doc.text('shiPRO Fleet Management System', 196, 280, { align: 'right' })

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
