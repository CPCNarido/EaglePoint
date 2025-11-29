import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function BallHandlerHeader({
  title = 'Ball Handler',
  subtitle,
  totalDelivered,
}: {
  title?: string;
  subtitle?: string;
  totalDelivered?: number | null;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.right}>
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>Total Bucket Delivered: {totalDelivered ?? '—'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#DADFD6', marginBottom: 12 },
  left: { flex: 1 },
  right: {},
  title: { fontSize: 28, fontWeight: '700', color: '#1f3b2d' },
  subtitle: { color: '#666', marginTop: 4 },
  badge: { backgroundColor: '#E6F8EE', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  badgeTxt: { color: '#1f7a3a', fontWeight: '700' },
});
