'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import {
  FiArrowRight,
  FiChevronDown,
  FiFilter,
  FiPlus,
  FiTrash2,
} from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

type Priority = 'low' | 'medium' | 'high' | 'critical'
type Status = 'todo' | 'in_progress' | 'done'
type Category = 'inspection' | 'repair' | 'meter' | 'complaint' | 'report'

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
  createdAt: string
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
  created_at: string
}

const mapApiTask = (t: ApiTask): Task => ({
  ...t,
  dueTime: t.due_time,
  createdAt: t.created_at,
})

const DroppableColumn = ({ status, children }: { status: Status; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[80px] flex-col gap-2 rounded-lg px-2.5 pb-2.5 transition-colors ${isOver ? 'bg-slate-100/80' : ''}`}
    >
      {children}
    </div>
  )
}

type DraggableTaskCardProps = {
  task: Task
  onMove: (id: string, status: Status) => void
  onDelete: (id: string) => void
}

const DraggableTaskCard = ({ task, onMove, onDelete }: DraggableTaskCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <TaskCard task={task} onMove={onMove} onDelete={onDelete} />
    </div>
  )
}

type TaskCardContentProps = { task: Task; isOverlay?: boolean }

const TaskCardContent = ({ task, isOverlay }: TaskCardContentProps) => {
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const categoryCfg = CATEGORY_CONFIG[task.category]
  return (
    <article className={`rounded-md bg-white p-2.5 ${isOverlay ? 'shadow-lg ring-1 ring-slate-200' : ''}`}>
      <div className='mb-1.5 flex items-start justify-between gap-2'>
        <div className='flex items-center gap-1.5'>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityCfg.color}`}>
            <span className={`size-1.5 rounded-full ${priorityCfg.dot}`} />
            {priorityCfg.label}
          </span>
          <span className='inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600'>
            {categoryCfg.label}
          </span>
        </div>
        <span className='shrink-0 text-[10px] font-medium text-slate-400'>{task.dueTime}</span>
      </div>
      <h3 className='text-xs font-semibold text-slate-800'>{task.title}</h3>
      <p className='mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500'>{task.description}</p>
      <div className='mt-2 flex items-center gap-1.5'>
        <span className='rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600'>{task.building}</span>
        {task.apartment && (
          <span className='rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600'>{task.apartment}</span>
        )}
      </div>
    </article>
  )
}

const TasksBoardPage = () => {
  const { accessToken, activeOrganizationId } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all')
  const [filterBuilding, setFilterBuilding] = useState<string>('all')
  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
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
    return true
  })

  const handleMoveTask = useCallback(async (taskId: string, newStatus: Status) => {
    if (!accessToken) return
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
    try {
      const updated = await apiRequest<ApiTask>(`/tasks/${taskId}`, {
        method: 'PATCH',
        token: accessToken,
        body: { status: newStatus },
      })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? mapApiTask(updated) : t)))
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: tasks.find((x) => x.id === taskId)!.status } : t)))
    }
  }, [accessToken, tasks])

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
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE', token: accessToken })
    } catch {
      setTasks((prev) => [...prev, tasks.find((t) => t.id === taskId)!])
    }
  }, [accessToken, tasks])

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

        <button
          type='button'
          onClick={() => setShowNewTaskForm((prev) => !prev)}
          className='ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
          aria-label='Add new task'
        >
          <FiPlus className='size-3.5' />
          Task
        </button>
      </div>

      {error && (
        <div className='mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </div>
      )}

      {showNewTaskForm && (
        <NewTaskForm buildings={buildings} onAdd={handleAddTask} onCancel={() => setShowNewTaskForm(false)} />
      )}

      {isLoading ? (
        <p className='py-8 text-center text-sm text-slate-500'>Loading tasks...</p>
      ) : (
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className='grid gap-3 lg:grid-cols-3'>
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
                <div className='flex items-center justify-between px-3 py-2.5'>
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
                      onMove={handleMoveTask}
                      onDelete={handleDeleteTask}
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
    </AppShell>
  )
}

export default TasksBoardPage

type TaskCardProps = {
  task: Task
  onMove: (id: string, status: Status) => void
  onDelete: (id: string) => void
}

