'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { signUp } from '@/lib/auth'
import type { UserRole } from '@/types'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company_name: '',
    contact_number: '',
    password: '',
    confirm_password: '',
    role: 'fleet_manager' as UserRole,
  })

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await signUp(form.email, form.password, form.full_name, form.role, form.company_name, form.contact_number)
      toast.success('Account created! Please check your email to verify.')
      router.push('/login')
    } catch (err: any) {
      toast.error(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <Link href="/login" className="text-text-muted text-sm mb-4 inline-block">← Back to login</Link>
        <h1 className="font-heading text-3xl font-bold text-text-primary">Create Account</h1>
        <p className="text-text-secondary text-sm mt-1">Join shiPRO fleet management platform</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="form-label">Account Type</label>
          <select className="form-input" value={form.role} onChange={e => update('role', e.target.value)}>
            <option value="fleet_manager">Fleet Manager</option>
            <option value="warehouse_manager">Warehouse Manager</option>
            <option value="truck_owner">Truck Owner</option>
            <option value="driver">Driver</option>
            <option value="client">Client / Viewer</option>
          </select>
        </div>

        <div>
          <label className="form-label">Full Name</label>
          <input className="form-input" placeholder="Your full name" required
            value={form.full_name} onChange={e => update('full_name', e.target.value)} />
        </div>

        <div>
          <label className="form-label">Company / Business Name</label>
          <input className="form-input" placeholder="Optional"
            value={form.company_name} onChange={e => update('company_name', e.target.value)} />
        </div>

        <div>
          <label className="form-label">Email Address</label>
          <input className="form-input" type="email" placeholder="email@example.com" required
            value={form.email} onChange={e => update('email', e.target.value)} />
        </div>

        <div>
          <label className="form-label">Mobile Number</label>
          <input className="form-input" type="tel" placeholder="+63 9XX XXX XXXX"
            value={form.contact_number} onChange={e => update('contact_number', e.target.value)} />
        </div>

        <div>
          <label className="form-label">Password</label>
          <input className="form-input" type="password" placeholder="At least 8 characters" required
            value={form.password} onChange={e => update('password', e.target.value)} />
        </div>

        <div>
          <label className="form-label">Confirm Password</label>
          <input className="form-input" type="password" placeholder="Repeat password" required
            value={form.confirm_password} onChange={e => update('confirm_password', e.target.value)} />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary btn-full py-3.5 mt-2">
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <p className="text-xs text-text-muted text-center">
          By registering, you agree to shiPRO's Terms of Service and Privacy Policy.
        </p>
      </form>

      <div className="text-center mt-6 text-sm text-text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-text-primary font-semibold">Sign In</Link>
      </div>
    </div>
  )
}
