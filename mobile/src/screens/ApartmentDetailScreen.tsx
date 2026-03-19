import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dimensions,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { apiRequest, ApiError } from '../lib/api'
import ApartmentChatModal, { type ContextItem } from '../components/ApartmentChatModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type ApartmentSummaryResponse = {
  apartment: {
    id: string
    number: string
    score: number
    status: 'good' | 'watch' | 'alert'
  }
  live_snapshot: {
    electricity: number
    water: number
    co2: number
    humidity: number
    savings: number
  }
}

type DynamicsResponse = {
  dynamics: Array<{ label: string; value: number }>
}

type RouteParams = {
  route: { params: { apartmentId: string } }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_W = Dimensions.get('window').width - 64
const CHART_H = 80

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  good: { bg: '#ecfdf5', text: '#059669' },
  watch: { bg: '#fffbeb', text: '#d97706' },
  alert: { bg: '#fef2f2', text: '#dc2626' },
}

// ── Mini sparkline chart ──────────────────────────────────────────────────────

function MiniChart({ data, color, label, unit }: { data: number[]; color: string; label: string; unit: string }) {
  if (data.length < 2) return null

  const maxVal = Math.max(...data)
  const minVal = Math.min(...data)
  const range = maxVal - minVal || 1
  const delta = ((data[data.length - 1] - data[0]) / (data[0] || 1)) * 100
  const isUp = delta >= 0

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * CHART_W
      const y = CHART_H - ((val - minVal) / range) * (CHART_H - 10) - 5
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={[styles.chartDelta, { color: isUp ? '#dc2626' : '#059669' }]}>
          {isUp ? '+' : ''}{delta.toFixed(1)}%
        </Text>
      </View>

      <Svg width={CHART_W} height={CHART_H}>
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      <View style={styles.chartFooter}>
        <Text style={styles.chartRange}>
          {Math.round(data[0])} → {Math.round(data[data.length - 1])} {unit}
        </Text>
      </View>
    </View>
  )
}

// ── Pinnable KPI card ─────────────────────────────────────────────────────────

