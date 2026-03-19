import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: 'sent' | 'viewing' | 'decision';
  created_at: string;
  complaint_type: string | null;
};

const statusLabel: Record<string, string> = {
  sent: 'Waiting',
  viewing: 'Reviewing',
  decision: 'Resolved',
};

const statusColor: Record<string, string> = {
  sent: '#f59e0b',
  viewing: '#3b82f6',
  decision: '#10b981',
};

export default function TicketsScreen() {
  const { accessToken, activeRole } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<Ticket[]>('/tickets', { token: accessToken });
      setTickets(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeRole === 'Manager') {
      setError('Tickets are for residents. Use Tasks for managers.');
    }
  }, [activeRole]);

  const handleCreate = async () => {
    if (!accessToken || !subject.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest('/tickets', {
        method: 'POST',
        token: accessToken,
        body: {
          subject: subject.trim(),
          description: description.trim(),
          incident_date: new Date().toISOString().slice(0, 10),
          incident_time: new Date().toTimeString().slice(0, 5),
        },
      });
      setSubject('');
      setDescription('');
      setShowForm(false);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  if (activeRole === 'Manager') {
    return (
      <View style={styles.center}>
        <Text style={styles.managerText}>Tickets are for residents. Use the web app for Tasks.</Text>
      </View>
    );
  }

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

      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setShowForm(!showForm)}
      >
        <Text style={styles.addBtnText}>{showForm ? 'Cancel' : '+ New complaint'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Subject"
            placeholderTextColor="#94a3b8"
            value={subject}
            onChangeText={setSubject}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description"
            placeholderTextColor="#94a3b8"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleCreate}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>Submit</Text>
          </TouchableOpacity>
        </View>
      )}

      {tickets.length === 0 && !loading ? (
        <Text style={styles.empty}>No tickets yet</Text>
      ) : (
        tickets.map((t) => (
          <View key={t.id} style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketSubject}>{t.subject}</Text>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor[t.status]}20` }]}>
                <Text style={[styles.statusText, { color: statusColor[t.status] }]}>
                  {statusLabel[t.status] ?? t.status}
                </Text>
              </View>
            </View>
            <Text style={styles.ticketDesc} numberOfLines={2}>
              {t.description}
            </Text>
            <Text style={styles.ticketDate}>
              {new Date(t.created_at).toLocaleDateString()}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  managerText: { fontSize: 14, color: '#64748b' },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: { color: '#b91c1c', fontSize: 14 },
  addBtn: {
    backgroundColor: '#059669',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: '#059669',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: '#0f172a', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  ticketDesc: { fontSize: 13, color: '#64748b' },
  ticketDate: { fontSize: 11, color: '#94a3b8', marginTop: 8 },
});
