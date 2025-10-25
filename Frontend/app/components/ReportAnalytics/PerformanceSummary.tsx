import React from "react";
import { View, Text, StyleSheet } from "react-native";

const PerformanceSummary: React.FC = () => {
  const summaryData = [
    { title: "Total Session", value: "1,250", change: "+12.5%" },
    { title: "Total Buckets Dispensed", value: "5,620", change: "-12.5%" },
    { title: "Total Play Duration", value: "2,800 Hrs", change: "+12.5%" },
    { title: "Bay Utilization Rate", value: "78%", change: "-12.5%" },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Performance Summary</Text>
      <View style={styles.row}>
        {summaryData.map((item, i) => (
          <View key={i} style={styles.box}>
            <Text style={styles.label}>{item.title}</Text>
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.change}>{item.change} vs Last Period</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export default PerformanceSummary;

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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  box: {
    backgroundColor: "#fafafa",
    borderRadius: 8,
    padding: 14,
    width: "48%",
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: "#555",
  },
  value: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 4,
  },
  change: {
    fontSize: 12,
    color: "#5b8c45",
  },
});
