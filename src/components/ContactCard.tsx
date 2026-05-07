'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle, Phone } from 'lucide-react'

interface ContactCardProps {
  userId?: string | null
  name?: string | null
  role?: string | null
  contactNumber?: string | null
  email?: string | null
  label?: string
  compact?: boolean
}

export default function ContactCard({
  userId, name, role, contactNumber, email, label, compact = false
}: ContactCardProps) {
  const router = useRouter()

  // Don't render if no name
  if (!name) return null

  const roleLabel: Record<string, string> = {
    admin: '⚙️ Admin',
    fleet_manager: '🏢 Fleet Manager',
    truck_owner: '🚛 Truck Owner',
    driver: '👤 Driver',
    client: '👁️ Client',
  }

  const hasContact = !!contactNumber
  const hasChat = !!userId

  if (compact) {
    return (
      <div className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-secondary flex-shrink-0">
            {name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            {label && <div className="text-xs text-text-muted leading-tight">{label}</div>}
            <div className="text-sm font-semibold text-text-primary truncate">{name}</div>
            {role && <div className="text-xs text-text-muted">{roleLabel[role] || role}</div>}
            {contactNumber && <div className="text-xs text-text-muted">📞 {contactNumber}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {hasContact && (
            <a
              href={`tel:${contactNumber}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(34,197,94,0.2)', border: '1.5px solid #22c55e', color: '#22c55e', textDecoration: 'none' }}
            >
              <Phone size={12} /> Call
            </a>
          )}
          {hasChat && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); e.preventDefault(); router.push(`/chat/${userId}`) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(96,165,250,0.2)', border: '1.5px solid #60a5fa', color: '#60a5fa', cursor: 'pointer' }}
            >
              <MessageCircle size={12} /> Chat
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-tertiary border border-border rounded-lg p-4">
      {label && (
        <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3">{label}</div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-bg-elevated flex items-center justify-center font-heading text-base font-bold text-text-secondary flex-shrink-0">
          {name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading text-sm font-semibold text-text-primary">{name}</div>
          {role && <div className="text-xs text-text-muted mt-0.5">{roleLabel[role] || role}</div>}
          {contactNumber && <div className="text-xs text-text-muted mt-0.5">📞 {contactNumber}</div>}
          {email && <div className="text-xs text-text-muted mt-0.5">✉️ {email}</div>}
        </div>
      </div>
      {(hasContact || hasChat) && (
        <div className="flex gap-2">
          {hasContact && (
            <a
              href={`tel:${contactNumber}`}
              className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(34,197,94,0.2)', border: '1.5px solid #22c55e', color: '#22c55e', textDecoration: 'none' }}
            >
              <Phone size={14} /> 📞 Call
            </a>
          )}
          {hasChat && (
            <button
              type="button"
              onClick={() => router.push(`/chat/${userId}`)}
              className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(96,165,250,0.2)', border: '1.5px solid #60a5fa', color: '#60a5fa', cursor: 'pointer' }}
            >
              <MessageCircle size={14} /> 💬 Message
            </button>
          )}
        </div>
      )}
    </div>
  )
}
