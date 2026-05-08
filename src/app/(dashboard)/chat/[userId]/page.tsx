'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, Send, Phone } from 'lucide-react'

export default function ChatThreadPage() {
  const { userId: otherUserId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [myId, setMyId] = useState<string | null>(null)
  const [otherUser, setOtherUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async (myUid: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myUid},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${myUid})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    // Mark as read
    await supabase.from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('sender_id', otherUserId)
      .eq('receiver_id', myUid)
      .eq('is_read', false)
  }, [otherUserId])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setMyId(session.user.id)

      const { data: other } = await supabase
        .from('profiles')
        .select('id, full_name, role, contact_number')
        .eq('id', otherUserId)
        .single()
      setOtherUser(other)

      await loadMessages(session.user.id)

      // Real-time subscription
      channel = supabase
        .channel(`chat-${session.user.id}-${otherUserId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        }, (payload: any) => {
          const msg = payload.new
          const isRelevant =
            (msg.sender_id === otherUserId && msg.receiver_id === session.user.id) ||
            (msg.sender_id === session.user.id && msg.receiver_id === otherUserId)
          if (isRelevant) {
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev
              // replace matching optimistic temp message
              const tempIdx = prev.findIndex(m => m.id.startsWith('temp-') && m.content === msg.content && m.sender_id === msg.sender_id)
              if (tempIdx !== -1) {
                const next = [...prev]
                next[tempIdx] = msg
                return next
              }
              return [...prev, msg]
            })
          }
        })
        .subscribe()
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [otherUserId, router, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!newMessage.trim() || !myId) return
    setSending(true)
    const content = newMessage.trim()
    setNewMessage('')

    const optimistic = { id: `temp-${Date.now()}`, sender_id: myId, receiver_id: otherUserId, content, created_at: new Date().toISOString(), is_read: false }
    setMessages(prev => [...prev, optimistic])

    const { error } = await supabase.from('messages').insert({
      sender_id: myId, receiver_id: otherUserId, content,
    })

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setNewMessage(content)
    }

    // Send notification to receiver
    await supabase.from('notifications').insert({
      user_id: otherUserId,
      type: 'message',
      title: `New message`,
      body: content.substring(0, 100),
      data: { sender_id: myId },
    })

    setSending(false)
  }

  const roleLabel: Record<string, string> = {
    admin: '⚙️ Admin', fleet_manager: '🏢 Fleet Manager',
    truck_owner: '🚛 Truck Owner', driver: '👤 Driver',
  }

  function groupMessages() {
    const groups: { date: string; messages: any[] }[] = []
    let currentDate = ''
    for (const msg of messages) {
      const date = new Date(msg.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })
      if (date !== currentDate) {
        currentDate = date
        groups.push({ date, messages: [msg] })
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    }
    return groups
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto" style={{ height: 'calc(100dvh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-secondary border-b border-border flex-shrink-0">
        <Link href="/chat" className="p-1.5 rounded-md hover:bg-bg-tertiary">
          <ChevronLeft size={20} className="text-text-muted" />
        </Link>
        <div className="w-9 h-9 rounded-full bg-bg-tertiary flex items-center justify-center font-heading text-sm font-bold text-text-secondary flex-shrink-0">
          {otherUser?.full_name?.charAt(0) || '?'}
        </div>
        <div className="flex-1">
          <div className="font-heading text-sm font-semibold">{otherUser?.full_name}</div>
          <div className="text-xs text-text-muted">{roleLabel[otherUser?.role] || otherUser?.role}</div>
        </div>
        {otherUser?.contact_number && (
          <a href={`tel:${otherUser.contact_number}`}
            className="p-2 rounded-full bg-success-bg border border-success-border flex items-center justify-center"
            title="Call this person">
            <Phone size={16} className="text-success" />
          </a>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {groupMessages().map(group => (
          <div key={group.date}>
            <div className="text-center text-xs text-text-muted my-3">{group.date}</div>
            {group.messages.map(msg => {
              const isMe = msg.sender_id === myId
              return (
                <div key={msg.id} className={`flex mb-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isMe ? '#ffffff' : '#2a2a2a',
                    color: isMe ? '#000000' : '#e0e0e0',
                    fontSize: '14px',
                    lineHeight: '1.4',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                    <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>
                      {new Date(msg.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      {isMe && <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 bg-bg-secondary border-t border-border flex-shrink-0">
        <input
          className="form-input flex-1"
          placeholder="Type a message..."
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
        />
        <button
          onClick={sendMessage}
          disabled={sending || !newMessage.trim()}
          style={{
            width: '42px', height: '42px', borderRadius: '50%',
            background: newMessage.trim() ? '#ffffff' : '#2a2a2a',
            border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s', flexShrink: 0,
          }}>
          <Send size={16} style={{ color: newMessage.trim() ? '#000' : '#666' }} />
        </button>
      </div>
    </div>
  )
}
