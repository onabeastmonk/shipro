'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Search, MessageCircle, Plus } from 'lucide-react'

export default function ChatPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      await loadConversations(session.user.id)
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .neq('id', session.user.id)
        .order('full_name')
      setAllUsers(users || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function loadConversations(uid: string) {
    const { data: sent } = await supabase
      .from('messages')
      .select('*, receiver:profiles!receiver_id(id, full_name, role)')
      .eq('sender_id', uid)
      .order('created_at', { ascending: false })

    const { data: received } = await supabase
      .from('messages')
      .select('*, sender:profiles!sender_id(id, full_name, role)')
      .eq('receiver_id', uid)
      .order('created_at', { ascending: false })

    // Build conversation list
    const convMap = new Map<string, any>()

    for (const msg of (sent || [])) {
      const otherId = msg.receiver_id
      if (!convMap.has(otherId) || msg.created_at > convMap.get(otherId).last_message_at) {
        convMap.set(otherId, {
          other_user: msg.receiver,
          last_message: msg.content,
          last_message_at: msg.created_at,
          unread: 0,
        })
      }
    }

    for (const msg of (received || [])) {
      const otherId = msg.sender_id
      if (!convMap.has(otherId) || msg.created_at > convMap.get(otherId).last_message_at) {
        convMap.set(otherId, {
          other_user: msg.sender,
          last_message: msg.content,
          last_message_at: msg.created_at,
          unread: !msg.is_read ? (convMap.get(otherId)?.unread || 0) + 1 : 0,
        })
      }
    }

    setConversations(Array.from(convMap.values()).sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    ))
  }

  const roleLabel: Record<string, string> = {
    admin: '⚙️ Admin', fleet_manager: '🏢 Fleet Manager',
    truck_owner: '🚛 Truck Owner', driver: '👤 Driver', client: '👁️ Client',
  }

  const filtered = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Messages</h1>
          <p className="text-text-muted text-sm mt-0.5">Chat with your team</p>
        </div>
        <button onClick={() => setShowNewChat(true)}
          className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={14} /> New Chat
        </button>
      </div>

      {loading ? (
        Array(4).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-16 rounded-lg mb-2" />)
      ) : conversations.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No messages yet</p>
          <p className="text-text-muted text-sm mt-1">Start a conversation with your team</p>
          <button onClick={() => setShowNewChat(true)} className="btn btn-primary btn-sm mt-4">
            Start Chatting
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => (
            <Link key={conv.other_user?.id} href={`/chat/${conv.other_user?.id}`}>
              <div className="bg-bg-secondary border border-border rounded-lg p-3.5 flex items-center gap-3 hover:border-border-secondary transition-colors">
                <div className="w-11 h-11 rounded-full bg-bg-tertiary flex items-center justify-center font-heading text-base font-bold text-text-secondary flex-shrink-0">
                  {conv.other_user?.full_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-sm font-semibold text-text-primary">{conv.other_user?.full_name}</span>
                    <span className="text-xs text-text-muted">{formatDate(conv.last_message_at)}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{roleLabel[conv.other_user?.role] || conv.other_user?.role}</div>
                  <p className="text-xs text-text-secondary truncate mt-0.5">{conv.last_message}</p>
                </div>
                {conv.unread > 0 && (
                  <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center text-xs font-bold text-bg-primary flex-shrink-0">
                    {conv.unread}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[80vh] overflow-y-auto scrollbar-hide">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-secondary z-10">
              <h2 className="font-heading text-base font-bold">New Conversation</h2>
              <button onClick={() => setShowNewChat(false)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input className="form-input pl-9" placeholder="Search people..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="space-y-2">
                {filtered.map(user => (
                  <div key={user.id} onClick={() => { setShowNewChat(false); router.push(`/chat/${user.id}`) }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-bg-tertiary cursor-pointer transition-colors">
                    <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center font-heading text-sm font-bold text-text-secondary">
                      {user.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{user.full_name}</div>
                      <div className="text-xs text-text-muted">{roleLabel[user.role] || user.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
