import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function DashboardTab() {
  // Pagination + selected
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBay, setSelectedBay] = useState(null);

  // ✅ Quick Overview Data
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

  // ✅ Color Scheme
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

  // ✅ Legend component
  const Legend = ({ color, label }) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );

  // ✅ Overview Card component
  const OverviewCard = ({ title, value, subtitle, color }) => (
    <View style={[styles.overviewCard, { borderLeftColor: color }]}>
      <Text style={styles.overviewTitle}>{title}</Text>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewSubtitle}>{subtitle}</Text>
    </View>
  );

  // ✅ Render Dashboard
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
            const { border, bg } = getStatusColors(bay.status);
            return (
              <View key={bay.id} style={[styles.bayCard, { borderColor: border }]}>
                <View style={[styles.statusCapsule, { backgroundColor: bg }]}>
                  <Text style={styles.statusCapsuleText}>
                    {bay.status} #{bay.id}
                  </Text>
                </View>

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

  // ✅ Main Render
  return <View style={{ flex: 1 }}>{renderDashboard()}</View>;
}

const styles = StyleSheet.create({
  scrollArea: { flex: 1 },
  contentBox: { padding: 16 },
  welcomeText: { fontSize: 20, fontWeight: "bold", marginBottom: 4 },
  dateText: { color: "#666", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginVertical: 10 },
  quickOverviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonText: { color: "#1E2B20", fontWeight: "600" },
  overviewContainer: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  overviewCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 5,
    width: "47%",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  overviewTitle: { fontSize: 14, fontWeight: "600" },
  overviewValue: { fontSize: 20, fontWeight: "bold", marginVertical: 5 },
  overviewSubtitle: { color: "#555", fontSize: 12 },
  legendContainer: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 15 },
  legendColor: { width: 15, height: 15, borderRadius: 3, marginRight: 5 },
  legendText: { fontSize: 13 },
  bayContainer: { flexWrap: "wrap", flexDirection: "row", gap: 10 },
  bayCard: {
    width: "20%",
    borderWidth: 2,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#fff",
  },
  statusCapsule: {
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 6,
  },
  statusCapsuleText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  bayInfo: { fontSize: 13, color: "#222" },
  timeText: { fontSize: 12, color: "#666", marginVertical: 3 },
  editButton: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 4,
    alignItems: "center",
    marginTop: 6,
  },
  editText: { fontWeight: "600" },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 15,
  },
  pageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#E0E0E0",
    borderRadius: 8,
  },
  pageText: { fontWeight: "bold" },
  pageIndicator: { marginHorizontal: 10 },
  pageNumber: { fontSize: 16, fontWeight: "bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
    width: "80%",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  modalText: { fontSize: 14, marginBottom: 4 },
  closeButton: {
    backgroundColor: "#007bff",
    paddingVertical: 10,
    borderRadius: 8,    
    alignItems: "center",
    marginTop: 10,
  },
  closeButtonText: { color: "#fff", fontWeight: "600" },
});
