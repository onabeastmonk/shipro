import { supabase } from './supabase'
import type { User, UserRole } from '@/types'

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    return profile as User | null
  } catch {
    return null
  }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  companyName?: string,
  contactNumber?: string
) {
  // Step 1: Create auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role, company_name: companyName, contact_number: contactNumber },
    },
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('User creation failed')

  // Step 2: Manually insert profile (don't rely on trigger)
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    role,
    company_name: companyName || null,
    contact_number: contactNumber || null,
    is_verified: false,
  }, { onConflict: 'id' })

  // Don't throw on profile error — user was created, profile can be set later
  if (profileError) console.warn('Profile insert warning:', profileError.message)

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })
  if (error) throw new Error(error.message)
}

export async function updateProfile(userId: string, updates: Partial<User>) {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single()
  if (error) throw new Error(error.message)
  return data
}

export function hasRole(user: User | null, roles: UserRole[]): boolean {
  if (!user) return false
  return roles.includes(user.role)
}

export function isAdmin(user: User | null): boolean {
  return hasRole(user, ['admin', 'fleet_manager', 'warehouse_manager'])
}

export function canManageJobs(user: User | null): boolean {
  return hasRole(user, ['admin', 'fleet_manager', 'warehouse_manager'])
}
