// ============================================================
// shiPRO - TypeScript Type Definitions
// ============================================================

export type UserRole = 'admin' | 'driver' | 'warehouse' | 'client'

export type VerificationStatus = 'pending' | 'for_review' | 'approved' | 'rejected' | 'expired'

export type TruckAvailability = 'available' | 'on_job' | 'under_maintenance' | 'inactive'

export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'pending_upload'

export type JobStatus =
  | 'draft'
  | 'posted'
  | 'open_for_applications'
  | 'pending_selection'
  | 'pending_assignment'
  | 'assigned'
  | 'accepted'
  | 'at_pickup'
  | 'loaded'
  | 'in_transit'
  | 'arrived'
  | 'delivered'
  | 'completed'
  | 'cancelled'

export type PaymentStatus = 'pending' | 'processing' | 'paid'

export type ShipmentCategory = 'appliances' | 'electronics' | 'furniture' | 'general_cargo' | 'others'

export type TruckType =
  | 'motorcycle'
  | 'sedan'
  | 'mpv'
  | 'small_van'
  | 'l300_fb_van'
  | '6w_closed_van'
  | '6w_dropside'
  | '6w_wing_van'
  | 'closed_van_10ft'
  | 'closed_van_12ft'
  | 'closed_van_14ft'
  | 'closed_van_16ft'
  | 'closed_van_18ft'
  | 'closed_van_20ft'
  | 'closed_van_22ft'
  | 'closed_van_24ft'
  | '4w_truck'
  | '6w_truck'
  | '10w_truck'
  | '12w_truck'
  | '14w_truck'
  | 'wing_van'
  | 'forward_truck'
  | 'flatbed_truck'
  | 'elf_truck'
  | 'reefer_van'
  | 'container_van'

// ── Users ─────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  full_name: string
  company_name?: string
  contact_number?: string
  role: UserRole
  is_verified: boolean
  avatar_url?: string
  created_at: string
  updated_at: string
}

// ── Trucks ────────────────────────────────────────────────

export interface Truck {
  id: string
  owner_id: string
  owner_name: string
  business_name?: string
  contact_person: string
  contact_number: string
  email: string
  driver_name: string
  driver_contact: string
  plate_number: string
  truck_type: TruckType
  truck_type_label: string
  cbm_capacity: number
  load_capacity_kg: number
  ltfrb_number?: string
  availability: TruckAvailability
  verification_status: VerificationStatus
  admin_remarks?: string
  created_at: string
  updated_at: string
  documents?: TruckDocument[]
}

export interface TruckDocument {
  id: string
  truck_id: string
  document_type: string
  file_url?: string
  expiry_date?: string
  status: DocumentStatus
  uploaded_at: string
}

// ── Job Orders ────────────────────────────────────────────

export interface JobOrder {
  id: string
  job_number: string
  created_by: string
  pickup_location: string
  dropoff_location: string
  client_name: string
  contact_person: string
  contact_number: string
  shipment_category: ShipmentCategory
  goods_description?: string
  total_cbm?: number
  estimated_weight_kg?: number
  required_truck_type?: TruckType
  required_truck_type_label?: string
  delivery_date: string
  delivery_time?: string
  special_instructions?: string
  status: JobStatus
  assigned_truck_id?: string
  assigned_driver_id?: string
  base_rate?: number
  other_charges?: number
  total_rate?: number
  remarks?: string
  created_at: string
  updated_at: string
  truck?: Truck
  driver?: User
  shipment_items?: ShipmentItem[]
  status_logs?: DeliveryStatusLog[]
  applicants?: JobApplicant[]
}

export interface ShipmentItem {
  id: string
  job_order_id: string
  item_name: string
  quantity: number
  cbm_per_item?: number
  total_cbm?: number
  is_fragile: boolean
  requires_special_handling: boolean
  remarks?: string
}

export interface JobApplicant {
  id: string
  job_order_id: string
  truck_id: string
  driver_id: string
  status: 'pending' | 'approved' | 'rejected'
  message?: string
  applied_at: string
  truck?: Truck
  driver?: User
}

export interface DeliveryStatusLog {
  id: string
  job_order_id: string
  status: JobStatus
  note?: string
  location?: string
  proof_url?: string
  logged_by: string
  logged_at: string
}

// ── Payslips ──────────────────────────────────────────────

export interface Payslip {
  id: string
  payslip_number: string
  driver_id: string
  job_order_id: string
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
  payment_status: PaymentStatus
  date_paid?: string
  remarks?: string
  created_by: string
  created_at: string
  driver?: User
  job_order?: JobOrder
}

// ── Notifications ─────────────────────────────────────────

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  is_read: boolean
  link?: string
  created_at: string
}

