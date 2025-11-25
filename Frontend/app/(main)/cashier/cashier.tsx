import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { logoutAndClear } from '../../_lib/auth';
import { fetchWithAuth } from '../../_lib/fetchWithAuth';
import { useSettings } from '../../lib/SettingsProvider';
import ConfirmModal from '../../components/ConfirmModal';
import DashboardTab from './Tabs/DashboardTab';
import TransactionTab from './Tabs/TransactionTab';
import PlayerListTab from './Tabs/PlayerListTab';
import TeamChats from '../admin/Tabs/TeamChats';

// Referenced to silence no-unused-vars where ScrollView is imported but not used in this layout
void ScrollView;

type OverviewItem = {
  title: string;
  value: string;
  subtitle: string;
  color: string;
};

export default function CashierLayout() {
  const settings = useSettings();
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const [logoutModalVisible, setLogoutModalVisible] = useState<boolean>(false);
  const router = useRouter();
  // Live overview state (keeps cashier in sync with Admin dashboard)
  const [overview, setOverview] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  void loadingOverview;
  const prevOverviewJsonRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const performLogout = async () => {
    setLogoutModalVisible(false);
    await logoutAndClear();
    router.replace("/");
  };

  // Fetch logged-in employee info for sidebar (mirror Admin/Dispatcher behavior)
  const [userName, setUserName] = useState<string>('CASHIER');
  const [userEmployeeId, setUserEmployeeId] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
        try {
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
          if (override) baseUrl = override;
        } catch (_e) { void _e; }

        let d: any = null;
        try {
          const r = await fetchWithAuth(`${baseUrl}/api/admin/me`, { method: 'GET' });
          if (r.ok) d = await r.json();
        } catch (_e) { void _e; }
        if (!d) return;
        const name = d?.full_name || d?.name || d?.username || 'CASHIER';
        const empId = d?.employee_id ?? d?.employeeId ?? null;
        setUserName(name);
        setUserEmployeeId(empId != null ? String(empId) : '');
      } catch (_e) { void _e; }
    })();
  }, []);

  const handleLogout = () => {
    // Use the same modal-based logout UX across platforms
    setLogoutModalVisible(true);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return <DashboardTab overview={overview} userName={userName} />;
      case "Transaction":
        return <TransactionTab userName={userName} />;
      case "Player List":
        return <PlayerListTab userName={userName} />;
      case "Team Chats":
        return <TeamChats />;
      default:
        return <DashboardTab overview={overview} userName={userName} />;
    }
  };

  // Fetch overview (polling) - modeled after AdminDashboard.fetchOverview
  const fetchOverview = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoadingOverview(true);
    try {
      let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) baseUrl = override;
      } catch {}

      const res = await fetchWithAuth(`${baseUrl}/api/admin/overview`, { method: 'GET' });
      if (!res.ok) {
        setOverview(null);
        return;
      }
      const data = await res.json();
      try {
        const dataJson = JSON.stringify(data);
        if (prevOverviewJsonRef.current && prevOverviewJsonRef.current !== dataJson) {
          prevOverviewJsonRef.current = dataJson;
          setOverview(data);
          return;
        }
        prevOverviewJsonRef.current = dataJson;
      } catch {}
      setOverview(data);
    } catch {
      setOverview(null);
    } finally {
      setLoadingOverview(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // initial fetch
    fetchOverview();
    const interval = setInterval(() => fetchOverview(), 2000);
    // listen for external overview update events
    let overviewUpdateTimer: any = null;
    const onOverviewUpdated = () => {
      try { if (overviewUpdateTimer) clearTimeout(overviewUpdateTimer); } catch {}
      overviewUpdateTimer = setTimeout(() => { fetchOverview(); }, 2000);
    };
    try { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('overview:updated', onOverviewUpdated as EventListener); } catch (_e) { void _e; }

    return () => {
      clearInterval(interval);
      try { if (overviewUpdateTimer) clearTimeout(overviewUpdateTimer); } catch (_e) { void _e; }
      try { if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('overview:updated', onOverviewUpdated as EventListener); } catch (_e) { void _e; }
    };
  }, [fetchOverview]);

  // SSE stream for immediate updates (mirrors Admin behavior)
  useEffect(() => {
    let es: any = null;
    (async () => {
      try {
        let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
        try {
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
          if (override) baseUrl = override;
        } catch {}

        if (typeof EventSource !== 'undefined') {
          let token: string | null = null;
          try { if (typeof window !== 'undefined' && window.localStorage) token = window.localStorage.getItem('authToken'); } catch {}
          if (!token) {
            try {
              // @ts-ignore
              const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
              const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
              if (AsyncStorage && AsyncStorage.getItem) token = await AsyncStorage.getItem('authToken');
            } catch {}
          }

          const streamBase = baseUrl.replace(/\/$/, '');
          const streamUrl = token ? `${streamBase}/api/admin/chats/stream?token=${encodeURIComponent(token)}` : `${streamBase}/api/admin/chats/stream`;
          try {
            es = new EventSource(streamUrl);
              es.onmessage = (ev: any) => {
                try {
                  const payload = JSON.parse(ev.data);
                  try {
                    const json = JSON.stringify(payload);
                    prevOverviewJsonRef.current = json;
                    setOverview(payload);
                  } catch (_e) { void _e; }
                } catch (_e) { void _e; }
              };
              es.onerror = () => { try { es.close(); } catch (_e) { void _e; } };
          } catch {}
        }
      } catch {}
    })();

    return () => { try { if (es) es.close(); } catch (_e) { void _e; } };
  }, []);

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      {/* @ts-ignore - attach data-role to the DOM element on web for print CSS */}
      <View // @ts-ignore
        data-role="sidebar"
        style={styles.sidebar}
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../../../assets/General/Logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.logoTextContainer}>
            <Text style={styles.logoAppName}>{settings.siteName}</Text>
            <Text style={styles.logoRole}>CASHIER</Text>
          </View>
        </View>
        <View style={styles.logoDivider} />

        {[
          { name: 'Dashboard', icon: 'dashboard' },
          { name: 'Transaction', icon: 'point-of-sale' },
          { name: 'Player List', icon: 'people-alt' },
          { name: 'Team Chats', icon: 'chat' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[styles.tabButton, activeTab === tab.name && styles.activeTabButton]}
            onPress={() => setActiveTab(tab.name)}
          >
            <Icon name={tab.icon as any} size={22} color={activeTab === tab.name ? "#fff" : "#B8C1B7"} style={styles.icon} />
            <Text style={[activeTab === tab.name ? styles.activeTabText : styles.tabText]}>{tab.name}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.logoutContainer}>
          <Text style={styles.loggedInText}>Logged in as: {userName}</Text>
          <Text style={styles.loggedInText}>Cashier ID: {userEmployeeId || '—'}</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>{renderContent()}</View>

      {/* Logout confirmation */}
      <ConfirmModal
        visible={logoutModalVisible}
        title="Confirm Logout"
        message="Are you sure you want to log out?"
        confirmText="Log out"
        cancelText="Cancel"
        onConfirm={performLogout}
        onCancel={() => setLogoutModalVisible(false)}
      />
    </View>
  );
}

