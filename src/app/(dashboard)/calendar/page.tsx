'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarEvent {
  id: string
  date: string
  title: string
  subtitle?: string
  type: 'job_scheduled' | 'job_completed' | 'job_cancelled' | 'job_active' | 'doc_expiry' | 'doc_warning'
  color: string
  bgColor: string
  data?: any
}

const LEGEND = [
  { type: 'job_active', label: 'Active/Assigned Job', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  { type: 'job_scheduled', label: 'Scheduled Job', color: '#a0a0a0', bg: 'rgba(160,160,160,0.15)' },
  { type: 'job_completed', label: 'Completed Job', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  { type: 'job_cancelled', label: 'Cancelled Job', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  { type: 'doc_warning', label: 'Doc Expiring Soon', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { type: 'doc_expiry', label: 'Doc Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.2)' },
]

function getEventStyle(type: string) {
  return LEGEND.find(l => l.type === type) || LEGEND[0]
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

      for (const job of (jobsRes.data || [])) {
        if (!job.delivery_date) continue
        let type: CalendarEvent['type'] = 'job_scheduled'
        if (job.status === 'completed' || job.status === 'delivered') type = 'job_completed'
        else if (job.status === 'cancelled') type = 'job_cancelled'
        else if (['assigned', 'accepted', 'at_pickup', 'loaded', 'in_transit', 'arrived'].includes(job.status)) type = 'job_active'

        const style = getEventStyle(type)
        allEvents.push({
          id: job.id,
          date: job.delivery_date,
          title: `${job.job_number}`,
          subtitle: job.client_name,
          type,
          color: style.color,
          bgColor: style.bg,
          data: job,
        })
      }

      for (const doc of (docsRes.data || [])) {
        if (!doc.expiry_date) continue
        const expiry = new Date(doc.expiry_date)
        const today = new Date()
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntil < 0) {
          const style = getEventStyle('doc_expiry')
          allEvents.push({ id: doc.id, date: doc.expiry_date, title: `${doc.document_type} EXPIRED`, subtitle: (doc.truck as any)?.plate_number, type: 'doc_expiry', color: style.color, bgColor: style.bg, data: doc })
        } else if (daysUntil <= 30) {
          const style = getEventStyle('doc_warning')
          allEvents.push({ id: doc.id, date: doc.expiry_date, title: `${doc.document_type} expiring`, subtitle: `${(doc.truck as any)?.plate_number} · ${daysUntil}d left`, type: 'doc_warning', color: style.color, bgColor: style.bg, data: doc })
        }
      }

      setEvents(allEvents)
      setLoading(false)
    }
    load()
  }, [])

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
  const upcomingEvents = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 15)

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Calendar</h1>
        <p className="text-text-muted text-sm mt-0.5">Schedules, trips & document expiry</p>
      </div>

      {/* Colorized Legend */}
      <div className="bg-bg-secondary border border-border rounded-lg p-3 mb-4">
        <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Legend</div>
        <div className="grid grid-cols-2 gap-1.5">
          {LEGEND.map(l => (
            <div key={l.type} className="flex items-center gap-2">
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.color, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: l.color, fontWeight: 600 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-2 rounded-md hover:bg-bg-tertiary transition-colors">
            <ChevronLeft size={20} className="text-text-muted" />
          </button>
          <h2 className="font-heading text-lg font-bold text-text-primary">{monthName}</h2>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-2 rounded-md hover:bg-bg-tertiary transition-colors">
            <ChevronRight size={20} className="text-text-muted" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs text-text-muted font-bold py-1">{d}</div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1">
          {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} className="h-16" />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1
            const dateStr = getDateStr(day)
            const dayEvents = getEventsForDate(day)
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate

            return (
              <div
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className="h-16 rounded-lg cursor-pointer flex flex-col p-1 transition-all"
                style={{
                  background: isSelected ? 'rgba(255,255,255,0.15)' : isToday ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: isSelected ? '1.5px solid #fff' : isToday ? '1.5px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                }}
              >
                <span className="text-xs font-bold mb-0.5" style={{ color: isToday ? '#fff' : isSelected ? '#fff' : '#a0a0a0' }}>
                  {day}
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((ev, idx) => (
                    <div key={idx} style={{
                      background: ev.bgColor,
                      borderLeft: `2px solid ${ev.color}`,
                      borderRadius: '2px',
                      padding: '1px 3px',
                      fontSize: '9px',
                      fontWeight: 600,
                      color: ev.color,
                      lineHeight: '12px',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div style={{ fontSize: '9px', color: '#666', paddingLeft: '3px' }}>+{dayEvents.length - 2} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="mb-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          {selectedDateEvents.length === 0 ? (
            <div className="text-center py-4 text-text-muted text-sm">No events on this date</div>
          ) : (
            <div className="space-y-2">
              {selectedDateEvents.map(ev => (
                <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                  className="rounded-lg p-3 cursor-pointer transition-all hover:opacity-90 flex items-start gap-3"
                  style={{ background: ev.bgColor, border: `1px solid ${ev.color}` }}>
                  <div style={{ width: '4px', alignSelf: 'stretch', borderRadius: '2px', background: ev.color, flexShrink: 0 }} />
                  <div className="flex-1">
                    <div className="text-sm font-bold" style={{ color: ev.color }}>{ev.title}</div>
                    {ev.subtitle && <div className="text-xs mt-0.5" style={{ color: ev.color, opacity: 0.8 }}>{ev.subtitle}</div>}
                  </div>
                  <span style={{ color: ev.color, fontSize: '16px' }}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming */}
      <div>
        <h3 className="font-heading text-sm font-bold text-text-primary mb-3">📅 Upcoming Events</h3>
        {loading ? Array(4).fill(0).map((_: any, i: number) => <div key={i} className="skeleton h-14 rounded-lg mb-2" />) :
         upcomingEvents.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-sm">No upcoming events</div>
         ) : (
          <div className="space-y-2">
            {upcomingEvents.map(ev => (
              <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                className="rounded-lg p-3 cursor-pointer flex items-center gap-3 transition-all hover:opacity-90"
                style={{ background: ev.bgColor, border: `1px solid ${ev.color}` }}>
                <div style={{ width: '4px', alignSelf: 'stretch', minHeight: '36px', borderRadius: '2px', background: ev.color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: ev.color }}>{ev.title}</div>
                  {ev.subtitle && <div className="text-xs" style={{ color: ev.color, opacity: 0.8 }}>{ev.subtitle}</div>}
                </div>
                <div style={{ color: ev.color, fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                  {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
         )}
      </div>

      {/* Event detail popup */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl"
            style={{ borderTop: `3px solid ${selectedEvent.color}` }}>
            <div className="w-9 h-1 bg-border-secondary rounded mx-auto mt-3 mb-1 md:hidden" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-heading text-base font-bold" style={{ color: selectedEvent.color }}>{selectedEvent.title}</h2>
              <button onClick={() => setSelectedEvent(null)}
                style={{ background: '#2a2a2a', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a0a0a0', fontSize: '16px' }}>
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-text-muted">
                {new Date(selectedEvent.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>

              {selectedEvent.data && selectedEvent.type.startsWith('job') && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: selectedEvent.bgColor, border: `1px solid ${selectedEvent.color}` }}>
                  {[
                    ['Client', selectedEvent.data.client_name],
                    ['Pickup', selectedEvent.data.pickup_location],
                    ['Drop-off', selectedEvent.data.dropoff_location],
                    ['Rate', selectedEvent.data.total_rate ? `₱${Number(selectedEvent.data.total_rate).toLocaleString()}` : '—'],
                    ['Status', selectedEvent.data.status?.replace(/_/g, ' ')],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-text-muted">{k}</span>
                      <span className="font-semibold text-right max-w-[60%] truncate" style={{ color: selectedEvent.color }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedEvent.data && selectedEvent.type.startsWith('doc') && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: selectedEvent.bgColor, border: `1px solid ${selectedEvent.color}` }}>
                  {[
                    ['Document', selectedEvent.data.document_type],
                    ['Truck', selectedEvent.data.truck?.plate_number],
                    ['Owner', selectedEvent.data.truck?.owner_name],
                    ['Expiry', formatDate(selectedEvent.data.expiry_date)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-text-muted">{k}</span>
                      <span className="font-semibold" style={{ color: selectedEvent.color }}>{v}</span>
                    </div>
                  ))}
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
