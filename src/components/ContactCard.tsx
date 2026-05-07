'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle, Phone } from 'lucide-react'

interface ContactCardProps {
  userId?: string | null          // for chat button
  name: string
  role?: string
  contactNumber?: string | null
  email?: string | null
  label?: string                  // e.g. "Assigned Driver", "Truck Owner"
  compact?: boolean               // smaller version
}

export default function ContactCard({
  userId, name, role, contactNumber, email, label, compact = false
}: ContactCardProps) {

  const router = useRouter()

  const roleLabel: Record<string, string> = {
    admin: '⚙️ Admin',
    fleet_manager: '🏢 Fleet Manager',
    truck_owner: '🚛 Truck Owner',
    driver: '👤 Driver',
    client: '👁️ Client',
  }

  if (compact) {
    return (
      <div className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-secondary flex-shrink-0">
            {name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            {label && <div className="text-xs text-text-muted">{label}</div>}
            <div className="text-sm font-semibold text-text-primary truncate">{name}</div>
            {role && <div className="text-xs text-text-muted">{roleLabel[role] || role}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {contactNumber && (
            <a href={`tel:${contactNumber}`}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
              title={`Call ${name}`}>
              <Phone size={14} style={{ color: '#22c55e' }} />
            </a>
          )}
          {userId && (
            <button
              onClick={() => router.push(`/chat/${userId}`)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}
              title={`Message ${name}`}>
              <MessageCircle size={14} style={{ color: '#60a5fa' }} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-tertiary border border-border rounded-lg p-3.5">
      {label && (
        <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">{label}</div>
      )}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center font-heading text-sm font-bold text-text-secondary flex-shrink-0">
          {name?.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading text-sm font-semibold text-text-primary">{name}</div>
          {role && <div className="text-xs text-text-muted mt-0.5">{roleLabel[role] || role}</div>}
          {contactNumber && <div className="text-xs text-text-muted mt-0.5">📞 {contactNumber}</div>}
          {email && <div className="text-xs text-text-muted mt-0.5">✉️ {email}</div>}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {contactNumber && (
          <a href={`tel:${contactNumber}`}
            className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-xs font-bold transition-colors"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
            <Phone size={13} /> Call
          </a>
        )}
        {userId && (
          <button
            onClick={() => router.push(`/chat/${userId}`)}
            className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-xs font-bold transition-colors"
            style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa' }}>
            <MessageCircle size={13} /> Message
          </button>
        )}
      </div>
    </div>
  )
}
