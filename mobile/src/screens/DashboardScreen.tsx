import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type HouseItem = {
  id: string;
  name: string;
  address: string;
  units_count: number;
  occupancy_rate: number;
};

type HouseSummary = {
  total_power: number;
  total_water: number;
  average_air: number;
  city_impact: number;
  alerts_count: number;
};

type ResourceAlert = {
  id: string;
  house_name: string;
  resource: string;
  severity: string;
  title: string;
  detected_at: string;
};

type MeterItem = { id: string; signal_strength: string };

type ApartmentSummaryResponse = {
  apartment: { id: string; number: string; score: number; status: string };
  live_snapshot: { electricity: number; water: number; co2: number };
};

type DynamicsResponse = { dynamics: Array<{ label: string; value: number }> };

export default function DashboardScreen() {
  const { accessToken, activeOrganizationId, user, activeRole } = useAuth();
  const [houses, setHouses] = useState<HouseItem[]>([]);
  const [summary, setSummary] = useState<HouseSummary | null>(null);
  const [alerts, setAlerts] = useState<ResourceAlert[]>([]);
  const [meters, setMeters] = useState<MeterItem[]>([]);
  const [apartmentNumber, setApartmentNumber] = useState<string | null>(null);
  const [apartmentScore, setApartmentScore] = useState<number | null>(null);
  const [electricity, setElectricity] = useState(0);
  const [water, setWater] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const houseId = activeOrganizationId ?? 'house-1';
  const isResident = activeRole === 'Resident';
  const myApartmentId = user?.apartment_id;

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      if (isResident && myApartmentId) {
        const [apt, elec, waterDyn, alertsRes, metersRes] = await Promise.all([
          apiRequest<ApartmentSummaryResponse>(`/apartments/${myApartmentId}/summary`, {
            token: accessToken,
          }),
          apiRequest<DynamicsResponse>(
            `/apartments/${myApartmentId}/dynamics?resource=electricity&period=24h`,
            { token: accessToken }
          ),
          apiRequest<DynamicsResponse>(
            `/apartments/${myApartmentId}/dynamics?resource=water&period=24h`,
            { token: accessToken }
          ),
          apiRequest<ResourceAlert[]>(`/alerts?house_id=${houseId}`, { token: accessToken }),
          apiRequest<MeterItem[]>(`/meters?house_id=${houseId}`, { token: accessToken }),
        ]);
        const ev = elec.dynamics.reduce((a, d) => a + d.value, 0);
        const wv = waterDyn.dynamics.reduce((a, d) => a + d.value, 0);
        setSummary({
          total_power: ev,
          total_water: wv,
          average_air: Math.round(apt.live_snapshot.co2),
          city_impact: 0,
          alerts_count: 0,
        });
        setApartmentNumber(apt.apartment.number);
        setApartmentScore(apt.apartment.score);
        setElectricity(ev);
        setWater(wv);
        setAlerts(alertsRes);
        setMeters(metersRes);
      } else {
        const [housesRes, summaryRes, alertsRes, metersRes, elec, waterDyn] = await Promise.all([
          apiRequest<HouseItem[]>('/houses', { token: accessToken }),
          apiRequest<HouseSummary>(`/houses/${houseId}/summary`, { token: accessToken }),
          apiRequest<ResourceAlert[]>(`/alerts?house_id=${houseId}`, { token: accessToken }),
          apiRequest<MeterItem[]>(`/meters?house_id=${houseId}`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/houses/${houseId}/dynamics?resource=electricity&period=24h`, {
            token: accessToken,
          }),
          apiRequest<DynamicsResponse>(`/houses/${houseId}/dynamics?resource=water&period=24h`, {
            token: accessToken,
          }),
        ]);
        const ev = elec.dynamics.reduce((a, d) => a + d.value, 0);
        const wv = waterDyn.dynamics.reduce((a, d) => a + d.value, 0);
        setHouses(housesRes);
        setSummary(summaryRes);
        setAlerts(alertsRes);
        setMeters(metersRes);
        setElectricity(ev);
        setWater(wv);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, houseId, isResident, myApartmentId]);

  const highAlerts = alerts.filter((a) => a.severity === 'high').length;
  const offlineMeters = meters.filter((m) => m.signal_strength === 'offline').length;

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

      <View style={styles.row}>
        <StatCard
          label={isResident ? 'My apartment' : 'Buildings'}
          value={isResident && apartmentNumber ? `#${apartmentNumber}` : String(houses.length)}
        />
        <StatCard label="Alerts" value={String(alerts.length)} sub={highAlerts > 0 ? `${highAlerts} critical` : undefined} />
      </View>
      <View style={styles.row}>
        <StatCard
          label={isResident ? 'Eco score' : 'Occupancy'}
          value={isResident && apartmentScore != null ? String(apartmentScore) : '—'}
        />
        <StatCard
          label="Meters"
          value={String(meters.length)}
          sub={offlineMeters > 0 ? `${offlineMeters} offline` : undefined}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resources (24h)</Text>
        <View style={styles.resourceRow}>
          <View style={styles.resourceCard}>
            <Text style={styles.resourceLabel}>Electricity</Text>
            <Text style={styles.resourceValue}>{electricity.toFixed(1)} kWh</Text>
          </View>
          <View style={styles.resourceCard}>
            <Text style={[styles.resourceLabel, { color: '#3b82f6' }]}>Water</Text>
            <Text style={styles.resourceValue}>{water.toFixed(1)} L</Text>
          </View>
        </View>
      </View>

      {alerts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent anomalies</Text>
          {alerts.slice(0, 3).map((a) => (
            <View key={a.id} style={styles.alertCard}>
              <Text style={styles.alertTitle}>{a.title}</Text>
              <Text style={styles.alertMeta}>
                {a.resource} · {a.severity}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
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
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  statSub: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 10 },
  resourceRow: { flexDirection: 'row', gap: 12 },
  resourceCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  resourceLabel: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },
  resourceValue: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  alertTitle: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  alertMeta: { fontSize: 11, color: '#64748b', marginTop: 4 },
});
