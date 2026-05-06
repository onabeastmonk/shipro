import { supabase } from './supabase'
import type {
  JobOrder, JobOrderForm, Truck, TruckRegistrationForm,
  Payslip, PayslipForm, DashboardStats, Notification,
  ShipmentItem, DeliveryStatusLog, JobApplicant, JobStatus
} from '@/types'

// ── Dashboard ──────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [jobsRes, trucksRes, driversRes, payslipsRes] = await Promise.all([
    supabase.from('job_orders').select('status, created_at'),
    supabase.from('trucks').select('availability, verification_status'),
    supabase.from('profiles').select('id').eq('role', 'driver'),
    supabase.from('payslips').select('total_amount, payment_status').eq('payment_status', 'pending'),
  ])

  const jobs = jobsRes.data || []
  const trucks = trucksRes.data || []
  const drivers = driversRes.data || []
  const payslips = payslipsRes.data || []

  const today = new Date().toISOString().split('T')[0]

  const jobsByStatus = jobs.reduce((acc: Record<string, number>, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})

  return {
    active_jobs: jobs.filter(j => !['completed', 'cancelled', 'draft'].includes(j.status)).length,
    pending_jobs: jobsByStatus['pending_assignment'] || 0,
    in_transit: jobsByStatus['in_transit'] || 0,
    completed_today: jobs.filter(j => j.status === 'completed' && j.created_at?.startsWith(today)).length,
    available_trucks: trucks.filter(t => t.availability === 'available' && t.verification_status === 'approved').length,
    total_trucks: trucks.length,
    registered_drivers: drivers.length,
    total_payables: payslips.reduce((sum, p) => sum + (p.total_amount || 0), 0),
    cancelled_this_week: jobs.filter(j => j.status === 'cancelled').length,
    jobs_by_status: Object.entries(jobsByStatus).map(([status, count]) => ({
      status: status as JobStatus,
      count,
    })),
  }
}

// ── Job Orders ─────────────────────────────────────────────

export async function fetchJobOrders(filters?: {
  status?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('job_orders')
    .select(`
      *,
      truck:trucks(id, plate_number, truck_type_label, driver_name),
      driver:profiles!assigned_driver_id(id, full_name, contact_number),
      applicants:job_applicants(id, status)
    `)
    .order('created_at', { ascending: false })

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters?.search) {
    query = query.or(
      `job_number.ilike.%${filters.search}%,client_name.ilike.%${filters.search}%,pickup_location.ilike.%${filters.search}%,dropoff_location.ilike.%${filters.search}%`
    )
  }
  if (filters?.dateFrom) query = query.gte('delivery_date', filters.dateFrom)
  if (filters?.dateTo) query = query.lte('delivery_date', filters.dateTo)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset) query = query.range(filters.offset, (filters.offset + (filters.limit || 20)) - 1)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as JobOrder[]
}

