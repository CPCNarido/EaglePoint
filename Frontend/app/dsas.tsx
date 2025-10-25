import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from "react-native";
import { FontAwesome5, MaterialIcons } from "@expo/vector-icons";

export default function CashierDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return (
          <View style={styles.container}>
            <Text style={styles.header}>Dashboard</Text>

            {/* Welcome Section */}
            <View style={styles.welcomeCard}>
              <Text style={styles.welcomeText}>Welcome back, Cashier!</Text>
              <Text style={styles.dateText}>October 18, 2025</Text>
              <Text style={styles.dateText}>15:30 PM</Text>
            </View>

            {/* Quick Overview */}
            <Text style={styles.subHeader}>Quick Overview</Text>
            <View style={styles.overviewContainer}>
              <View style={[styles.overviewCard, { borderLeftColor: "#006400" }]}>
                <Text style={styles.overviewTitle}>Total Revenue (Today)</Text>
                <Text style={styles.overviewValue}>₱45,250</Text>
                <Text style={styles.overviewNote}>+₱1,250 from last hour</Text>
              </View>

              <View style={[styles.overviewCard, { borderLeftColor: "#8FBC8F" }]}>
                <Text style={styles.overviewTitle}>Active Bays</Text>
                <Text style={styles.overviewValue}>8</Text>
                <Text style={styles.overviewNote}>45 Total Bays</Text>
              </View>

              <View style={[styles.overviewCard, { borderLeftColor: "#B22222" }]}>
                <Text style={styles.overviewTitle}>Players Checked In</Text>
                <Text style={[styles.overviewValue, { color: "#B22222" }]}>32</Text>
                <Text style={styles.overviewNote}>12 Currently Playing</Text>
              </View>

              <View style={[styles.overviewCard, { borderLeftColor: "#8B4513" }]}>
                <Text style={styles.overviewTitle}>Pending Payments</Text>
                <Text style={[styles.overviewValue, { color: "#8B4513" }]}>3</Text>
                <Text style={styles.overviewNote}>₱1,800 Total</Text>
              </View>
            </View>

            {/* Real-Time Bay Overview */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Real-Time Bay Overview</Text>

              <View style={styles.bayGrid}>
                {Array.from({ length: 45 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bayBox,
                      i % 4 === 0
                        ? styles.assigned
                        : i % 5 === 0
                        ? styles.maintenance
                        : i % 3 === 0
                        ? styles.open
                        : styles.available,
                    ]}
                  >
                    <Text style={styles.bayText}>{i + 1}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#2E8B57" }]} />
                  <Text style={styles.legendLabel}>Available</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#FFA500" }]} />
                  <Text style={styles.legendLabel}>Open Time Session</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#B22222" }]} />
                  <Text style={styles.legendLabel}>Assigned</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#8B4513" }]} />
                  <Text style={styles.legendLabel}>Maintenance</Text>
                </View>
              </View>
            </View>

            {/* Transaction Summary */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.activityRow}>
                  <Text style={styles.activityText}>
                    Payment Received - Bay {Math.floor(Math.random() * 45) + 1}
                  </Text>
                  <Text style={styles.activitySub}>₱{(Math.random() * 1000 + 300).toFixed(0)}</Text>
                  <Text style={styles.activitySub}>Oct 18, 2025 – 3:{20 + i} PM</Text>
                </View>
              ))}
            </View>
          </View>
        );

      default:
        return (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>You are at the {activeTab} tab</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.layout}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <FontAwesome5 name="dove" size={28} color="#fff" />
            <Text style={styles.sidebarTitle}>Eagle Point</Text>
            <Text style={styles.sidebarSubtitle}>CASHIER</Text>
          </View>

          {/* Tabs / Menu */}
          <View style={styles.menu}>
            {["Dashboard", "Players", "Transactions", "Queue", "Receipts"].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={activeTab === tab ? styles.menuItemActive : styles.menuItem}
                onPress={() => setActiveTab(tab)}
              >
                <MaterialIcons
                  name={
                    tab === "Dashboard"
                      ? "dashboard"
                      : tab === "Player"
                      ? "people"
                      : tab === "Transactions"
                      ? "attach-money"
                      : tab === "Queue"
                      ? "list-alt"
                      : "history"
                  }
                  size={22}
                  color="#fff"
                />
                <Text style={activeTab === tab ? styles.menuTextActive : styles.menuText}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.sidebarFooter}>
            <Text style={styles.footerText}>Logged in as: CASHIER</Text>
            <TouchableOpacity style={styles.logoutButton}>
              <Text style={styles.logoutText}>LOG OUT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content */}
        <ScrollView contentContainerStyle={styles.scroll}>{renderContent()}</ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F5" },
  layout: { flexDirection: "row", flex: 1 },
  sidebar: {
    width: 220,
    backgroundColor: "#2A3328",
    paddingVertical: 25,
    paddingHorizontal: 15,
    justifyContent: "space-between",
  },
  sidebarHeader: { alignItems: "center", marginBottom: 20 },
  sidebarTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  sidebarSubtitle: { color: "#D3D3D3", fontSize: 14, fontWeight: "500" },
  menu: { flexGrow: 1, marginTop: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  menuItemActive: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#394236",
    borderRadius: 6,
    padding: 8,
    marginVertical: 8,
  },
  menuText: { color: "#fff", fontSize: 14, marginLeft: 10 },
  menuTextActive: { color: "#fff", fontSize: 14, marginLeft: 10, fontWeight: "600" },
  sidebarFooter: { marginTop: 20 },
  footerText: { color: "#ccc", fontSize: 11, textAlign: "center" },
  logoutButton: {
    backgroundColor: "#444",
    paddingVertical: 8,
    marginTop: 10,
    borderRadius: 5,
  },
  logoutText: { color: "#fff", fontSize: 13, textAlign: "center" },
  scroll: { alignItems: "center", paddingBottom: 80 },
  container: { width: "95%", paddingTop: 20 },
  header: { fontSize: 24, fontWeight: "700", marginBottom: 20, color: "#2A3328" },
  welcomeCard: { backgroundColor: "#2A3328", borderRadius: 10, padding: 20, marginBottom: 20 },
  welcomeText: { color: "#fff", fontSize: 18, marginBottom: 8 },
  dateText: { color: "#ccc", fontSize: 14 },
  subHeader: { fontSize: 18, fontWeight: "600", color: "#555", marginVertical: 10 },
  overviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  overviewCard: {
    backgroundColor: "#fff",
    width: "48%",
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 3,
  },
  overviewTitle: { fontSize: 13, color: "#555" },
  overviewValue: { fontSize: 22, fontWeight: "700", color: "#2A3328" },
  overviewNote: { fontSize: 12, color: "#888" },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 3,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 10, color: "#2A3328" },
  bayGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginBottom: 10 },
  bayBox: {
    width: 50,
    height: 40,
    borderWidth: 1,
    borderColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
    margin: 3,
    borderRadius: 6,
  },
  available: { backgroundColor: "#E9F5EC", borderColor: "#2E8B57" },
  open: { backgroundColor: "#FFF9E5", borderColor: "#FFA500" },
  assigned: { backgroundColor: "#FFE5E5", borderColor: "#B22222" },
  maintenance: { backgroundColor: "#F3E0D3", borderColor: "#8B4513" },
  bayText: { fontWeight: "500", color: "#333" },
  legend: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 5 },
  legendLabel: { fontSize: 12, color: "#333" },
  activityRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  activityText: { fontSize: 13, color: "#333", flex: 2 },
  activitySub: { fontSize: 12, color: "#666", flex: 1, textAlign: "right" },

  // Placeholder Tabs
  placeholderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 600,
  },
  placeholderText: { fontSize: 18, color: "#333", fontWeight: "600" },
});
