import React from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';

export default function DispatcherHeader({
  title,
  subtitle,
  counts,
  assignedBays,
  showBadges = true,
  showBanner = false,
  bannerSource,
}: {
  title: string;
  subtitle?: string;
  counts?: { availableBays?: number; totalBays?: number; servicemenAvailable?: number; servicemenTotal?: number; waitingQueue?: number };
  assignedBays?: number[] | null;
  showBadges?: boolean;
  showBanner?: boolean;
  bannerSource?: any;
}) {
  // derive a short name when subtitle may contain the role (e.g. "Dispatcher Anne")
  const shortName = (() => {
    try {
      if (!subtitle) return '';
      const m = String(subtitle).match(/^Dispatcher\s+(.+)$/);
      if (m && m[1]) return m[1];
      return subtitle;
    } catch {
      return subtitle ?? '';
    }
  })();
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
      {/* optional banner below header (Dashboard uses this) */}
    {showBanner ? (
      <View style={styles.bannerWrapper}>
        {/* right-side green panel sits behind the image and shows through transparent pixels */}
        <View style={styles.bannerGreenPanel} />
        <ImageBackground source={bannerSource ?? { uri: 'https://via.placeholder.com/1200x180/17321d/ffffff?text=Eagle+Point' }} style={styles.banner} resizeMode="cover" imageStyle={{ borderRadius: 10, backgroundColor: 'transparent', opacity: 1 }}>
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerTitle}>{shortName ? `Welcome back, Dispatcher ${shortName}` : `Welcome back, Dispatcher`}</Text>
            <View>
              <Text style={styles.bannerDate}>{new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              <Text style={styles.bannerTime}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          </View>
        </ImageBackground>
      </View>
    ) : (
      <View style={styles.divider} />
    )}
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
    // Match Admin banner sizing and spacing
    // Wrapper holds an absolutely-positioned green panel on the right and the
    // ImageBackground sits above it. The ImageBackground uses imageStyle
    // borderRadius so the image corners remain rounded.
    bannerWrapper: { position: 'relative', width: '100%', height: 190, marginBottom: 8 },
    banner: { width: '100%', height: 190, borderRadius: 10, marginBottom: 8, backgroundColor: 'transparent', overflow: 'hidden' },
    // Right-side green accent (shows through transparent pixels of the image)
    bannerGreenPanel: { position: 'absolute', top: 65, right: 0, bottom: 0, width: '100%',height:'65%', backgroundColor: '#17321d', borderRadius: 10 },
  bannerOverlay: { flex: 1, justifyContent: 'space-between', padding: 16, alignItems: 'flex-start' },
  bannerTitle: { color: '#fff', marginTop: 60, fontSize: 20, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bannerDate: { color: '#fff', marginBottom: 4, marginTop: 6, fontSize: 13, fontWeight: '600' },
  bannerTime: { color: '#fff', fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#e6e6e6', marginTop: 12,marginBottom: 16  },
});
