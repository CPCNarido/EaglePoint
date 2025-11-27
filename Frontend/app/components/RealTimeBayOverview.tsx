import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, useWindowDimensions, Platform } from 'react-native';
import Legend from '../(main)/admin/components/Legend';
import InfoPanel from '../(main)/admin/components/InfoPanel';
import { clamp, getColorFromStatus, legendMatchesStatus } from '../(main)/utils/uiHelpers';

interface Props {
  overview?: any;
  settings?: any;
  highlightedBays?: number[];
}

export default function RealTimeBayOverview({ overview, settings, highlightedBays = [] }: Props) {
  const total = Number(settings?.totalAvailableBays ?? 45);
  const bayAnimMap = useRef<Record<string, Animated.Value>>({});
  const [legendFilter, setLegendFilter] = useState<string[]>([]);
  const [showSessionLegend, setShowSessionLegend] = useState<boolean>(false);
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [selectedBayDetails, setSelectedBayDetails] = useState<any>(null);
  const [bayContainerWidth, setBayContainerWidth] = useState<number>(0);

  const { width, height } = useWindowDimensions();
  const isTablet = Math.max(width, height) >= 900;
  const isLargeTablet = width >= 1800 || height >= 1200;

  // responsive reserved badge sizing
  const badgeScale = clamp(width / 1200, 0.9, 1.3);
  const baseBadgeFont = isLargeTablet ? 14 : isTablet ? 12 : 10;
  const responsiveBadgeFontSize = Math.round(baseBadgeFont * badgeScale);
  const nudgeLeftPx = 8;
  const badgeFontOffsetPx = -4;
  const badgeMinWidth = 50;
  const badgeMinHeight = 15;
  const BAY_BOX_TOTAL = 45;
  const baseRight = isLargeTablet ? -18 : isTablet ? -12 : -8;
  const adjustedBadgeRight = baseRight + nudgeLeftPx;

  const inferSessionType = (b: any) => {
    try {
      // Prefer explicit session_type if provided by server
      if (b?.session_type) return b.session_type;
      const original = String(b?.originalStatus ?? b?.status ?? '');
      if (original === 'SpecialUse') return 'Reserved';
      const start = b?.start_time ?? (b?.player && (b.player as any).start_time) ?? null;
      const end = b?.end_time ?? b?.assignment_end_time ?? null;
      const hasPlayer = !!(b?.player && (b.player.nickname || b.player.player_id));
      if (hasPlayer && start && !end) return 'Open';
      if (end) return 'Timed';
      return null;
    } catch (_e) { void _e; return null; }
  };

  // Helper: determine whether a bay/session should be considered started
  // Consider session started only if there's at least one delivered ball.
  const isSessionStarted = (b: any) => {
    try {
      if (!b) return false;
      const balls = Number(b.total_balls ?? b.balls_used ?? b.bucket_count ?? b.transactions_count ?? 0) || 0;
      return balls >= 1;
    } catch (_e) { void _e; return false; }
  };

  const getAdminBayColor = (b: any) => {
    try {
      if (showSessionLegend) {
        const original = String(b?.originalStatus ?? b?.status ?? '');
        const stype = b?.session_type ?? inferSessionType(b);
        if (stype === 'Open') return '#BF930E';
        if (stype === 'Timed') {
          if (isSessionStarted(b)) return '#D18B3A';
          return '#A3784E';
        }
        if (original === 'SpecialUse') return '#6A1B9A';
        return '#2E7D32';
      }
      return getColorFromStatus(String(b?.status ?? 'Available'));
    } catch (_e) { void _e; return '#2E7D32'; }
  };

  useEffect(() => {
    // animate overlays when filters/overview changes
    const animations: Animated.CompositeAnimation[] = [];
    for (let i = 1; i <= total; i++) {
      const key = `bay-${i}`;
      const bayData = overview?.bays?.find((x: any) => String(x.bay_number) === String(i) || String(x.bay_id) === String(i));
      const statusToMatch = showSessionLegend ? (bayData?.session_type ?? inferSessionType(bayData)) : (bayData?.status ?? null);
      const isActive = legendMatchesStatus(legendFilter, statusToMatch ?? null);
      if (!bayAnimMap.current[key]) bayAnimMap.current[key] = new Animated.Value(isActive ? 1 : 0);
      animations.push(Animated.timing(bayAnimMap.current[key], { toValue: isActive ? 1 : 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }));
    }
    if (animations.length) Animated.parallel(animations).start();
  }, [legendFilter, overview, total]);

  const handlePressBay = (num: number, b: any) => {
    if (selectedBay === num) {
      setSelectedBay(null);
      setSelectedBayDetails(null);
    } else {
      // Normalize player to a string for InfoPanel (avoid passing objects as React children)
      let player: string | null = null;
      try {
        if (b?.player_name) player = String(b.player_name);
        else if (typeof b?.player === 'string') player = b.player;
        else if (b?.player) {
          player = String(b.player.nickname ?? b.player.full_name ?? b.player.name ?? b.player.player_id ?? '');
        } else if (b?.playerName) player = String(b.playerName);
      } catch (_e) { void _e; player = null; }
      const ballsUsed = b?.total_balls ?? b?.balls_used ?? b?.bucket_count ?? b?.transactions_count ?? null;
      setSelectedBay(num);
      setSelectedBayDetails({ player: player ?? '—', ballsUsed: ballsUsed ?? '—', raw: b });
    }
  };

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10 }}>Real-Time Bay Overview</Text>
        <TouchableOpacity style={{ backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }} onPress={() => setLegendFilter([])}>
          <Text style={{ color: '#444', fontWeight: '700' }}>Clear</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', marginTop: 10, marginBottom: 10 }} onLayout={(e: any) => setBayContainerWidth(e.nativeEvent.layout.width)}>
        {overview && overview.bays && overview.bays.length > 0 ? (
          Array.from({ length: total }).map((_, i) => {
            const num = i + 1;
            const numStr = String(num);
            const b = overview.bays.find((x: any) => String(x.bay_number) === numStr || String(x.bay_id) === numStr);
            const original = b?.originalStatus ?? null;
            const status = showSessionLegend ? (b?.session_type ?? inferSessionType(b)) : (b?.status ?? null);
            const isHighlighted = (highlightedBays || []).includes(num);
            const isLegendActive = legendMatchesStatus(legendFilter, status ?? null);
            const bayColor = getAdminBayColor(b);
            const bayBoxDynamic = isLegendActive ? { backgroundColor: bayColor, borderColor: bayColor } : { borderColor: bayColor };
            const animKey = `bay-${num}`;
            let anim = bayAnimMap.current[animKey];
            if (!anim) {
              anim = new Animated.Value(isLegendActive ? 1 : 0);
              bayAnimMap.current[animKey] = anim;
            }

            const cols = bayContainerWidth ? Math.max(1, Math.min(14, Math.floor(bayContainerWidth / BAY_BOX_TOTAL))) : 4;
            const colIndex = (num - 1) % cols;
            let offsetX = 0;
            if (colIndex === 0) offsetX = 40;
            else if (colIndex === cols - 1) offsetX = -40;

            return (
              <TouchableOpacity key={b?.bay_id ?? `bay-${num}`} onPress={() => handlePressBay(num, b)} activeOpacity={0.9} style={[{ width: 45, height: 45, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9F9F9', margin: 3 }, bayBoxDynamic, ...(isHighlighted ? [{ borderWidth: 3, shadowColor: '#00BFA5', shadowOpacity: 0.3 }] : []), ...(selectedBay === num ? [{ borderWidth: 3, borderColor: '#FFD54F', shadowColor: '#FFD54F', shadowOpacity: 0.35 }] : [])]}>
                <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bayColor, borderRadius: 8, opacity: anim }} />
                <Text style={[{ fontWeight: '700' }, isLegendActive ? { color: '#fff', fontWeight: '700' } : { color: bayColor }]}>{num}</Text>
                {original === 'SpecialUse' && (
                  <View style={[{ position: 'absolute', top: -8, right: -8, backgroundColor: '#7C0A02', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6 }, isLargeTablet ? { top: -18, right: -18 } : isTablet ? { top: -8, right: -12 } : {} , { right: adjustedBadgeRight, minWidth: badgeMinWidth, minHeight: badgeMinHeight }]}>
                    <Text style={[{ color: '#fff', fontSize: 11, fontWeight: '900', textAlign: 'center' }, isLargeTablet ? { fontSize: 14, fontWeight: '800' } : isTablet ? { fontSize: 12 } : {}, { fontSize: responsiveBadgeFontSize + badgeFontOffsetPx } ]}>Reserved</Text>
                  </View>
                )}

                {selectedBay === num && selectedBayDetails && (
                  <>
                    <View style={{ position: 'absolute', top: -10, left: '50%', marginLeft: -8, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#000', zIndex: 9999 }} pointerEvents="none" />
                    <InfoPanel num={num} details={selectedBayDetails} now={new Date()} offsetX={offsetX} />
                  </>
                )}
              </TouchableOpacity>
            );
          })
        ) : (
          Array.from({ length: total }).map((_, i) => {
            const num = i + 1;
            const status = getColorFromStatus('Available');
            const animKey = `bay-${num}`;
            let anim = bayAnimMap.current[animKey];
            if (!anim) { anim = new Animated.Value(0); bayAnimMap.current[animKey] = anim; }
            return (
              <View key={i} style={{ width: 45, height: 45, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9F9F9', margin: 3, borderColor: status }}>
                <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: status, borderRadius: 8, opacity: anim }} />
                <Text style={{ fontWeight: '700', color: status }}>{num}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <View style={{ marginRight: 8, alignItems: 'flex-start' }}>
          <TouchableOpacity onPress={() => { setShowSessionLegend((s) => { const next = !s; setLegendFilter([]); return next; }); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#F4F4F2' }}>
            <Text style={{ marginLeft: 8, color: '#17321d', fontWeight: '700' }}>{showSessionLegend ? 'Session Type' : 'Assignment'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', flex: 1 }}>
          {showSessionLegend ? (
            <>
              <Legend color="#BF930E" label="Open Time" legendFilter={legendFilter} setLegendFilter={setLegendFilter} overview={overview} />
              <Legend color="#D18B3A" label="Timed Session" legendFilter={legendFilter} setLegendFilter={setLegendFilter} overview={overview} />
              <Legend color="#6A1B9A" label="Reserved" legendFilter={legendFilter} setLegendFilter={setLegendFilter} overview={overview} />
            </>
          ) : (
            <>
              <Legend color="#2E7D32" label="Available" legendFilter={legendFilter} setLegendFilter={setLegendFilter} overview={overview} />
              <Legend color="#A3784E" label="Assigned" legendFilter={legendFilter} setLegendFilter={setLegendFilter} overview={overview} />
            </>
          )}
        </View>
      </View>
    </>
  );
}
