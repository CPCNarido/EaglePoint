import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function SessionControlTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session Control</Text>
      <Text style={styles.text}>Manage player sessions here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold" },
  text: { color: "#666", marginTop: 8 },
});
