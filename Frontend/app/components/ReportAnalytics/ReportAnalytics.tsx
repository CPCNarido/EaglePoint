import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import ReportExportTool from "./ReportExportTool";
import PerformanceSummary from "./PerformanceSummary";
import OperationalTrends from "./OperationalTrends";
import DetailedSessionReport from "./DetailedSessionReport";

const ReportAnalytics: React.FC = () => {
  return (
    <ScrollView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Reports & Analytics</Text>
        <Text style={styles.subtitle}>Admin Josh</Text>
        <Text style={styles.date}>October 18, 2025 — 15:30 PM</Text>
      </View>

      {/* Sections */}
      <ReportExportTool />
      <PerformanceSummary />
      <OperationalTrends />
      <DetailedSessionReport />
      <ReportExportTool />
    </ScrollView>
  );
};

export default ReportAnalytics;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f3",
    padding: 24,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1b1b1b",
  },
  subtitle: {
    fontSize: 16,
    color: "#5b5b5b",
  },
  date: {
    fontSize: 14,
    color: "#767676",
    marginTop: 4,
  },
});

