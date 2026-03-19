import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type MeterItem = {
  id: string;
  signal_strength: 'good' | 'weak' | 'offline';
};

export default function MetersScreen() {
  const { accessToken, activeOrganizationId } = useAuth();
  const [meters, setMeters] = useState<MeterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const houseId = activeOrganizationId ?? 'house-1';

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<MeterItem[]>(`/meters?house_id=${houseId}`, {
        token: accessToken,
      });
      setMeters(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, houseId]);

  const good = meters.filter((m) => m.signal_strength === 'good').length;
  const weak = meters.filter((m) => m.signal_strength === 'weak').length;
  const offline = meters.filter((m) => m.signal_strength === 'offline').length;

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

      <View style={styles.summary}>
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>Total meters</Text>
          <Text style={styles.sumValue}>{meters.length}</Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>Healthy</Text>
          <Text style={[styles.sumValue, { color: '#10b981' }]}>{good}</Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>Weak</Text>
          <Text style={[styles.sumValue, { color: '#f59e0b' }]}>{weak}</Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>Offline</Text>
          <Text style={[styles.sumValue, { color: '#ef4444' }]}>{offline}</Text>
        </View>
      </View>

      {meters.length === 0 && !loading ? (
        <Text style={styles.empty}>No meters</Text>
      ) : (
        meters.map((m) => (
          <View key={m.id} style={styles.card}>
            <Text style={styles.meterId}>{m.id}</Text>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    m.signal_strength === 'good'
                      ? '#10b981'
                      : m.signal_strength === 'weak'
                        ? '#f59e0b'
                        : '#ef4444',
                },
              ]}
            />
            <Text style={styles.statusText}>{m.signal_strength}</Text>
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
  summary: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel: { fontSize: 14, color: '#64748b' },
  sumValue: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  meterId: { flex: 1, fontSize: 13, color: '#0f172a' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 12, color: '#64748b' },
});