const TaskCard = ({ task, onMove, onDelete }: TaskCardProps) => {
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const categoryCfg = CATEGORY_CONFIG[task.category]

  const nextStatus: Status | null =
    task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : null

  const prevStatus: Status | null =
    task.status === 'done' ? 'in_progress' : task.status === 'in_progress' ? 'todo' : null

  return (
    <article className='group rounded-md bg-white p-2.5'>
      <div className='mb-1.5 flex items-start justify-between gap-2'>
        <div className='flex items-center gap-1.5'>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityCfg.color}`}>
            <span className={`size-1.5 rounded-full ${priorityCfg.dot}`} />
            {priorityCfg.label}
          </span>
          <span className='inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600'>
            {categoryCfg.label}
          </span>
        </div>
        <span className='shrink-0 text-[10px] font-medium text-slate-400'>{task.dueTime}</span>
      </div>

      <h3 className='text-xs font-semibold text-slate-800'>{task.title}</h3>
      <p className='mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500'>{task.description}</p>

      <div className='mt-2 flex items-center gap-1.5'>
        <span className='rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600'>{task.building}</span>
        {task.apartment && (
          <span className='rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600'>{task.apartment}</span>
        )}
      </div>

      <div className='mt-2.5 flex items-center gap-1 pt-2'>
        {prevStatus && (
          <button
            type='button'
            onClick={() => onMove(task.id, prevStatus)}
            className='flex h-5 items-center gap-1 rounded bg-slate-100 px-1.5 text-[10px] text-slate-600 hover:bg-slate-200'
            aria-label={`Move to ${COLUMN_CONFIG[prevStatus].title}`}
          >
            <FiArrowRight className='size-2.5 rotate-180' />
            {COLUMN_CONFIG[prevStatus].title}
          </button>
        )}
        {nextStatus && (
          <button
            type='button'
            onClick={() => onMove(task.id, nextStatus)}
            className='flex h-5 items-center gap-1 rounded bg-blue-50 px-1.5 text-[10px] text-blue-700 hover:bg-blue-100'
            aria-label={`Move to ${COLUMN_CONFIG[nextStatus].title}`}
          >
            {COLUMN_CONFIG[nextStatus].title}
            <FiArrowRight className='size-2.5' />
          </button>
        )}
        <button
          type='button'
          onClick={() => onDelete(task.id)}
          className='ml-auto flex size-5 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600'
          aria-label='Delete task'
        >
          <FiTrash2 className='size-3' />
        </button>
      </div>
    </article>
  )
}

type NewTaskFormProps = {
  buildings: string[]
  onAdd: (task: Omit<Task, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

const NewTaskForm = ({ buildings, onAdd, onCancel }: NewTaskFormProps) => {
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

  return (
    <form onSubmit={handleSubmit} className='mb-3 rounded-lg bg-white p-3'>
      <h3 className='mb-2 text-xs font-semibold text-slate-800'>New Task</h3>
      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='sm:col-span-2'>
          <label htmlFor='task-title' className='mb-1 block text-xs text-slate-600'>Title</label>
          <input
            id='task-title'
            type='text'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='Task title...'
            className='h-8 w-full rounded-md bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300'
            required
          />
        </div>
        <div className='sm:col-span-2'>
          <label htmlFor='task-desc' className='mb-1 block text-xs text-slate-600'>Description</label>
          <textarea
            id='task-desc'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='Details...'
            rows={2}
            className='w-full resize-none rounded-md bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300'
          />
        </div>
        <div>
          <label htmlFor='task-building' className='mb-1 block text-xs text-slate-600'>Building</label>
          <select
            id='task-building'
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            className='h-8 w-full rounded-md bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
          >
            {buildings.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor='task-category' className='mb-1 block text-xs text-slate-600'>Category</label>
          <select
            id='task-category'
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className='h-8 w-full rounded-md bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
          >
            {(Object.keys(CATEGORY_CONFIG) as Category[]).map((key) => (
              <option key={key} value={key}>{CATEGORY_CONFIG[key].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor='task-priority' className='mb-1 block text-xs text-slate-600'>Priority</label>
          <select
            id='task-priority'
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className='h-8 w-full rounded-md bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
          >
            {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((key) => (
              <option key={key} value={key}>{PRIORITY_CONFIG[key].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor='task-time' className='mb-1 block text-xs text-slate-600'>Due Time</label>
          <input
            id='task-time'
            type='time'
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className='h-8 w-full rounded-md bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'
          />
        </div>
      </div>
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
    </form>
  )
}
