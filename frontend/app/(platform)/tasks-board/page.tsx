'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import {
  FiAlertTriangle,
  FiChevronDown,
  FiExternalLink,
  FiFilter,
  FiMapPin,
  FiPhone,
  FiPlus,
  FiTrash2,
  FiX,
} from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { NearbyServicesMap, get2gisSearchUrl } from '@/components/nearby-services-map'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

type Priority = 'low' | 'medium' | 'high' | 'critical'
type Status = 'todo' | 'in_progress' | 'done'
type Category = 'inspection' | 'repair' | 'meter' | 'complaint' | 'report'
type ComplaintType = 'neighbors' | 'water' | 'electricity' | 'schedule' | 'general' | 'recommendation'

type Task = {
  id: string
  title: string
  description: string
  building: string
  category: Category
  priority: Priority
  status: Status
  dueTime: string
  apartment?: string
  aiComment?: string | null
  sourceTicketId?: string | null
  complaintType?: ComplaintType | null
  complaintTypes?: ComplaintType[]
  createdAt: string
}

type NearbyService = {
  name: string
  service_type: string
  phone: string | null
  distance_m: number | null
  address: string | null
  lat?: number | null
  lon?: number | null
  maps_url: string
  maps_2gis_url?: string | null
  whatsapp_url: string | null
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'text-rose-700 bg-rose-50', dot: 'bg-rose-500' },
  high: { label: 'High', color: 'text-orange-700 bg-orange-50', dot: 'bg-orange-500' },
  medium: { label: 'Medium', color: 'text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
  low: { label: 'Low', color: 'text-slate-600 bg-slate-50', dot: 'bg-slate-400' },
}

const CATEGORY_CONFIG: Record<Category, { label: string }> = {
  inspection: { label: 'Inspection' },
  repair: { label: 'Repair' },
  meter: { label: 'Meter' },
  complaint: { label: 'Complaint' },
  report: { label: 'Report' },
}

const COMPLAINT_TYPE_CONFIG: Record<ComplaintType, { label: string; color: string }> = {
  neighbors: { label: 'Neighbors', color: 'text-purple-700 bg-purple-50' },
  water: { label: 'Water', color: 'text-cyan-700 bg-cyan-50' },
  electricity: { label: 'Electricity', color: 'text-yellow-700 bg-yellow-50' },
  schedule: { label: 'Schedule', color: 'text-indigo-700 bg-indigo-50' },
  general: { label: 'General', color: 'text-slate-700 bg-slate-100' },
  recommendation: { label: 'Recommendation', color: 'text-emerald-700 bg-emerald-50' },
}

const STATUS_CONFIG: Record<Status, { label: string; next: Status | null; nextLabel: string | null; color: string }> = {
  todo: { label: 'To Do', next: 'in_progress', nextLabel: 'Start working', color: 'text-slate-600 bg-slate-100' },
  in_progress: { label: 'In Progress', next: 'done', nextLabel: 'Mark done', color: 'text-blue-700 bg-blue-50' },
  done: { label: 'Done', next: null, nextLabel: null, color: 'text-emerald-700 bg-emerald-50' },
}

const SERVICE_TYPE_LABEL: Record<string, string> = {
  police: 'Police',
  local_authority: 'Local Authority',
  housing_office: 'Housing Office',
  plumber: 'Plumber',
  water_utility: 'Water Utility',
  electrician: 'Electrician',
  power_company: 'Power Company',
  service: 'Place',
  restaurant: 'Restaurant',
  cafe: 'Cafe',
}

const COLUMN_CONFIG: Record<Status, { title: string }> = {
  todo: { title: 'To Do' },
  in_progress: { title: 'In Progress' },
  done: { title: 'Done' },
}

const COLUMNS: Status[] = ['todo', 'in_progress', 'done']

const DEFAULT_BUILDINGS = ['Maple Residence', 'River Park', 'Oak Gardens', 'All buildings']

type ApiTask = {
  id: string
  title: string
  description: string
  building: string
  category: Category
  priority: Priority
  status: Status
  due_time: string
  apartment?: string
  ai_comment?: string | null
  source_ticket_id?: string | null
  complaint_type?: ComplaintType | null
  complaint_types?: ComplaintType[]
  created_at: string
}

