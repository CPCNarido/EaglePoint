import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function SharedDisplayTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shared Display</Text>
      <Text style={styles.text}>This tab controls the shared screen output.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold" },
  text: { color: "#666", marginTop: 8 },
});
