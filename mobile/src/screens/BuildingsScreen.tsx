import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { apiRequest, ApiError } from '../lib/api'

type ApartmentStatus = 'good' | 'watch' | 'alert'

type ApartmentItem = {
  id: string
  number: string
  floor: number
  score: number
  status: ApartmentStatus
  anomalies: string[]
}

type HouseSummary = {
  total_power: number
  total_water: number
  average_air: number
  city_impact: number
}

const STATUS_CONFIG: Record<ApartmentStatus, { bg: string; border: string; dot: string; label: string }> = {
  good: { bg: '#ecfdf5', border: '#a7f3d0', dot: '#10b981', label: 'Good' },
  watch: { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: 'Watch' },
  alert: { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: 'Alert' },
}

type BuildingsScreenProps = {
  navigation: {
    navigate: (routeName: string, params?: Record<string, unknown>) => void
  }
}

export default function BuildingsScreen({ navigation }: BuildingsScreenProps) {
  const { accessToken, activeOrganizationId } = useAuth()
  const [apartments, setApartments] = useState<ApartmentItem[]>([])
  const [summary, setSummary] = useState<HouseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const houseId = activeOrganizationId ?? 'house-1'

  const load = async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [summaryRes, apartmentsRes] = await Promise.all([
        apiRequest<HouseSummary>(`/houses/${houseId}/summary`, { token: accessToken }),
        apiRequest<ApartmentItem[]>(`/houses/${houseId}/apartments`, { token: accessToken }),
      ])
      setSummary(summaryRes)
      setApartments(apartmentsRes)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [accessToken, houseId])

  const floorGroups = useMemo(() => {
    const map: Record<number, ApartmentItem[]> = {}
    for (const apt of apartments) {
      if (!map[apt.floor]) map[apt.floor] = []
      map[apt.floor].push(apt)
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([floor, apts]) => ({
        floor: Number(floor),
        apts: apts.sort((a, b) => Number(a.number) - Number(b.number)),
      }))
  }, [apartments])

  const alertCount = apartments.filter((a) => a.status === 'alert').length
  const watchCount = apartments.filter((a) => a.status === 'watch').length

  return (
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

      {/* Summary KPIs */}
      {summary && (
        <View style={styles.kpiGrid}>
          <KpiCard label="Power" value={`${Math.round(summary.total_power)}`} unit="kWh" icon="flash" iconColor="#2563eb" />
          <KpiCard label="Water" value={`${Math.round(summary.total_water)}`} unit="L" icon="water" iconColor="#0ea5e9" />
          <KpiCard label="Air" value={`${summary.average_air}`} unit="AQI" icon="leaf" iconColor="#10b981" />
          <KpiCard label="Impact" value={`${summary.city_impact}`} unit="%" icon="globe" iconColor="#8b5cf6" />
        </View>
      )}

      {/* Alerts summary */}
      {(alertCount > 0 || watchCount > 0) && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning" size={14} color="#d97706" />
          <Text style={styles.alertBannerText}>
            {alertCount > 0 ? `${alertCount} alert${alertCount > 1 ? 's' : ''}` : ''}
            {alertCount > 0 && watchCount > 0 ? ' · ' : ''}
            {watchCount > 0 ? `${watchCount} watch` : ''}
            {' '}require attention
          </Text>
        </View>
      )}

      {/* Floor sections */}
      {floorGroups.map(({ floor, apts }) => (
        <View key={floor} style={styles.floorSection}>
          <View style={styles.floorHeader}>
            <Text style={styles.floorTitle}>Floor {floor}</Text>
            <Text style={styles.floorCount}>{apts.length} apt{apts.length > 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.aptList}>
            {apts.map((apt) => {
              const cfg = STATUS_CONFIG[apt.status]
              return (
                <TouchableOpacity
                  key={apt.id}
                  onPress={() => navigation.navigate('ApartmentDetail', { apartmentId: apt.id })}
                  activeOpacity={0.7}
                  style={[styles.aptRow, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                >
                  <View style={[styles.aptDot, { backgroundColor: cfg.dot }]} />
                  <View style={styles.aptInfo}>
                    <Text style={styles.aptNumber}>Apt {apt.number}</Text>
                    {apt.anomalies.length > 0 && (
                      <Text style={styles.aptAnomalies}>
                        {apt.anomalies.length} alert{apt.anomalies.length > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                  <View style={styles.aptRight}>
                    <Text style={styles.aptScore}>Eco {apt.score}</Text>
                    <Text style={[styles.aptStatusLabel, { color: cfg.dot }]}>{cfg.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={styles.aptChevron} />
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}

      {apartments.length === 0 && !loading && (
        <Text style={styles.empty}>No apartments found</Text>
      )}
    </ScrollView>
  )
}

function KpiCard({
  label,
  value,
  unit,
  icon,
  iconColor,
}: {
  label: string
  value: string
  unit: string
  icon: keyof typeof Ionicons.glyphMap
  iconColor: string
}) {
  return (
    <View style={styles.kpiCard}>
      <Ionicons name={icon} size={18} color={iconColor} style={styles.kpiIcon} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiUnit}>{unit}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },

  errorBox: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 10 },
  errorText: { color: '#b91c1c', fontSize: 14 },

  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    alignItems: 'center',
  },
  kpiIcon: { marginBottom: 4 },
  kpiValue: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  kpiUnit: { fontSize: 9, color: '#94a3b8', marginTop: 0 },
  kpiLabel: { marginTop: 2, fontSize: 9, color: '#64748b' },

  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertBannerText: { fontSize: 13, color: '#92400e', fontWeight: '500' },

  floorSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  floorTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  floorCount: { fontSize: 11, color: '#94a3b8' },

  aptList: { paddingVertical: 4 },
  aptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  aptDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  aptInfo: { flex: 1 },
  aptNumber: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  aptAnomalies: { marginTop: 1, fontSize: 11, color: '#ef4444', fontWeight: '500' },
  aptRight: { alignItems: 'flex-end' },
  aptScore: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  aptStatusLabel: { marginTop: 2, fontSize: 10, fontWeight: '600' },
  aptChevron: { flexShrink: 0 },

  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
})
