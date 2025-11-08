import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AttendanceTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.sub}>This tab will show attendance and shift controls.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', color: '#1c2b1d', marginBottom: 8 },
  sub: { color: '#666' },
});
