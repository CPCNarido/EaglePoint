import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, Modal, StyleSheet } from "react-native";
import { tw } from 'react-native-tailwindcss';
import { useRouter } from "expo-router";
// Defer loading of icons to runtime
import { logoutAndClear } from '../../lib/auth';
import { useSettings } from '../../lib/SettingsProvider';
import StaffManagement from "./Tabs/StaffManagement";
import BayManagement from "./Tabs/BayManagement";
import SystemSettings from "./Tabs/SystemSettingsTab";
import ReportsAndAnalytics from "./Tabs/ReportsAndAnalytics";


type OverviewItem = { title: string; value: string; subtitle: string; color: string };

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const router = useRouter();

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      setLogoutModalVisible(true);
      return;
    }

    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => performLogout() },
    ]);
  };

  const [logoutModalVisible, setLogoutModalVisible] = useState<boolean>(false);

  const performLogout = async () => {
    try { setLogoutModalVisible(false); } catch {}
  await logoutAndClear();
    router.replace('/');
  };

  const getBayStatus = (num: number) => {
    // fallback static mapping (kept for immediate visuals)
    if ([4, 9, 12, 18, 32, 40].includes(num)) return { color: "#C62828" }; // Maintenance
    if ([5, 13, 26, 34, 36].includes(num)) return { color: "#BF930E" }; // Open Session
    if ([8, 21, 22, 35].includes(num)) return { color: "#A3784E" }; // Assigned
    return { color: "#2E7D32" }; // Available
  };

  // State from server
  const [overview, setOverview] = useState<any>(null);
  const [, setLoadingOverview] = useState(false);
  // admin info
  const [adminName, setAdminName] = useState<string>('ADMIN');
  const [adminId, setAdminId] = useState<string>('');
  const settings = useSettings();
  const prevTotalRef = React.useRef<number | null>(null);
  const [highlightedBays, setHighlightedBays] = useState<number[]>([]);

  const getColorFromStatus = (status: string) => {
    switch (status) {
      case 'Maintenance':
        return '#C62828';
      case 'Occupied':
        return '#A3784E';
      case 'Open':
      case 'OpenTime':
        return '#BF930E';
      case 'Available':
      default:
        return '#2E7D32';
    }
  };

  useEffect(() => {
    const fetchOverview = async () => {
      setLoadingOverview(true);
      try {
          const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
          const res = await fetch(`${baseUrl}/api/admin/overview`, { method: 'GET', credentials: 'include' });
          if (!res.ok) return setOverview(null);
          const data = await res.json();
          setOverview(data);
        } catch {
            setOverview(null);
          } finally {
        setLoadingOverview(false);
      }
    };
    // initial fetch
    fetchOverview();

    // Poll every 5 seconds so dashboard reflects DB changes without manual refresh
    const interval = setInterval(() => {
      fetchOverview();
    }, 5000);

    // Listen for explicit update events (emitted by other components after mutations)
    const onOverviewUpdated = () => fetchOverview();
    try {
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('overview:updated', onOverviewUpdated as EventListener);
    } catch {}
    // fetch admin identity for sidebar
    const fetchAdmin = async () => {
      try {
        const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
        const r = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json();
    const name = d?.full_name || d?.name || d?.username || 'ADMIN';
    // Prefer the database employee id. If not present, allow camelCase employeeId as a fallback.
    // Do NOT fall back to internal ids — the sidebar must show the employee id from the DB.
    const empId = d?.employee_id ?? d?.employeeId ?? null;
    const id = empId != null ? String(empId) : '';
    setAdminName(name);
    setAdminId(id);
      } catch {
        // ignore
      }
    };
    fetchAdmin();

    return () => {
      clearInterval(interval);
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('overview:updated', onOverviewUpdated as EventListener);
  } catch {}
    };
  }, []);

  // load icon lib at runtime to avoid bundler-time issues
  let MaterialIcons: any = null;
  try {
    // allow a runtime require here (we intentionally defer loading)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    MaterialIcons = require('@expo/vector-icons').MaterialIcons;
  } catch {
    MaterialIcons = function MaterialIconsStub({ name, size, color }: any) { return null; };
  }

  // Watch settings.totalAvailableBays and highlight newly added bay numbers when it increases
  useEffect(() => {
    const current = Number(settings.totalAvailableBays ?? 45);
    const prev = prevTotalRef.current ?? current;
    if (current > prev) {
      const newNumbers: number[] = [];
      for (let i = prev + 1; i <= current; i++) newNumbers.push(i);
      setHighlightedBays(newNumbers);
      // clear after 4s
      const t = setTimeout(() => setHighlightedBays([]), 4000);
      return () => clearTimeout(t);
    }
    prevTotalRef.current = current;
  }, [settings.totalAvailableBays]);

  const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );

