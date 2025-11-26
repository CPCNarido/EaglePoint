import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface InfoPanelProps {
  num: number;
  details: any;
  now: Date;
  // optional horizontal offset (px) to nudge the panel left/right
  offsetX?: number;
}

export default function InfoPanel({ num, details, now, offsetX }: InfoPanelProps) {
  const computeRemaining = () => {
    try {
      const raw = details?.raw ?? details;
      // Prefer end_time (timed session) — show remaining countdown.
      const end = raw?.end_time ? new Date(raw.end_time) : (raw?.assignment_end_time ? new Date(raw.assignment_end_time) : null);
      const formatMsForDisplay = (ms: number) => {
        try {
          if (ms <= 0) return 'Expired';
          const totalSecs = Math.floor(ms / 1000);
          if (totalSecs >= 3600) {
            const hrs = Math.floor(totalSecs / 3600);
            const rem = totalSecs % 3600;
            const mins = Math.floor(rem / 60);
            const secs = rem % 60;
            const hh = String(hrs).padStart(2, '0');
            const mm = String(mins).padStart(2, '0');
            const ss = String(secs).padStart(2, '0');
            return `${hh}:${mm}:${ss} hr`;
          }
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          const mm = String(mins).padStart(2, '0');
          const ss = String(secs).padStart(2, '0');
          return `${mm}:${ss} mins`;
        } catch (e) { void e; return '—'; }
      };

      if (end) {
        const ms = end.getTime() - now.getTime();
        if (ms <= 0) return 'Remaining: Expired';
        return `Remaining: ${formatMsForDisplay(ms)}`;
      }

      // If there's a stopwatch-style start_time and no end_time, show elapsed Time: mm:ss (or hr)
      const startStr = raw?.start_time ?? details?.player?.start_time ?? null;
      if (startStr) {
        const start = new Date(startStr);
        const elapsedMs = now.getTime() - start.getTime();
        if (elapsedMs <= 0) return 'Time: 0:00';
        return `Time: ${formatMsForDisplay(elapsedMs)}`;
      }

      // If start_time is not yet persisted but we already have at least one
      // delivered bucket reported (total_balls / bucket_count), treat the
      // session as started locally so the UI shows a running timer. Add a
      // 30s offset to reflect the grace period applied by the backend.
      try {
        const balls = Number(raw?.total_balls ?? raw?.balls_used ?? raw?.bucket_count ?? details?.ballsUsed ?? details?.total_balls ?? 0) || 0;
        if (balls >= 1) {
          const estimatedStart = new Date(Date.now() - 30 * 1000);
          const elapsedMs = now.getTime() - estimatedStart.getTime();
          if (elapsedMs <= 0) return 'Time: 0:00';
          return `Time: ${formatMsForDisplay(elapsedMs)}`;
        }
      } catch (_e) { void _e; }
    } catch (_e) { void _e; }
    return '—';
  };

  const player = details?.player ?? (details?.player_name ?? '—');
  const ballsUsed = details?.ballsUsed ?? details?.total_balls ?? details?.bucket_count ?? details?.transactions_count ?? '—';

  // allow small horizontal nudges so the panel avoids clipping near edges
  const translateBase = -80 + (offsetX ?? 0);
  const panelTransform = [{ translateX: translateBase }];

  return (
    <View style={[localStyles.infoPanel, { transform: panelTransform }]} pointerEvents="box-none">
      <View style={localStyles.infoCard}>
        <Text style={localStyles.infoTitle}>Bay {num}</Text>
        <Text style={localStyles.infoRow}><Text style={{ fontWeight: '700' }}>Player: </Text>{player}</Text>
        <Text style={localStyles.infoRow}><Text style={{ fontWeight: '700' }}>{/* label included in computeRemaining */}</Text>{computeRemaining()}</Text>
        <Text style={localStyles.infoRow}><Text style={{ fontWeight: '700' }}>Balls used: </Text>{String(ballsUsed)}</Text>
      </View>

  {/* outlined caret: black border (largest), inner black ring, then white center to create a bordered caret */}
  <View style={[localStyles.caretWrapper, { transform: [{ translateX: -(offsetX ?? 0) }] }]} pointerEvents="none">
    <View style={localStyles.infoCaretBorder} />
    <View style={localStyles.infoCaretInnerBorder} />
    <View style={localStyles.infoCaretInner} />
  </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  infoPanel: { position: 'absolute', bottom: 56, left: '50%', transform: [{ translateX: -80 }], zIndex: 99999, alignItems: 'center' },
  // legacy top caret (unused) kept for reference
  infoCaret: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#333', marginBottom: -1, zIndex: 100000 },
  // caret border (black) placed below the info card (largest)
  infoCaretBorder: { width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderTopWidth: 12, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#000', marginTop: -6, zIndex: 100000 },
  // inner black ring slightly smaller than the outer border to create a visible outline
  infoCaretInnerBorder: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#000', marginTop: -12, zIndex: 100001 },
  // inner caret (white) slightly smaller and positioned over the border to create an outlined look
  infoCaretInner: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff', marginTop: -12, zIndex: 100002 },
  caretWrapper: { position: 'relative', alignItems: 'center', zIndex: 100000 },
  infoCard: { minWidth: 160, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 12, borderWidth: 1, borderColor: '#E6E6E6' },
  infoTitle: { fontWeight: '800', color: '#17321d', marginBottom: 6 },
  infoRow: { fontSize: 13, color: '#333', marginBottom: 4 },
});
