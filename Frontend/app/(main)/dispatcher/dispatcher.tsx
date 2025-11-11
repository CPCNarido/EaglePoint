// DispatcherDashboard.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Alert,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { logoutAndClear } from '../../_lib/auth';
import { fetchWithAuth } from '../../_lib/fetchWithAuth';
import { useSettings } from '../../lib/SettingsProvider';

import DashboardTab from "./Tabs/DashboardTab";
import BayAssignmentTab from "./Tabs/BayAssignmentTab";
import SharedDisplayTab from "./Tabs/SharedDisplayTab";
import SessionControlTab from "./Tabs/SessionControlTab";
import TeamChats from "../admin/Tabs/TeamChats";
import AttendanceTab from "./Tabs/AttendanceTab";

export default function DispatcherDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const router = useRouter();
  const settings = useSettings();
  // show logged-in user info (fetch from API similar to admin sidebar)
  const [userName, setUserName] = useState<string>("DISPATCHER");
  const [userEmployeeId, setUserEmployeeId] = useState<string>("");
  // Global dispatcher header counts
  const [globalAvailableBays, setGlobalAvailableBays] = useState<number | null>(null);
  const [globalTotalBays, setGlobalTotalBays] = useState<number | null>(null);
  const [globalServicemenAvailable, setGlobalServicemenAvailable] = useState<number | null>(null);
  const [globalServicemenTotal, setGlobalServicemenTotal] = useState<number | null>(null);
  const [globalWaitingQueue, setGlobalWaitingQueue] = useState<number | null>(null);
  const [assignedBays, setAssignedBays] = useState<number[] | null>(null);

  const handleLogout = () => {
    if (Platform.OS === "web") {
      setLogoutModalVisible(true);
      return;
    }
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => performLogout() },
    ]);
  };

  const performLogout = async () => {
    setLogoutModalVisible(false);
    await logoutAndClear();
    router.replace("/");
  };

  const tabs = [
    { name: "Dashboard", icon: "dashboard" },
    { name: "Bay Assignment", icon: "golf-course" },
    { name: "Shared Display", icon: "tv" },
    { name: "Session Control", icon: "settings" },
    { name: "Team Chats", icon: "chat" },
    { name: "Attendance", icon: "person-add" },
  ];

  // fetch the logged-in user (employee) info for the sidebar (tries cookie first, then bearer token)
  useEffect(() => {
    (async () => {
      try {
        let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
        try {
          // dynamic import to avoid bundler-time dependency
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
          if (override) baseUrl = override;
        } catch {}

        let data: any = null;
        try {
          const r = await fetchWithAuth(`${baseUrl}/api/admin/me`, { method: 'GET' });
          if (r.ok) data = await r.json();
        } catch (e) {
          // fallback to manual attempts below
        }
        if (!data) {
          // fallback to bearer token saved in AsyncStorage
          try {
            // @ts-ignore
            const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
            const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
            const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
            if (token) {
              const r2 = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
              if (r2.ok) data = await r2.json();
            }
          } catch {}
        }

        if (!data) return;
        const name = data?.full_name || data?.name || data?.username || 'DISPATCHER';
        const empId = data?.employee_id ?? data?.employeeId ?? null;
        setUserName(name);
        setUserEmployeeId(empId != null ? String(empId) : '');
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // Fetch global counts (overview, staff, queue) and poll periodically
  useEffect(() => {
    let mounted = true;
    const fetchCounts = async () => {
      try {
        const baseUrl = await (async () => {
          let b = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
          try {
            // @ts-ignore
            const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
            const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
            const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
            if (override) b = override;
          } catch {}
          return b;
        })();

        // overview
        try {
          const r = await fetchWithAuth(`${baseUrl}/api/dispatcher/overview`, { method: 'GET' });
          if (r && r.ok) {
            const ov = await r.json();
            if (!mounted) return;
            const total = ov?.totalBays ?? (Array.isArray(ov?.bays) ? ov.bays.length : null);
            const avail = ov?.availableBays ?? null;
            setGlobalTotalBays(total != null ? Number(total) : null);
            setGlobalAvailableBays(avail != null ? Number(avail) : null);
            // derive assigned bays from overview if available
            try {
              let assigned: number[] = [];
              if (Array.isArray(ov?.bays)) {
                assigned = ov.bays
                  .filter((b: any) => {
                    // detect occupied/assigned bay - common shapes
                    if (b == null) return false;
                    if (b.player || b.session) return true;
                    const status = (b.status || b.state || '').toString().toLowerCase();
                    if (status && status !== 'available' && status !== 'free' && status !== 'open') return true;
                    // sometimes overview includes end_time/session info
                    if (b.end_time === null || b.endTime === null) return true;
                    return false;
                  })
                  .map((b: any) => Number(b.bay_number ?? b.bayNo ?? b.bay_no ?? b.number ?? b.id))
                  .filter((n: number) => !Number.isNaN(n));
              }
              // fallback: use reports to derive assigned bays
              if (!assigned.length) {
                try {
                  const r2 = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions?limit=1000`, { method: 'GET' });
                  if (r2 && r2.ok) {
                    const rows = await r2.json();
                    const active = Array.isArray(rows) ? rows.filter((s: any) => s.bay_no && !s.end_time) : [];
                    assigned = Array.from(new Set(active.map((s: any) => Number(s.bay_no)).filter((n: number) => !Number.isNaN(n))));
                  }
                } catch {}
              }
              setAssignedBays(assigned);
            } catch {}
          }
        } catch {}

        // staff
        try {
          const r2 = await fetchWithAuth(`${baseUrl}/api/admin/staff`, { method: 'GET' });
          if (r2 && r2.ok) {
            const staff = await r2.json();
            if (!mounted) return;
            const svc = Array.isArray(staff) ? staff.filter((s: any) => String(s.role).toLowerCase() === 'serviceman') : [];
            setGlobalServicemenTotal(svc.length);
            const busy = svc.filter((s:any) => !!s.online).length;
            setGlobalServicemenAvailable(Math.max(0, svc.length - busy));
          }
        } catch {}

        // waiting queue
        try {
          const r3 = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions?limit=1000`, { method: 'GET' });
          if (r3 && r3.ok) {
            const rows = await r3.json();
            if (!mounted) return;
            const waiting = Array.isArray(rows) ? rows.filter((r: any) => !r.bay_no && !r.end_time) : [];
            setGlobalWaitingQueue(waiting.length);
          }
        } catch {}
      } catch {}
    };
    fetchCounts();
    const iv = setInterval(fetchCounts, 5000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "Dashboard":
        return <DashboardTab userName={userName} counts={{ availableBays: globalAvailableBays ?? undefined, totalBays: globalTotalBays ?? undefined, servicemenAvailable: globalServicemenAvailable ?? undefined, servicemenTotal: globalServicemenTotal ?? undefined, waitingQueue: globalWaitingQueue ?? undefined }} assignedBays={assignedBays} />;
      case "Bay Assignment":
        return <BayAssignmentTab userName={userName} counts={{ availableBays: globalAvailableBays ?? undefined, totalBays: globalTotalBays ?? undefined, servicemenAvailable: globalServicemenAvailable ?? undefined, servicemenTotal: globalServicemenTotal ?? undefined, waitingQueue: globalWaitingQueue ?? undefined }} assignedBays={assignedBays} />;
      case "Shared Display":
        return <SharedDisplayTab userName={userName} counts={{ availableBays: globalAvailableBays ?? undefined, totalBays: globalTotalBays ?? undefined, servicemenAvailable: globalServicemenAvailable ?? undefined, servicemenTotal: globalServicemenTotal ?? undefined, waitingQueue: globalWaitingQueue ?? undefined }} assignedBays={assignedBays} />;
      case "Session Control":
        return (
          <SessionControlTab
            userName={userName}
            counts={{
              availableBays: globalAvailableBays ?? undefined,
              totalBays: globalTotalBays ?? undefined,
              servicemenAvailable: globalServicemenAvailable ?? undefined,
              servicemenTotal: globalServicemenTotal ?? undefined,
              waitingQueue: globalWaitingQueue ?? undefined,
            }}
            assignedBays={assignedBays}
          />
        );
      case "Team Chats":
        return <TeamChats />;
      case "Attendance":
        return <AttendanceTab userName={userName} counts={{ availableBays: globalAvailableBays ?? undefined, totalBays: globalTotalBays ?? undefined, servicemenAvailable: globalServicemenAvailable ?? undefined, servicemenTotal: globalServicemenTotal ?? undefined, waitingQueue: globalWaitingQueue ?? undefined }} assignedBays={assignedBays} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Badges moved into per-tab headers via DispatcherHeader component */}
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../../../assets/General/Logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.logoTextContainer}>
            <Text style={styles.logoAppName}>{settings.siteName}</Text>
            <Text style={styles.logoRole}>DISPATCHER</Text>
          </View>
        </View>
        <View style={styles.logoDivider} />

        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[
              styles.tabButton,
              activeTab === tab.name && styles.activeTabButton,
            ]}
            onPress={() => setActiveTab(tab.name)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={22}
              color={activeTab === tab.name ? "#fff" : "#B8C1B7"}
              style={styles.icon}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === tab.name && styles.activeTabText,
              ]}
            >
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.logoutContainer}>
          <Text style={styles.loggedInText}>Logged in as: {userName}</Text>
          <Text style={styles.loggedInText}>Employee ID: {userEmployeeId || '—'}</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Badges are now rendered inside each tab header via DispatcherHeader */}

        {renderActiveTab()}
      </View>

      {/* Logout Modal */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to log out?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={() => performLogout()}
              >
                <Text style={styles.modalButtonText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ✅ Styles
const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F6F6F2" },
  sidebar: { width: 250, backgroundColor: "#1E2B20", padding: 20 },
  // Logo block (mirrors admin sidebar styling)
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
  logoutContainer: { marginTop: "auto", marginBottom: 10 },
  loggedInText: { color: "#ccc", fontSize: 12, marginBottom: 3 },
  logoutButton: {
    marginTop: 10,
    backgroundColor: "#404040",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold" },
  mainContent: { flex: 1, padding: 25 },
  globalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  globalBadges: { flexDirection: 'row' },
  globalBadgesAbsolute: {
    position: 'absolute',
    right: 50,
    top: 65,
    zIndex: 999,
    alignItems: 'center',
  },
  badge: { backgroundColor: '#e6f0e5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#c8e0c3', marginLeft: 8 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#314c31' },
  tabHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'column' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1c2b1d' },
  headerSubtitle: { color: '#6b6b6b', marginTop: 4 },
  headerDivider: { height: 1, backgroundColor: '#e6e6e6', marginBottom: 16, marginTop: 6 },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: { backgroundColor: "#fff", width: "80%", borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  modalText: { fontSize: 14, color: "#333", marginBottom: 6 },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  modalButtonCancel: { backgroundColor: "#EEE", marginRight: 8 },
  modalButtonConfirm: { backgroundColor: "#C62828" },
  modalButtonText: { color: "#fff", fontWeight: "600" },
});
