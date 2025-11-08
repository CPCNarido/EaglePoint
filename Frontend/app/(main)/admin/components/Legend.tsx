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
  // For session-type legend labels, prefer the assignment's typed session_type when available
  const sessionLabels = ['Open Time', 'Open Time Session', 'Timed Session', 'Reserved'];
    return (overview.bays as any[]).filter((b) => {
      const isSessionLabel = sessionLabels.includes(label);
      const compareValue = isSessionLabel ? (b?.session_type ?? null) : (b?.status ?? null);
      // If no typed session_type is present for a bay, fall back to a best-effort inference
      if (isSessionLabel && !compareValue) {
        // inference: if bay has a player with start_time and no end_time => Open, else Timed; reserved when originalStatus is SpecialUse
        const inferred = (() => {
          if (b?.originalStatus === 'SpecialUse' || b?.status === 'SpecialUse') return 'Reserved';
          const hasPlayer = !!(b?.player && (b.player.nickname || b.player.player_id));
          const hasStart = !!(b?.start_time);
          const hasEnd = !!(b?.end_time || b?.assignment_end_time);
          if (hasPlayer && hasStart && !hasEnd) return 'Open';
          if (hasEnd) return 'Timed';
          return null;
        })();
        return legendMatchesStatus([label], inferred);
      }
      return legendMatchesStatus([label], compareValue ?? null);
    }).length;
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
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  legendColor: { width: 16, height: 16, borderRadius: 3, marginRight: 6 },
  legendText: { fontSize: 12, color: '#333' },
  legendItemSelected: { backgroundColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  legendTextSelected: { fontWeight: '700', color: '#111' },
  legendCountBadge: { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  legendCountText: { fontSize: 11, color: '#333' },
});
