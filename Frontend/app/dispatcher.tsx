import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function DispatcherDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBay, setSelectedBay] = useState(null);

  // Quick Overview Data
  const overviewData = [
    {
      title: "Available Bays Currently",
      value: "30/45",
      subtitle: "15 Bays are Occupied",
      color: "#2E7D32",
    },
    {
      title: "Service Man Available",
      value: "30/45",
      subtitle: "15 Service Man are Assigned",
      color: "#33691E",
    },
    {
      title: "Waiting Queue",
      value: "5 Players",
      subtitle: "Waiting to be Assigned by Staff",
      color: "#BF930E",
    },
    {
      title: "Urgent Attention",
      value: "5 Alerts",
      subtitle: "Check Bay Status",
      color: "#C62828",
    },
  ];

  // ✅ Bay Data
  const bayData = [
    { id: 1, status: "Timed Session", player: "Motea", sm: "Narido", time: "1:18:00 Remaining" },
    { id: 2, status: "Open Time", player: "Camarillo", sm: "Narido", time: "1:03:26 Elapsed" },
    { id: 3, status: "Available", player: "Lamadora", sm: "Narido", time: "1:03:26 Remaining" },
    { id: 4, status: "Maintenance", player: "Serviceman John", sm: "Fixing Ball Sensor", time: "—" },
    { id: 5, status: "Timed Session", player: "Motea", sm: "Narido", time: "0:03:26 Remaining" },
    { id: 6, status: "Timed Session", player: "Camarillo", sm: "Narido", time: "0:03:26 Remaining" },
    { id: 7, status: "Open Time", player: "Lamadora", sm: "Narido", time: "1:03:26 Elapsed" },
    { id: 8, status: "Timed Session", player: "Motea", sm: "Narido", time: "0:03:26 Remaining" },
    { id: 9, status: "Maintenance", player: "Serviceman Luis", sm: "Fixing Lighting", time: "—" },
    { id: 10, status: "Available", player: "Camarillo", sm: "Narido", time: "1:03:26 Remaining" },
    { id: 11, status: "Open Time", player: "Lamadora", sm: "Narido", time: "1:03:26 Elapsed" },
    { id: 12, status: "Maintenance", player: "Serviceman Noel", sm: "Fixing Tee Mat", time: "—" },
    { id: 13, status: "Maintenance", player: "Serviceman Jay", sm: "Fixing Net Sensor", time: "—" },
    { id: 14, status: "Maintenance", player: "Serviceman Lea", sm: "Fixing Cable", time: "—" },
    { id: 15, status: "Timed Session", player: "Motea", sm: "Narido", time: "1:03:26 Remaining" },
  ];

  // Color Scheme
  const getStatusColors = (status) => {
    switch (status) {
      case "Available":
        return { border: "#2E7D32", text: "#fff", bg: "#2E7D32" };
      case "Open Time":
        return { border: "#BF930E", text: "#fff", bg: "#BF930E" };
      case "Timed Session":
        return { border: "#A3784E", text: "#fff", bg: "#A3784E" };
      case "Maintenance":
        return { border: "#C62828", text: "#fff", bg: "#C62828" };
      default:
        return { border: "#999", text: "#fff", bg: "#999" };
    }
  };

  const Legend = ({ color, label }) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );

  const OverviewCard = ({ title, value, subtitle, color }) => (
    <View style={[styles.overviewCard, { borderLeftColor: color }]}>
      <Text style={styles.overviewTitle}>{title}</Text>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewSubtitle}>{subtitle}</Text>
    </View>
  );

  const renderDashboard = () => (
    <ScrollView style={styles.scrollArea}>
      <View style={styles.contentBox}>
        <Text style={styles.welcomeText}>Welcome back, Dispatcher!</Text>
        <Text style={styles.dateText}>October 25, 2025 | 09:00 AM</Text>

        {/* Quick Overview */}
        <View style={styles.quickOverviewHeader}>
          <Text style={styles.sectionTitle}>Quick Overview</Text>
          <TouchableOpacity style={styles.addButton}>
            <MaterialIcons name="add" size={20} color="#1E2B20" />
            <Text style={styles.addButtonText}>Add New Assignment</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.overviewContainer}>
          {overviewData.map((item, idx) => (
            <OverviewCard key={idx} {...item} />
          ))}
        </View>

        {/* Real-Time Bay Monitoring */}
        <Text style={styles.sectionTitle}>Real-Time Bay Monitoring</Text>
        <View style={styles.legendContainer}>
          <Legend color="#2E7D32" label="Available" />
          <Legend color="#A3784E" label="Assigned" />
          <Legend color="#C62828" label="Maintenance" />
          <Legend color="#BF930E" label="Open Time Session" />
        </View>

        <View style={styles.bayContainer}>
          {bayData.map((bay) => {
            const { border, text, bg } = getStatusColors(bay.status);
            return (
              <View key={bay.id} style={[styles.bayCard, { borderColor: border }]}>
                
                {/* Capsule Status */}
                <View style={[styles.statusCapsule, { backgroundColor: bg }]}>
                  <Text style={styles.statusCapsuleText}>
                    {bay.status}  #{bay.id}
                  </Text>
                </View>

                {/* Player Info */}
                <Text style={styles.bayInfo}>Player Name: {bay.player}</Text>
                <Text style={styles.bayInfo}>SM: {bay.sm}</Text>
                <Text style={styles.timeText}>{bay.time}</Text>

                <TouchableOpacity
                  style={[styles.editButton, { borderColor: border }]}
                  onPress={() => setSelectedBay(bay)}
                >
                  <Text style={[styles.editText, { color: border }]}>Edit</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Pagination */}
        <View style={styles.paginationContainer}>
          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
          >
            <Text style={styles.pageText}>Previous</Text>
          </TouchableOpacity>
          <View style={styles.pageIndicator}>
            <Text style={styles.pageNumber}>{currentPage}</Text>
          </View>
          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => setCurrentPage(Math.min(3, currentPage + 1))}
          >
            <Text style={styles.pageText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit Modal */}
      <Modal
        visible={!!selectedBay}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedBay(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {selectedBay && (
              <>
                <Text style={styles.modalTitle}>Edit Bay #{selectedBay.id}</Text>
                <Text style={styles.modalText}>Status: {selectedBay.status}</Text>
                <Text style={styles.modalText}>Player: {selectedBay.player}</Text>
                <Text style={styles.modalText}>SM: {selectedBay.sm}</Text>
                <Text style={styles.modalText}>Time: {selectedBay.time}</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setSelectedBay(null)}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );

  const tabs = [
    { name: "Dashboard", icon: "dashboard" },
    { name: "Bay Assignment", icon: "golf-course" },
    { name: "Shared Display", icon: "tv" },
    { name: "Session Control", icon: "settings" },
  ];

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <Text style={styles.logo}>🦅{"  "}Eagle Point{"\n"}Dispatcher</Text>

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
              name={tab.icon}
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
          <Text style={styles.loggedInText}>Logged in as: Cashier Anne</Text>
          <Text style={styles.loggedInText}>Cashier ID: 1022101</Text>
          <TouchableOpacity style={styles.logoutButton}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {activeTab === "Dashboard" ? renderDashboard() : (
          <View style={styles.placeholderContainer}>
            <Text style={styles.sectionTitle}>{activeTab}</Text>
            <Text style={styles.placeholderText}>
              You are on the {activeTab} tab.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F6F6F2" },

  sidebar: {
    width: 250,
    backgroundColor: "#1E2B20",
    padding: 20,
  },
  logo: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
    marginBottom: 40,
    lineHeight: 26,
  },
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
  scrollArea: { flex: 1 },
  contentBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  welcomeText: { fontSize: 18, fontWeight: "700" },
  dateText: { color: "#666", marginBottom: 20 },
  quickOverviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DDEED9",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addButtonText: { color: "#1E2B20", fontWeight: "600", marginLeft: 5 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginVertical: 10 },
  overviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  overviewCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#F4F8F3",
    borderLeftWidth: 5,
    borderRadius: 10,
    padding: 15,
  },
  overviewTitle: { fontSize: 13, color: "#555" },
  overviewValue: { fontSize: 20, fontWeight: "700", marginTop: 5 },
  overviewSubtitle: { fontSize: 12, color: "#777", marginTop: 4 },

  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendColor: { width: 14, height: 14, borderRadius: 3, marginRight: 6 },
  legendText: { fontSize: 12, color: "#333" },

  // ✅ Real-Time Bays
  bayContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  bayCard: {
    width: "15%",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderRadius: 8,
    padding: 10,
  },

  // Capsule Style for Status
  statusCapsule: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  statusCapsuleText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  bayInfo: { fontSize: 12, color: "#333", marginBottom: 2 },
  timeText: { fontSize: 12, color: "#555", fontStyle: "italic", marginBottom: 4 },

  editButton: {
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  editText: { fontSize: 12, fontWeight: "600" },

  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  pageButton: {
    backgroundColor: "#1E2B20",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginHorizontal: 10,
  },
  pageText: { color: "#fff", fontWeight: "600" },
  pageIndicator: { paddingHorizontal: 10 },
  pageNumber: { fontSize: 16, fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: {
    backgroundColor: "#fff",
    width: "80%",
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  modalText: { fontSize: 14, color: "#333", marginBottom: 6 },
  closeButton: {
    marginTop: 10,
    backgroundColor: "#1E2B20",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  closeButtonText: { color: "#fff", fontWeight: "600" },
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { color: "#666", marginTop: 10 },
});
