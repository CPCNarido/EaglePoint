import React from "react";
import { View, Text, StyleSheet } from "react-native";

const OperationalTrends: React.FC = () => {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Operational Trends</Text>
      <Text style={styles.placeholder}>
        📊 Chart placeholders (Timed vs Open, Bay Usage, Volume Over Time)
      </Text>
    </View>
  );
};

export default OperationalTrends;

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
  placeholder: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    paddingVertical: 40,
  },
});
