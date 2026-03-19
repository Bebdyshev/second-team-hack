import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { loadStoredApiUrl } from './src/config';

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadStoredApiUrl().then(() => setReady(true));
  }, []);
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ marginTop: 12, color: '#64748b' }}>Loading…</Text>
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
          <StatusBar style="dark" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
