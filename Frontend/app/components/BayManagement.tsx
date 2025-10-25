import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { tw } from "react-native-tailwindcss";

export default function BayManagement() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const bays = [
    { bayNo: 5, player: "John Marston", session: "Timed Session", time: "12:00 AM - 02:30 PM" },
    { bayNo: 7, player: "Maintenance", session: "N/A", time: "N/A" },
    { bayNo: 2, player: "Christian Narido", session: "Open Time", time: "1:00 PM" },
    { bayNo: 5, player: "John Marston", session: "Timed Session", time: "12:00 AM - 02:30 PM" },
    { bayNo: 7, player: "Maintenance", session: "N/A", time: "N/A" },
    { bayNo: 2, player: "Christian Narido", session: "Open Time", time: "1:00 PM" },
  ];

  const getColor = (sessionType: string) => {
    if (sessionType === "N/A") return "#C62828"; // Maintenance - Red
    if (sessionType === "Open Time") return "#BF930E"; // Open Time - Yellow
    if (sessionType === "Timed Session") return "#2E7D32"; // Timed Session - Green
    return "#333";
  };

  return (
    <ScrollView style={[tw.flex1, { backgroundColor: "#F6F6F2" }]}>
      <View style={[styles.container]}>
        <Text style={styles.pageTitle}>Bay Management</Text>
        <Text style={styles.subTitle}>Welcome back, Admin!</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Real-Time Bay Monitoring */}
        <Text style={styles.sectionTitle}>Real - Time Bay Monitoring</Text>

        <View style={styles.searchFilterRow}>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color="#555" style={{ marginHorizontal: 8 }} />
            <TextInput
              placeholder="Search by Name or Bay No."
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              placeholderTextColor="#888"
            />
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Text style={styles.filterText}>Filter by {filter}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Table */}
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 1 }]}>Bay No.</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>Player</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>Session Type</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>Time Range</Text>
          </View>

          {bays.map((bay, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1, color: getColor(bay.session) }]}>
                {bay.bayNo}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, color: getColor(bay.session) }]}>
                {bay.player}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, color: getColor(bay.session) }]}>
                {bay.session}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, color: getColor(bay.session) }]}>
                {bay.time}
              </Text>
            </View>
          ))}
        </View>

        {/* Override Section */}
        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>
          Session Override & Direct Control
        </Text>
        <Text style={styles.sectionDescription}>
          Use this panel to manually adjust bay status, end sessions, or perform maintenance overrides.
        </Text>

        <View style={styles.overrideBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Choose Bay</Text>
            <TouchableOpacity style={styles.dropdown}>
              <Text style={styles.dropdownText}>Choose or Type in Bay Number</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Select Action</Text>
            <TouchableOpacity style={styles.dropdown}>
              <Text style={styles.dropdownText}>Select Action to be done</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.overrideButton}>
            <Text style={styles.overrideButtonText}>Override</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2E3B2B",
  },
  subTitle: { color: "#666", marginBottom: 10 },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2E3B2B",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: "#555",
    marginBottom: 10,
  },
  searchFilterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 5,
    flex: 1,
    height: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#333" },
  filterButton: {
    backgroundColor: "#D5E2C6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    height: 40,
    marginLeft: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  filterText: { fontSize: 14, color: "#333", marginRight: 4 },
  tableContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    padding: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#E9F0E4",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#C8D1C1",
  },
  headerCell: {
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    color: "#2E3B2B",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingVertical: 8,
  },
  tableCell: {
    textAlign: "center",
    fontSize: 13,
    color: "#333",
  },
  overrideBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 5, color: "#333" },
  dropdown: {
    backgroundColor: "#F8F8F8",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: "#D8D8D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { color: "#555", fontSize: 13 },
  overrideButton: {
    backgroundColor: "#7C0A02",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    height: 40,
    justifyContent: "center",
  },
  overrideButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
