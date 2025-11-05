import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { legendMatchesStatus } from '../../utils/uiHelpers';

interface LegendProps {
  color: string;
  label: string;
  legendFilter: string[];
  setLegendFilter: (fn: (prev: string[]) => string[]) => void;
  overview?: any;
}

export default function Legend({ color, label, legendFilter, setLegendFilter, overview }: LegendProps) {
  const selected = legendFilter.includes(label);
  const toggle = () => {
    setLegendFilter((prev) => {
      if (prev.includes(label)) return prev.filter((l) => l !== label);
      return [...prev, label];
    });
  };
  const count = (() => {
    if (!overview || !overview.bays) return 0;
    return (overview.bays as any[]).filter((b) => legendMatchesStatus([label], b?.status ?? null)).length;
  })();

  return (
    <TouchableOpacity onPress={toggle} style={[localStyles.legendItem, selected ? localStyles.legendItemSelected : null]}>
      <View style={[localStyles.legendColor, { backgroundColor: color }]} />
      <Text style={[localStyles.legendText, selected ? localStyles.legendTextSelected : null]}>{label}</Text>
      <View style={localStyles.legendCountBadge}>
        <Text style={localStyles.legendCountText}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const localStyles = StyleSheet.create({
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendColor: { width: 16, height: 16, borderRadius: 3, marginRight: 6 },
  legendText: { fontSize: 12, color: '#333' },
  legendItemSelected: { backgroundColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  legendTextSelected: { fontWeight: '700', color: '#111' },
  legendCountBadge: { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  legendCountText: { fontSize: 11, color: '#333' },
});
