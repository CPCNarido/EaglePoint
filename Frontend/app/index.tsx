import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import Constants from "expo-constants";
import * as Network from "expo-network";
import { useRouter } from "expo-router";
import Splash from "./components/Splash";
import { tw } from "react-native-tailwindcss";
import { saveAccessToken } from "./_lib/auth";
import { useSettings } from "./_lib/SettingsProvider";
import ErrorModal from "./components/ErrorModal";

// === FULL BACKEND + LOGIN IMPLEMENTATION (unchanged) ===

// derive dev host IP
const getDevHostIp = (): string | null => {
  try {
    const manifest: any =
      (Constants as any).manifest || (Constants as any).expoConfig || {};
    const debuggerHost =
      manifest?.debuggerHost || manifest?.packagerOpts?.host || null;
    if (!debuggerHost) return null;
    return String(debuggerHost).split(":")[0];
  } catch {
    return null;
  }
};

const resolveBaseUrl = () => {
  if (Platform.OS === "android") return "http://10.127.147.53:3000";
  if (Platform.OS === "ios") return "http://localhost:3000";
  if (Platform.OS === "web") return "http://localhost:3000";
  return "http://localhost:3000";
};

const probeHosts = async (candidates: string[]) => {
  try {
    // @ts-ignore
    const AsyncStorageModule = await import(
      "@react-native-async-storage/async-storage"
    ).catch(() => null);
    const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
    const override = AsyncStorage
      ? await AsyncStorage.getItem("backendBaseUrlOverride")
      : null;
    if (override) {
      try {
        const controller = new AbortController();
        const timeoutMs = 1500;
        const t = setTimeout(() => {
          try {
            controller.abort();
          } catch {}
        }, timeoutMs);
        const url = `${override.replace(/\/$/, "")}/api/health`;
        const resp = await fetch(url, { method: "GET", signal: controller.signal }).catch(
          () => null
        );
        clearTimeout(t);
        if (resp && resp.ok) {
          console.debug("Using persisted backendBaseUrlOverride (reachable)", override);
          try {
            (global as any).__EAGLEPOINT_BASE_URL__ = override;
          } catch {}
          return override;
        }
        console.warn("Persisted override unreachable, removing it", override);
        await AsyncStorage.removeItem("backendBaseUrlOverride");
      } catch {
        await AsyncStorage.removeItem("backendBaseUrlOverride");
      }
    }
  } catch {}

  const tryHealth = (base: string) =>
    new Promise<string>((resolve, reject) => {
      const controller = new AbortController();
      const timeoutMs = 1500;
      const t = setTimeout(() => {
        try {
          controller.abort();
        } catch {}
        reject(new Error("timeout"));
      }, timeoutMs);
      const url = `${base.replace(/\/$/, "")}/api/health`;
      fetch(url, { method: "GET", signal: controller.signal })
        .then((r) => {
          clearTimeout(t);
          if (r && r.ok) resolve(base);
          else reject(new Error("not-ok"));
        })
        .catch(() => {
          clearTimeout(t);
          reject(new Error("fetch-failed"));
        });
    });

  try {
    const winner = await Promise.any(candidates.map((c) => tryHealth(c))).catch(() => null);
    if (winner) {
      try {
        // @ts-ignore
        const AsyncStorageModule = await import(
          "@react-native-async-storage/async-storage"
        ).catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        if (AsyncStorage)
          await AsyncStorage.setItem("backendBaseUrlOverride", winner);
        try {
          (global as any).__EAGLEPOINT_BASE_URL__ = winner;
        } catch {}
      } catch {}
      return winner;
    }
  } catch {}
  return null;
};

const persistLastError = async (title: string, detail: any) => {
  try {
    // @ts-ignore
    const AsyncStorageModule = await import(
      "@react-native-async-storage/async-storage"
    ).catch(() => null);
    const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
    await AsyncStorage?.setItem?.(
      "lastLoginError",
      JSON.stringify({ time: Date.now(), title, detail })
    );
  } catch {}
};

// === LOGIN SCREEN (new design + error modal integration) ===

