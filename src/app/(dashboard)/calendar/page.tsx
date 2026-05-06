'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  id: string
  date: string
  title: string
  subtitle?: string
  type: 'job' | 'document_expiry' | 'document_warning'
  color: string
  data?: any
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    async function load() {
      const [jobsRes, docsRes] = await Promise.all([
        supabase.from('job_orders').select('id, job_number, client_name, delivery_date, status, pickup_location, dropoff_location, total_rate'),
        supabase.from('truck_documents').select('id, document_type, expiry_date, status, truck:trucks(plate_number, owner_name)'),
      ])

      const allEvents: CalendarEvent[] = []

      // Job order events
      for (const job of (jobsRes.data || [])) {
        if (!job.delivery_date) continue
        const statusColors: Record<string, string> = {
          completed: '#22c55e', cancelled: '#ef4444', in_transit: '#3b82f6',
          assigned: '#f59e0b', delivered: '#22c55e',
        }
        allEvents.push({
          id: job.id,
          date: job.delivery_date,
          title: `🚛 ${job.job_number}`,
          subtitle: job.client_name,
          type: 'job',
          color: statusColors[job.status] || '#a0a0a0',
          data: job,
        })
      }

      // Document expiry events
      for (const doc of (docsRes.data || [])) {
        if (!doc.expiry_date) continue
        const expiry = new Date(doc.expiry_date)
        const today = new Date()
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntil < 0) {
          allEvents.push({
            id: doc.id,
            date: doc.expiry_date,
            title: `❌ ${doc.document_type} EXPIRED`,
            subtitle: (doc.truck as any)?.plate_number,
            type: 'document_expiry',
            color: '#ef4444',
            data: doc,
          })
        } else if (daysUntil <= 30) {
          allEvents.push({
            id: doc.id,
            date: doc.expiry_date,
            title: `⚠️ ${doc.document_type} expiring`,
            subtitle: `${(doc.truck as any)?.plate_number} · ${daysUntil}d left`,
            type: 'document_warning',
            color: '#f59e0b',
            data: doc,
          })
        }
      }

      setEvents(allEvents)
      setLoading(false)
    }
    load()
  }, [])

  // Calendar helpers
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = currentDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  const today = new Date().toISOString().split('T')[0]

  function getDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function getEventsForDate(day: number) {
    return events.filter(e => e.date === getDateStr(day))
  }

  const selectedDateEvents = selectedDate ? events.filter(e => e.date === selectedDate) : []

  // Upcoming events (next 30 days)
  const upcomingEvents = events
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Calendar</h1>
        <p className="text-text-muted text-sm mt-0.5">Schedules, trips & document expiry</p>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-3 h-3 rounded-full bg-info" />Job Orders
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-3 h-3 rounded-full bg-warning" />Doc Expiring
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-3 h-3 rounded-full bg-danger" />Doc Expired
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-3 h-3 rounded-full bg-success" />Completed
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-2 rounded-md hover:bg-bg-tertiary transition-colors">
            <ChevronLeft size={18} className="text-text-muted" />
          </button>
          <h2 className="font-heading text-base font-semibold text-text-primary">{monthName}</h2>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-2 rounded-md hover:bg-bg-tertiary transition-colors">
            <ChevronRight size={18} className="text-text-muted" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-xs text-text-muted font-semibold py-1">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1
            const dateStr = getDateStr(day)
            const dayEvents = getEventsForDate(day)
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={cn(
                  'relative flex flex-col items-center justify-start p-1 rounded-md min-h-[48px] transition-all',
                  isSelected ? 'bg-brand text-bg-primary' :
                  isToday ? 'bg-bg-elevated border border-brand' :
                  'hover:bg-bg-tertiary'
                )}
              >
                <span className={cn('text-xs font-semibold', isSelected ? 'text-bg-primary' : isToday ? 'text-brand' : 'text-text-secondary')}>
                  {day}
                </span>
                <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                  {dayEvents.slice(0, 3).map((ev, idx) => (
                    <div key={idx} style={{ width: '5px', height: '5px', borderRadius: '50%', background: isSelected ? '#000' : ev.color, flexShrink: 0 }} />
                  ))}
                  {dayEvents.length > 3 && (
                    <span style={{ fontSize: '8px', color: isSelected ? '#000' : '#a0a0a0', lineHeight: '5px' }}>+{dayEvents.length - 3}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="mb-4">
          <h3 className="font-heading text-sm font-semibold text-text-primary mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          {selectedDateEvents.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-sm">No events on this date</div>
          ) : (
            <div className="space-y-2">
              {selectedDateEvents.map(ev => (
                <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                  className="bg-bg-secondary border border-border rounded-lg p-3 cursor-pointer hover:border-border-secondary transition-colors flex items-start gap-3">
                  <div style={{ width: '4px', height: '100%', minHeight: '36px', borderRadius: '2px', background: ev.color, flexShrink: 0 }} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-text-primary">{ev.title}</div>
                    {ev.subtitle && <div className="text-xs text-text-muted mt-0.5">{ev.subtitle}</div>}
                  </div>
                  <span className="text-xs text-text-muted">›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming events */}
      <div>
        <h3 className="font-heading text-sm font-semibold text-text-primary mb-3">📅 Upcoming (Next 30 Days)</h3>
        {loading ? (
          Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg mb-2" />)
        ) : upcomingEvents.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-sm">No upcoming events</div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(ev => (
              <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                className="bg-bg-secondary border border-border rounded-lg p-3 cursor-pointer hover:border-border-secondary transition-colors flex items-center gap-3">
                <div style={{ width: '4px', alignSelf: 'stretch', borderRadius: '2px', background: ev.color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{ev.title}</div>
                  {ev.subtitle && <div className="text-xs text-text-muted">{ev.subtitle}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-semibold text-text-secondary">
                    {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event detail popup */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl">
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-heading text-base font-bold">{selectedEvent.title}</h2>
              <button onClick={() => setSelectedEvent(null)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-text-muted">
                {new Date(selectedEvent.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>

              {selectedEvent.type === 'job' && selectedEvent.data && (
                <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Client</span><span className="text-xs font-semibold">{selectedEvent.data.client_name}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Pickup</span><span className="text-xs font-semibold text-right max-w-[60%]">{selectedEvent.data.pickup_location}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Drop-off</span><span className="text-xs font-semibold text-right max-w-[60%]">{selectedEvent.data.dropoff_location}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Rate</span><span className="text-xs font-semibold">{selectedEvent.data.total_rate ? `₱${Number(selectedEvent.data.total_rate).toLocaleString()}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Status</span><span className="text-xs font-semibold capitalize">{selectedEvent.data.status?.replace(/_/g, ' ')}</span></div>
                </div>
              )}

              {(selectedEvent.type === 'document_expiry' || selectedEvent.type === 'document_warning') && selectedEvent.data && (
                <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Document</span><span className="text-xs font-semibold">{selectedEvent.data.document_type}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Truck</span><span className="text-xs font-semibold">{selectedEvent.data.truck?.plate_number}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Owner</span><span className="text-xs font-semibold">{selectedEvent.data.truck?.owner_name}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-text-muted">Expiry</span><span className="text-xs font-semibold text-danger">{formatDate(selectedEvent.data.expiry_date)}</span></div>
                </div>
              )}

              <button onClick={() => setSelectedEvent(null)} className="btn btn-secondary btn-full">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
