import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';

const OVERRIDE_KEY = 'backendBaseUrlOverride';

const defaultForPlatform = () => {
  if (Platform.OS === 'android') return 'http://10.127.147.53:3000';
  return 'http://localhost:3000';
};

export default function DevNetHelper() {
  const [override, setOverride] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // dynamic import to avoid bundler issues on web
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        if (!AsyncStorage) return;
        const v = await AsyncStorage.getItem(OVERRIDE_KEY);
        if (v) {
          setOverride(v);
          setInput(v);
        }
      } catch (_e) { void _e; }
    })();
  }, []);

  const saveOverride = async () => {
    try {
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (!AsyncStorage) return;
      const v = input?.trim() || '';
      if (!v) {
        await AsyncStorage.removeItem(OVERRIDE_KEY);
        setOverride(null);
        setLastResult('Cleared override');
        return;
      }
      await AsyncStorage.setItem(OVERRIDE_KEY, v);
      setOverride(v);
      setLastResult(`Saved override: ${v}`);
    } catch (e: any) {
      setLastResult(`Save failed: ${String(e?.message ?? e)}`);
    }
  };

  const clearOverride = async () => {
    try {
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (!AsyncStorage) return;
      await AsyncStorage.removeItem(OVERRIDE_KEY);
      setOverride(null);
      setInput('');
      setLastResult('Override removed');
    } catch (e: any) { setLastResult(`Remove failed: ${String(e?.message ?? e)}`); }
  };

  const testConnectivity = async () => {
    setTesting(true);
    setLastResult(null);
    try {
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const stored = AsyncStorage ? await AsyncStorage.getItem(OVERRIDE_KEY) : null;
      const base = (stored && stored.trim()) || override || defaultForPlatform();
      const probeUrl = base.replace(/\/$/, '') + '/api/health';

      const controller = new AbortController();
      const t0 = Date.now();
      const timeoutMs = 3000;
      const to = setTimeout(() => {
        try { controller.abort(); } catch (_e) { void _e; }
      }, timeoutMs);
      const resp = await fetch(probeUrl, { method: 'GET', signal: controller.signal }).catch((e) => ({ ok: false, status: 0, _err: e } as any));
      clearTimeout(to);
      const took = Date.now() - t0;
      if (resp && (resp as any).ok) {
        setLastResult(`Reachable (${(resp as any).status}) in ${took}ms — ${probeUrl}`);
      } else {
        const status = (resp as any)?.status ?? 'no-status';
        setLastResult(`Unreachable (${status}) after ${took}ms — tried ${probeUrl}`);
      }
    } catch (e: any) {
      setLastResult(`Error: ${String(e?.message ?? e)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.heading}>Dev: Backend Helper</Text>
      <Text style={styles.rowLabel}>Effective default: <Text style={styles.code}>{defaultForPlatform()}</Text></Text>
      <Text style={styles.rowLabel}>Current override: <Text style={styles.code}>{override ?? '<none>'}</Text></Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="http://192.168.x.y:3000"
        style={styles.input}
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={saveOverride}>
          <Text style={styles.btnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#eee' }]} onPress={clearOverride}>
          <Text style={[styles.btnText, { color: '#333' }]}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#cfe' }]} onPress={testConnectivity} disabled={testing}>
          {testing ? <ActivityIndicator /> : <Text style={styles.btnText}>Test</Text>}
        </TouchableOpacity>
      </View>
      <Text style={styles.result}>{lastResult ?? 'No test run yet'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 14, bottom: 14, backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', width: 340, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
  heading: { fontWeight: '800', marginBottom: 6, color: '#17321d' },
  rowLabel: { fontSize: 12, marginBottom: 4, color: '#4b5b4a' },
  code: { fontFamily: Platform.OS === 'android' ? undefined : 'Courier', backgroundColor: '#f5f7f5', paddingHorizontal: 4, borderRadius: 4 },
  input: { height: 36, borderWidth: 1, borderColor: '#D6E4D0', borderRadius: 6, paddingHorizontal: 8, backgroundColor: '#fff', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#C6DFA4', borderRadius: 6, borderWidth: 1, borderColor: '#9FBF7F' },
  btnText: { color: '#17321d', fontWeight: '700' },
  result: { marginTop: 8, fontSize: 12, color: '#334' },
});
