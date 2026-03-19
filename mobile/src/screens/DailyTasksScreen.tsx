import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { apiRequest, ApiError } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'in_progress' | 'done'
type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
type TaskCategory = 'inspection' | 'repair' | 'meter' | 'complaint' | 'report'
type ComplaintType = 'neighbors' | 'water' | 'electricity' | 'schedule' | 'general' | 'recommendation'

type TaskItem = {
  id: string
  title: string
  description: string
  building: string
  priority: TaskPriority
  status: TaskStatus
  due_time: string
  apartment?: string | null
  category: TaskCategory
  ai_comment?: string | null
  complaint_type?: ComplaintType | null
  created_at?: string
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string; next: TaskStatus | null; nextLabel: string | null }> = {
  todo: { label: 'To Do', color: '#475569', bg: '#f1f5f9', next: 'in_progress', nextLabel: 'Start' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', next: 'done', nextLabel: 'Mark done' },
  done: { label: 'Done', color: '#059669', bg: '#ecfdf5', next: null, nextLabel: null },
}

const PRIORITY_CFG: Record<TaskPriority, { color: string; bg: string }> = {
  critical: { color: '#dc2626', bg: '#fef2f2' },
  high: { color: '#d97706', bg: '#fffbeb' },
  medium: { color: '#2563eb', bg: '#eff6ff' },
  low: { color: '#64748b', bg: '#f8fafc' },
}

const CATEGORY_LABEL: Record<TaskCategory, string> = {
  inspection: 'Inspection',
  repair: 'Repair',
  meter: 'Meter',
  complaint: 'Complaint',
  report: 'Report',
}

const COMPLAINT_CFG: Record<ComplaintType, { label: string; color: string; bg: string }> = {
  neighbors: { label: 'Neighbors', color: '#7c3aed', bg: '#f5f3ff' },
  water: { label: 'Water', color: '#0891b2', bg: '#ecfeff' },
  electricity: { label: 'Electricity', color: '#ca8a04', bg: '#fefce8' },
  schedule: { label: 'Schedule', color: '#4f46e5', bg: '#eef2ff' },
  general: { label: 'General', color: '#475569', bg: '#f8fafc' },
  recommendation: { label: 'Recommendation', color: '#059669', bg: '#ecfdf5' },
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────

function TaskDetailModal({
  task,
  onClose,
  onStatusChange,
}: {
  task: TaskItem | null
  onClose: () => void
  onStatusChange: (id: string, status: TaskStatus) => void
}) {
  if (!task) return null

  const status = STATUS_CFG[task.status]
  const priority = PRIORITY_CFG[task.priority]
  const complaint = task.complaint_type ? COMPLAINT_CFG[task.complaint_type] : null

  const handleAdvance = () => {
    if (status.next) onStatusChange(task.id, status.next)
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={2}>{task.title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          {/* Status + priority row */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: status.bg }]}>
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: priority.bg }]}>
              <Text style={[styles.badgeText, { color: priority.color }]}>{task.priority}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{CATEGORY_LABEL[task.category]}</Text>
            </View>
            {complaint && (
              <View style={[styles.badge, { backgroundColor: complaint.bg }]}>
                <Text style={[styles.badgeText, { color: complaint.color }]}>{complaint.label}</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {task.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.sectionBody}>{task.description}</Text>
            </View>
          ) : null}

          {/* Meta grid */}
          <View style={styles.metaGrid}>
            <MetaCell icon="business-outline" label="Building" value={task.building} />
            {task.apartment && <MetaCell icon="home-outline" label="Apartment" value={`Apt ${task.apartment}`} />}
            <MetaCell icon="time-outline" label="Due time" value={task.due_time} />
            {task.created_at && <MetaCell icon="calendar-outline" label="Created" value={task.created_at} />}
          </View>

          {/* AI suggestion */}
          {task.ai_comment && (
            <View style={styles.aiCard}>
              <View style={styles.aiHeader}>
                <View style={styles.aiBadge}>
                  <View style={styles.aiLiveDot} />
                  <Text style={styles.aiBadgeText}>AI suggestion</Text>
                </View>
              </View>
              <Text style={styles.aiBody}>{task.ai_comment}</Text>
            </View>
          )}
        </ScrollView>

        {/* Advance status button */}
        {status.next && (
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={handleAdvance} style={styles.advanceBtn} activeOpacity={0.8}>
              <Text style={styles.advanceBtnText}>{status.nextLabel}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

function MetaCell({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Ionicons name={icon} size={14} color="#94a3b8" />
      <View>
        <Text style={styles.metaCellLabel}>{label}</Text>
        <Text style={styles.metaCellValue}>{value}</Text>
      </View>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DailyTasksScreen() {
  const { accessToken, activeOrganizationId } = useAuth()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

  const houseId = activeOrganizationId ?? 'house-1'

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest<TaskItem[]>(`/tasks?house_id=${houseId}`, { token: accessToken })
      setTasks(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [accessToken, houseId])

  useEffect(() => { void load() }, [load])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    if (!accessToken) return
    setSelectedTask((prev) => prev ? { ...prev, status: newStatus } : null)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'PATCH', token: accessToken, body: { status: newStatus } })
    } catch { /* optimistic update — revert not needed for demo */ }
  }, [accessToken])

  const counters = useMemo(() => ({
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }), [tasks])

  const filtered = useMemo(() =>
    statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter),
    [tasks, statusFilter],
  )

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {/* Counters */}
        <View style={styles.counterRow}>
          <CounterCard label="To do" value={counters.todo} color="#475569" onPress={() => setStatusFilter(statusFilter === 'todo' ? 'all' : 'todo')} active={statusFilter === 'todo'} />
          <CounterCard label="In progress" value={counters.in_progress} color="#2563eb" onPress={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')} active={statusFilter === 'in_progress'} />
          <CounterCard label="Done" value={counters.done} color="#059669" onPress={() => setStatusFilter(statusFilter === 'done' ? 'all' : 'done')} active={statusFilter === 'done'} />
        </View>

        {/* Filter hint */}
        {statusFilter !== 'all' && (
          <TouchableOpacity onPress={() => setStatusFilter('all')} style={styles.filterHint}>
            <Text style={styles.filterHintText}>Showing: {STATUS_CFG[statusFilter].label}</Text>
            <Ionicons name="close-circle" size={14} color="#2563eb" />
          </TouchableOpacity>
        )}

        {/* Task list */}
        <Text style={styles.sectionTitle}>Tasks · {filtered.length}</Text>

        {filtered.length === 0 && !loading ? (
          <Text style={styles.empty}>No tasks</Text>
        ) : (
          filtered.map((task) => {
            const st = STATUS_CFG[task.status]
            const pr = PRIORITY_CFG[task.priority]
            return (
              <TouchableOpacity
                key={task.id}
                style={styles.card}
                onPress={() => setSelectedTask(task)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.priorityStripe, { backgroundColor: pr.color }]} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>
                      <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                        <Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    {task.description ? (
                      <Text style={styles.cardDesc} numberOfLines={1}>{task.description}</Text>
                    ) : null}
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardMetaText}>{task.building}</Text>
                      {task.apartment && <Text style={styles.cardMetaText}>Apt {task.apartment}</Text>}
                      <Text style={styles.cardMetaText}>Due {task.due_time}</Text>
                    </View>
                    {task.complaint_type && (
                      <View style={[styles.complaintBadge, { backgroundColor: COMPLAINT_CFG[task.complaint_type].bg }]}>
                        <Text style={[styles.complaintBadgeText, { color: COMPLAINT_CFG[task.complaint_type].color }]}>
                          {COMPLAINT_CFG[task.complaint_type].label}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={styles.cardChevron} />
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChange}
      />
    </View>
  )
}

function CounterCard({ label, value, color, onPress, active }: { label: string; value: number; color: string; onPress: () => void; active: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.counterCard, active && { borderColor: color, borderWidth: 1.5 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.counterLabel}>{label}</Text>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
    </TouchableOpacity>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f2f5' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 10 },
  errorBox: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 10 },
  errorText: { color: '#b91c1c', fontSize: 14 },

  counterRow: { flexDirection: 'row', gap: 8 },
  counterCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  counterLabel: { fontSize: 10, color: '#64748b' },
  counterValue: { marginTop: 3, fontSize: 22, fontWeight: '800' },

  filterHint: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  filterHintText: { fontSize: 12, color: '#2563eb', fontWeight: '500' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 20 },

  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'stretch' },
  priorityStripe: { width: 4 },
  cardBody: { flex: 1, padding: 12, gap: 5 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  cardDesc: { fontSize: 12, color: '#64748b' },
  cardMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 11, color: '#94a3b8' },
  complaintBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  complaintBadgeText: { fontSize: 10, fontWeight: '600' },
  cardChevron: { alignSelf: 'center', marginRight: 10 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0f172a', lineHeight: 26 },
  modalClose: { padding: 4, marginTop: 2 },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, gap: 16, paddingBottom: 20 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#475569' },

  section: { gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionBody: { fontSize: 14, color: '#334155', lineHeight: 22 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaCell: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '46%' },
  metaCellLabel: { fontSize: 10, color: '#94a3b8' },
  metaCellValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },

  aiCard: { backgroundColor: '#eff6ff', borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', padding: 14 },
  aiHeader: { marginBottom: 8 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#dbeafe', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  aiLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  aiBadgeText: { fontSize: 10, fontWeight: '700', color: '#2563eb' },
  aiBody: { fontSize: 13, color: '#1e40af', lineHeight: 21 },

  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0f172a', borderRadius: 14, paddingVertical: 14 },
  advanceBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
