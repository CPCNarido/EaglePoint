import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  useWindowDimensions,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { useRouter } from "expo-router";
import { tw } from "react-native-tailwindcss";
import { saveAccessToken } from './_lib/auth';
import { useSettings } from './_lib/SettingsProvider';

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { width, height } = useWindowDimensions();

  // Responsive scaling logic
  const isTablet = width >= 1000 && height >= 700;
  const isLaptop = width >= 1400;
  const isSmallScreen = width < 700;

  // Maintain tablet size as base, scale up for laptops/desktops slightly
  const containerWidth = isLaptop
    ? "40%"
    : isTablet
    ? "50%"
    : isSmallScreen
    ? "95%"
    : "80%";

  const containerHeight = isLaptop
    ? "93%"
    : isTablet
    ? "80%"
    : isSmallScreen
    ? "85%"
    : "80%";

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<any>(null);

  // derive dev host IP from expo manifest when possible (helps physical devices)
  const getDevHostIp = (): string | null => {
    try {
      const manifest: any = (Constants as any).manifest || (Constants as any).expoConfig || {};
      const debuggerHost = manifest?.debuggerHost || manifest?.packagerOpts?.host || null;
      if (!debuggerHost) return null;
      return String(debuggerHost).split(':')[0];
    } catch {
      return null;
    }
  };

  const resolveBaseUrl = () => {
    // Use explicit android host and port per project config.
    if (Platform.OS === 'android') return 'http://10.127.147.53:3000';
    if (Platform.OS === 'ios') return 'http://localhost:3000';
    if (Platform.OS === 'web') return 'http://localhost:3000';
    return 'http://localhost:3000';
  };

  // Probe a list of candidate baseUrls and return the first that replies OK to /api/health
  const probeHosts = async (candidates: string[]) => {
    // Try persistent override first if present
    try {
        // @ts-ignore - AsyncStorage is optional in some environments; dynamic import may not resolve at build-time
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
      if (override) {
        console.debug('Using persisted backendBaseUrlOverride', override);
        try { (global as any).__EAGLEPOINT_BASE_URL__ = override; } catch {}
        return override;
      }
    } catch (e: any) {
      if (!String(e?.message ?? '').includes('Cannot find module')) console.warn('probeHosts read override failed', e);
    }

    // Run lightweight parallel probes and return the first host that responds OK.
    const tryHealth = (base: string) => new Promise<string>((resolve, reject) => {
      const controller = new AbortController();
      const timeoutMs = 1500; // short per-host timeout to keep probing fast
      const t = setTimeout(() => {
        try { controller.abort(); } catch {};
        reject(new Error('timeout'));
      }, timeoutMs);
      const url = `${base.replace(/\/$/, '')}/api/health`;
      fetch(url, { method: 'GET', signal: controller.signal })
        .then((r) => {
          clearTimeout(t);
          if (r && r.ok) resolve(base);
          else reject(new Error('not-ok'));
        })
        .catch((_) => {
          clearTimeout(t);
          reject(new Error('fetch-failed'));
        });
    });

    try {
      const probes = candidates.map((c) => tryHealth(c));
      // Promise.any resolves with the first fulfilled promise (fastest successful probe)
      const winner = await Promise.any(probes).catch(() => null);
      if (winner) {
        try {
          // persist a short-lived override for convenience
          // @ts-ignore - optional dependency
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          if (AsyncStorage) await AsyncStorage.setItem('backendBaseUrlOverride', winner);
          try { (global as any).__EAGLEPOINT_BASE_URL__ = winner; } catch {}
        } catch (e: any) {
          if (!String(e?.message ?? '').includes('Cannot find module')) console.warn('Failed persisting baseUrl override', e);
        }
        return winner;
      }
    } catch {
      // fallthrough to null
    }

    return null;
  };

  const persistLastError = async (title: string, detail: any) => {
    try {
      // @ts-ignore - optional runtime dependency
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      await AsyncStorage?.setItem?.('lastLoginError', JSON.stringify({ time: Date.now(), title, detail }));
    } catch (e: any) {
      // If AsyncStorage isn't installed, skip noisy warnings (common in web/dev builds).
      if (String(e?.message ?? '').includes('Cannot find module')) {
        // silently ignore
      } else {
        console.warn('Failed persisting login error', e);
      }
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) return Alert.alert("Validation", "Email and password required");
    setLoading(true);
    setErrorMessage("");
    setErrorModalVisible(false);
    try {
      // Resolve a reachable backend host for this device/session. probeHosts will try several
      // candidates (emulator loopback, localhost, expo dev host) and return the first that
      // replies OK on /api/health. This helps physical devices and emulators find the server.
      const defaultBase = resolveBaseUrl();
      const devIp = getDevHostIp();

      // Attempt to get the device IP (e.g. 192.168.100.88) so we can add a
      // couple of cheap subnet-derived candidates (avoid scanning full /24).
      let deviceIp: string | null = null;
      try {
        deviceIp = await Network.getIpAddressAsync();
      } catch (e) {
        deviceIp = null;
      }

      // Build a short candidate list. Prioritize hosts on the device's subnet
      // and known LAN addresses so probes are more likely to succeed quickly.
      const candidates: string[] = [];

      // If we can get the device IP, try a couple addresses in the same /24
      // first (cheap checks). These are often the router (.1) or a dev machine
      // (.100) on local networks.
      if (deviceIp) {
        try {
          const parts = String(deviceIp).split('.');
          if (parts.length === 4) {
            const prefix = parts.slice(0, 3).join('.');
            // include common host addresses on the subnet (router, typical dev host)
            candidates.push(`http://${prefix}.100:3000`, `http://${prefix}.1:3000`, `http://${prefix}.230:3000`);
          }
        } catch (e) {
          // ignore
        }
      }

      // Known tablet IPs (explicit). Try these next.
      candidates.push('http://192.168.100.88:3000', 'http://192.168.100.86:3000');

      // If Expo packager/dev host is known, try it before fallback addresses.
      if (devIp) candidates.push(`http://${devIp}:3000`);

      // Finally try configured defaults and localhost.
      candidates.push('http://10.127.147.53:3000', defaultBase, 'http://localhost:3000');

      // allow probeHosts to filter nulls/invalids if any
      // (probeHosts itself does `.filter(Boolean)` earlier when called)

      let baseUrl: string;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // In development, probe candidate hosts to find a reachable backend.
        const probed = await probeHosts(candidates);
        baseUrl = probed ?? defaultBase;
      } else {
        // In production builds, do not probe hosts. Expect a configured API URL
        // to be provided at build/runtime via EXPO_PUBLIC_API_URL. Fallback to
        // the resolved default if not provided.
        // @ts-ignore
        baseUrl = (process?.env?.EXPO_PUBLIC_API_URL as string) ?? defaultBase;
      }
  try { (global as any).__EAGLEPOINT_BASE_URL__ = baseUrl; } catch {}
      const loginUrl = `${baseUrl}/api/auth/login`;

      console.debug('Login attempt', { platform: Platform.OS, isDevice: Constants.isDevice, baseUrl, debuggerHost: (Constants as any).manifest?.debuggerHost });

      // quick health check to provide clearer diagnostics
      try {
        const healthRes = await fetch(`${baseUrl}/api/health`).catch(() => null);
        console.debug('Health check', { ok: healthRes?.ok, status: healthRes?.status });
      } catch (e) {
        console.warn('Health check failed', e);
      }

      // timeout using AbortController
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email?.trim(), password }),
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        let bodyText = '';
        try { bodyText = await res.text(); } catch {}
        const detail = { status: res.status, statusText: res.statusText, body: bodyText, attemptedUrl: loginUrl };
        await persistLastError(`Login failed: ${res.status}`, detail);
        setErrorMessage(bodyText || `Status ${res.status}`);
        setErrorDetails(detail);
        setErrorModalVisible(true);
        return;
      }

      const data = await res.json().catch(() => ({ message: 'OK' }));

      try {
        const access = data?.accessToken || data?.access_token || null;
        if (access) saveAccessToken(access);
      } catch (e) {
        console.warn('Failed saving access token', e);
      }

      // Ensure we have a user profile available to store locally. Some backends
      // may not include `user` in the login response (web-only flows rely on
      // cookies). Attempt to fetch /api/auth/me using the saved access token
      // before navigating so downstream screens can read a stored user object.
      let profile: any = data?.user ?? null;
      if (!profile) {
        try {
          // @ts-ignore - dynamic import for optional AsyncStorage
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
          if (token) {
            try {
              const profileRes = await fetch(`${baseUrl}/api/auth/me`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              });
              if (profileRes.ok) {
                const pd = await profileRes.json().catch(() => null);
                profile = pd?.user ?? profile;
              }
            } catch (e) {
              // ignore profile fetch errors
            }
          }
        } catch (e) {
          // ignore storage/profile errors
        }
      }

      try {
        // persist user for convenience (if available)
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        if (AsyncStorage && profile) await AsyncStorage.setItem('user', JSON.stringify(profile));
      } catch (e) {
        // ignore
      }

      console.info('Login successful', { user: profile ?? null, destination: data?.destination });
      router.push(data?.destination || "/admin");
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      const message = err?.message ?? String(err);
      const detail = { message, name: err?.name, attemptedUrl: undefined, baseUrl: resolveBaseUrl(), platform: Platform.OS, isDevice: Constants.isDevice, stack: err?.stack || null };
      await persistLastError(isAbort ? 'Request timed out' : 'Network or unexpected error', detail);
      if (message.includes('Network request failed')) {
        setErrorMessage('Network request failed. Check backend is running and baseUrl is reachable from this device.');
      } else if (isAbort) {
        setErrorMessage('Request timed out. Server did not respond within 10s.');
      } else {
        setErrorMessage('Unexpected error during login: ' + message);
      }
      setErrorDetails(detail);
      setErrorModalVisible(true);
      console.error('Login error', detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/Login Page/LOGIN TABLET.png")}
      style={[tw.flex1, { width: "100%", height: "100%" }]}
      resizeMode="cover"
    >
      <View style={[tw.flex1, tw.justifyCenter, tw.itemsCenter]}>
          <View
            style={[
              tw.justifyCenter,
              tw.bgWhite,
              tw.p8,
              tw.roundedLg,
              tw.shadowMd,
              tw.wFull,
              {
                height: containerHeight,
                gap: 5,
                minWidth: 320,
                maxWidth: 700, // Prevent it from being too huge
              },
            ]}
          >
          <Image
            source={require("../assets/images/EaglePointLogo.png")}
            style={{ width: 120, height: 120, alignSelf: "center", marginBottom: 10 }}
            resizeMode="contain"
          />
          <Text style={[tw.text2xl, tw.fontBold, tw.textCenter]}>STAFF LOGIN</Text>
          <Text style={[tw.textCenter, tw.textGray500, tw.fontMedium, tw.mB10]}>
            Welcome to {useSettings().siteName} Management System
          </Text>

          <View style={tw.mB4}>
            <Text style={[tw.textBase, tw.fontBold, tw.textGray700, tw.mB2]}>
              EmployeeID / Username
            </Text>
            <TextInput
              style={[
                  tw.wFull,
                  tw.pX5,
                  tw.pY4,
                  tw.border,
                  tw.rounded,
                  tw.mB2,
                  { fontSize: isSmallScreen ? 14 : 16 },
                ]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your EmployeeID or Username"
              placeholderTextColor="#B1B1B1"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={tw.mB6}>
            <Text style={[tw.textBase, tw.fontBold, tw.textGray700, tw.mB2]}>Password</Text>
            <TextInput
              style={[
                tw.wFull,
                tw.pX5,
                tw.pY4,
                tw.border,
                tw.rounded,
                tw.mB2,
                { fontSize: isSmallScreen ? 14 : 16 },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your Password"
              placeholderTextColor="#B1B1B1"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[
              tw.wFull,
              tw.pY5,
              tw.rounded,
              tw.itemsCenter,
              tw.border,
              tw.mT10,
              { backgroundColor: "#C6DFA4" },
              tw.shadowMd,
              loading ? { opacity: 0.7 } : {},
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#283720" />
            ) : (
              <Text style={[{ color: "#283720" }, tw.textBase, tw.fontMedium, tw.fontBold]}>
                LOGIN
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[tw.mT10, tw.textBase, tw.textCenter]}>
            Contact Admin for Access Issues
          </Text>
        </View>
      </View>

      {/* Error Modal */}
      <Modal
        visible={errorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ width: "80%", backgroundColor: "#fff", borderRadius: 8, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>Error</Text>
            <Text style={{ marginBottom: 10 }}>{errorMessage}</Text>
            {errorDetails ? (
              <ScrollView style={{ maxHeight: 220, marginBottom: 12 }}>
                <Text selectable>{JSON.stringify(errorDetails, null, 2)}</Text>
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Pressable onPress={() => setErrorModalVisible(false)} style={{ padding: 10, marginRight: 8 }}>
                <Text style={{ color: "#1E2B20", fontWeight: "600" }}>Close</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  // Re-open persisted error in console for easier debugging
                  try {
                    // @ts-ignore - optional runtime dependency
                    const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
                    const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
                    const v = await AsyncStorage?.getItem?.('lastLoginError');
                    console.debug('lastLoginError', v ? JSON.parse(v) : null);
                    Alert.alert('Saved', 'Last error logged to console for inspection');
                  } catch (e) {
                    console.warn('Failed reading lastLoginError', e);
                    Alert.alert('Error', 'Failed reading saved diagnostics');
                  }
                }}
                style={{ padding: 10 }}
              >
                <Text style={{ color: "#1E2B20", fontWeight: "600" }}>Open Saved</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};

export default Login;