// Sidebar is rendered inline to match Admin/Dispatcher layout; individual button component removed.

/* Inline tab contents removed — using separate files under Tabs/ */

/* ----------------------------- Reusable Components ----------------------------- */
const OverviewCard: React.FC<OverviewItem> = ({
  title,
  value,
  subtitle,
  color,
}) => (
  <View style={[styles.overviewCard, { borderLeftColor: color }]}>
    <Text style={styles.overviewTitle}>{title}</Text>
    <Text style={[styles.overviewValue, { color }]}>{value}</Text>
    <Text style={styles.overviewSubtitle}>{subtitle}</Text>
  </View>
);
void OverviewCard;

// Legend is provided by the shared RealTimeBayOverview component and admin Legend.

/* ----------------------------- Styles ----------------------------- */
const styles = StyleSheet.create({
  container: { flexDirection: "row", flex: 1, backgroundColor: "#EDECE8" },
  sidebar: {
    width: 250,
    backgroundColor: "#1E2B20",
    padding: 20,
    justifyContent: "space-between",
  },
  logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  logoImage: { width: 60, height: 60, borderRadius: 8, marginRight: 10, backgroundColor: 'transparent', overflow: 'hidden' },
  logoTextContainer: { flexDirection: 'column' },
  logoAppName: { color: '#fff', fontWeight: '700', fontSize: 20 },
  logoRole: { color: '#DADADA', fontSize: 15, marginTop: 2 },
  logoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 0, alignSelf: 'stretch' },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  activeTabButton: { backgroundColor: "#405C45" },
  tabText: { color: "#DADADA", fontSize: 16 },
  activeTabText: { color: "#fff", fontWeight: "600" },
  icon: { marginRight: 10 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#555",
    paddingTop: 10,
  },
  logoutContainer: { marginTop: 'auto', marginBottom: 10 },
  loggedInText: { color: "#CFCFCF", fontSize: 12, marginBottom: 4 },
  logoutButton: {
    backgroundColor: "#555",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 10,
  },
  logoutText: { color: "white", fontWeight: "bold" },
  mainContent: {
    flex: 1,
    backgroundColor: "#F9F8F6",
    borderTopLeftRadius: 20,
    padding: 20,
  },
  scrollArea: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#2E372E",
  },
  welcomeCard: {
    backgroundColor: "#2E372E",
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  welcomeText: { color: "white", fontSize: 18 },
  dateText: { color: "#CFCFCF", fontSize: 14, marginTop: 4 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#4A5944",
  },
  quickOverview: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  overviewCard: {
    backgroundColor: "white",
    width: "48%",
    borderRadius: 10,
    padding: 15,
    borderLeftWidth: 5,
    marginBottom: 10,
  },
  overviewTitle: { fontSize: 12, color: "#555" },
  overviewValue: { fontSize: 20, fontWeight: "bold", marginVertical: 5 },
  overviewSubtitle: { fontSize: 12, color: "#777" },
  bayContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bayBox: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 15,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendLabel: { fontSize: 12, color: "#444" },
  placeholderBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 30,
    alignItems: "center",
    marginTop: 20,
  },
  placeholderText: { fontSize: 16, color: "#555" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  modalText: { fontSize: 14, color: "#333", marginBottom: 6 },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  modalButtonCancel: { backgroundColor: "#EEE" },
  modalButtonCancelText: { color: "#333", fontWeight: "600" },
  modalButtonConfirm: { backgroundColor: "#C62828" },
  modalButtonText: { color: "#fff", fontWeight: "600" },
});