const mapApiTask = (t: ApiTask): Task => ({
  ...t,
  dueTime: t.due_time,
  aiComment: t.ai_comment,
  sourceTicketId: t.source_ticket_id,
  complaintType: t.complaint_type,
  complaintTypes: t.complaint_types ?? (t.complaint_type ? [t.complaint_type] : []),
  createdAt: t.created_at,
})

// ── Task Detail Sidebar ───────────────────────────────────────────────────────

type GeoState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'

const TaskDetailSidebar = ({
  task,
  accessToken,
  onClose,
  onStatusChange,
  onDelete,
}: {
  task: Task
  accessToken: string | null
  onClose: () => void
  onStatusChange: (taskId: string, status: Status) => void
  onDelete: (taskId: string) => void
}) => {
  const [nearbyServices, setNearbyServices] = useState<NearbyService[]>([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [geoState, setGeoState] = useState<GeoState>('idle')
  const statusCfg = STATUS_CONFIG[task.status]
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const categoryCfg = CATEGORY_CONFIG[task.category]
  const tags = task.complaintTypes?.length ? task.complaintTypes : task.complaintType ? [task.complaintType] : []

  const [nearbyCenter, setNearbyCenter] = useState<{ lat: number; lon: number } | null>(null)
  const [nearbySearchQuery, setNearbySearchQuery] = useState<string>('сантехник')

  const fetchNearbyServices = useCallback(async (lat?: number, lon?: number) => {
    if (!task.sourceTicketId || !accessToken) return
    setLoadingNearby(true)
    try {
      const params = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : ''
      const data = await apiRequest<{ services: NearbyService[]; center_lat?: number; center_lon?: number; search_query?: string }>(
        `/tickets/${task.sourceTicketId}/nearby-services${params}`,
        { token: accessToken }
      )
      setNearbyServices(data.services ?? [])
      if (data.center_lat != null && data.center_lon != null) {
        setNearbyCenter({ lat: data.center_lat, lon: data.center_lon })
      } else {
        setNearbyCenter(null)
      }
      setNearbySearchQuery(data.search_query ?? (tags.includes('water') ? 'сантехник' : tags.includes('electricity') ? 'электрик' : tags.includes('neighbors') ? 'полиция' : 'ЖКХ'))
    } catch {
      setNearbyServices([])
      setNearbyCenter(null)
    } finally {
      setLoadingNearby(false)
    }
  }, [accessToken, task.sourceTicketId, tags])

  useEffect(() => {
    if (!task.sourceTicketId || !accessToken) return
    if (tags.includes('recommendation')) return

    setGeoState('requesting')
    setNearbyServices([])

    if (!navigator.geolocation) {
      setGeoState('unavailable')
      void fetchNearbyServices()
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState('granted')
        void fetchNearbyServices(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setGeoState('denied')
        void fetchNearbyServices()
      },
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [task.id])

  const handleAdvanceStatus = () => {
    if (statusCfg.next) onStatusChange(task.id, statusCfg.next)
  }

  const handleDelete = () => {
    onDelete(task.id)
    onClose()
  }

  return (
    <>
      <div className='fixed inset-0 z-30 bg-black/20' onClick={onClose} aria-hidden='true' />
      <aside className='fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl'>
        <div className='flex items-center justify-between border-b border-slate-200 px-4 py-3'>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            aria-label='Close sidebar'
          >
            <FiX className='size-4' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto px-4 py-4 space-y-5'>
          <div>
            <h2 className='text-base font-semibold text-slate-900 leading-snug'>{task.title}</h2>
            <p className='mt-2 text-sm text-slate-600 leading-relaxed'>{task.description}</p>
          </div>

          <div className='grid grid-cols-2 gap-2 text-xs'>
            <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
              <p className='text-[10px] text-slate-500 mb-0.5'>Priority</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityCfg.color}`}>
                <span className={`size-1.5 rounded-full ${priorityCfg.dot}`} />
                {priorityCfg.label}
              </span>
            </div>
            <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
              <p className='text-[10px] text-slate-500 mb-0.5'>Category</p>
              <span className='text-xs font-medium text-slate-700'>{categoryCfg.label}</span>
            </div>
            <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
              <p className='text-[10px] text-slate-500 mb-0.5'>Due time</p>
              <span className='text-xs font-medium text-slate-700'>{task.dueTime}</span>
            </div>
            <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
              <p className='text-[10px] text-slate-500 mb-0.5'>Building</p>
              <span className='text-xs font-medium text-slate-700 truncate block'>{task.building}</span>
            </div>
            {task.apartment && (
              <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
                <p className='text-[10px] text-slate-500 mb-0.5'>Apartment</p>
                <span className='text-xs font-medium text-blue-600'>{task.apartment}</span>
              </div>
            )}
            <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
              <p className='text-[10px] text-slate-500 mb-0.5'>Created</p>
              <span className='text-xs font-medium text-slate-700'>{task.createdAt}</span>
            </div>
          </div>

          {tags.length > 0 && (
            <div>
              <p className='mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500'>Complaint type</p>
              <div className='flex flex-wrap gap-1.5'>
                {tags.map((tag) => (
                  <span key={tag} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${COMPLAINT_TYPE_CONFIG[tag].color}`}>
                    {COMPLAINT_TYPE_CONFIG[tag].label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {task.aiComment && (
            <div className='rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5'>
              <p className='text-[10px] font-semibold uppercase tracking-wide text-indigo-500 mb-1'>AI suggestion</p>
              <p className='text-xs text-indigo-800 leading-relaxed'>{task.aiComment}</p>
            </div>
          )}

          {task.sourceTicketId && !tags.includes('recommendation') && (
            <div>
              <p className='mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500'>Nearby Services</p>

              {geoState === 'requesting' && (
                <p className='text-xs text-slate-400'>Определяем местоположение…</p>
              )}

              {(geoState === 'granted' || geoState === 'denied' || geoState === 'unavailable') && (
                <>
                  {geoState === 'denied' && (
                    <p className='mb-2 text-[10px] text-amber-600'>Геолокация запрещена — поиск по адресу здания</p>
                  )}
                  {loadingNearby ? (
                    <p className='text-xs text-slate-500'>Finding nearest services…</p>
                  ) : (
                    <>
                      {nearbyCenter && (
                        <NearbyServicesMap
                          centerLat={nearbyCenter.lat}
                          centerLon={nearbyCenter.lon}
                          services={nearbyServices}
                          buildingName={task.building}
                          searchQuery={nearbySearchQuery}
                        />
                      )}
                      {nearbyServices.length === 0 ? (
                        <div className='space-y-1.5'>
                          <p className='text-xs text-slate-400'>No nearby services found. Search on 2GIS for local results.</p>
                          {nearbyCenter && (
                            <a
                              href={get2gisSearchUrl(nearbySearchQuery, nearbyCenter.lat, nearbyCenter.lon)}
                              target='_blank'
                              rel='noreferrer'
                              className='inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50'
                            >
                              <FiMapPin className='size-3' /> Search on 2GIS
                            </a>
                          )}
                        </div>
                      ) : (
                    <div className='space-y-2'>
                      {nearbyServices.map((service, idx) => (
                        <div key={`${service.service_type}-${idx}`} className='rounded-lg border border-slate-200 bg-white p-2.5'>
                          <div className='flex items-start justify-between gap-2'>
                            <div className='min-w-0'>
                              <p className='text-[10px] font-semibold text-slate-500'>
                                {SERVICE_TYPE_LABEL[service.service_type] ?? service.service_type}
                              </p>
                              <p className='text-xs font-medium text-slate-800 truncate'>{service.name}</p>
                              {service.address && (
                                <p className='text-[10px] text-slate-500 mt-0.5 truncate'>{service.address}</p>
                              )}
                              {service.distance_m !== null && (
                                <p className='text-[10px] text-slate-400 mt-0.5'>~{service.distance_m} m away</p>
                              )}
                            </div>
                            <div className='flex shrink-0 items-center gap-1'>
                              {service.phone && (
                                <a
                                  href={`tel:${service.phone}`}
                                  className='inline-flex items-center gap-0.5 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-700 hover:bg-slate-50'
                                  aria-label={`Call ${service.name}`}
                                >
                                  <FiPhone className='size-3' /> Call
                                </a>
                              )}
                              {service.whatsapp_url && (
                                <a
                                  href={service.whatsapp_url}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='inline-flex items-center gap-0.5 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-700 hover:bg-slate-50'
                                >
                                  WA
                                </a>
                              )}
                              <a
                                href={service.maps_url}
                                target='_blank'
                                rel='noreferrer'
                                className='inline-flex items-center gap-0.5 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-700 hover:bg-slate-50'
                                aria-label={`Google Maps for ${service.name}`}
                              >
                                <FiMapPin className='size-3' /> G
                              </a>
                              {service.maps_2gis_url && (
                                <a
                                  href={service.maps_2gis_url}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='inline-flex items-center gap-0.5 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-700 hover:bg-slate-50'
                                  aria-label={`2GIS for ${service.name}`}
                                >
                                  2GIS
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tags.includes('neighbors') && (
            <div className='rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2'>
              <FiAlertTriangle className='mt-0.5 size-3.5 shrink-0 text-amber-600' />
              <p className='text-xs text-amber-800'>If noise is after 23:00, police escalation is recommended.</p>
            </div>
          )}
        </div>

        <div className='border-t border-slate-200 px-4 py-3 space-y-2'>
          {statusCfg.next && (
            <button
              type='button'
              onClick={handleAdvanceStatus}
              className='w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors'
            >
              {statusCfg.nextLabel}
            </button>
          )}
          <button
            type='button'
            onClick={handleDelete}
            className='w-full rounded-lg border border-rose-200 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors'
          >
            Delete task
          </button>
        </div>
      </aside>
    </>
  )
}

// ── Droppable column ──────────────────────────────────────────────────────────

const DroppableColumn = ({ status, children }: { status: Status; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[72px] flex-col gap-2 rounded-lg px-2 pb-2 transition-colors ${isOver ? 'bg-slate-100/80' : ''}`}
    >
      {children}
    </div>
  )
}

// ── Draggable card wrapper ────────────────────────────────────────────────────

type DraggableTaskCardProps = {
  task: Task
  onDelete: (id: string) => void
  onSelect: (task: Task) => void
}

const DraggableTaskCard = ({ task, onDelete, onSelect }: DraggableTaskCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStart.current) return
    const dx = Math.abs(e.clientX - pointerStart.current.x)
    const dy = Math.abs(e.clientY - pointerStart.current.y)
    if (dx > 5 || dy > 5) didDrag.current = true
  }

  const handleClick = () => {
    if (!didDrag.current) onSelect(task)
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      className={`cursor-pointer active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <TaskCard task={task} onDelete={onDelete} />
    </div>
  )
}

// ── Overlay content (while dragging) ─────────────────────────────────────────

type TaskCardContentProps = { task: Task; isOverlay?: boolean }

const TaskCardContent = ({ task, isOverlay }: TaskCardContentProps) => {
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const categoryCfg = CATEGORY_CONFIG[task.category]
  const tags = task.complaintTypes?.length ? task.complaintTypes : task.complaintType ? [task.complaintType] : []
  return (
    <article className={`rounded-md bg-white p-2.5 ${isOverlay ? 'shadow-lg ring-1 ring-slate-200' : ''}`}>
      <div className='mb-1.5 flex items-start justify-between gap-1.5'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityCfg.color}`}>
            <span className={`size-1.5 rounded-full ${priorityCfg.dot}`} />
            {priorityCfg.label}
          </span>
          <span className='inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600'>
            {categoryCfg.label}
          </span>
          {tags.map((tag) => (
            <span key={tag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${COMPLAINT_TYPE_CONFIG[tag].color}`}>
              {COMPLAINT_TYPE_CONFIG[tag].label}
            </span>
          ))}
        </div>
        <span className='shrink-0 text-[10px] font-medium text-slate-400'>{task.dueTime}</span>
      </div>
      <h3 className='text-sm font-semibold text-slate-800'>{task.title}</h3>
      <p className='mt-1 line-clamp-2 text-xs leading-snug text-slate-500'>{task.description}</p>
      <div className='mt-2 flex items-center gap-1.5'>
        <span className='rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600'>{task.building}</span>
        {task.apartment && (
          <span className='rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600'>{task.apartment}</span>
        )}
      </div>
    </article>
  )
}

// ── Main board page ───────────────────────────────────────────────────────────

const TasksBoardPage = () => {
  const { accessToken, activeOrganizationId } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all')
  const [filterBuilding, setFilterBuilding] = useState<string>('all')
  const [filterComplaintType, setFilterComplaintType] = useState<ComplaintType | 'all'>('all')
  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const buildings = Array.from(new Set([...DEFAULT_BUILDINGS, ...tasks.map((t) => t.building)]))

  useEffect(() => {
    if (!accessToken) return
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const path = activeOrganizationId ? `/tasks?house_id=${activeOrganizationId}` : '/tasks'
        const data = await apiRequest<ApiTask[]>(path, { token: accessToken })
        setTasks(data.map(mapApiTask))
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to load tasks')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [accessToken, activeOrganizationId])

  const filteredTasks = tasks.filter((task) => {
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false
    if (filterBuilding !== 'all' && task.building !== filterBuilding) return false
    if (filterComplaintType !== 'all') {
      const tags = task.complaintTypes?.length ? task.complaintTypes : task.complaintType ? [task.complaintType] : []
      if (!tags.includes(filterComplaintType)) return false
    }
    return true
  })

  const handleMoveTask = useCallback(async (taskId: string, newStatus: Status) => {
    if (!accessToken) return
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => prev ? { ...prev, status: newStatus } : null)
    }
    try {
      const updated = await apiRequest<ApiTask>(`/tasks/${taskId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { status: newStatus },
      })
      const mapped = mapApiTask(updated)
      setTasks((prev) => prev.map((t) => (t.id === taskId ? mapped : t)))
      if (selectedTask?.id === taskId) setSelectedTask(mapped)
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: tasks.find((x) => x.id === taskId)!.status } : t)))
    }
  }, [accessToken, tasks, selectedTask])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }, [tasks])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveTask(null)
    if (!event.over) return
    const taskId = event.active.id as string
    const newStatus = event.over.id as Status
    if (COLUMNS.includes(newStatus)) {
      void handleMoveTask(taskId, newStatus)
    }
  }, [handleMoveTask])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!accessToken) return
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    if (selectedTask?.id === taskId) setSelectedTask(null)
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE', token: accessToken })
    } catch {
      setTasks((prev) => [...prev, tasks.find((t) => t.id === taskId)!])
    }
  }, [accessToken, tasks, selectedTask])

  const handleAddTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt'>) => {
    if (!accessToken) return
    try {
      const created = await apiRequest<ApiTask>('/tasks', {
        method: 'POST',
        token: accessToken,
        body: {
          title: task.title,
          description: task.description,
          building: task.building,
          category: task.category,
          priority: task.priority,
          due_time: task.dueTime,
          house_id: activeOrganizationId || undefined,
        },
      })
      setTasks((prev) => [mapApiTask(created), ...prev])
      setShowNewTaskForm(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create task')
    }
  }, [accessToken, activeOrganizationId])

  const todoCount = filteredTasks.filter((t) => t.status === 'todo').length
  const inProgressCount = filteredTasks.filter((t) => t.status === 'in_progress').length
  const doneCount = filteredTasks.filter((t) => t.status === 'done').length
  const totalCount = filteredTasks.length

  return (
    <AppShell title='Daily Tasks' subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • ${totalCount} tasks`}>
      <div className='mb-3 flex flex-wrap items-center gap-2'>
        <div className='flex items-center gap-1.5 text-xs text-slate-500'>
          <FiFilter className='size-3.5' />
          Filters
        </div>

        <div className='relative'>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
            className='h-7 appearance-none rounded-md bg-white py-0 pl-2.5 pr-7 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
            aria-label='Filter by priority'
          >
            <option value='all'>Priority</option>
            <option value='critical'>Critical</option>
            <option value='high'>High</option>
            <option value='medium'>Medium</option>
            <option value='low'>Low</option>
          </select>
          <FiChevronDown className='pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-slate-400' />
        </div>

        <div className='relative'>
          <select
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
            className='h-7 appearance-none rounded-md bg-white py-0 pl-2.5 pr-7 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
            aria-label='Filter by building'
          >
            <option value='all'>Building</option>
            {buildings.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <FiChevronDown className='pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-slate-400' />
        </div>

        <div className='relative'>
          <select
            value={filterComplaintType}
            onChange={(e) => setFilterComplaintType(e.target.value as ComplaintType | 'all')}
            className='h-7 appearance-none rounded-md bg-white py-0 pl-2.5 pr-7 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
            aria-label='Filter by complaint type'
          >
            <option value='all'>Complaint type</option>
            {(Object.keys(COMPLAINT_TYPE_CONFIG) as ComplaintType[]).map((key) => (
              <option key={key} value={key}>{COMPLAINT_TYPE_CONFIG[key].label}</option>
            ))}
          </select>
          <FiChevronDown className='pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-slate-400' />
        </div>

        <Dialog open={showNewTaskForm} onOpenChange={setShowNewTaskForm}>
          <DialogTrigger asChild>
            <button
              type='button'
              className='ml-auto inline-flex h-7 items-center gap-1.5 rounded-md bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
              aria-label='Add new task'
            >
              <FiPlus className='size-4' />
              Task
            </button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-[425px]'>
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
              <DialogDescription>Create a daily task for the building.</DialogDescription>
            </DialogHeader>
            <NewTaskForm
              buildings={buildings}
              onAdd={handleAddTask}
              onCancel={() => setShowNewTaskForm(false)}
              variant='dialog'
            />
            <DialogFooter className='mt-4 gap-2 sm:gap-0'>
              <DialogClose asChild>
                <button
                  type='button'
                  className='h-9 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50'
                  onClick={() => setShowNewTaskForm(false)}
                >
                  Cancel
                </button>
              </DialogClose>
              <button
                type='submit'
                form='new-task-form'
                className='h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800'
              >
                Add Task
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className='mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </div>
      )}

      {isLoading ? (
        <p className='py-8 text-center text-sm text-slate-500'>Loading tasks...</p>
      ) : (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className='grid gap-2 lg:grid-cols-3'>
            {COLUMNS.map((status) => {
              const config = COLUMN_CONFIG[status]
              const columnTasks = filteredTasks
                .filter((t) => t.status === status)
                .sort((a, b) => {
                  const priorityOrder: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
                  return priorityOrder[a.priority] - priorityOrder[b.priority] || a.dueTime.localeCompare(b.dueTime)
                })

              const count = status === 'todo' ? todoCount : status === 'in_progress' ? inProgressCount : doneCount

              return (
                <div key={status} className='rounded-lg'>
                  <div className='flex items-center justify-between px-3 py-2'>
                    <div className='flex items-center gap-2'>
                      <h2 className='text-xs font-semibold text-slate-800'>{config.title}</h2>
                      <span className='rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600'>{count}</span>
                    </div>
                  </div>

                  <DroppableColumn status={status}>
                    {columnTasks.length === 0 && (
                      <p className='py-4 text-center text-xs text-slate-400'>No tasks</p>
                    )}
                    {columnTasks.map((task) => (
                      <DraggableTaskCard
                        key={task.id}
                        task={task}
                        onDelete={handleDeleteTask}
                        onSelect={setSelectedTask}
                      />
                    ))}
                  </DroppableColumn>
                </div>
              )
            })}
          </div>

          <DragOverlay>
            {activeTask ? (
              <TaskCardContent task={activeTask} isOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {selectedTask && (
        <TaskDetailSidebar
          task={selectedTask}
          accessToken={accessToken}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleMoveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </AppShell>
  )
}

export default TasksBoardPage

// ── Task card (inside draggable wrapper) ─────────────────────────────────────

type TaskCardProps = {
  task: Task
  onDelete: (id: string) => void
}

const TaskCard = ({ task, onDelete }: TaskCardProps) => {
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const categoryCfg = CATEGORY_CONFIG[task.category]
  const tags = task.complaintTypes?.length ? task.complaintTypes : task.complaintType ? [task.complaintType] : []

  return (
    <article className='group rounded-md bg-white p-2.5 ring-0 hover:ring-1 hover:ring-slate-200 transition-shadow'>
      <div className='mb-1.5 flex items-start justify-between gap-1.5'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityCfg.color}`}>
            <span className={`size-1.5 rounded-full ${priorityCfg.dot}`} />
            {priorityCfg.label}
          </span>
          <span className='inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600'>
            {categoryCfg.label}
          </span>
          {tags.map((tag) => (
            <span key={tag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${COMPLAINT_TYPE_CONFIG[tag].color}`}>
              {COMPLAINT_TYPE_CONFIG[tag].label}
            </span>
          ))}
        </div>
        <span className='shrink-0 text-[10px] font-medium text-slate-400'>{task.dueTime}</span>
      </div>

      <h3 className='text-sm font-semibold text-slate-800'>{task.title}</h3>
      <p className='mt-1 line-clamp-2 text-xs leading-snug text-slate-500'>{task.description}</p>

      <div className='mt-2 flex items-center gap-1.5'>
        <span className='rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600'>{task.building}</span>
        {task.apartment && (
          <span className='rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600'>{task.apartment}</span>
        )}
      </div>

      <div className='mt-2.5 flex items-center justify-end'>
        <button
          type='button'
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className='ml-auto flex size-5 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600'
          aria-label='Delete task'
        >
          <FiTrash2 className='size-3' />
        </button>
      </div>
    </article>
  )
}

// ── New task form ─────────────────────────────────────────────────────────────

type NewTaskFormProps = {
  buildings: string[]
  onAdd: (task: Omit<Task, 'id' | 'createdAt'>) => void
  onCancel?: () => void
  variant?: 'inline' | 'dialog'
}

const NewTaskForm = ({ buildings, onAdd, onCancel, variant = 'inline' }: NewTaskFormProps) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [building, setBuilding] = useState(buildings[0] || '')
  const [category, setCategory] = useState<Category>('inspection')
  const [priority, setPriority] = useState<Priority>('medium')
  const [dueTime, setDueTime] = useState('12:00')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({
      title: title.trim(),
      description: description.trim(),
      building,
      category,
      priority,
      status: 'todo',
      dueTime,
    })
  }

  const isDialog = variant === 'dialog'

  return (
    <form
      id={isDialog ? 'new-task-form' : undefined}
      onSubmit={handleSubmit}
      className={isDialog ? 'grid gap-4' : 'mb-3 rounded-lg bg-white p-3'}
    >
      {!isDialog && <h3 className='mb-2 text-xs font-semibold text-slate-800'>New Task</h3>}
      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor='task-title'>Title</Label>
          <Input
            id='task-title'
            type='text'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='Task title...'
            required
          />
        </div>
        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor='task-desc'>Description</Label>
          <Textarea
            id='task-desc'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='Details...'
            rows={2}
          />
        </div>
        <div className='space-y-2'>
          <Label>Building</Label>
          <Select value={building} onValueChange={setBuilding}>
            <SelectTrigger id='task-building'>
              <SelectValue placeholder='Select building' />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger id='task-category'>
              <SelectValue placeholder='Select category' />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CATEGORY_CONFIG) as Category[]).map((key) => (
                <SelectItem key={key} value={key}>{CATEGORY_CONFIG[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger id='task-priority'>
              <SelectValue placeholder='Select priority' />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((key) => (
                <SelectItem key={key} value={key}>{PRIORITY_CONFIG[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='task-time'>Due Time</Label>
          <Input
            id='task-time'
            type='time'
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
      </div>
      {!isDialog && (
        <div className='mt-3 flex items-center justify-end gap-2'>
          <button
            type='button'
            onClick={onCancel}
            className='h-7 rounded-md px-2.5 text-xs text-slate-600 hover:bg-slate-50'
          >
            Cancel
          </button>
          <button
            type='submit'
            className='h-7 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800'
          >
            Add Task
          </button>
        </div>
      )}
    </form>
  )
}
