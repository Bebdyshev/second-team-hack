import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type TaskStatus = 'todo' | 'in_progress' | 'done';

type TaskItem = {
  id: string;
  title: string;
  description: string;
  building: string;
  due_time: string;
  status: TaskStatus;
  category: string;
};

const statusColor: Record<TaskStatus, string> = {
  todo: '#64748b',
  in_progress: '#2563eb',
  done: '#10b981',
};

const statusLabel: Record<TaskStatus, string> = {
  todo: 'Planned',
  in_progress: 'In progress',
  done: 'Completed',
};

export default function MaintenanceScreen() {
  const { accessToken, activeOrganizationId } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const houseId = activeOrganizationId ?? 'house-1';

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<TaskItem[]>(`/tasks?house_id=${houseId}`, { token: accessToken });
      setTasks(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load maintenance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, houseId]);

  const maintenanceTasks = useMemo(
    () => tasks.filter((task) => ['inspection', 'repair', 'meter'].includes(task.category)),
    [tasks]
  );

  const openCount = maintenanceTasks.filter((task) => task.status !== 'done').length;

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
        <Text style={styles.summaryLabel}>Active maintenance items</Text>
        <Text style={styles.summaryValue}>{openCount}</Text>
        <Text style={styles.summarySub}>{maintenanceTasks.length} total tasks in maintenance scope</Text>
      </View>

      <Text style={styles.sectionTitle}>Maintenance queue</Text>
      {maintenanceTasks.length === 0 && !loading ? (
        <Text style={styles.empty}>No maintenance tasks</Text>
      ) : (
        maintenanceTasks.map((task) => (
          <View key={task.id} style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{task.title}</Text>
              <View style={[styles.badge, { backgroundColor: `${statusColor[task.status]}1A` }]}>
                <Text style={[styles.badgeText, { color: statusColor[task.status] }]}>{statusLabel[task.status]}</Text>
              </View>
            </View>
            <Text style={styles.description} numberOfLines={2}>
              {task.description || 'No details'}
            </Text>
            <View style={styles.footerRow}>
              <Text style={styles.meta}>{task.building}</Text>
              <Text style={styles.meta}>Due {task.due_time}</Text>
            </View>
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
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 16,
  },
  summaryLabel: { fontSize: 12, color: '#64748b' },
  summaryValue: { marginTop: 4, fontSize: 30, fontWeight: '700', color: '#0f172a' },
  summarySub: { marginTop: 3, fontSize: 12, color: '#94a3b8' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  description: { marginTop: 6, fontSize: 13, color: '#64748b' },
  footerRow: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 12, color: '#64748b' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
