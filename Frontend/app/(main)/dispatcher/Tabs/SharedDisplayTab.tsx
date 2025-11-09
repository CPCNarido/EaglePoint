import React from "react";
import { View, Text, StyleSheet } from "react-native";
import DispatcherHeader from "../DispatcherHeader";

export default function SharedDisplayTab({ userName, counts, assignedBays }: { userName?: string; counts?: { availableBays?: number; totalBays?: number; servicemenAvailable?: number; servicemenTotal?: number; waitingQueue?: number }; assignedBays?: number[] | null }) {
  return (
    <View style={styles.container}>
      <DispatcherHeader title="Shared Display" subtitle={userName ? `Dispatcher ${userName}` : 'Dispatcher'} counts={counts} assignedBays={assignedBays} showBadges={true} />
      <Text style={styles.text}>This tab controls the shared screen output.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'column' },
  title: { fontSize: 20, fontWeight: '700', color: '#1c2b1d' },
  headerSubtitle: { color: '#6b6b6b', marginTop: 4 },
  headerDivider: { height: 1, backgroundColor: '#e6e6e6', marginBottom: 16, marginTop: 6 },
  text: { color: '#666', marginTop: 8 },
});
