import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';

type EcoQuest = {
  id: string;
  title: string;
  description: string;
  points: number;
  completed: boolean;
  category: 'water' | 'energy' | 'waste' | 'transport' | 'other';
};

type ActivityDay = { date: string; level: number };

const QUESTS: EcoQuest[] = [
  { id: 'eq-1', title: 'Turn off lights when leaving', description: 'Switch off lights in rooms you are not using for 3 days.', points: 10, completed: false, category: 'energy' },
  { id: 'eq-2', title: 'Short shower challenge', description: 'Keep showers under 5 minutes for a week.', points: 15, completed: false, category: 'water' },
  { id: 'eq-3', title: 'Sort your recycling', description: 'Separate plastic, paper, and glass for 1 week.', points: 20, completed: false, category: 'waste' },
  { id: 'eq-4', title: 'Use stairs instead of elevator', description: 'Take the stairs for trips under 3 floors for 5 days.', points: 12, completed: false, category: 'transport' },
  { id: 'eq-5', title: 'Fix a dripping tap', description: 'Report or fix a leaky faucet in your apartment.', points: 25, completed: false, category: 'water' },
  { id: 'eq-6', title: 'Unplug idle devices', description: 'Unplug chargers and devices when not in use for 5 days.', points: 12, completed: false, category: 'energy' },
  { id: 'eq-7', title: 'Use reusable bags', description: 'Avoid single-use plastic bags for groceries for 1 week.', points: 18, completed: false, category: 'waste' },
];

const PLANT_IMAGES = [
  require('../../assets/plant-growth/1.png'),
  require('../../assets/plant-growth/2.png'),
  require('../../assets/plant-growth/3.png'),
  require('../../assets/plant-growth/4.png'),
  require('../../assets/plant-growth/5.png'),
  require('../../assets/plant-growth/6.png'),
  require('../../assets/plant-growth/7.png'),
];

const CAT: Record<string, { label: string; color: string }> = {
  water: { label: 'Water', color: '#0e7490' },
  energy: { label: 'Energy', color: '#b45309' },
  waste: { label: 'Waste', color: '#047857' },
  transport: { label: 'Transport', color: '#1d4ed8' },
  other: { label: 'Other', color: '#475569' },
};

