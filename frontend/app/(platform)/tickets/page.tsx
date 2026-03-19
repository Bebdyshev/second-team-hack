'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiCheck, FiEye, FiMessageCircle, FiPaperclip, FiPlus, FiSend, FiTrash2 } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

type TicketAttachment = { name: string; url?: string }
type TicketFollowUp = { id: string; text: string; author_id: string; author_name: string; author_role: string; created_at: string }
type ComplaintType = 'neighbors' | 'water' | 'electricity' | 'schedule' | 'general' | 'recommendation'
type Ticket = {
  id: string
  house_id: string
  resident_id: string
  resident_name: string
  resident_email: string
  apartment_id: string
  subject: string
  description: string
  incident_date: string
  incident_time: string
  attachments: TicketAttachment[]
  status: 'sent' | 'viewing' | 'decision'
  follow_ups: TicketFollowUp[]
  created_at: string
  updated_at: string
  viewed_at: string | null
  decision: string | null
  complaint_type: ComplaintType | null
}

const statusLabel: Record<string, string> = {
  sent: 'Waiting for manager',
  viewing: 'Manager reviewing',
  decision: 'Resolved',
}

const statusColor: Record<string, string> = {
  sent: 'bg-amber-100 text-amber-700',
  viewing: 'bg-blue-100 text-blue-700',
  decision: 'bg-emerald-100 text-emerald-700',
}

const complaintTypeLabel: Record<ComplaintType, string> = {
  neighbors: 'Neighbors',
  water: 'Water',
  electricity: 'Electricity',
  schedule: 'Schedule',
  general: 'General',
  recommendation: 'Recommendation',
}

const complaintTypeColor: Record<ComplaintType, string> = {
  neighbors: 'bg-purple-100 text-purple-700',
  water: 'bg-cyan-100 text-cyan-700',
  electricity: 'bg-yellow-100 text-yellow-700',
  schedule: 'bg-indigo-100 text-indigo-700',
  general: 'bg-slate-100 text-slate-700',
  recommendation: 'bg-emerald-100 text-emerald-700',
}