export default function Login() {
  const router = useRouter();
  const settings = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [errorType, setErrorType] = useState<'credentials'|'network'|'server'|'timeout'|'other'|null>(null);

  const [showTransitionSplash, setShowTransitionSplash] = useState(false);
  const [showInitialSplash, setShowInitialSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowInitialSplash(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async () => {
    if (!email || !password)
      return Alert.alert("Validation", "Email and password required");
    setLoading(true);
    setErrorMessage("");
    setErrorModalVisible(false);
    try {
      const defaultBase = resolveBaseUrl();
      const devIp = getDevHostIp();
      let deviceIp: string | null = null;
      try {
        deviceIp = await Network.getIpAddressAsync();
      } catch {}

      const candidates: string[] = [];
      if (deviceIp) {
        const parts = String(deviceIp).split(".");
        if (parts.length === 4) {
          const prefix = parts.slice(0, 3).join(".");
          candidates.push(
            `http://${prefix}.100:3000`,
            `http://${prefix}.1:3000`,
            `http://${prefix}.230:3000`
          );
        }
      }
      candidates.push(
        "http://192.168.100.88:3000",
        "http://192.168.100.86:3000"
      );
      if (devIp) candidates.push(`http://${devIp}:3000`);
      candidates.push("http://10.127.147.53:3000", defaultBase, "http://localhost:3000");

      let baseUrl: string;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        const probed = await probeHosts(candidates);
        baseUrl = probed ?? defaultBase;
      } else {
        // @ts-ignore
        baseUrl = process?.env?.EXPO_PUBLIC_API_URL ?? defaultBase;
      }
      const loginUrl = `${baseUrl}/api/auth/login`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch {}
        const detail = {
          status: res.status,
          statusText: res.statusText,
          body: bodyText,
          attemptedUrl: loginUrl,
        };
        await persistLastError(`Login failed: ${res.status}`, detail);
        // classify error for the modal
        if (res.status === 401 || res.status === 403) setErrorType('credentials');
        else if (res.status >= 500) setErrorType('server');
        else setErrorType('other');
        setErrorMessage(bodyText || `Status ${res.status}`);
        setErrorDetails(detail);
        setErrorModalVisible(true);
        return;
      }

      const data = await res.json().catch(() => ({ message: "OK" }));
      const access = data?.accessToken || data?.access_token || null;
      if (access) saveAccessToken(access);

      setShowTransitionSplash(true);
      await new Promise((r) => setTimeout(r, 700));
      router.push(data?.destination || "/admin");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // classify runtime/network errors
      if (err?.name === 'AbortError') {
        setErrorType('timeout');
        setErrorMessage('Request timed out. Server did not respond within allotted time.');
      } else if (String(msg).toLowerCase().includes('network') || String(msg).toLowerCase().includes('failed to fetch') || String(msg).toLowerCase().includes('network request failed')) {
        setErrorType('network');
        setErrorMessage('Network request failed. Check your connection and backend reachability.');
      } else {
        setErrorType('other');
        setErrorMessage('Unexpected error during login: ' + msg);
      }
      setErrorDetails(err);
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  if (showInitialSplash)
    return <Splash onClose={() => setShowInitialSplash(false)} />;

  if (showTransitionSplash)
    return <Splash message="Signing in..." onClose={() => setShowTransitionSplash(false)} />;

  return (
    <ImageBackground
      source={require("../assets/Login Page/LOGIN TABLET.png")}
      style={styles.bg}
      resizeMode="cover"
    >
      <ScrollView contentContainerStyle={styles.scrollWrap}>
        <View style={styles.card}>
          <Image
            source={require("../assets/images/EaglePointLogo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>STAFF LOGIN</Text>
          <Text style={styles.subtitle}>
            Welcome to {settings?.siteName ?? "EaglePoint"} Management System
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Employee ID / Username</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your EmployeeID or Username"
              placeholderTextColor="#9AA29A"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your Password"
              placeholderTextColor="#9AA29A"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            style={[styles.button, loading ? { opacity: 0.7 } : null]}
          >
            {loading ? (
              <ActivityIndicator color="#17321d" />
            ) : (
              <Text style={styles.buttonText}>LOGIN</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footer}>Contact Admin for Access Issues</Text>
        </View>
      </ScrollView>

      <ErrorModal
        visible={errorModalVisible}
        errorType={errorType}
        errorMessage={errorMessage}
        errorDetails={errorDetails}
        onClose={() => setErrorModalVisible(false)}
        onRetry={() => {
          setErrorModalVisible(false);
          setTimeout(() => handleSubmit(), 150);
        }}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },
  scrollWrap: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: {
    width: 520,
    maxWidth: "94%",
    backgroundColor: "#F8FBF5",
    borderRadius: 10,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  logo: { width: 88, height: 88, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "800", color: "#17321d", marginTop: 4, marginBottom: 6 },
  subtitle: { fontSize: 12, color: "#8E9B90", marginBottom: 20 },
  field: { alignSelf: "stretch", marginBottom: 14 },
  label: { fontSize: 12, color: "#2E3B2B", fontWeight: "700", marginBottom: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#D6E4D0",
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
    color: "#17321d",
  },
  button: {
    marginTop: 8,
    width: "100%",
    backgroundColor: "#C6DFA4",
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#9FBF7F",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: { color: "#17321d", fontWeight: "800" },
  footer: { marginTop: 18, fontSize: 12, color: "#6C7A6E" },
});
