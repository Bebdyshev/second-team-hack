import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type ReportOverview = {
  house_name: string;
  monthly_rows: Array<{
    period: string;
    electricity_kwh: number;
    water_liters: number;
    co2_avg_ppm: number;
    anomaly_count: number;
  }>;
  anomalies: Array<{
    id: string;
    title: string;
    resource: string;
    severity: 'low' | 'medium' | 'high';
    detected_at: string;
  }>;
};

type ReportAnchor = {
  id: string;
  period: string;
  status: 'pending' | 'confirmed' | 'failed';
  tx_hash: string;
  explorer_url: string;
  created_at: string;
};

const severityColor: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

export default function ReportsScreen() {
  const { accessToken, activeOrganizationId, activeRole } = useAuth();
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [anchors, setAnchors] = useState<ReportAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [error, setError] = useState('');

  const houseId = activeOrganizationId ?? 'house-1';
  const isManager = activeRole === 'Manager';

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const [overviewRes, anchorsRes] = await Promise.all([
        apiRequest<ReportOverview>(`/houses/${houseId}/reports/overview`, { token: accessToken }),
        apiRequest<ReportAnchor[]>(`/houses/${houseId}/reports/anchors`, { token: accessToken }),
      ]);
      setOverview(overviewRes);
      setAnchors(anchorsRes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, houseId]);

  const latestPeriod = useMemo(
    () => overview?.monthly_rows.at(-1)?.period ?? new Date().toISOString().slice(0, 7),
    [overview]
  );

  const handleAnchor = async () => {
    if (!accessToken || !isManager) return;
    setIsAnchoring(true);
    setError('');
    try {
      await apiRequest(`/houses/${houseId}/reports/anchor`, {
        method: 'POST',
        token: accessToken,
        body: { period: latestPeriod, metadata_uri: `report://${houseId}/${latestPeriod}` },
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to anchor report');
    } finally {
      setIsAnchoring(false);
    }
  };

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

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Transparency report</Text>
        <Text style={styles.summarySub}>{overview?.house_name ?? 'House'} · monthly + on-chain proof</Text>
        <View style={styles.kpiRow}>
          <Kpi title='Months' value={overview?.monthly_rows.length ?? 0} />
          <Kpi title='Anomalies' value={overview?.anomalies.length ?? 0} />
          <Kpi title='Anchors' value={anchors.length} />
        </View>
      </View>

      {isManager ? (
        <TouchableOpacity
          onPress={handleAnchor}
          disabled={isAnchoring || !accessToken}
          style={[styles.anchorButton, (isAnchoring || !accessToken) && styles.anchorButtonDisabled]}
        >
          <Text style={styles.anchorButtonText}>{isAnchoring ? 'Anchoring...' : 'Anchor latest report'}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.verificationNote}>
          <Text style={styles.verificationText}>Verification mode: resident can inspect proof history</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Monthly rows</Text>
      {overview?.monthly_rows?.length ? (
        overview.monthly_rows.map((row) => (
          <View key={row.period} style={styles.monthCard}>
            <Text style={styles.monthTitle}>{row.period}</Text>
            <Text style={styles.monthMeta}>Electricity: {row.electricity_kwh.toFixed(1)} kWh</Text>
            <Text style={styles.monthMeta}>Water: {row.water_liters.toFixed(1)} L</Text>
            <Text style={styles.monthMeta}>CO₂ avg: {row.co2_avg_ppm.toFixed(1)} ppm</Text>
            <Text style={styles.monthMeta}>Anomalies: {row.anomaly_count}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No monthly data</Text>
      )}

      <Text style={styles.sectionTitle}>On-chain proof history</Text>
      {anchors.length ? (
        anchors.map((anchor) => (
          <View key={anchor.id} style={styles.anchorCard}>
            <View style={styles.anchorTop}>
              <Text style={styles.anchorPeriod}>{anchor.period}</Text>
              <Text style={styles.anchorStatus}>{anchor.status}</Text>
            </View>
            <Text style={styles.anchorHash}>{anchor.tx_hash.slice(0, 24)}...</Text>
            {anchor.explorer_url ? (
              <TouchableOpacity onPress={() => Linking.openURL(anchor.explorer_url)}>
                <Text style={styles.linkText}>Open explorer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No anchors yet</Text>
      )}

      <Text style={styles.sectionTitle}>Recent anomalies</Text>
      {overview?.anomalies?.length ? (
        overview.anomalies.slice(0, 6).map((anomaly) => (
          <View key={anomaly.id} style={styles.anomalyCard}>
            <Text style={styles.anomalyTitle}>{anomaly.title}</Text>
            <Text style={[styles.anomalyMeta, { color: severityColor[anomaly.severity] ?? '#64748b' }]}>
              {anomaly.resource} · {anomaly.severity} · {anomaly.detected_at}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No anomalies</Text>
      )}
    </ScrollView>
  );
}

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <View style={styles.kpiCell}>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 32 },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: { color: '#b91c1c', fontSize: 14 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  summaryTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  summarySub: { marginTop: 4, fontSize: 12, color: '#64748b' },
  kpiRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  kpiCell: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10,
    alignItems: 'center',
  },
  kpiTitle: { fontSize: 11, color: '#64748b' },
  kpiValue: { marginTop: 2, fontSize: 16, fontWeight: '700', color: '#0f172a' },
  anchorButton: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  anchorButtonDisabled: { opacity: 0.6 },
  anchorButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  verificationNote: {
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 12,
  },
  verificationText: { fontSize: 12, color: '#64748b' },
  sectionTitle: { marginTop: 6, marginBottom: 10, fontSize: 16, fontWeight: '700', color: '#0f172a' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginVertical: 10 },
  monthCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  monthTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 5 },
  monthMeta: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  anchorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  anchorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  anchorPeriod: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  anchorStatus: { fontSize: 11, color: '#64748b', textTransform: 'capitalize' },
  anchorHash: { marginTop: 5, fontSize: 11, color: '#475569' },
  linkText: { marginTop: 6, fontSize: 12, color: '#2563eb', fontWeight: '500' },
  anomalyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  anomalyTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  anomalyMeta: { marginTop: 4, fontSize: 12 },
});
