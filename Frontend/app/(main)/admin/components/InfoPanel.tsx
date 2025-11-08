import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface InfoPanelProps {
  num: number;
  details: any;
  now: Date;
}

export default function InfoPanel({ num, details, now }: InfoPanelProps) {
  const computeRemaining = () => {
    try {
      const raw = details?.raw ?? details;
      // Prefer end_time (timed session) — show remaining countdown.
      const end = raw?.end_time ? new Date(raw.end_time) : (raw?.assignment_end_time ? new Date(raw.assignment_end_time) : null);
      if (end) {
        const ms = end.getTime() - now.getTime();
        if (ms > 0) {
          const mins = Math.floor(ms / (1000 * 60));
          const secs = Math.floor((ms % (1000 * 60)) / 1000);
          return `Remaining: ${mins}m ${secs}s`;
        }
        return 'Remaining: 0m 0s';
      }

      // If there's a stopwatch-style start_time and no end_time, show elapsed Time: mm:ss
      const startStr = raw?.start_time ?? details?.player?.start_time ?? null;
      if (startStr) {
        const start = new Date(startStr);
        const elapsedMs = now.getTime() - start.getTime();
        if (elapsedMs <= 0) return 'Time: 0:00';
        const totalSecs = Math.floor(elapsedMs / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `Time: ${mins}:${secs.toString().padStart(2, '0')}`;
      }
    } catch (e) { void e; }
    return '—';
  };

  const player = details?.player ?? (details?.player_name ?? '—');
  const ballsUsed = details?.ballsUsed ?? details?.total_balls ?? details?.bucket_count ?? details?.transactions_count ?? '—';

  return (
    <View style={localStyles.infoPanel} pointerEvents="box-none">
      <View style={localStyles.infoCaret} />
      <View style={localStyles.infoCard}>
        <Text style={localStyles.infoTitle}>Bay {num}</Text>
        <Text style={localStyles.infoRow}><Text style={{ fontWeight: '700' }}>Player: </Text>{player}</Text>
  <Text style={localStyles.infoRow}><Text style={{ fontWeight: '700' }}>{/* label included in computeRemaining */}</Text>{computeRemaining()}</Text>
        <Text style={localStyles.infoRow}><Text style={{ fontWeight: '700' }}>Balls used: </Text>{String(ballsUsed)}</Text>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  infoPanel: { position: 'absolute', bottom: 56, left: '50%', transform: [{ translateX: -80 }], zIndex: 50, alignItems: 'center' },
  infoCaret: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff', marginBottom: -1 },
  infoCard: { minWidth: 160, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 8, borderWidth: 1, borderColor: '#E6E6E6' },
  infoTitle: { fontWeight: '800', color: '#17321d', marginBottom: 6 },
  infoRow: { fontSize: 13, color: '#333', marginBottom: 4 },
});
