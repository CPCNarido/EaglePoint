import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons as Icon } from "@expo/vector-icons";

type SidebarButtonProps = {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

type OverviewItem = {
  title: string;
  value: string;
  subtitle: string;
  color: string;
};

export default function CashierLayout() {
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const [logoutModalVisible, setLogoutModalVisible] = useState<boolean>(false);
  const router = useRouter();

  const performLogout = async () => {
    try {
      setLogoutModalVisible(false);
      const baseUrl =
        Platform.OS === "android"
          ? "http://10.127.147.53:3000"
          : "http://localhost:3000";
      await fetch(`${baseUrl}/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    } catch (e) {}

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        ["authToken", "token", "user", "EAGLEPOINT_AUTH"].forEach((k) =>
          window.localStorage.removeItem(k)
        );
      }
    } catch (e) {}

    try {
      // @ts-ignore
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      if (AsyncStorage && AsyncStorage.multiRemove) {
        await AsyncStorage.multiRemove([
          "authToken",
          "token",
          "user",
          "EAGLEPOINT_AUTH",
        ]);
      }
    } catch (e) {}

    router.replace("/");
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      setLogoutModalVisible(true);
      return;
    }

    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: performLogout },
    ]);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return <DashboardContent />;
      case "Transaction":
        return <TransactionContent />;
      case "Player List":
        return <PlayerListContent />;
      default:
        return <DashboardContent />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View>
          <Text style={styles.logoTitle}>Eagle Point{"\n"}CASHIER</Text>

          {/* Navigation Buttons */}
          <View style={styles.navContainer}>
            <SidebarButton
              icon="dashboard"
              label="Dashboard"
              active={activeTab === "Dashboard"}
              onPress={() => setActiveTab("Dashboard")}
            />
            <SidebarButton
              icon="point-of-sale"
              label="Transaction"
              active={activeTab === "Transaction"}
              onPress={() => setActiveTab("Transaction")}
            />
            <SidebarButton
              icon="people-alt"
              label="Player List"
              active={activeTab === "Player List"}
              onPress={() => setActiveTab("Player List")}
            />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Logged in as: Cashier Anne</Text>
          <Text style={styles.footerText}>Cashier ID: 1022101</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>{renderContent()}</View>

      {/* Logout Modal (Web) */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalText}>
              Are you sure you want to log out?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={performLogout}
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

/* ----------------------------- Sidebar Button ----------------------------- */
const SidebarButton: React.FC<SidebarButtonProps> = ({
  icon,
  label,
  active,
  onPress,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.navButton, active && styles.navButtonActive]}
  >
    <Icon
      name={icon as any}
      size={22}
      color={active ? "#FFFFFF" : "#DADDD8"}
      style={{ marginRight: 10 }}
    />
    <Text style={[styles.navText, active && styles.navTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

/* ----------------------------- Dashboard Tab ----------------------------- */
const DashboardContent = () => (
  <ScrollView style={styles.scrollArea}>
    <Text style={styles.title}>Dashboard</Text>

    <View style={styles.welcomeCard}>
      <Text style={styles.welcomeText}>Welcome back, Cashier!</Text>
      <Text style={styles.dateText}>October 18, 2025 - 15:30 PM</Text>
    </View>

    {/* Quick Overview */}
    <Text style={styles.sectionTitle}>Quick Overview</Text>
    <View style={styles.quickOverview}>
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
        value="20/30"
        subtitle="5 Staff are Absent Today."
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
            <Text style={{ color: status.color }}>{i + 1}</Text>
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
  </ScrollView>
);

const getBayStatus = (num: number) => {
  if ([4, 9, 12, 18, 32, 40].includes(num)) return { color: "#C62828" }; // Maintenance
  if ([5, 13, 26, 34, 36].includes(num)) return { color: "#BF930E" }; // Open Session
  if ([8, 21, 22, 35].includes(num)) return { color: "#A3784E" }; // Assigned
  return { color: "#2E7D32" }; // Available
};

/* ----------------------------- Transaction Tab ----------------------------- */
const TransactionContent = () => (
  <ScrollView style={styles.scrollArea}>
    <Text style={styles.title}>Player Transaction</Text>
    <View style={styles.placeholderBox}>
      <Text style={styles.placeholderText}>Transaction Page</Text>
    </View>
  </ScrollView>
);

/* ----------------------------- Player List Tab ----------------------------- */
const PlayerListContent = () => (
  <ScrollView style={styles.scrollArea}>
    <Text style={styles.title}>Active Player List</Text>
    <View style={styles.placeholderBox}>
      <Text style={styles.placeholderText}>Player List Page</Text>
    </View>
  </ScrollView>
);

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

const Legend: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendLabel}>{label}</Text>
  </View>
);

/* ----------------------------- Styles ----------------------------- */
const styles = StyleSheet.create({
  container: { flexDirection: "row", flex: 1, backgroundColor: "#EDECE8" },
  sidebar: {
    width: 240,
    backgroundColor: "#2E372E",
    padding: 20,
    justifyContent: "space-between",
  },
  logoTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 40,
  },
  navContainer: { flexGrow: 1 },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  navButtonActive: { backgroundColor: "#4A5944" },
  navText: { color: "#CFCFCF", fontSize: 16 },
  navTextActive: { color: "white", fontWeight: "bold" },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#555",
    paddingTop: 10,
  },
  footerText: { color: "#CFCFCF", fontSize: 12, marginBottom: 4 },
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
