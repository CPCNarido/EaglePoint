import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, Modal, StyleSheet } from "react-native";
import { tw } from 'react-native-tailwindcss';
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import auth from '../../lib/auth';
import StaffManagement from "./Tabs/StaffManagement";
import BayManagement from "./Tabs/BayManagement";


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
    try { setLogoutModalVisible(false); } catch (e) {}
    await auth.logoutAndClear();
    router.replace('/');
  };

  const getBayStatus = (num: number) => {
    if ([4, 9, 12, 18, 32, 40].includes(num)) return { color: "#C62828" }; // Maintenance
    if ([5, 13, 26, 34, 36].includes(num)) return { color: "#BF930E" }; // Open Session
    if ([8, 21, 22, 35].includes(num)) return { color: "#A3784E" }; // Assigned
    return { color: "#2E7D32" }; // Available
  };

  const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );

  const OverviewCard: React.FC<OverviewItem> = ({ title, value, subtitle, color }) => (
    <View style={[styles.overviewCard, { borderLeftColor: color }]}>
      <Text style={styles.overviewLabel}>{title}</Text>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewSubtitle}>{subtitle}</Text>
    </View>
  );

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
                  value="₱100,000"
                  subtitle="▲ 12.5% vs Last Period"
                  color="#2E7D32"
                />
                <OverviewCard
                  title="Active Players Today"
                  value="48"
                  subtitle="6 Bays Currently Playing"
                  color="#558B2F"
                />
                <OverviewCard
                  title="Staff on Duty Today"
                  value="20 / 30"
                  subtitle="5 Staff are Absent Today"
                  color="#C62828"
                />
                <OverviewCard
                  title="Next Tee Time"
                  value="10:30 AM"
                  subtitle="Group 3 Waiting in Queue"
                  color="#6D4C41"
                />
              </View>

              {/* Real-Time Bay Overview */}
              <Text style={styles.sectionTitle}>Real-Time Bay Overview</Text>
              <View style={styles.bayContainer}>
                {Array.from({ length: 45 }).map((_, i) => {
                  const status = getBayStatus(i + 1);
                  return (
                    <View key={i} style={[styles.bayBox, { borderColor: status.color }]}>
                      <Text style={[styles.bayText, { color: status.color }]}>{i + 1}</Text>
                    </View>
                  );
                })}
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
    { name: "Reports", icon: "bar-chart" },
    { name: "Settings", icon: "settings" },
    { name: "Logs", icon: "history" },
  ];

  return (
    <View style={[tw.flex1, tw.flexRow, { backgroundColor: '#F6F6F2' }]}>
      {/* Sidebar */}
      <View style={[tw.w64, tw.p5, { backgroundColor: '#1E2B20', justifyContent: 'space-between' }]}>
  <Text style={[tw.textWhite, tw.fontBold, tw.text2xl, tw.mB10]}>Eagle Point{"\n"}ADMIN</Text>

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
          <Text style={[tw.textGray400, tw.textXs]}>Logged in as: ADMIN</Text>
          <Text style={[tw.textGray400, tw.textXs]}>Admin ID: 1212121212</Text>
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
