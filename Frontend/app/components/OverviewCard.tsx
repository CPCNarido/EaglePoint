import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type OverviewItem = { title: string; value: string; subtitle: string; color: string };

export default function OverviewCard({ title, value, subtitle, color }: OverviewItem) {
  return (
    <View style={[localStyles.overviewCard, { borderLeftColor: color }]}>
      <Text style={localStyles.overviewLabel}>{title}</Text>
      <Text style={[localStyles.overviewValue, { color }]}>{value}</Text>
      <Text style={localStyles.overviewSubtitle}>{subtitle}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  overviewCard: {
    backgroundColor: '#F4F8F3',
    borderRadius: 10,
    padding: 15,
    flex: 1,
    minWidth: '45%',
    borderLeftWidth: 5,
  },
  overviewLabel: { fontSize: 13, color: '#555' },
  overviewValue: { fontSize: 20, fontWeight: '700', marginTop: 5 },
  overviewSubtitle: { fontSize: 12, color: '#777', marginTop: 4 },
});
