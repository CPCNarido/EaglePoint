// DispatcherDashboard.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { logoutAndClear } from '../../_lib/auth';
import { fetchWithAuth } from '../../_lib/fetchWithAuth';
import { isServicemanRole } from '../utils/staffHelpers';
import { useSettings } from '../../lib/SettingsProvider';
import { legendMatchesStatus } from '../utils/uiHelpers';

import DashboardTab from "./Tabs/DashboardTab";
import BayAssignmentTab from "./Tabs/BayAssignmentTab";
import SharedDisplayTab from "./Tabs/SharedDisplayTab";
import SessionControlTab from "./Tabs/SessionControlTab";
import TeamChats from "../admin/Tabs/TeamChats";
import AttendanceTab from "./Tabs/AttendanceTab";
import ConfirmModal from '../../components/ConfirmModal';

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
    // show the same logout modal on all platforms for consistent UX
    setLogoutModalVisible(true);
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
          // fallback: try the centralized fetchWithAuth which attaches stored token
          try {
            const r2 = await fetchWithAuth(`${baseUrl}/api/admin/me`, { method: 'GET' });
            if (r2 && r2.ok) data = await r2.json();
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
            let avail: number | null = ov?.availableBays ?? null;
            if (avail === null && Array.isArray(ov?.bays)) {
              const bays = ov.bays;
              const unavailable = bays.filter((b: any) => {
                const rawSession = b?.session;
                const sessionAction = rawSession && typeof rawSession === 'object' ? (rawSession.action || rawSession.status || rawSession.type || rawSession.session_type) : rawSession;
                const statusCandidate = String(b?.status ?? b?.originalStatus ?? sessionAction ?? b?.session_type ?? b?.sessionType ?? b?.type ?? b?.bay_status ?? b?.action ?? '').trim();
                const statusLower = String(statusCandidate).toLowerCase();
                const isReserved = legendMatchesStatus(['reserved'], statusCandidate) || !!(b?.reserved || b?.is_reserved || b?.reserved_for) || statusLower.includes('specialuse') || statusLower === 'specialuse';
                const isSpecial = legendMatchesStatus(['reserved'], statusCandidate) || !!(b?.special_use || b?.specialUse || b?.is_special_use || b?.specialuse) || statusLower.includes('specialuse') || statusLower === 'specialuse';
                const isOccupied = legendMatchesStatus(['assigned', 'maintenance', 'timed'], statusCandidate) || (() => {
                  const s = String(statusCandidate).toLowerCase();
                  return ['occupied', 'assigned', 'inuse', 'in-use', 'maintenance', 'inprogress', 'open time', 'opentime'].some(k => s.includes(k));
                })();
                return isReserved || isSpecial || isOccupied;
              }).length;
              avail = Math.max(0, (total != null ? Number(total) : bays.length) - unavailable);
            }
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

        // staff + attendance: compute servicemen available as those who have clocked in and NOT yet clocked out
        try {
          const r2 = await fetchWithAuth(`${baseUrl}/api/admin/staff`, { method: 'GET' });
          if (r2 && r2.ok) {
            const staff = await r2.json();
            if (!mounted) return;
            const svc = Array.isArray(staff) ? staff.filter((s: any) => isServicemanRole(s.role)) : [];
            // try to fetch attendance rows to make an accurate present/available count
            try {
              const ra = await fetchWithAuth(`${baseUrl}/api/admin/attendance`, { method: 'GET' });
              const attRows = ra && ra.ok ? await ra.json() : [];
              let available = 0;
              let presentTotal = 0; // servicemen who have clock-in (present)
              for (const s of svc) {
                const empId = Number(s.employee_id ?? s.id ?? s.employeeId ?? null);
                const found = Array.isArray(attRows) ? attRows.find((a: any) => Number(a.employee_id) === empId || String(a.employee_id) === String(empId)) : null;
                const hasClockIn = !!(found && (found.clock_in || found.clockIn));
                const hasClockOut = !!(found && (found.clock_out || found.clockOut));
                if (hasClockIn) presentTotal++;
                if (hasClockIn && !hasClockOut) available++;
              }
              setGlobalServicemenTotal(presentTotal);
              setGlobalServicemenAvailable(available);
            } catch (e) {
              // fallback to previous heuristic (online flag)
              const busy = svc.filter((s:any) => !!s.online).length;
              setGlobalServicemenTotal(svc.length);
              setGlobalServicemenAvailable(Math.max(0, svc.length - busy));
            }
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
      {/* @ts-ignore - attach data-role attribute for web DOM so print CSS can target it */}
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
      {/* @ts-ignore - attach data-role attribute for web DOM so print CSS can target it */}
      <View // @ts-ignore
        data-role="main"
        style={styles.mainContent}
      >
        {/* Badges are now rendered inside each tab header via DispatcherHeader */}

        {renderActiveTab()}
      </View>

      {/* Logout confirmation (reusable) */}
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