const TicketsPage = () => {
  const router = useRouter()
  const { accessToken, activeRole, user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (activeRole === 'Manager') router.replace('/tasks-board')
  }, [activeRole, router])

  const loadTickets = useCallback(async () => {
    if (!accessToken) return
    setIsLoading(true)
    setError('')
    try {
      const response = await apiRequest<Ticket[]>('/tickets', { token: accessToken })
      setTickets(response)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Failed to load tickets')
    } finally {
      setIsLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  const isResident = activeRole === 'Resident'
  const isManager = activeRole === 'Manager'

  return (
    <AppShell
      title='Tickets'
      subtitle={isResident ? 'File a request and track its status' : 'View and manage resident requests'}
    >
      <section className='mx-auto max-w-4xl space-y-5'>
        {error && (
          <p className='rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{error}</p>
        )}

        {isResident && (
          <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <div className='flex items-center justify-between'>
              <h2 className='text-sm font-semibold text-slate-900'>New request</h2>
              <Button
                onClick={() => setShowForm((v) => !v)}
                className='h-8 gap-1.5 px-3 text-xs'
                variant={showForm ? 'outline' : 'default'}
              >
                <FiPlus className='size-3.5' />
                {showForm ? 'Cancel' : 'File ticket'}
              </Button>
            </div>
            {showForm && (
              <TicketForm
                accessToken={accessToken}
                apartmentId={user?.apartment_id ?? ''}
                onSuccess={() => {
                  setShowForm(false)
                  void loadTickets()
                }}
                onError={setError}
              />
            )}
          </article>
        )}

        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-semibold text-slate-900'>
              {isResident ? 'My requests' : 'All requests'}
            </h2>
            <Button variant='outline' size='sm' onClick={() => void loadTickets()} disabled={isLoading} className='h-8 text-xs'>
              Refresh
            </Button>
          </div>
          {isLoading ? (
            <p className='py-8 text-center text-sm text-slate-500'>Loading…</p>
          ) : tickets.length === 0 ? (
            <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500'>
              {isResident ? 'No tickets yet. File one above.' : 'No tickets from residents yet.'}
            </div>
          ) : (
            <div className='space-y-2'>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type='button'
                  onClick={() => setSelectedTicket(t)}
                  className='flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50'
                >
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium text-slate-900'>{t.subject}</p>
                    <p className='mt-0.5 truncate text-xs text-slate-500'>
                      {isManager ? `${t.resident_name} · Apt ${t.apartment_id.replace('apt-', '')}` : t.incident_date} {t.incident_time}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[t.status]}`}>
                    {statusLabel[t.status]}
                  </span>
                  {t.complaint_type && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${complaintTypeColor[t.complaint_type]}`}>
                      {complaintTypeLabel[t.complaint_type]}
                    </span>
                  )}
                  {t.follow_ups.length > 0 && (
                    <span className='flex shrink-0 items-center gap-1 text-xs text-slate-400'>
                      <FiMessageCircle className='size-3.5' />
                      {t.follow_ups.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          accessToken={accessToken}
          isManager={isManager}
          onClose={() => setSelectedTicket(null)}
          onUpdate={(updated) => {
            if (updated) setSelectedTicket(updated)
            void loadTickets()
          }}
          onDelete={() => {
            setSelectedTicket(null)
            void loadTickets()
          }}
        />
      )}
    </AppShell>
  )
}

function TicketForm({
  accessToken,
  apartmentId,
  onSuccess,
  onError,
}: {
  accessToken: string | null
  apartmentId: string
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [incidentDate, setIncidentDate] = useState('')
  const [incidentTime, setIncidentTime] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [newAttachment, setNewAttachment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !subject.trim() || !description.trim() || !incidentDate || !incidentTime) {
      onError('Please fill required fields')
      return
    }
    setSubmitting(true)
    onError('')
    try {
      await apiRequest<Ticket>('/tickets', {
        method: 'POST',
        token: accessToken,
        body: {
          subject: subject.trim(),
          description: description.trim(),
          incident_date: incidentDate,
          incident_time: incidentTime,
          attachments: attachments.map((name) => ({ name, url: null })),
        },
      })
      onSuccess()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const addAttachment = () => {
    const name = newAttachment.trim()
    if (name && !attachments.includes(name)) {
      setAttachments((prev) => [...prev, name])
      setNewAttachment('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className='mt-4 space-y-4'>
      <div>
        <label className='mb-1 block text-xs font-medium text-slate-600'>Subject</label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder='e.g. Water leak in bathroom' required />
      </div>
      <div>
        <label className='mb-1 block text-xs font-medium text-slate-600'>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='Describe the problem in detail…'
          rows={4}
          className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400'
          required
        />
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <label className='mb-1 block text-xs font-medium text-slate-600'>Incident date</label>
          <Input type='date' value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} required />
        </div>
        <div>
          <label className='mb-1 block text-xs font-medium text-slate-600'>Incident time</label>
          <Input type='time' value={incidentTime} onChange={(e) => setIncidentTime(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className='mb-1 block text-xs font-medium text-slate-600'>Attachments (optional)</label>
        <div className='flex gap-2'>
          <Input
            value={newAttachment}
            onChange={(e) => setNewAttachment(e.target.value)}
            placeholder='File name or description'
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttachment())}
          />
          <Button type='button' variant='outline' onClick={addAttachment} className='shrink-0'>
            <FiPaperclip className='size-4' />
          </Button>
        </div>
        {attachments.length > 0 && (
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {attachments.map((a) => (
              <span
                key={a}
                className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700'
              >
                {a}
                <button type='button' onClick={() => setAttachments((p) => p.filter((x) => x !== a))} className='text-slate-400 hover:text-slate-600'>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <Button type='submit' disabled={submitting} className='gap-2'>
        <FiSend className='size-4' />
        {submitting ? 'Sending…' : 'Submit ticket'}
      </Button>
    </form>
  )
}

function TicketDetailModal({
  ticket,
  accessToken,
  isManager,
  onClose,
  onUpdate,
  onDelete,
}: {
  ticket: Ticket
  accessToken: string | null
  isManager: boolean
  onClose: () => void
  onUpdate: (updated?: Ticket) => void
  onDelete: () => void
}) {
  const [followUpText, setFollowUpText] = useState('')
  const [sendingFollowUp, setSendingFollowUp] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [decision, setDecision] = useState(ticket.decision ?? '')

  const handleView = async () => {
    if (!accessToken || !isManager) return
    setUpdatingStatus(true)
    try {
      const updated = await apiRequest<Ticket>(`/tickets/${ticket.id}/view`, { method: 'POST', token: accessToken })
      onUpdate(updated)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleDecision = async () => {
    if (!accessToken || !isManager) return
    setUpdatingStatus(true)
    try {
      const updated = await apiRequest<Ticket>(`/tickets/${ticket.id}`, {
        method: 'PATCH',
        token: accessToken,
        body: { status: 'decision', decision: decision.trim() || 'Resolved' },
      })
      onUpdate(updated)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const canDelete = !isManager && (ticket.status === 'sent' || ticket.status === 'viewing')

  const handleDelete = async () => {
    if (!accessToken || !canDelete) return
    setDeleting(true)
    try {
      await apiRequest(`/tickets/${ticket.id}`, { method: 'DELETE', token: accessToken })
      onDelete()
    } catch {
      setDeleting(false)
    }
  }

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !followUpText.trim()) return
    setSendingFollowUp(true)
    try {
      const updated = await apiRequest<Ticket>(`/tickets/${ticket.id}/follow-ups`, {
        method: 'POST',
        token: accessToken,
        body: { text: followUpText.trim() },
      })
      setFollowUpText('')
      onUpdate(updated)
    } finally {
      setSendingFollowUp(false)
    }
  }

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return s
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4' onClick={onClose}>
      <div
        className='max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3'>
          <h3 className='text-sm font-semibold text-slate-900'>{ticket.subject}</h3>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
          >
            ×
          </button>
        </div>
        <div className='space-y-4 p-4'>
          <div className='flex flex-wrap gap-2'>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[ticket.status]}`}>
              {statusLabel[ticket.status]}
            </span>
            {ticket.complaint_type && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${complaintTypeColor[ticket.complaint_type]}`}>
                {complaintTypeLabel[ticket.complaint_type]}
              </span>
            )}
            <span className='text-xs text-slate-500'>
              {ticket.resident_name} · Apt {ticket.apartment_id.replace('apt-', '')}
            </span>
            <span className='text-xs text-slate-500'>
              {ticket.incident_date} {ticket.incident_time}
            </span>
          </div>
          <p className='text-sm text-slate-700'>{ticket.description}</p>
          {ticket.attachments.length > 0 && (
            <div className='flex flex-wrap gap-1.5'>
              {ticket.attachments.map((a) => (
                <span key={a.name} className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'>
                  <FiPaperclip className='size-3' /> {a.name}
                </span>
              ))}
            </div>
          )}
          {ticket.decision && (
            <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
              <p className='font-medium'>Decision</p>
              <p className='mt-0.5'>{ticket.decision}</p>
            </div>
          )}
          {isManager && ticket.status === 'sent' && (
            <Button onClick={handleView} disabled={updatingStatus} className='gap-2'>
              <FiEye className='size-4' />
              View & start working
            </Button>
          )}
          {isManager && ticket.status === 'viewing' && (
            <div className='space-y-2'>
              <Input
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                placeholder='Your decision or resolution…'
              />
              <Button onClick={handleDecision} disabled={updatingStatus} className='gap-2'>
                <FiCheck className='size-4' />
                Mark as resolved
              </Button>
            </div>
          )}
          {canDelete && (
            <Button
              variant='outline'
              onClick={handleDelete}
              disabled={deleting}
              className='gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700'
            >
              <FiTrash2 className='size-4' />
              {deleting ? 'Deleting…' : 'Delete ticket'}
            </Button>
          )}

          <div className='border-t border-slate-200 pt-4'>
            <p className='mb-2 text-xs font-medium text-slate-600'>Follow-ups</p>
            <div className='space-y-3'>
              {ticket.follow_ups.map((fu) => (
                <div key={fu.id} className='rounded-lg border border-slate-100 bg-slate-50 p-3'>
                  <p className='text-sm text-slate-800'>{fu.text}</p>
                  <p className='mt-1 text-[10px] text-slate-500'>
                    {fu.author_name} ({fu.author_role}) · {formatDate(fu.created_at)}
                  </p>
                </div>
              ))}
            </div>
            <form onSubmit={handleFollowUp} className='mt-3 flex gap-2'>
              <Input
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
                placeholder='Add a follow-up…'
                className='flex-1'
              />
              <Button type='submit' disabled={sendingFollowUp || !followUpText.trim()} size='sm'>
                Send
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TicketsPage
