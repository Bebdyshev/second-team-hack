import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

type NavItem = {
  title: string;
  subtitle: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type MoreScreenProps = {
  navigation: {
    navigate: (routeName: string) => void;
  };
};

export default function MoreScreen({ navigation }: MoreScreenProps) {
  const { activeRole } = useAuth();
  const isResident = activeRole === 'Resident';

  const items: NavItem[] = isResident
    ? [
        {
          title: 'Eco Quests',
          subtitle: 'Gamified sustainability goals',
          route: 'EcoQuests',
          icon: 'leaf-outline',
        },
        {
          title: 'Reports',
          subtitle: 'Transparency and proof history',
          route: 'Reports',
          icon: 'document-text-outline',
        },
        {
          title: 'Buildings',
          subtitle: 'Building and apartment overview',
          route: 'Buildings',
          icon: 'business-outline',
        },
      ]
    : [
        {
          title: 'Meters',
          subtitle: 'Fleet health and signal quality',
          route: 'MetersFull',
          icon: 'speedometer-outline',
        },
        {
          title: 'Maintenance',
          subtitle: 'Inspection and repair queue',
          route: 'Maintenance',
          icon: 'build-outline',
        },
        {
          title: 'Reports',
          subtitle: 'Monthly analytics and on-chain proof',
          route: 'Reports',
          icon: 'document-text-outline',
        },
      ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>More sections</Text>
      <Text style={styles.subheader}>Open additional modules available in the app</Text>

      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.route}
            onPress={() => navigation.navigate(item.route)}
            style={styles.itemCard}
            activeOpacity={0.85}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={18} color='#475569' />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name='chevron-forward' size={16} color='#94a3b8' />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 32 },
  header: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subheader: { marginTop: 4, marginBottom: 14, fontSize: 13, color: '#64748b' },
  list: { gap: 10 },
  itemCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  itemSubtitle: { marginTop: 2, fontSize: 12, color: '#64748b' },
});
