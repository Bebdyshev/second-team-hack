import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Svg, { Line, Polyline } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { apiRequest, ApiError } from '../lib/api'
import { getApiBaseUrl } from '../config'

// ── Types ─────────────────────────────────────────────────────────────────────

type AiFinding = {
  hour: string
  resource: 'electricity' | 'water' | 'co2'
  value: number
  level: 'ok' | 'warn' | 'critical'
  reason: string
}

type AiReasoning = {
  summary: string
  findings: AiFinding[]
  recommendations: string[]
}

type Metrics = {
  electricity_24h: number[]
  water_24h: number[]
  co2_24h: number[]
}

type Severity = 'low' | 'medium' | 'high'

type ApiAlert = {
  id: string
  house_name: string
  resource: string
  severity: Severity
  title: string
  detected_at: string
}

type ApartmentItem = {
  id: string
  number: string
  electricity_daily: number[]
  water_daily: number[]
  co2_series: number[]
}

type Scope = 'house' | 'apartment'

// ── Constants ─────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  electricity: { warn: 2.8, critical: 4.5, unit: 'kWh' },
  water: { warn: 35, critical: 55, unit: 'L' },
  co2: { warn: 800, critical: 1000, unit: 'ppm' },
}

const SEV_DOT: Record<Severity, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#94a3b8',
}

const SCREEN_W = Dimensions.get('window').width
const CHART_W = SCREEN_W - 64
const CHART_H = 100

// ── Sparkline chart ───────────────────────────────────────────────────────────

