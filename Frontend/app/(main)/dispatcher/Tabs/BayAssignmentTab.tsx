import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function BayAssignmentTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bay Assignment</Text>
      <Text style={styles.text}>This is where bay assignments will be managed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold" },
  text: { color: "#666", marginTop: 8 },
});
