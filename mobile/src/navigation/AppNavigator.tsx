import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import EcoQuestsScreen from '../screens/EcoQuestsScreen';
import TicketsScreen from '../screens/TicketsScreen';
import AlertsScreen from '../screens/AlertsScreen';
import MetersScreen from '../screens/MetersScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const emoji: Record<string, string> = {
    Overview: '🏠',
    'Eco Quests': '🌱',
    Tickets: '📋',
    Alerts: '⚠️',
    Meters: '📊',
  };
  return (
    <View style={styles.tabIcon}>
      <Text style={styles.tabEmoji}>{emoji[label] ?? '•'}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
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
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#94a3b8',
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerRight: () => <LogoutButton />,
      })}
    >
      <Tab.Screen name="Overview" component={DashboardScreen} />
      {isResident && <Tab.Screen name="Eco Quests" component={EcoQuestsScreen} />}
      {isResident && <Tab.Screen name="Tickets" component={TicketsScreen} />}
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Meters" component={MetersScreen} />
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
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
    height: 64,
  },
  tabIcon: { alignItems: 'center', justifyContent: 'center' },
  tabEmoji: { fontSize: 18, marginBottom: 2 },
  tabLabel: { fontSize: 10, color: '#94a3b8' },
  tabLabelActive: { color: '#059669', fontWeight: '600' },
  header: { backgroundColor: '#fff', borderBottomColor: '#e2e8f0', borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#0f172a' },
  logoutBtn: { marginRight: 16 },
  logoutText: { fontSize: 14, color: '#ef4444', fontWeight: '500' },
});
