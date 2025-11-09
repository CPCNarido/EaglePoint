import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DispatcherHeader({
  title,
  subtitle,
  counts,
  assignedBays,
  showBadges = true,
}: {
  title: string;
  subtitle?: string;
  counts?: { availableBays?: number; totalBays?: number; servicemenAvailable?: number; servicemenTotal?: number; waitingQueue?: number };
  assignedBays?: number[] | null;
  showBadges?: boolean;
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.left}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {showBadges ? (
          <View style={styles.badgeRow} pointerEvents="none">
            <View style={styles.badge} pointerEvents="auto">
              <Text style={styles.badgeText}>Available Bays: {counts?.availableBays != null ? `${counts?.availableBays}/${counts?.totalBays ?? '-'} ` : '-'}</Text>
            </View>
            <View style={styles.badge} pointerEvents="auto">
              <Text style={styles.badgeText}>Serviceman: {counts?.servicemenAvailable != null ? `${counts?.servicemenAvailable}/${counts?.servicemenTotal ?? '-'} ` : '-'}</Text>
            </View>
            <View style={styles.badge} pointerEvents="auto">
              <Text style={styles.badgeText}>Waiting Queue: {counts?.waitingQueue != null ? String(counts.waitingQueue) : '-'}</Text>
            </View>
          </View>
        ) : null}
      </View>
      {/* underline divider below header to match design */}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left: { flexDirection: 'column' },
  title: { fontSize: 20, fontWeight: '700', color: '#1c2b1d' },
  subtitle: { color: '#6b6b6b', marginTop: 4 },
  badgeRow: { flexDirection: 'row' },
  badge: { backgroundColor: '#e6f0e5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#c8e0c3', marginLeft: 8 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#314c31' },
  divider: { height: 1, backgroundColor: '#e6e6e6', marginTop: 12 },
});
