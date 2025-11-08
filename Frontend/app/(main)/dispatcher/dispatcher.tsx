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

        let r = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' });
        let data: any = null;
        if (r.ok) data = await r.json();
        else {
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

  const renderActiveTab = () => {
    switch (activeTab) {
      case "Dashboard":
        return <DashboardTab />;
      case "Bay Assignment":
        return <BayAssignmentTab />;
      case "Shared Display":
        return <SharedDisplayTab />;
      case "Session Control":
        return <SessionControlTab />;
      case "Team Chats":
        return <TeamChats />;
      case "Attendance":
        return <AttendanceTab />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
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
      <View style={styles.mainContent}>{renderActiveTab()}</View>

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