function ResourceChart({
  label,
  values,
  unit,
  warn,
  critical,
  findings,
  resource,
  color,
}: {
  label: string
  values: number[]
  unit: string
  warn: number
  critical: number
  findings: AiFinding[]
  resource: 'electricity' | 'water' | 'co2'
  color: string
}) {
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const peakIdx = values.indexOf(max)

  const toY = (v: number) => CHART_H - ((v - min) / range) * (CHART_H - 12) - 6
  const toX = (i: number) => (i / (values.length - 1)) * CHART_W

  const points = values
    .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ')

  const warnY = toY(warn)
  const critY = toY(critical)

  const resourceFindings = findings.filter((f) => f.resource === resource)
  const level = resourceFindings.some((f) => f.level === 'critical')
    ? 'critical'
    : resourceFindings.some((f) => f.level === 'warn')
    ? 'warn'
    : 'ok'

  const dotColor = level === 'critical' ? '#ef4444' : level === 'warn' ? '#f59e0b' : '#10b981'

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartTop}>
        <View style={styles.chartTitleRow}>
          <View style={[styles.levelDot, { backgroundColor: dotColor }]} />
          <Text style={styles.chartTitle}>{label}</Text>
        </View>
        <View style={styles.chartMeta}>
          <Text style={styles.chartMetaText}>avg {avg.toFixed(1)}{unit}</Text>
          <Text style={styles.chartMetaText}>
            peak {max.toFixed(1)}{unit} @ {String(peakIdx).padStart(2, '0')}:00
          </Text>
        </View>
      </View>

      <Svg width={CHART_W} height={CHART_H} style={styles.svg}>
        {/* Warn threshold */}
        {warnY > 0 && warnY < CHART_H && (
          <Line x1={0} y1={warnY} x2={CHART_W} y2={warnY} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,3" />
        )}
        {/* Critical threshold */}
        {critY > 0 && critY < CHART_H && (
          <Line x1={0} y1={critY} x2={CHART_W} y2={critY} stroke="#f87171" strokeWidth={1} strokeDasharray="4,3" />
        )}
        <Polyline
          points={points}
          fill="none"
          stroke="#0f172a"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {resourceFindings.length > 0 && (
        <View style={styles.findingsList}>
          {resourceFindings.slice(0, 2).map((f, i) => (
            <View key={i} style={styles.findingRow}>
              <View style={[styles.findingDot, {
                backgroundColor: f.level === 'critical' ? '#ef4444' : f.level === 'warn' ? '#f59e0b' : '#10b981'
              }]} />
              <Text style={styles.findingText} numberOfLines={2}>
                <Text style={styles.findingHour}>{f.hour} </Text>
                {f.reason}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const { accessToken, activeOrganizationId } = useAuth()
  const houseId = activeOrganizationId ?? 'house-1'

  const [scope, setScope] = useState<Scope>('house')
  const [apartments, setApartments] = useState<ApartmentItem[]>([])
  const [selectedAptId, setSelectedAptId] = useState('')

  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const [reasoning, setReasoning] = useState<AiReasoning | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  const [alerts, setAlerts] = useState<ApiAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  const abortRef = useRef<unknown>(null)

  // Load apartments
  useEffect(() => {
    if (!accessToken) return
    apiRequest<ApartmentItem[]>(`/houses/${houseId}/apartments`, { token: accessToken })
      .then((data) => {
        setApartments(data)
        if (data.length > 0) setSelectedAptId(data[0].id)
      })
      .catch(() => {})
  }, [accessToken, houseId])

  const loadAlerts = useCallback(async () => {
    if (!accessToken) return
    const data = await apiRequest<ApiAlert[]>(`/alerts?house_id=${houseId}`, { token: accessToken })
    setAlerts(data)
  }, [accessToken, houseId])

  const startStream = useCallback((forceRefresh = false) => {
    if (!accessToken) return

    // Abort previous XHR if any
    const prevXhr = abortRef.current as XMLHttpRequest | null
    if (prevXhr) prevXhr.abort()

    const params = new URLSearchParams()
    if (scope === 'apartment' && selectedAptId) params.set('apartment_id', selectedAptId)
    if (forceRefresh) params.set('force_refresh', 'true')
    const query = params.toString()
    const url = `${getApiBaseUrl()}/houses/${houseId}/analytics/reasoning/stream${query ? `?${query}` : ''}`

    setIsStreaming(true)
    setStreamError(null)
    setStreamedText('')
    setReasoning(null)
    setMetrics(null)

    // React Native supports XHR onprogress for streaming text responses
    const xhr = new XMLHttpRequest()
    abortRef.current = xhr

    let processedLen = 0
    let currentEvent = ''

    const processChunk = (chunk: string) => {
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
          continue
        }
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') {
            setIsStreaming(false)
            const now = new Date()
            setLastRefreshed(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
            return
          }
          try {
            const parsed = JSON.parse(raw)
            if (currentEvent === 'metrics' || parsed.electricity_24h) {
              setMetrics({
                electricity_24h: parsed.electricity_24h,
                water_24h: parsed.water_24h,
                co2_24h: parsed.co2_24h,
              })
            } else if (currentEvent === 'structured' || parsed.summary) {
              setReasoning(parsed as AiReasoning)
            } else if (parsed.token !== undefined) {
              setStreamedText((prev) => prev + (parsed.token as string))
            }
          } catch { /* skip malformed */ }
          currentEvent = ''
        }
      }
    }

    xhr.open('GET', url)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('Accept', 'text/event-stream')

    xhr.onprogress = () => {
      const newChunk = xhr.responseText.slice(processedLen)
      processedLen = xhr.responseText.length
      processChunk(newChunk)
    }

    xhr.onload = () => {
      const remaining = xhr.responseText.slice(processedLen)
      if (remaining) processChunk(remaining)
      setIsStreaming(false)
      const now = new Date()
      setLastRefreshed(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    }

    xhr.onerror = () => {
      setStreamError('Connection failed — check backend URL')
      setIsStreaming(false)
    }

    xhr.onabort = () => setIsStreaming(false)

    xhr.send()
  }, [accessToken, houseId, scope, selectedAptId])

  // Derive metrics from selected apartment (no re-stream needed)
  useEffect(() => {
    if (scope === 'apartment' && selectedAptId) {
      const apt = apartments.find((a) => a.id === selectedAptId)
      if (apt) {
        setMetrics({
          electricity_24h: apt.electricity_daily,
          water_24h: apt.water_daily,
          co2_24h: apt.co2_series.map(Number),
        })
      }
    }
  }, [scope, selectedAptId, apartments])

  // Initial boot
  useEffect(() => {
    if (!accessToken) return
    const boot = async () => {
      setLoading(true)
      try { await loadAlerts() } catch { /* ignore */ }
      setLoading(false)
      startStream()
    }
    void boot()
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const findings = useMemo(() => reasoning?.findings ?? [], [reasoning])
  const displaySummary = reasoning?.summary ?? streamedText

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => {
      const order: Record<Severity, number> = { high: 3, medium: 2, low: 1 }
      return order[b.severity] - order[a.severity]
    }),
    [alerts],
  )

  const sevCounts = useMemo(
    () => alerts.reduce((acc, a) => { acc[a.severity] = (acc[a.severity] ?? 0) + 1; return acc }, {} as Record<string, number>),
    [alerts],
  )

  const handleRefresh = () => startStream(true)

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadAlerts() }} />}
    >
      {/* Scope toggle + refresh */}
      <View style={styles.headerRow}>
        <View style={styles.scopeToggle}>
          {(['house', 'apartment'] as Scope[]).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setScope(s)}
              style={[styles.scopeBtn, scope === s && styles.scopeBtnActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.scopeBtnText, scope === s && styles.scopeBtnTextActive]}>
                {s === 'house' ? 'Whole house' : 'Apartment'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.headerRight}>
          {lastRefreshed && <Text style={styles.updatedText}>Updated {lastRefreshed}</Text>}
          <TouchableOpacity onPress={handleRefresh} disabled={isStreaming} style={styles.refreshBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={14} color={isStreaming ? '#cbd5e1' : '#64748b'} />
            <Text style={[styles.refreshText, isStreaming && { color: '#cbd5e1' }]}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Apartment picker when scope = apartment */}
      {scope === 'apartment' && apartments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.aptPickerRow} contentContainerStyle={styles.aptPickerContent}>
          {apartments.map((a) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => setSelectedAptId(a.id)}
              style={[styles.aptChip, selectedAptId === a.id && styles.aptChipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.aptChipText, selectedAptId === a.id && styles.aptChipTextActive]}>
                Apt {a.number}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Resource Insights widget */}
      <View style={styles.insightsCard}>
        <View style={styles.insightsHeader}>
          <Text style={styles.insightsLabel}>RESOURCE INSIGHTS</Text>
          {isStreaming && (
            <View style={styles.generatingChip}>
              <View style={styles.generatingDot} />
              <Text style={styles.generatingText}>Generating</Text>
            </View>
          )}
        </View>

        {displaySummary ? (
          <Text style={styles.insightsSummary}>{displaySummary}</Text>
        ) : (
          <View style={styles.insightsSkeleton} />
        )}

        {reasoning?.recommendations && reasoning.recommendations.length > 0 && (
          <View style={styles.recsList}>
            {reasoning.recommendations.map((r, i) => (
              <View key={i} style={styles.recRow}>
                <Text style={styles.recBullet}>·</Text>
                <Text style={styles.recText}>{r}</Text>
              </View>
            ))}
          </View>
        )}

        {streamError && (
          <Text style={styles.streamError}>Stream error: {streamError}</Text>
        )}
      </View>

      {/* Charts */}
      {metrics && (
        <>
          <ResourceChart
            label="Electricity"
            values={metrics.electricity_24h}
            unit={THRESHOLDS.electricity.unit}
            warn={THRESHOLDS.electricity.warn}
            critical={THRESHOLDS.electricity.critical}
            findings={findings}
            resource="electricity"
            color="#2563eb"
          />
          <ResourceChart
            label="Water"
            values={metrics.water_24h}
            unit={THRESHOLDS.water.unit}
            warn={THRESHOLDS.water.warn}
            critical={THRESHOLDS.water.critical}
            findings={findings}
            resource="water"
            color="#0ea5e9"
          />
          <ResourceChart
            label="CO₂"
            values={metrics.co2_24h}
            unit={THRESHOLDS.co2.unit}
            warn={THRESHOLDS.co2.warn}
            critical={THRESHOLDS.co2.critical}
            findings={findings}
            resource="co2"
            color="#f59e0b"
          />
        </>
      )}

      {/* Active alerts */}
      <View style={styles.alertsCard}>
        <View style={styles.alertsHeader}>
          <Text style={styles.alertsTitle}>Active alerts</Text>
          <View style={styles.alertsCounts}>
            {(sevCounts.high ?? 0) > 0 && <Text style={styles.highCount}>{sevCounts.high} high</Text>}
            {(sevCounts.medium ?? 0) > 0 && <Text style={styles.medCount}>{sevCounts.medium} med</Text>}
            {(sevCounts.low ?? 0) > 0 && <Text style={styles.lowCount}>{sevCounts.low} low</Text>}
          </View>
        </View>

        {sortedAlerts.length === 0 ? (
          <Text style={styles.noAlerts}>No active alerts</Text>
        ) : (
          sortedAlerts.map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={[styles.alertDot, { backgroundColor: SEV_DOT[alert.severity] }]} />
              <View style={styles.alertInfo}>
                <Text style={styles.alertTitle} numberOfLines={2}>{alert.title}</Text>
                <Text style={styles.alertMeta}>{alert.resource} · {alert.detected_at}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Hour-by-hour findings */}
      {findings.length > 0 && (
        <View style={styles.findingsCard}>
          <Text style={styles.findingsCardTitle}>Hour-by-hour findings</Text>
          {findings.map((f, i) => (
            <View key={i} style={[styles.findingTableRow, i > 0 && styles.findingTableRowBorder]}>
              <Text style={styles.ftHour}>{f.hour}</Text>
              <Text style={styles.ftResource}>{f.resource}</Text>
              <Text style={[styles.ftLevel, {
                color: f.level === 'critical' ? '#ef4444' : f.level === 'warn' ? '#f59e0b' : '#10b981'
              }]}>{f.value} {THRESHOLDS[f.resource]?.unit}</Text>
              <Text style={styles.ftReason} numberOfLines={2}>{f.reason}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  scopeToggle: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
  },
  scopeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scopeBtnActive: { backgroundColor: '#0f172a' },
  scopeBtnText: { fontSize: 13, fontWeight: '500', color: '#64748b' },
  scopeBtnTextActive: { color: '#fff' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  updatedText: { fontSize: 11, color: '#94a3b8' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  refreshText: { fontSize: 12, color: '#64748b' },

  aptPickerRow: { marginHorizontal: -16 },
  aptPickerContent: { paddingHorizontal: 16, gap: 6, flexDirection: 'row' },
  aptChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  aptChipActive: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  aptChipText: { fontSize: 12, color: '#64748b' },
  aptChipTextActive: { color: '#2563eb', fontWeight: '600' },

  insightsCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  insightsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  insightsLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 1.2 },
  generatingChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  generatingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#94a3b8' },
  generatingText: { fontSize: 10, color: '#64748b' },
  insightsSummary: { fontSize: 15, lineHeight: 23, color: '#334155' },
  insightsSkeleton: { height: 16, width: '70%', backgroundColor: '#f1f5f9', borderRadius: 6 },
  recsList: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, gap: 6 },
  recRow: { flexDirection: 'row', gap: 6 },
  recBullet: { fontSize: 14, color: '#94a3b8', lineHeight: 20 },
  recText: { flex: 1, fontSize: 13, color: '#64748b', lineHeight: 20 },
  streamError: { marginTop: 8, fontSize: 12, color: '#ef4444' },

  chartCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  chartTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  chartTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  chartMeta: { alignItems: 'flex-end', gap: 1 },
  chartMetaText: { fontSize: 10, color: '#94a3b8' },
  svg: { borderRadius: 4 },
  findingsList: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, gap: 6 },
  findingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  findingDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  findingHour: { fontWeight: '700', color: '#334155' },
  findingText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 18 },

  alertsCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  alertsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  alertsTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  alertsCounts: { flexDirection: 'row', gap: 8 },
  highCount: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  medCount: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },
  lowCount: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  noAlerts: { fontSize: 13, color: '#94a3b8', paddingVertical: 8 },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f8fafc' },
  alertDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  alertMeta: { marginTop: 2, fontSize: 11, color: '#94a3b8' },

  findingsCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  findingsCardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  findingTableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  findingTableRowBorder: { borderTopWidth: 1, borderTopColor: '#f8fafc' },
  ftHour: { width: 40, fontSize: 12, fontWeight: '600', color: '#64748b', flexShrink: 0 },
  ftResource: { width: 64, fontSize: 12, color: '#64748b', flexShrink: 0, textTransform: 'capitalize' },
  ftLevel: { width: 64, fontSize: 12, fontWeight: '600', flexShrink: 0 },
  ftReason: { flex: 1, fontSize: 12, color: '#475569', lineHeight: 17 },
})
