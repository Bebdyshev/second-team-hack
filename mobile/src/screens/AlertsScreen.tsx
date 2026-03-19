import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type AlertItem = {
  id: string;
  house_name: string;
  resource: string;
  severity: string;
  title: string;
  detected_at: string;
};

export default function AlertsScreen() {
  const { accessToken, activeOrganizationId } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const houseId = activeOrganizationId ?? 'house-1';

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<AlertItem[]>(`/alerts?house_id=${houseId}`, {
        token: accessToken,
      });
      setAlerts(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, houseId]);

  const sevColor: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#94a3b8',
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

      {alerts.length === 0 && !loading ? (
        <Text style={styles.empty}>No active alerts</Text>
      ) : (
        alerts.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.title}>{a.title}</Text>
              <View style={[styles.badge, { backgroundColor: `${sevColor[a.severity] ?? '#94a3b8'}20` }]}>
                <Text style={[styles.badgeText, { color: sevColor[a.severity] ?? '#64748b' }]}>
                  {a.severity}
                </Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {a.resource} · {a.house_name} · {a.detected_at}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
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
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  title: { fontSize: 14, fontWeight: '600', color: '#0f172a', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  meta: { fontSize: 12, color: '#64748b' },
});
