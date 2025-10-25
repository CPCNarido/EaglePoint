import React from "react";
import { View, Text, StyleSheet } from "react-native";

const DetailedSessionReport: React.FC = () => {
  const sessions = [
    { id: "S-1001", name: "John Doe", bay: 15, type: "Timed", duration: "2hrs 30mins", buckets: 5, staff: "Cashier - A" },
    { id: "S-1002", name: "John Doe", bay: 15, type: "Timed", duration: "2hrs 30mins", buckets: 5, staff: "Cashier - A" },
    { id: "M-1002", name: "M", bay: 1, type: "Open Time", duration: "3hrs", buckets: 8, staff: "Dispatcher - B" },
    { id: "M-1003", name: "M", bay: 1, type: "Open Time", duration: "3hrs", buckets: 6, staff: "Dispatcher - B" },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Detailed Session Report</Text>
      <View style={styles.tableHeader}>
        <Text style={styles.headerCell}>Session ID</Text>
        <Text style={styles.headerCell}>Player Name</Text>
        <Text style={styles.headerCell}>Bay</Text>
        <Text style={styles.headerCell}>Type</Text>
        <Text style={styles.headerCell}>Duration</Text>
        <Text style={styles.headerCell}>Buckets</Text>
        <Text style={styles.headerCell}>Cashier/Dispatcher</Text>
      </View>

      {sessions.map((s, i) => (
        <View key={i} style={styles.tableRow}>
          <Text style={styles.cell}>{s.id}</Text>
          <Text style={styles.cell}>{s.name}</Text>
          <Text style={styles.cell}>{s.bay}</Text>
          <Text style={styles.cell}>{s.type}</Text>
          <Text style={styles.cell}>{s.duration}</Text>
          <Text style={styles.cell}>{s.buckets}</Text>
          <Text style={styles.cell}>{s.staff}</Text>
        </View>
      ))}
    </View>
  );
};

export default DetailedSessionReport;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e7e7e7",
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerCell: {
    flex: 1,
    fontWeight: "600",
    textAlign: "center",
    fontSize: 13,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#ddd",
  },
  cell: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
  },
});
