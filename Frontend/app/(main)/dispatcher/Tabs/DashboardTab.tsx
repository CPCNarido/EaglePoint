import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function DispatcherDashboard() {
  // Tabs
  const [activeTab, setActiveTab] = useState("Dashboard");

  // Pagination or data view (optional)
  const [currentPage, setCurrentPage] = useState(1);

  // Bay selection
  const [selectedBay, setSelectedBay] = useState(null);

  // Modal control
  const [modalVisible, setModalVisible] = useState(false);

  // Example data
  const bays = [
    { id: 1, name: "Bay 1", status: "Available" },
    { id: 2, name: "Bay 2", status: "In Use" },
    { id: 3, name: "Bay 3", status: "Under Maintenance" },
  ];

  const reports = [
    { id: 1, title: "Daily Report", date: "2025-10-25" },
    { id: 2, title: "Weekly Summary", date: "2025-10-18" },
  ];

  const renderTabButton = (label, icon) => (
    <TouchableOpacity
      key={label}
      style={[
        styles.tabButton,
        activeTab === label && styles.activeTabButton,
      ]}
      onPress={() => setActiveTab(label)}
    >
      <MaterialIcons
        name={icon}
        size={22}
        color={activeTab === label ? "#fff" : "#333"}
      />
      <Text
        style={[
          styles.tabText,
          activeTab === label && styles.activeTabText,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderDashboard = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.sectionTitle}>Dispatcher Overview</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>Total Bays: {bays.length}</Text>
        <Text style={styles.cardText}>
          Available: {bays.filter((b) => b.status === "Available").length}
        </Text>
        <Text style={styles.cardText}>
          In Use: {bays.filter((b) => b.status === "In Use").length}
        </Text>
      </View>
    </View>
  );

  const renderBayManagement = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.sectionTitle}>Bay Management</Text>
      <ScrollView style={{ width: "100%" }}>
        {bays.map((bay) => (
          <TouchableOpacity
            key={bay.id}
            style={styles.bayCard}
            onPress={() => {
              setSelectedBay(bay);
              setModalVisible(true);
            }}
          >
            <View>
              <Text style={styles.bayName}>{bay.name}</Text>
              <Text
                style={[
                  styles.bayStatus,
                  {
                    color:
                      bay.status === "Available"
                        ? "green"
                        : bay.status === "In Use"
                        ? "orange"
                        : "red",
                  },
                ]}
              >
                {bay.status}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#888" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedBay && (
              <>
                <Text style={styles.modalTitle}>{selectedBay.name}</Text>
                <Text style={styles.modalStatus}>
                  Status: {selectedBay.status}
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderReports = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.sectionTitle}>Reports</Text>
      <ScrollView style={{ width: "100%" }}>
        {reports.map((report) => (
          <View key={report.id} style={styles.reportCard}>
            <Text style={styles.reportTitle}>{report.title}</Text>
            <Text style={styles.reportDate}>Date: {report.date}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return renderDashboard();
      case "Bays":
        return renderBayManagement();
      case "Reports":
        return renderReports();
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Dispatcher Dashboard</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {renderTabButton("Dashboard", "dashboard")}
        {renderTabButton("Bays", "build")}
        {renderTabButton("Reports", "bar-chart")}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {renderContent()}
      </ScrollView>
    </View>
  );
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  header: {
    paddingVertical: 18,
    backgroundColor: "#0066cc",
    alignItems: "center",
  },
  headerText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "bold",
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#e9e9e9",
    paddingVertical: 10,
  },
  tabButton: {
    alignItems: "center",
    padding: 8,
    borderRadius: 10,
    flexDirection: "row",
    gap: 5,
  },
  activeTabButton: {
    backgroundColor: "#0066cc",
  },
  tabText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "500",
  },
  activeTabText: {
    color: "#fff",
  },
  contentContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  cardText: {
    fontSize: 16,
    marginVertical: 4,
  },
  bayCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  bayName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  bayStatus: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
    width: "80%",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modalStatus: {
    fontSize: 16,
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: "#0066cc",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  reportCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  reportDate: {
    fontSize: 14,
    color: "#666",
  },
});