export async function fetchJobOrder(id: string) {
  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      *,
      truck:trucks(id, plate_number, truck_type_label, driver_name, owner_name, contact_number),
      driver:profiles!assigned_driver_id(id, full_name, contact_number, email),
      shipment_items(*),
      status_logs:delivery_status_logs(*, logged_by_profile:profiles!logged_by(full_name)),
      applicants:job_applicants(
        *,
        truck:trucks(id, plate_number, truck_type_label, owner_name, driver_name, cbm_capacity),
        driver:profiles!driver_id(id, full_name, contact_number)
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data as JobOrder
}

export async function createJobOrder(form: JobOrderForm, userId: string) {
  const { shipment_items, ...jobData } = form

  const { data: job, error: jobError } = await supabase
    .from('job_orders')
    .insert({ ...jobData, created_by: userId })
    .select()
    .single()

  if (jobError) throw new Error(jobError.message)

  if (shipment_items?.length) {
    const items = shipment_items.map(item => ({
      ...item,
      job_order_id: job.id,
      total_cbm: (item.cbm_per_item || 0) * item.quantity,
    }))
    const { error: itemsError } = await supabase.from('shipment_items').insert(items)
    if (itemsError) throw new Error(itemsError.message)
  }

  await logActivity(userId, 'create', 'job_order', job.id, `Created job order ${job.job_number}`)
  return job as JobOrder
}

export async function updateJobOrder(id: string, updates: Partial<JobOrder>, userId: string) {
  const { data, error } = await supabase
    .from('job_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  await logActivity(userId, 'update', 'job_order', id, `Updated job order`)
  return data as JobOrder
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  userId: string,
  note?: string,
  proofUrl?: string
) {
  const { error: jobError } = await supabase
    .from('job_orders')
    .update({ status })
    .eq('id', jobId)

  if (jobError) throw new Error(jobError.message)

  const { error: logError } = await supabase
    .from('delivery_status_logs')
    .insert({ job_order_id: jobId, status, note, proof_url: proofUrl, logged_by: userId })

  if (logError) throw new Error(logError.message)
  await logActivity(userId, 'status_update', 'job_order', jobId, `Updated status to ${status}`)
}

export async function applyToJob(jobId: string, truckId: string, driverId: string, message?: string) {
  const { data, error } = await supabase
    .from('job_applicants')
    .insert({ job_order_id: jobId, truck_id: truckId, driver_id: driverId, message })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function assignTruck(
  jobId: string,
  truckId: string,
  driverId: string,
  applicantId: string,
  userId: string
) {
  // Update job
  await supabase.from('job_orders').update({
    status: 'assigned',
    assigned_truck_id: truckId,
    assigned_driver_id: driverId,
  }).eq('id', jobId)

  // Approve this applicant
  await supabase.from('job_applicants').update({ status: 'approved' }).eq('id', applicantId)

  // Reject others
  await supabase.from('job_applicants')
    .update({ status: 'rejected' })
    .eq('job_order_id', jobId)
    .neq('id', applicantId)

  // Mark truck as on_job
  await supabase.from('trucks').update({ availability: 'on_job' }).eq('id', truckId)

  await logActivity(userId, 'assign', 'job_order', jobId, `Assigned truck to job order`)
}

// ── Trucks ─────────────────────────────────────────────────

export async function fetchTrucks(filters?: {
  verification_status?: string
  availability?: string
  search?: string
}) {
  let query = supabase
    .from('trucks')
    .select('*, documents:truck_documents(*)')
    .order('created_at', { ascending: false })

  if (filters?.verification_status) query = query.eq('verification_status', filters.verification_status)
  if (filters?.availability) query = query.eq('availability', filters.availability)
  if (filters?.search) {
    query = query.or(
      `plate_number.ilike.%${filters.search}%,owner_name.ilike.%${filters.search}%,driver_name.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as Truck[]
}

export async function fetchTruck(id: string) {
  const { data, error } = await supabase
    .from('trucks')
    .select('*, documents:truck_documents(*)')
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data as Truck
}

export async function registerTruck(form: TruckRegistrationForm, ownerId: string) {
  const { data, error } = await supabase
    .from('trucks')
    .insert({ ...form, owner_id: ownerId, verification_status: 'pending' })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Create document placeholders
  const docTypes = ['OR/CR', 'LTFRB Permit', 'Insurance', "Driver's License", 'Medical Certificate', 'Vehicle Photos']
  await supabase.from('truck_documents').insert(
    docTypes.map(doc => ({ truck_id: data.id, document_type: doc, status: 'pending_upload' }))
  )

  await logActivity(ownerId, 'register', 'truck', data.id, `Registered truck ${form.plate_number}`)
  return data as Truck
}

export async function updateTruckVerification(
  truckId: string,
  status: string,
  remarks: string,
  adminId: string
) {
  const { error } = await supabase
    .from('trucks')
    .update({ verification_status: status, admin_remarks: remarks })
    .eq('id', truckId)

  if (error) throw new Error(error.message)
  await logActivity(adminId, 'verify', 'truck', truckId, `Set truck verification to ${status}`)
}

export async function uploadTruckDocument(
  truckId: string,
  documentType: string,
  file: File,
  expiryDate?: string
) {
  const ext = file.name.split('.').pop()
  const path = `trucks/${truckId}/${documentType.replace(/\s/g, '_')}_${Date.now()}.${ext}`

  // Upload file to storage
  const { error: uploadError } = await supabase.storage
    .from('shipro-documents')
    .upload(path, file, { upsert: true })

  if (uploadError) throw new Error(uploadError.message)

  const { data: { publicUrl } } = supabase.storage
    .from('shipro-documents')
    .getPublicUrl(path)

  // Check if a document record already exists for this truck + type
  const { data: existing } = await supabase
    .from('truck_documents')
    .select('id')
    .eq('truck_id', truckId)
    .eq('document_type', documentType)
    .single()

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from('truck_documents')
      .update({
        file_url: publicUrl,
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        expiry_date: expiryDate || null,
        status: 'valid',
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    // Insert new record
    const { error } = await supabase
      .from('truck_documents')
      .insert({
        truck_id: truckId,
        document_type: documentType,
        file_url: publicUrl,
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        expiry_date: expiryDate || null,
        status: 'valid',
      })
    if (error) throw new Error(error.message)
  }
}

// ── Drivers ────────────────────────────────────────────────

export async function fetchDrivers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'driver')
    .order('full_name')

  if (error) throw new Error(error.message)
  return data
}

// ── Payslips ───────────────────────────────────────────────

export async function fetchPayslips(filters?: { driver_id?: string; status?: string }) {
  let query = supabase
    .from('payslips')
    .select('*, driver:profiles!driver_id(full_name, email), job_order:job_orders(job_number)')
    .order('created_at', { ascending: false })

  if (filters?.driver_id) query = query.eq('driver_id', filters.driver_id)
  if (filters?.status) query = query.eq('payment_status', filters.status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as Payslip[]
}

export async function createPayslip(form: PayslipForm, createdBy: string) {
  const total = form.base_rate + form.additional_charges + form.fuel_allowance +
    form.toll_fee + form.parking_fee - form.deductions

  const { data, error } = await supabase
    .from('payslips')
    .insert({ ...form, total_amount: Math.max(0, total), created_by: createdBy })
    .select()
    .single()

  if (error) throw new Error(error.message)
  await logActivity(createdBy, 'create', 'payslip', data.id, `Created payslip ${data.payslip_number}`)
  return data as Payslip
}

export async function updatePayslipStatus(
  id: string,
  status: string,
  datePaid?: string,
  userId?: string
) {
  const { error } = await supabase
    .from('payslips')
    .update({ payment_status: status, date_paid: datePaid })
    .eq('id', id)

  if (error) throw new Error(error.message)
  if (userId) await logActivity(userId, 'update', 'payslip', id, `Updated payslip status to ${status}`)
}

// ── Notifications ──────────────────────────────────────────

export async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data as Notification[]
}

export async function markNotificationRead(id: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId)
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'error' = 'info',
  link?: string
) {
  await supabase.from('notifications').insert({ user_id: userId, title, message, type, link })
}

// ── Activity Logs ──────────────────────────────────────────

export async function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata,
  })
}

export async function fetchActivityLogs(limit = 50) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, user:profiles(full_name, role)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data
}

// ── File Uploads ───────────────────────────────────────────

export async function uploadProofOfDelivery(jobId: string, file: File) {
  const ext = file.name.split('.').pop()
  const path = `proof/${jobId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('shipro-documents')
    .upload(path, file)

  if (error) throw new Error(error.message)

  const { data: { publicUrl } } = supabase.storage
    .from('shipro-documents')
    .getPublicUrl(path)

  return publicUrl
}