function PinnableCard({
  label,
  value,
  valueColor,
  contextSummary,
  isPinned,
  onPin,
}: {
  label: string
  value: string
  valueColor?: string
  contextSummary: string
  isPinned: boolean
  onPin: (summary: string) => void
}) {
  return (
    <TouchableOpacity
      style={[styles.kpiCard, isPinned && styles.kpiCardPinned]}
      onPress={() => onPin(contextSummary)}
      activeOpacity={0.7}
    >
      <View style={styles.kpiCardHeader}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Ionicons
          name={isPinned ? 'bookmark' : 'bookmark-outline'}
          size={13}
          color={isPinned ? '#2563eb' : '#cbd5e1'}
        />
      </View>
      <Text style={[styles.kpiValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      {isPinned && <Text style={styles.pinnedHint}>Added to AI context</Text>}
    </TouchableOpacity>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ApartmentDetailScreen({ route }: RouteParams) {
  const { apartmentId } = route.params
  const { accessToken } = useAuth()

  const [summary, setSummary] = useState<ApartmentSummaryResponse | null>(null)
  const [hourlyElec, setHourlyElec] = useState<number[]>([])
  const [hourlyWater, setHourlyWater] = useState<number[]>([])
  const [hourlyCo2, setHourlyCo2] = useState<number[]>([])
  const [hourlyHumidity, setHourlyHumidity] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [chatOpen, setChatOpen] = useState(false)
  const [contextItems, setContextItems] = useState<ContextItem[]>([])

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [summaryRes, elecRes, waterRes, co2Res, humidityRes] = await Promise.all([
        apiRequest<ApartmentSummaryResponse>(`/apartments/${apartmentId}/summary`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/apartments/${apartmentId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/apartments/${apartmentId}/dynamics?resource=water&period=24h`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/apartments/${apartmentId}/dynamics?resource=co2&period=24h`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/apartments/${apartmentId}/dynamics?resource=humidity&period=24h`, { token: accessToken }),
      ])
      setSummary(summaryRes)
      setHourlyElec(elecRes.dynamics.map((d) => d.value))
      setHourlyWater(waterRes.dynamics.map((d) => d.value))
      setHourlyCo2(co2Res.dynamics.map((d) => d.value))
      setHourlyHumidity(humidityRes.dynamics.map((d) => d.value))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load apartment')
    } finally {
      setLoading(false)
    }
  }, [accessToken, apartmentId])

  useEffect(() => { void load() }, [load])

  const handlePinContext = useCallback((label: string, summary: string) => {
    const id = `${label}-${summary}`.toLowerCase().replace(/\s+/g, '-').slice(0, 40)
    setContextItems((prev) => {
      if (prev.some((c) => c.id === id)) return prev
      return [{ id, label, summary }, ...prev].slice(0, 8)
    })
  }, [])

  const handleRemoveContext = useCallback((id: string) => {
    setContextItems((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const isPinned = useCallback(
    (label: string) => contextItems.some((c) => c.label === label),
    [contextItems],
  )

  const apt = summary?.apartment
  const snap = summary?.live_snapshot
  const badge = STATUS_BADGE[apt?.status ?? 'good']

  const chatApartment = useMemo(() => {
    if (!apt || !snap) return null
    return {
      apartmentId: apt.id,
      number: apt.number,
      score: apt.score,
      status: apt.status,
      electricity: snap.electricity,
      water: snap.water,
      co2: snap.co2,
      humidity: snap.humidity,
      savings: snap.savings,
    }
  }, [apt, snap])

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Header */}
        {apt && (
          <View style={styles.headerCard}>
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>Apartment #{apt.number}</Text>
              <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusText, { color: badge.text }]}>Eco {apt.score}</Text>
              </View>
            </View>
            <Text style={styles.headerSub}>Status: {apt.status} · ID: {apt.id}</Text>
          </View>
        )}

        {/* Live snapshot — pinnable KPI cards */}
        {snap && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live snapshot</Text>
              <Text style={styles.sectionHint}>Tap card to pin to AI</Text>
            </View>
            <View style={styles.kpiGrid}>
              <PinnableCard
                label="Electricity"
                value={`${snap.electricity.toFixed(1)} kWh`}
                contextSummary={`Live electricity usage is ${snap.electricity.toFixed(1)} kWh`}
                isPinned={isPinned('Electricity')}
                onPin={(s) => handlePinContext('Electricity', s)}
              />
              <PinnableCard
                label="Water"
                value={`${Math.round(snap.water)} L`}
                contextSummary={`Live water usage is ${Math.round(snap.water)} L`}
                isPinned={isPinned('Water')}
                onPin={(s) => handlePinContext('Water', s)}
              />
              <PinnableCard
                label="Air quality"
                value={`${Math.round(snap.co2)} ppm / ${Math.round(snap.humidity)}%`}
                contextSummary={`CO₂ is ${Math.round(snap.co2)} ppm, humidity ${Math.round(snap.humidity)}%`}
                isPinned={isPinned('Air quality')}
                onPin={(s) => handlePinContext('Air quality', s)}
              />
              <PinnableCard
                label="Savings"
                value={`${snap.savings}%`}
                valueColor="#059669"
                contextSummary={`Projected energy savings are ${snap.savings}%`}
                isPinned={isPinned('Savings')}
                onPin={(s) => handlePinContext('Savings', s)}
              />
            </View>
          </View>
        )}

        {/* Hourly charts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hourly analytics (24h)</Text>
          <MiniChart data={hourlyElec} color="#2563eb" label="Electricity" unit="kWh" />
          <MiniChart data={hourlyWater} color="#0ea5e9" label="Water" unit="L" />
          <MiniChart data={hourlyCo2} color="#f59e0b" label="CO₂" unit="ppm" />
          <MiniChart data={hourlyHumidity} color="#16a34a" label="Humidity" unit="%" />
        </View>
      </ScrollView>

      {/* FAB — open chat */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setChatOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        {contextItems.length > 0 && (
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{contextItems.length}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Chat modal */}
      <ApartmentChatModal
        visible={chatOpen}
        apartment={chatApartment}
        contextItems={contextItems}
        onRemoveContext={handleRemoveContext}
        onClose={() => setChatOpen(false)}
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f2f5' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 100, gap: 14 },

  errorBox: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 10 },
  errorText: { color: '#b91c1c', fontSize: 14 },

  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSub: { marginTop: 4, fontSize: 12, color: '#64748b' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: '700' },

  section: {},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sectionHint: { fontSize: 11, color: '#94a3b8' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  kpiCardPinned: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  kpiCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  kpiLabel: { fontSize: 11, color: '#64748b' },
  kpiValue: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  pinnedHint: { marginTop: 3, fontSize: 9, color: '#2563eb', fontWeight: '500' },

  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  chartLabel: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chartDelta: { fontSize: 11, fontWeight: '700' },
  chartFooter: { marginTop: 8 },
  chartRange: { fontSize: 11, color: '#64748b' },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  fabBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
})
