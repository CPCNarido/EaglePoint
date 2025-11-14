import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CashierHeader({ title, userName, showDate = true }: { title?: string; userName?: string; showDate?: boolean }) {
  const now = new Date();
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{title ?? 'Cashier'}</Text>
          <Text style={styles.subtitle}>{`Welcome back, ${userName ?? 'Cashier'}!`}</Text>
        </View>
        {showDate ? (
          <View>
            <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
            <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700', color: '#2E3B2B' },
  subtitle: { color: '#666', marginBottom: 6 },
  dateText: { textAlign: 'right', fontSize: 12, color: '#555' },
  divider: { height: 1, backgroundColor: '#ccc', marginVertical: 10 },
});
