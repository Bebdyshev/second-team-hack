import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import EcoQuestsScreen from '../screens/EcoQuestsScreen';
import TicketsScreen from '../screens/TicketsScreen';
import AlertsScreen from '../screens/AlertsScreen';
import MetersScreen from '../screens/MetersScreen';
import BuildingsScreen from '../screens/BuildingsScreen';
import DailyTasksScreen from '../screens/DailyTasksScreen';
import MaintenanceScreen from '../screens/MaintenanceScreen';
import ReportsScreen from '../screens/ReportsScreen';
import MoreScreen from '../screens/MoreScreen';
import ApartmentDetailScreen from '../screens/ApartmentDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  const iconNameByLabel: Record<string, keyof typeof Ionicons.glyphMap> = {
    Overview: focused ? 'home' : 'home-outline',
    Buildings: focused ? 'business' : 'business-outline',
    Tasks: focused ? 'list' : 'list-outline',
    Tickets: focused ? 'document-text' : 'document-text-outline',
    Alerts: focused ? 'warning' : 'warning-outline',
    Meters: focused ? 'stats-chart' : 'stats-chart-outline',
    More: focused ? 'grid' : 'grid-outline',
  };

  const iconName = iconNameByLabel[label] ?? 'ellipse-outline';

  return (
    <View style={styles.tabIcon}>
      <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
        <Ionicons
          name={iconName}
          size={18}
          color={focused ? '#2563eb' : color}
          style={styles.tabVectorIcon}
        />
      </View>
      <Text numberOfLines={1} style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <TouchableOpacity onPress={() => logout()} style={styles.logoutBtn}>
      <Text style={styles.logoutText}>Logout</Text>
    </TouchableOpacity>
  );
}

function MainTabs() {
  const { activeRole } = useAuth();
  const isResident = activeRole === 'Resident';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => <TabIcon label={route.name} focused={focused} color={color} />,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarHideOnKeyboard: true,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerRight: () => <LogoutButton />,
      })}
    >
      <Tab.Screen name="Overview" component={DashboardScreen} />
      {isResident ? (
        <Tab.Screen name="Tickets" component={TicketsScreen} />
      ) : (
        <Tab.Screen name="Buildings" component={BuildingsScreen} />
      )}
      {isResident ? (
        <Tab.Screen name="Meters" component={MetersScreen} />
      ) : (
        <Tab.Screen name="Tasks" component={DailyTasksScreen} />
      )}
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  const { login, register } = useAuth();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login">
        {({ navigation }) => (
          <LoginScreen
            onLogin={async (email, password) => login({ email, password })}
            onRegisterPress={() => navigation.navigate('Register')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Register">
        {({ navigation }) => (
          <RegisterScreen
            onRegister={async (email, password, fullName) => register({ email, password, fullName })}
            onLoginPress={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthStack />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name="Maintenance" component={MaintenanceScreen} options={{ title: 'Maintenance' }} />
      <Stack.Screen name="MetersFull" component={MetersScreen} options={{ title: 'Meters' }} />
      <Stack.Screen name="Buildings" component={BuildingsScreen} options={{ title: 'Buildings' }} />
      <Stack.Screen name="EcoQuests" component={EcoQuestsScreen} options={{ title: 'Eco Quests' }} />
      <Stack.Screen name="DailyTasks" component={DailyTasksScreen} options={{ title: 'Daily Tasks' }} />
      <Stack.Screen name="ApartmentDetail" component={ApartmentDetailScreen} options={({ route }: any) => ({ title: `Apartment ${route.params?.apartmentId ?? ''}` })} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: { fontSize: 16, color: '#64748b' },
  tabBar: {
    backgroundColor: '#fff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingTop: 8,
    height: 74,
  },
  tabIcon: { alignItems: 'center', justifyContent: 'center', width: 62 },
  tabIconWrap: {
    width: 34,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabVectorIcon: { marginBottom: 2 },
  tabLabel: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  tabLabelActive: { color: '#2563eb', fontWeight: '600' },
  header: { backgroundColor: '#fff', borderBottomColor: '#e2e8f0', borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#0f172a' },
  logoutBtn: { marginRight: 16 },
  logoutText: { fontSize: 14, color: '#ef4444', fontWeight: '500' },
});