// ── Dashboard ─────────────────────────────────────────────

export interface DashboardStats {
  active_jobs: number
  pending_jobs: number
  in_transit: number
  completed_today: number
  available_trucks: number
  total_trucks: number
  registered_drivers: number
  total_payables: number
  cancelled_this_week: number
  jobs_by_status: { status: JobStatus; count: number }[]
}

// ── API Responses ─────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// ── Forms ─────────────────────────────────────────────────

export interface LoginForm {
  email: string
  password: string
  role: UserRole
}

export interface RegisterForm {
  email: string
  password: string
  confirm_password: string
  full_name: string
  company_name?: string
  contact_number?: string
  role: UserRole
}

export interface JobOrderForm {
  pickup_location: string
  dropoff_location: string
  client_name: string
  contact_person: string
  contact_number: string
  shipment_category: ShipmentCategory
  goods_description?: string
  total_cbm?: number
  estimated_weight_kg?: number
  required_truck_type?: TruckType
  delivery_date: string
  delivery_time?: string
  special_instructions?: string
  base_rate?: number
  other_charges?: number
  status: JobStatus
  shipment_items: ShipmentItemForm[]
}

export interface ShipmentItemForm {
  item_name: string
  quantity: number
  cbm_per_item?: number
  is_fragile: boolean
  requires_special_handling: boolean
  remarks?: string
}

export interface TruckRegistrationForm {
  owner_name: string
  business_name?: string
  contact_person: string
  contact_number: string
  email: string
  driver_name: string
  driver_contact: string
  plate_number: string
  truck_type: TruckType
  cbm_capacity: number
  load_capacity_kg: number
  ltfrb_number?: string
}

export interface PayslipForm {
  driver_id: string
  job_order_id: string
  delivery_date: string
  base_rate: number
  additional_charges: number
  fuel_allowance: number
  toll_fee: number
  parking_fee: number
  deductions: number
  payment_status: PaymentStatus
  remarks?: string
}

// ── Constants ─────────────────────────────────────────────

export const TRUCK_TYPE_LABELS: Record<TruckType, string> = {
  motorcycle: 'Motorcycle Delivery',
  sedan: 'Sedan',
  mpv: 'MPV',
  small_van: 'Small Van',
  l300_fb_van: 'L300 / FB Van',
  '6w_closed_van': '6-Wheeler Closed Van',
  '6w_dropside': '6-Wheeler Dropside',
  '6w_wing_van': '6-Wheeler Wing Van',
  closed_van_10ft: '10ft Closed Van',
  closed_van_12ft: '12ft Closed Van',
  closed_van_14ft: '14ft Closed Van',
  closed_van_16ft: '16ft Closed Van',
  closed_van_18ft: '18ft Closed Van',
  closed_van_20ft: '20ft Closed Van',
  closed_van_22ft: '22ft Closed Van',
  closed_van_24ft: '24ft Closed Van',
  '4w_truck': '4-Wheeler Truck',
  '6w_truck': '6-Wheeler Truck',
  '10w_truck': '10-Wheeler Truck',
  '12w_truck': '12-Wheeler Truck',
  '14w_truck': '14-Wheeler Truck',
  wing_van: 'Wing Van',
  forward_truck: 'Forward Truck',
  flatbed_truck: 'Flatbed Truck',
  elf_truck: 'Elf Truck',
  reefer_van: 'Reefer Van',
  container_van: 'Container Van',
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  open_for_applications: 'Open for Applications',
  pending_selection: 'Pending Admin Selection',
  pending_assignment: 'Pending Assignment',
  assigned: 'Assigned',
  accepted: 'Accepted',
  at_pickup: 'At Pickup Location',
  loaded: 'Loaded',
  in_transit: 'In Transit',
  arrived: 'Arrived at Drop-off',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const DELIVERY_STEPS: JobStatus[] = [
  'accepted',
  'at_pickup',
  'loaded',
  'in_transit',
  'arrived',
  'delivered',
  'completed',
]

export const DOCUMENT_TYPES = [
  'OR/CR',
  'LTFRB Permit',
  'Insurance',
  "Driver's License",
  'Medical Certificate',
  'Vehicle Photos',
  'Business Permit',
  'BIR Registration',
  'DTI / SEC Registration',
]

// ── Extended Job Statuses (added for driver application workflow) ──
// open_for_applications, pending_selection added to JobStatus union above
// These are added as string literals in the DB check constraint via migration

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface JobApplication {
  id: string
  job_order_id: string
  driver_id: string
  truck_id: string
  status: ApplicationStatus
  date_applied: string
  admin_remarks?: string
  approved_by?: string
  approved_at?: string
  truck?: Truck
  driver?: User
}