(Legend as any).displayName = 'Legend';

  const OverviewCard: React.FC<OverviewItem> = ({ title, value, subtitle, color }) => (
    <View style={[styles.overviewCard, { borderLeftColor: color }]}>
      <Text style={styles.overviewLabel}>{title}</Text>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewSubtitle}>{subtitle}</Text>
    </View>
  );

(OverviewCard as any).displayName = 'OverviewCard';

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return (
          <ScrollView style={styles.scrollContent}>
            <View style={styles.contentContainer}>
              <Text style={styles.sectionTitle}>Admin Dashboard Overview</Text>
              <Text style={styles.placeholderText}>Welcome back, Admin!</Text>

              {/* Quick Overview */}
              <Text style={styles.sectionTitle}>Quick Overview</Text>
              <View style={styles.overviewContainer}>
                <OverviewCard
                  title="Total Revenue (Today)"
                  value={overview ? `${settings.currencySymbol}${overview.totalRevenueToday}` : '—'}
                  subtitle="Compared to previous period"
                  color="#2E7D32"
                />
                {(() => {
                  if (!overview) {
                    return <OverviewCard title="Available Bays" value={'—'} subtitle={''} color="#558B2F" />;
                  }

                  const total = Number(settings.totalAvailableBays ?? overview.totalBays ?? 45);

                  // Prefer server-provided availableBays when present.
                  let avail: number | null = typeof overview.availableBays === 'number' ? overview.availableBays : null;

                  // If server didn't provide a pre-computed availableBays, derive it from bay rows.
                  if (avail === null) {
                    const bays = overview.bays ?? [];
                    const occupied = bays.filter((b: any) => {
                      const st = String(b?.status ?? b?.originalStatus ?? '').trim();
                      return ['Occupied', 'Assigned', 'Open', 'OpenTime', 'Maintenance', 'SpecialUse'].includes(st);
                    }).length;
                    avail = Math.max(0, total - occupied);
                  }

                  return (
                    <OverviewCard
                      title="Available Bays"
                      value={String(avail)}
                      subtitle={`${avail} / ${total} available`}
                      color="#558B2F"
                    />
                  );
                })()}
                <OverviewCard
                  title="Staff on Duty"
                  value={overview ? String(overview.staffOnDuty) : '—'}
                  subtitle="Total staff"
                  color="#C62828"
                />
                <OverviewCard
                  title="Next Tee Time"
                  value={(() => {
                    if (!overview || !overview.nextTeeTime) return '—';
                    if (overview.nextTeeTime === 'Bay Ready') return 'Bay Ready';
                    try {
                      return new Date(overview.nextTeeTime).toLocaleTimeString();
                    } catch {
                      return String(overview.nextTeeTime);
                    }
                  })()}
                  subtitle={(() => {
                    if (!overview || !overview.nextTeeTime) return '';
                    if (overview.nextTeeTime === 'Bay Ready') return '';
                    try {
                      return new Date(overview.nextTeeTime).toLocaleDateString();
                    } catch {
                      return '';
                    }
                  })()}
                  color="#6D4C41"
                />
              </View>

              {/* Real-Time Bay Overview */}
              <Text style={styles.sectionTitle}>Real-Time Bay Overview</Text>
              <View style={styles.bayContainer}>
                {overview && overview.bays && overview.bays.length > 0 ? (
                  // Render bay grid 1..N in numerical order, using overview data when available
                  Array.from({ length: settings.totalAvailableBays ?? 45 }).map((_, i) => {
                    const num = i + 1;
                    const numStr = String(num);
                    const b = overview.bays.find((x: any) => String(x.bay_number) === numStr || String(x.bay_id) === numStr);
                    const status = b?.status ?? null;
                    const original = b?.originalStatus ?? null;
                    const isHighlighted = highlightedBays.includes(num);
                    return (
                      <View key={b?.bay_id ?? `bay-${num}`} style={[styles.bayBox, { borderColor: getColorFromStatus(status ?? ''), position: 'relative', ...(isHighlighted ? { borderWidth: 3, shadowColor: '#00BFA5', shadowOpacity: 0.3 } : {}) }]}>
                        <Text style={[styles.bayText, { color: getColorFromStatus(status ?? '') }]}>{num}</Text>
                        {original === 'SpecialUse' && (
                          <View style={styles.reservedBadge}>
                            <Text style={styles.reservedBadgeText}>Reserved</Text>
                          </View>
                        )}
                      </View>
                    );
                  })
                ) : (
                  // fallback static grid up to N
                  Array.from({ length: settings.totalAvailableBays ?? 45 }).map((_, i) => {
                    const num = i + 1;
                    const status = getBayStatus(num);
                    const isHighlighted = highlightedBays.includes(num);
                    return (
                      <View key={i} style={[styles.bayBox, { borderColor: status.color, ...(isHighlighted ? { borderWidth: 3, shadowColor: '#00BFA5', shadowOpacity: 0.3 } : {}) }]}>
                        <Text style={[styles.bayText, { color: status.color }]}>{num}</Text>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.legendContainer}>
                <Legend color="#2E7D32" label="Available" />
                <Legend color="#A3784E" label="Assigned" />
                <Legend color="#BF930E" label="Open Time Session" />
                <Legend color="#C62828" label="Maintenance" />
              </View>
            </View>
          </ScrollView>
        );
      case "Staff Management":
      return <StaffManagement />; // ✅ Calls the imported component

      case "Bay Management":
      return <BayManagement />;

  case "System Settings":
  return <SystemSettings />;
    case "Report & Analytics":
  return <ReportsAndAnalytics />;

      default:
        return (
          <View style={styles.contentContainer}>
            <Text style={styles.sectionTitle}>{activeTab}</Text>
            <Text style={styles.placeholderText}>
              You are at the {activeTab} tab.
            </Text>
          </View>
        );
    }
  };

  const tabs = [
    { name: "Dashboard", icon: "dashboard" },
    { name: "Staff Management", icon: "group" },
    { name: "Bay Management", icon: "golf-course" },
    { name: "Report & Analytics", icon: "bar-chart" },
    { name: "Team Chats", icon: "chat" },
    { name: "Audit Logs", icon: "history" },
    { name: "System Settings", icon: "settings" },
  ];

  return (
    <View style={[tw.flex1, tw.flexRow, { backgroundColor: '#F6F6F2' }]}>
      {/* Sidebar */}
      <View style={[tw.w64, tw.p5, { backgroundColor: '#1E2B20', justifyContent: 'space-between' }]}>
  <Text style={[tw.textWhite, tw.fontBold, tw.text2xl, tw.mB10]}>{settings.siteName}{"\n"}ADMIN</Text>

        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[
              tw.flexRow,
              tw.itemsCenter,
              tw.pY3,
              tw.pX2,
              tw.roundedLg,
              tw.mY1,
              activeTab === tab.name ? { backgroundColor: '#405C45' } : {},
            ]}
            onPress={() => setActiveTab(tab.name)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={22}
              color={activeTab === tab.name ? "#fff" : "#B8C1B7"}
              style={{ marginRight: 10 }}
            />
            <Text style={[activeTab === tab.name ? { color: '#fff', fontWeight: '600' } : { color: '#DADADA' }]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={{ marginTop: 60 }}>
          <Text style={[tw.textGray400, tw.textXs]}>Logged in as: {adminName}</Text>
          <Text style={[tw.textGray400, tw.textXs]}>Admin ID: {adminId || '—'}</Text>
          <TouchableOpacity style={{ marginTop: 10, backgroundColor: '#404040', paddingVertical: 10, borderRadius: 6, alignItems: 'center' }} onPress={handleLogout}>
            <Text style={[tw.textWhite, tw.fontBold]}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
  <View style={[tw.flex1, tw.p6]}>{renderContent()}</View>
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
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setLogoutModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={() => performLogout()}>
                <Text style={styles.modalButtonText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ensure linter recognizes the component display name
(AdminDashboard as any).displayName = 'AdminDashboard';

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F6F6F2" },
  sidebar: {
    width: 250,
    backgroundColor: "#1E2B20",
    padding: 20,
    justifyContent: "space-between",
  },
  logo: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 22,
    marginBottom: 40,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  icon: { marginRight: 10 },
  activeTabButton: { backgroundColor: "#405C45" },
  tabText: { color: "#DADADA", fontSize: 16 },
  activeTabText: { color: "#fff", fontWeight: "600" },
  logoutContainer: { marginTop: 60 },
  loggedInText: { color: "#ccc", fontSize: 12, marginBottom: 4 },
  logoutButton: {
    marginTop: 10,
    backgroundColor: "#404040",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold" },
  mainContent: { flex: 1, padding: 25 },
  contentContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  scrollContent: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  placeholderText: { fontSize: 15, color: "#555", marginBottom: 20 },
  overviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  overviewCard: {
    backgroundColor: "#F4F8F3",
    borderRadius: 10,
    padding: 15,
    flex: 1,
    minWidth: "45%",
    borderLeftWidth: 5,
  },
  overviewLabel: { fontSize: 13, color: "#555" },
  overviewValue: { fontSize: 20, fontWeight: "700", marginTop: 5 },
  overviewSubtitle: { fontSize: 12, color: "#777", marginTop: 4 },
  bayContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  bayBox: {
    width: 45,
    height: 45,
    borderWidth: 2,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9F9F9",
  },
  reservedBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: '#7C0A02', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, zIndex: 5 },
  reservedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  bayText: { fontWeight: "bold" },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: { fontSize: 12, color: "#333" },
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
  modalButtonCancel: { backgroundColor: "#EEE", marginRight: 8 },
  modalButtonConfirm: { backgroundColor: "#C62828" },
  modalButtonText: { color: "#fff", fontWeight: "600" },
});
