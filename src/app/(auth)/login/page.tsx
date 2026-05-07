'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { signIn } from '@/lib/auth'
import type { UserRole } from '@/types'

const ROLES: { value: UserRole; label: string; icon: string; desc: string }[] = [
  { value: 'admin', label: 'Fleet Manager', icon: '🏢', desc: 'Full system access' },
  { value: 'driver', label: 'Driver / Trucker', icon: '🚛', desc: 'Jobs & deliveries' },
  { value: 'warehouse_manager', label: 'Warehouse Manager', icon: '🏭', desc: 'Manage warehouses & inventory' },
  { value: 'client', label: 'Client', icon: '👁️', desc: 'View tracking' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('admin@shipro.ph')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('admin')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please enter email and password')
      return
    }

    setLoading(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back!')
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Logo */}
      <div className="mb-10">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-text-primary">
          shi<span className="text-text-muted">PRO</span>
        </h1>
        <p className="text-text-secondary mt-2 text-sm leading-relaxed max-w-xs">
          Fleet management & logistics operations platform for modern companies.
        </p>
      </div>

      {/* Role selector */}
      <div className="mb-6">
        <label className="form-label">Sign in as</label>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={`p-3 rounded-md border text-left transition-all ${
                role === r.value
                  ? 'border-text-muted bg-bg-tertiary'
                  : 'border-border bg-bg-secondary'
              }`}
            >
              <div className="text-xl mb-1">{r.icon}</div>
              <div className="text-xs font-semibold text-text-primary">{r.label}</div>
              <div className="text-xs text-text-muted">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="form-label">Email Address</label>
          <input
            type="email"
            className="form-input"
            placeholder="admin@shipro.ph"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-text-muted hover:text-text-secondary">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-full text-base py-3.5 mt-2"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="text-center mt-6">
        <span className="text-text-muted text-sm">Don't have an account? </span>
        <Link href="/register" className="text-text-primary text-sm font-semibold">
          Register
        </Link>
      </div>

      <div className="text-center mt-8 text-xs text-text-muted">
        shiPRO v1.0 — Logistics Fleet Management
      </div>
    </div>
  )
}
