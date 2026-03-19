import React, { useState } from 'react';
import { getApiBaseUrl, setApiBaseUrl } from '../config';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';

type LoginScreenProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegisterPress: () => void;
};

export default function LoginScreen({ onLogin, onRegisterPress }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiInput, setApiInput] = useState('');
  const [apiSaved, setApiSaved] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Enter email and password');
      return;
    }
    setIsSubmitting(true);
    try {
      await onLogin(email.trim(), password.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>ResMonitor</Text>
          <Text style={styles.logoSub}>Smart Building OS</Text>
        </View>
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Enter your email and password to continue</Text>
        <Text style={styles.apiUrl} numberOfLines={1}>API: {getApiBaseUrl()}</Text>
      </View>

      <View style={styles.form}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onRegisterPress} style={styles.registerLink}>
          <Text style={styles.registerText}>
            Don&apos;t have an account? <Text style={styles.registerBold}>Sign up</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowApiConfig(!showApiConfig)} style={styles.apiConfigLink}>
          <Text style={styles.apiConfigLinkText}>
            {showApiConfig ? 'Hide' : 'Network failed? Set API server'}
          </Text>
        </TouchableOpacity>
        {showApiConfig && (
          <View style={styles.apiConfigBox}>
            <Text style={styles.apiConfigHint}>
              Enter your Mac&apos;s IP (find in Mac System Settings → Network → Wi‑Fi → Details)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 192.168.1.105"
              placeholderTextColor="#94a3b8"
              value={apiInput}
              onChangeText={setApiInput}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity
              style={styles.apiSaveBtn}
              onPress={async () => {
                if (apiInput.trim()) {
                  await setApiBaseUrl(apiInput.trim());
                  setApiSaved(true);
                  setError('');
                }
              }}
            >
              <Text style={styles.apiSaveBtnText}>{apiSaved ? 'Saved! Try sign in' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 28,
  },
  logo: {
    marginBottom: 28,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#059669',
  },
  logoSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  apiUrl: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#0f172a',
  },
  button: {
    backgroundColor: '#059669',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  registerText: {
    color: '#64748b',
    fontSize: 14,
  },
  registerBold: {
    color: '#059669',
    fontWeight: '600',
  },
  apiConfigLink: {
    marginTop: 20,
    padding: 12,
    alignItems: 'center',
  },
  apiConfigLinkText: {
    fontSize: 13,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  apiConfigBox: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    gap: 10,
  },
  apiConfigHint: {
    fontSize: 12,
    color: '#64748b',
  },
  apiSaveBtn: {
    backgroundColor: '#475569',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  apiSaveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
