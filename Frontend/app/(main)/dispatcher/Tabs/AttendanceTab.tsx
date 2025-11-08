import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AttendanceTab({ userName }: { userName?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Attendance</Text>
          <Text style={styles.headerSubtitle}>{userName ? `Dispatcher ${userName}` : 'Dispatcher'}</Text>
        </View>
      </View>
      <View style={styles.headerDivider} />

      <Text style={styles.sub}>This tab will show attendance and shift controls.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'column' },
  title: { fontSize: 20, fontWeight: '700', color: '#1c2b1d', marginBottom: 8 },
  headerSubtitle: { color: '#6b6b6b', marginTop: 4 },
  headerDivider: { height: 1, backgroundColor: '#e6e6e6', marginBottom: 16, marginTop: 6 },
  sub: { color: '#666' },
});