export default function EcoQuestsScreen() {
  const { accessToken, activeRole, user } = useAuth();
  const [quests, setQuests] = useState<EcoQuest[]>(QUESTS);
  const [activityDays, setActivityDays] = useState<ActivityDay[]>([]);
  const [streak, setStreak] = useState(0);
  const [streakBreak, setStreakBreak] = useState<{ date: string; count: number } | null>(null);
  const [photoByQuest, setPhotoByQuest] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!accessToken || activeRole !== 'Resident') return;
    try {
      const status = await apiRequest<{ completed: string[] }>('/eco-quests/status', {
        token: accessToken,
      });
      setQuests((prev) =>
        prev.map((q) => ({ ...q, completed: status.completed.includes(q.id) }))
      );
    } catch {
      /* ignore */
    }
  }, [accessToken, activeRole]);

  const fetchActivity = useCallback(async () => {
    if (!accessToken || activeRole !== 'Resident') return;
    try {
      const res = await apiRequest<{ days: ActivityDay[] }>('/eco-quests/activity', {
        token: accessToken,
      });
      setActivityDays(res.days);
    } catch {
      setActivityDays([]);
    }
  }, [accessToken, activeRole]);

  const fetchStreak = useCallback(async () => {
    if (!accessToken || activeRole !== 'Resident') return;
    try {
      const res = await apiRequest<{
        current_streak: number;
        streak_break_date: string | null;
        streak_break_count: number | null;
      }>('/eco-quests/streak', { token: accessToken });
      setStreak(res.current_streak);
      setStreakBreak(
        res.streak_break_date
          ? { date: res.streak_break_date, count: res.streak_break_count ?? 0 }
          : null
      );
    } catch {
      setStreak(0);
      setStreakBreak(null);
    }
  }, [accessToken, activeRole]);

  useEffect(() => {
    void fetchStatus();
    void fetchActivity();
    void fetchStreak();
  }, [fetchStatus, fetchActivity, fetchStreak]);

  const pickPhoto = async (questId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to complete quests.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPhotoByQuest((p) => ({ ...p, [questId]: `data:image/jpeg;base64,${result.assets[0].base64}` }));
    }
  };

  const takePhoto = async (questId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera to take proof photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPhotoByQuest((p) => ({ ...p, [questId]: `data:image/jpeg;base64,${result.assets[0].base64}` }));
    }
  };

  const handleComplete = async (id: string) => {
    const photo = photoByQuest[id];
    if (!photo || !accessToken) return;
    setSubmitting(id);
    try {
      await apiRequest('/eco-quests/complete', {
        method: 'POST',
        token: accessToken,
        body: { quest_id: id, photo_base64: photo },
      });
      setPhotoByQuest((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      await fetchStatus();
      await fetchActivity();
      await fetchStreak();
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Failed to complete');
    } finally {
      setSubmitting(null);
    }
  };

  if (activeRole === 'Manager') {
    return (
      <View style={styles.center}>
        <Text style={styles.managerText}>Eco Quests are for residents only.</Text>
      </View>
    );
  }

  const completedCount = quests.filter((q) => q.completed).length;
  const totalPoints = quests.filter((q) => q.completed).reduce((s, q) => s + q.points, 0);
  const stateIndex = Math.min(completedCount, 6);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Plant + streak strip */}
      <View style={styles.plantStrip}>
        <View style={styles.plantWrap}>
          <Image
            source={PLANT_IMAGES[stateIndex]}
            style={styles.plantImg}
            resizeMode="contain"
          />
        </View>
        <View style={styles.streakWrap}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakLabel}>Day Streak</Text>
          <Text style={styles.statsText}>
            {completedCount}/7 · {totalPoints} pts
          </Text>
        </View>
      </View>

      {/* Quest list */}
      {quests.map((quest) => {
        const cat = CAT[quest.category] ?? CAT.other;
        const hasPhoto = !!photoByQuest[quest.id];
        const canSubmit = !quest.completed && hasPhoto;
        return (
          <View
            key={quest.id}
            style={[
              styles.questCard,
              quest.completed && styles.questCardDone,
            ]}
          >
            <View style={styles.questHeader}>
              <View style={[styles.badge, { backgroundColor: `${cat.color}20` }]}>
                <Text style={[styles.badgeText, { color: cat.color }]}>{cat.label}</Text>
              </View>
              <Text style={styles.questPoints}>+{quest.points} pts</Text>
              {quest.completed && (
                <View style={styles.doneBadge}>
                  <Text style={styles.doneText}>✓ Done</Text>
                </View>
              )}
            </View>
            <Text style={styles.questTitle}>{quest.title}</Text>
            <Text style={styles.questDesc}>{quest.description}</Text>
            {!quest.completed && (
              <View style={styles.questActions}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => takePhoto(quest.id)}
                >
                  <Text style={styles.photoBtnText}>
                    {hasPhoto ? '✓ Photo added' : '📷 Add photo'}
                  </Text>
                </TouchableOpacity>
                {hasPhoto && (
                  <View style={styles.previewRow}>
                    <Image
                      source={{ uri: photoByQuest[quest.id] }}
                      style={styles.previewImg}
                    />
                    <TouchableOpacity
                      onPress={() => setPhotoByQuest((p) => ({ ...p, [quest.id]: '' }))}
                      style={styles.removeBtn}
                    >
                      <Text style={styles.removeBtnText}>×</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.completeBtn, (!canSubmit || submitting === quest.id) && styles.completeBtnDisabled]}
                  onPress={() => handleComplete(quest.id)}
                  disabled={!canSubmit || submitting === quest.id}
                >
                  {submitting === quest.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.completeBtnText}>Complete</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {/* Activity legend */}
      {activityDays.length > 0 && (
        <View style={styles.legend}>
          <Text style={styles.legendText}>Activity: {activityDays.filter((d) => d.level >= 4).length} days with all 7 done</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  managerText: { fontSize: 14, color: '#64748b' },
  plantStrip: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  plantWrap: { width: 100, height: 100 },
  plantImg: { width: '100%', height: '100%' },
  streakWrap: { flex: 1, marginLeft: 16, alignItems: 'center' },
  streakEmoji: { fontSize: 32 },
  streakNum: { fontSize: 36, fontWeight: '700', color: '#0f172a' },
  streakLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statsText: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  questCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  questCardDone: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  questHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  questPoints: { fontSize: 10, color: '#64748b' },
  doneBadge: { backgroundColor: '#a7f3d0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  doneText: { fontSize: 10, fontWeight: '600', color: '#047857' },
  questTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  questDesc: { fontSize: 12, color: '#64748b', marginTop: 4 },
  questActions: { marginTop: 12, gap: 8 },
  photoBtn: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  photoBtnText: { fontSize: 13, color: '#475569', textAlign: 'center' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewImg: { width: 56, height: 56, borderRadius: 8 },
  removeBtn: {
    backgroundColor: '#475569',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  completeBtn: {
    backgroundColor: '#059669',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.5 },
  completeBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  legend: { marginTop: 16, padding: 12, backgroundColor: '#f8fafc', borderRadius: 10 },
  legendText: { fontSize: 12, color: '#64748b' },
});
