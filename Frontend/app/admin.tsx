import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  const getBayStatus = (num) => {
    if ([4, 9, 12, 18, 32, 40].includes(num)) return { color: "#C62828" }; // Maintenance
    if ([5, 13, 26, 34, 36].includes(num)) return { color: "#BF930E" }; // Open Session
    if ([8, 21, 22, 35].includes(num)) return { color: "#A3784E" }; // Assigned
    return { color: "#2E7D32" }; // Available
  };

  const Legend = ({ color, label }) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );

  const OverviewCard = ({ title, value, subtitle, color }) => (
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
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <Text style={styles.logo}>Eagle Point{"\n"}ADMIN</Text>

        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[styles.tabButton, activeTab === tab.name && styles.activeTabButton]}
            onPress={() => setActiveTab(tab.name)}
          >
            <MaterialIcons
              name={tab.icon}
              size={22}
              color={activeTab === tab.name ? "#fff" : "#B8C1B7"}
              style={styles.icon}
            />
            <Text
              style={[styles.tabText, activeTab === tab.name && styles.activeTabText]}
            >
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.logoutContainer}>
          <Text style={styles.loggedInText}>Logged in as: ADMIN</Text>
          <Text style={styles.loggedInText}>Admin ID: 1212121212</Text>
          <TouchableOpacity style={styles.logoutButton}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>{renderContent()}</View>
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
});
