import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, Modal, StyleSheet, useWindowDimensions, Animated, StatusBar as RNStatusBar, Image } from "react-native";
import { tw } from 'react-native-tailwindcss';
import { useRouter } from "expo-router";
import { useNavigation } from '@react-navigation/native';
// Defer loading of icons to runtime
import { logoutAndClear } from '../../_lib/auth';
import { useSettings } from '../../lib/SettingsProvider';
import StaffManagement from "./Tabs/StaffManagement";
import BayManagement from "./Tabs/BayManagement";
import SystemSettings from "./Tabs/SystemSettingsTab";
import ReportsAndAnalytics from "./Tabs/ReportsAndAnalytics";


type OverviewItem = { title: string; value: string; subtitle: string; color: string };

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const router = useRouter();
  // navigation (used to hide parent tab bar when entering fullscreen)
  const navigation: any = useNavigation();

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      setLogoutModalVisible(true);
      return;
    }

    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => performLogout() },
    ]);
  };

  const [logoutModalVisible, setLogoutModalVisible] = useState<boolean>(false);

  const performLogout = async () => {
    try { setLogoutModalVisible(false); } catch {}
  await logoutAndClear();
    router.replace('/');
  };

  const getBayStatus = (num: number) => {
    // fallback static mapping (kept for immediate visuals)
    if ([4, 9, 12, 18, 32, 40].includes(num)) return { color: "#C62828" }; // Maintenance
    if ([5, 13, 26, 34, 36].includes(num)) return { color: "#BF930E" }; // Open Session
    if ([8, 21, 22, 35].includes(num)) return { color: "#A3784E" }; // Assigned
    return { color: "#2E7D32" }; // Available
  };

  // State from server
  const [overview, setOverview] = useState<any>(null);
  const [, setLoadingOverview] = useState(false);
  // admin info
  const [adminName, setAdminName] = useState<string>('ADMIN');
  const [adminId, setAdminId] = useState<string>('');
  const settings = useSettings();
  const prevTotalRef = React.useRef<number | null>(null);
  const [highlightedBays, setHighlightedBays] = useState<number[]>([]);

  // Responsive helper: treat large screens/tablets specially
  const { width, height } = useWindowDimensions();
  const isTablet = Math.max(width, height) >= 900;
  const isLargeTablet = width >= 1800 || height >= 1200;
  // Responsive badge sizing and small position nudge (move left a few pixels)
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  // Scale relative to a 1200px baseline and clamp to avoid extreme sizes
  const badgeScale = clamp(width / 1200, 0.9, 1.3);
  const baseBadgeFont = isLargeTablet ? 14 : isTablet ? 12 : 10;
  const responsiveBadgeFontSize = Math.round(baseBadgeFont * badgeScale);
  // Move the badge slightly to the left (2-5px is perceptible but not disruptive) - changeable
   // Manual tweak knobs (change these at top-level to tune visuals)
   // nudgeLeftPx: positive values move the badge further left (smaller negative `right`)
   const nudgeLeftPx = 8;
   // badgeFontOffsetPx: additive manual adjustment to the computed responsive font size (px)
   // Set to positive/negative values to increase/decrease text size without changing scale math
   const badgeFontOffsetPx = -4;
   // badgeMinWidth / badgeMinHeight: enforce a minimum shape size for the badge
   // Set to 0 to allow content-driven sizing.
   const badgeMinWidth = 50;
   const badgeMinHeight = 15;
  const baseRight = isLargeTablet ? -18 : isTablet ? -12 : -8;
  const adjustedBadgeRight = baseRight + nudgeLeftPx; // less negative => moves left

  const getColorFromStatus = (status: string) => {
    switch (status) {
      case 'Maintenance':
        return '#C62828';
      case 'Occupied':
        return '#A3784E';
      case 'Open':
      case 'OpenTime':
        return '#BF930E';
      case 'Available':
      default:
        return '#2E7D32';
    }
  };

  // Legend filter state: support multi-select so users can highlight multiple statuses
  const [legendFilter, setLegendFilter] = useState<string[]>([]);
  // Fullscreen state (toggle system UI + lock orientation)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    // Animated values map for bay fill overlays. Keyed by `bay-{num}`.
    const bayAnimMap = React.useRef<Record<string, Animated.Value>>({});

    // Animate bay overlay opacity when legendFilter or overview changes
    React.useEffect(() => {
      const total = Number(settings.totalAvailableBays ?? 45);
      const animations: Animated.CompositeAnimation[] = [];
      for (let i = 1; i <= total; i++) {
        const key = `bay-${i}`;
        // decide status for bay i from overview when present
        const bayData = overview?.bays?.find((x: any) => String(x.bay_number) === String(i) || String(x.bay_id) === String(i));
        const status = bayData?.status ?? null;
        const isActive = legendMatchesStatus(legendFilter, status);
        if (!bayAnimMap.current[key]) bayAnimMap.current[key] = new Animated.Value(isActive ? 1 : 0);
        animations.push(Animated.timing(bayAnimMap.current[key], { toValue: isActive ? 1 : 0, duration: 220, useNativeDriver: true }));
      }
      if (animations.length) Animated.parallel(animations).start();
    }, [legendFilter, overview, settings.totalAvailableBays]);

    const legendMatchesStatus = (labels: string[], status: string | null) => {
      if (!labels || labels.length === 0 || !status) return false;
      for (const label of labels) {
        switch (label) {
          case 'Available':
            if (status === 'Available') return true;
            break;
          case 'Assigned':
            if (status === 'Assigned' || status === 'Occupied') return true;
            break;
          case 'Open Time Session':
            if (status === 'Open' || status === 'OpenTime') return true;
            break;
          case 'Maintenance':
            if (status === 'Maintenance') return true;
            break;
          default:
            break;
        }
      }
      return false;
    };

    // Fullscreen helpers: dynamically import Expo modules so the code is resilient
    const enterFullScreen = async () => {
      try {
        // hide React Native status bar
        RNStatusBar.setHidden(true);

        if (Platform.OS === 'android') {
          // dynamic import to avoid bundler-time failure if package isn't installed
          // @ts-ignore
          const navModule = await import('expo-navigation-bar').catch(() => null);
          const nav: any = navModule?.default ?? navModule;
          if (nav && nav.setBehaviorAsync) {
            // prefer immersive-sticky where available
            try { await nav.setBehaviorAsync('immersive-sticky'); } catch {}
            try { await nav.setVisibilityAsync('hidden'); } catch {}
          }
        }

        // lock orientation to landscape for fullscreen experience (adjust if you prefer portrait)
        // @ts-ignore
        const soModule = await import('expo-screen-orientation').catch(() => null);
        const so: any = soModule?.default ?? soModule;
        if (so && so.lockAsync && so.OrientationLock) {
          try { await so.lockAsync(so.OrientationLock.LANDSCAPE_RIGHT); } catch {}
        }

        setIsFullscreen(true);
      } catch (e) {
        console.warn('enterFullScreen error', e);
      }
    };

    const exitFullScreen = async () => {
      try {
        RNStatusBar.setHidden(false);
        if (Platform.OS === 'android') {
          // @ts-ignore
          const navModule = await import('expo-navigation-bar').catch(() => null);
          const nav: any = navModule?.default ?? navModule;
          if (nav && nav.setVisibilityAsync) {
            try { await nav.setVisibilityAsync('visible'); } catch {}
            try { await nav.setBehaviorAsync('overlay'); } catch {}
          }
        }
        // unlock orientation
        // @ts-ignore
        const soModule = await import('expo-screen-orientation').catch(() => null);
        const so: any = soModule?.default ?? soModule;
        if (so && so.lockAsync && so.OrientationLock) {
          try { await so.lockAsync(so.OrientationLock.DEFAULT); } catch {}
        }
        setIsFullscreen(false);
      } catch (e) {
        console.warn('exitFullScreen error', e);
      }
    };

  useEffect(() => {
    const fetchOverview = async () => {
      setLoadingOverview(true);
      try {
          // Resolve persisted probe override if available (helps physical devices)
          let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
          try {
            // @ts-ignore - dynamic import to avoid bundler-time dependency
            const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
            const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
            const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
            if (override) baseUrl = override;
          } catch {
            // ignore
          }
          const res = await fetch(`${baseUrl}/api/admin/overview`, { method: 'GET', credentials: 'include' });
          if (!res.ok) return setOverview(null);
          const data = await res.json();
          setOverview(data);
        } catch {
            setOverview(null);
          } finally {
        setLoadingOverview(false);
      }
    };
    // initial fetch
    fetchOverview();

    // Poll every 5 seconds so dashboard reflects DB changes without manual refresh
    const interval = setInterval(() => {
      fetchOverview();
    }, 5000);

    // Listen for explicit update events (emitted by other components after mutations)
    const onOverviewUpdated = () => fetchOverview();
    try {
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('overview:updated', onOverviewUpdated as EventListener);
    } catch {}
    // fetch admin identity for sidebar
    const fetchAdmin = async () => {
      try {
        let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
        try {
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
          if (override) baseUrl = override;
        } catch {
          // ignore
        }
        let r = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' });
        let d: any = null;
        if (r.ok) {
          d = await r.json();
        } else {
          // Try bearer auth using saved access token (native clients)
          try {
            // @ts-ignore
            const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
            const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
            const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
            if (token) {
              const r2 = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
              if (r2.ok) d = await r2.json();
            }
          } catch {
            // ignore
          }
        }
        if (!d) return;
    const name = d?.full_name || d?.name || d?.username || 'ADMIN';
    // Prefer the database employee id. If not present, allow camelCase employeeId as a fallback.
    // Do NOT fall back to internal ids — the sidebar must show the employee id from the DB.
    const empId = d?.employee_id ?? d?.employeeId ?? null;
    const id = empId != null ? String(empId) : '';
    setAdminName(name);
    setAdminId(id);
      } catch {
        // ignore
      }
    };
    fetchAdmin();

    return () => {
      clearInterval(interval);
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('overview:updated', onOverviewUpdated as EventListener);
  } catch {}
    };
  }, []);

  // ensure we exit fullscreen mode if the component unmounts while fullscreen is active
  useEffect(() => {
    return () => {
      if (isFullscreen) {
        try { exitFullScreen(); } catch {}
      }
    };
  }, []);

  // Hide parent tab bar (if present) when entering fullscreen. Works with React Navigation parents
  useEffect(() => {
    try {
      const parent = navigation && (navigation.getParent ? navigation.getParent() : null);
      if (parent && parent.setOptions) {
        parent.setOptions({ tabBarStyle: isFullscreen ? { display: 'none' } : undefined });
      }
    } catch (e) {
      // ignore if navigation parent isn't available
    }
  }, [isFullscreen, navigation]);

  // Auto-enter fullscreen when the user starts using the app.
  // We attempt immediately on mount, and also attach a web pointerdown fallback
  useEffect(() => {
    let webListener: any = null;
    (async () => {
      try {
        // Try to enter fullscreen immediately on mount
        await enterFullScreen();
      } catch {}

      // If we're running on web and immersive may require a user gesture, attach a one-time pointerdown
      if (typeof window !== 'undefined' && window.addEventListener) {
        webListener = async () => {
          try { await enterFullScreen(); } catch {}
          try { window.removeEventListener('pointerdown', webListener); } catch {}
        };
        try { window.addEventListener('pointerdown', webListener, { once: true }); } catch {}
      }
    })();

    return () => {
      try { if (webListener && typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('pointerdown', webListener); } catch {}
    };
  }, []);

  // load icon lib at runtime to avoid bundler-time issues
  let MaterialIcons: any = null;
  try {
    // allow a runtime require here (we intentionally defer loading)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    MaterialIcons = require('@expo/vector-icons').MaterialIcons;
  } catch {
    MaterialIcons = function MaterialIconsStub({ name, size, color }: any) { return null; };
  }

  // Watch settings.totalAvailableBays and highlight newly added bay numbers when it increases
  useEffect(() => {
    const current = Number(settings.totalAvailableBays ?? 45);
    const prev = prevTotalRef.current ?? current;
    if (current > prev) {
      const newNumbers: number[] = [];
      for (let i = prev + 1; i <= current; i++) newNumbers.push(i);
      setHighlightedBays(newNumbers);
      // clear after 4s
      const t = setTimeout(() => setHighlightedBays([]), 4000);
      return () => clearTimeout(t);
    }
    prevTotalRef.current = current;
  }, [settings.totalAvailableBays]);

  const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => {
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
      <TouchableOpacity onPress={toggle} style={[styles.legendItem, selected ? styles.legendItemSelected : null]}>
        <View style={[styles.legendColor, { backgroundColor: color }]} />
        <Text style={[styles.legendText, selected ? styles.legendTextSelected : null]}>{label}</Text>
        <View style={styles.legendCountBadge}>
          <Text style={styles.legendCountText}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  (Legend as any).displayName = 'Legend';

  const OverviewCard: React.FC<OverviewItem> = ({ title, value, subtitle, color }) => (
    <View style={[styles.overviewCard, { borderLeftColor: color }]}>
      <Text style={styles.overviewLabel}>{title}</Text>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewSubtitle}>{subtitle}</Text>
    </View>
  );

(OverviewCard as any).displayName = 'OverviewCard';

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return (
          <ScrollView style={styles.scrollContent}>
            <View style={styles.contentContainer}>
              <Text style={styles.sectionTitle}>Admin Dashboard Overview</Text>
              <Text style={styles.placeholderText}>Welcome back, Admin!</Text>

              {/* Quick Overview */}
              <Text style={styles.sectionTitle}>Quick Overview</Text>
              <View style={styles.overviewContainer}>
                <OverviewCard
                  title="Total Revenue (Today)"
                  value={overview ? `${settings.currencySymbol}${overview.totalRevenueToday}` : '—'}
                  subtitle="Compared to previous period"
                  color="#2E7D32"
                />
                {(() => {
                  if (!overview) {
                    return <OverviewCard title="Available Bays" value={'—'} subtitle={''} color="#558B2F" />;
                  }

                  const total = Number(settings.totalAvailableBays ?? overview.totalBays ?? 45);

                  // Prefer server-provided availableBays when present.
                  let avail: number | null = typeof overview.availableBays === 'number' ? overview.availableBays : null;

                  // If server didn't provide a pre-computed availableBays, derive it from bay rows.
                  if (avail === null) {
                    const bays = overview.bays ?? [];
                    const occupied = bays.filter((b: any) => {
                      const st = String(b?.status ?? b?.originalStatus ?? '').trim();
                      return ['Occupied', 'Assigned', 'Open', 'OpenTime', 'Maintenance', 'SpecialUse'].includes(st);
                    }).length;
                    avail = Math.max(0, total - occupied);
                  }

                  return (
                    <OverviewCard
                      title="Available Bays"
                      value={String(avail)}
                      subtitle={`${avail} / ${total} available`}
                      color="#558B2F"
                    />
                  );
                })()}
                <OverviewCard
                  title="Staff on Duty"
                  value={overview ? String(overview.staffOnDuty) : '—'}
                  subtitle="Total staff"
                  color="#C62828"
                />
                <OverviewCard
                  title="Next Tee Time"
                  value={(() => {
                    if (!overview || !overview.nextTeeTime) return '—';
                    if (overview.nextTeeTime === 'Bay Ready') return 'Bay Ready';
                    try {
                      return new Date(overview.nextTeeTime).toLocaleTimeString();
                    } catch {
                      return String(overview.nextTeeTime);
                    }
                  })()}
                  subtitle={(() => {
                    if (!overview || !overview.nextTeeTime) return '';
                    if (overview.nextTeeTime === 'Bay Ready') return '';
                    try {
                      return new Date(overview.nextTeeTime).toLocaleDateString();
                    } catch {
                      return '';
                    }
                  })()}
                  color="#6D4C41"
                />
              </View>

              {/* Real-Time Bay Overview */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Real-Time Bay Overview</Text>
                <TouchableOpacity style={styles.clearButton} onPress={() => setLegendFilter([])}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.bayContainer}>
                {overview && overview.bays && overview.bays.length > 0 ? (
                  // Render bay grid 1..N in numerical order, using overview data when available
                  Array.from({ length: settings.totalAvailableBays ?? 45 }).map((_, i) => {
                    const num = i + 1;
                    const numStr = String(num);
                    const b = overview.bays.find((x: any) => String(x.bay_number) === numStr || String(x.bay_id) === numStr);
                    const status = b?.status ?? null;
                    const original = b?.originalStatus ?? null;
                    const isHighlighted = highlightedBays.includes(num);
                    // legend-driven highlight
                    const isLegendActive = legendMatchesStatus(legendFilter, status ?? null);
                    const bayColor = getColorFromStatus(status ?? '');
                    const bayBoxDynamic = isLegendActive ? { backgroundColor: bayColor, borderColor: bayColor } : { borderColor: bayColor };
                    const bayTextBase = { color: bayColor };
                    const animKey = `bay-${num}`;
                    let anim = bayAnimMap.current[animKey];
                    if (!anim) {
                      anim = new Animated.Value(isLegendActive ? 1 : 0);
                      bayAnimMap.current[animKey] = anim;
                    }
                    return (
                      <View key={b?.bay_id ?? `bay-${num}`} style={[
                        styles.bayBox,
                        bayBoxDynamic,
                        { position: 'relative' },
                        ...(isHighlighted ? [{ borderWidth: 3, shadowColor: '#00BFA5', shadowOpacity: 0.3 }] : []),
                      ]}>
                        {/* animated fill overlay for legend highlights */}
                        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bayColor, borderRadius: 8, opacity: anim }} />
                        <Text style={[styles.bayText, bayTextBase, isLegendActive ? { color: '#fff', fontWeight: '700' } : null]}>{num}</Text>
                        {original === 'SpecialUse' && (
                          <View style={[
                            styles.reservedBadge,
                            isLargeTablet ? styles.reservedBadgeLarge : isTablet ? styles.reservedBadgeTablet : null,
                            // inline override to nudge the badge slightly left for visual alignment
                            { right: adjustedBadgeRight, minWidth: badgeMinWidth, minHeight: badgeMinHeight },
                          ]}>
                            <Text style={[
                              styles.reservedBadgeText,
                              isLargeTablet ? styles.reservedBadgeTextLarge : isTablet ? styles.reservedBadgeTextTablet : null,
                              // responsive font-size override to avoid disorientation on very large widths
                              { fontSize: responsiveBadgeFontSize + badgeFontOffsetPx, fontWeight: isLargeTablet ? '800' : '700' },
                            ]}>Reserved</Text>
                          </View>
                        )}
                      </View>
                    );
                  })
                ) : (
                  // fallback static grid up to N
                  Array.from({ length: settings.totalAvailableBays ?? 45 }).map((_, i) => {
                    const num = i + 1;
                    const status = getBayStatus(num);
                    const isHighlighted = highlightedBays.includes(num);
                    // try to infer a status name from the color for the static fallback so legend filtering still works
                    let statusName: string | null = null;
                    if (status.color === getColorFromStatus('Available')) statusName = 'Available';
                    else if (status.color === getColorFromStatus('Assigned') || status.color === getColorFromStatus('Occupied')) statusName = 'Assigned';
                    else if (status.color === getColorFromStatus('Maintenance')) statusName = 'Maintenance';
                    else statusName = null;
                    const isLegendActive = legendMatchesStatus(legendFilter, statusName);
                    const animKey = `bay-${num}`;
                    let anim = bayAnimMap.current[animKey];
                    if (!anim) {
                      anim = new Animated.Value(isLegendActive ? 1 : 0);
                      bayAnimMap.current[animKey] = anim;
                    }
                    const bayBoxDynamic = isLegendActive ? { backgroundColor: status.color, borderColor: status.color } : { borderColor: status.color };
                    return (
                      <View key={i} style={[styles.bayBox, bayBoxDynamic, { position: 'relative' }, ...(isHighlighted ? [{ borderWidth: 3, shadowColor: '#00BFA5', shadowOpacity: 0.3 }] : [])]}>
                        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: status.color, borderRadius: 8, opacity: anim }} />
                        <Text style={[styles.bayText, isLegendActive ? { color: '#fff', fontWeight: '700' } : { color: status.color }]}>{num}</Text>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.legendContainer}>
                <Legend color="#2E7D32" label="Available" />
                <Legend color="#A3784E" label="Assigned" />
                <Legend color="#BF930E" label="Open Time Session" />
                <Legend color="#C62828" label="Maintenance" />
              </View>
            </View>
          </ScrollView>
        );
      case "Staff Management":
      return <StaffManagement />; // ✅ Calls the imported component

      case "Bay Management":
      return <BayManagement />;

  case "System Settings":
  return <SystemSettings />;
    case "Report & Analytics":
  return <ReportsAndAnalytics />;

      default:
        return (
          <View style={styles.contentContainer}>
            <Text style={styles.sectionTitle}>{activeTab}</Text>
            <Text style={styles.placeholderText}>
              You are at the {activeTab} tab.
            </Text>
          </View>
        );
    }
  };

  const tabs = [
    { name: "Dashboard", icon: "dashboard" },
    { name: "Staff Management", icon: "group" },
    { name: "Bay Management", icon: "golf-course" },
    { name: "Report & Analytics", icon: "bar-chart" },
    { name: "Team Chats", icon: "chat" },
    { name: "Audit Logs", icon: "history" },
    { name: "System Settings", icon: "settings" },
  ];

  return (
    <View style={[tw.flex1, tw.flexRow, { backgroundColor: '#F6F6F2' }]}>
      {/* Sidebar */}
      <View style={[tw.w64, tw.p5, { backgroundColor: '#1E2B20', justifyContent: 'space-between' }]}>
        <View style={styles.logoContainer}>
          <Image
            // local asset; bundled via require so React Native includes it
            source={require('../../../assets/General/Logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            onError={(e) => { console.warn('Logo image load error', e.nativeEvent ? e.nativeEvent : e); }}
          />
          <View style={styles.logoTextContainer}>
            <Text style={styles.logoAppName}>{settings.siteName}</Text>
            <Text style={styles.logoRole}>ADMIN</Text>
          </View>
  </View>
  {/* Divider under logo/name/role to match design */}
  <View style={styles.logoDivider} />

  {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[
              tw.flexRow,
              tw.itemsCenter,
              tw.pY3,
              tw.pX2,
              tw.roundedLg,
              tw.mY1,
              activeTab === tab.name ? { backgroundColor: '#405C45' } : {},
            ]}
            onPress={() => setActiveTab(tab.name)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={22}
              color={activeTab === tab.name ? "#fff" : "#B8C1B7"}
              style={{ marginRight: 10 }}
            />
            <Text style={[activeTab === tab.name ? { color: '#fff', fontWeight: '600' } : { color: '#DADADA' }]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={{ marginTop: 60 }}>
          <Text style={[tw.textGray400, tw.textXs]}>Logged in as: {adminName}</Text>
          <Text style={[tw.textGray400, tw.textXs]}>Admin ID: {adminId || '—'}</Text>
          <TouchableOpacity style={{ marginTop: 10, backgroundColor: '#404040', paddingVertical: 10, borderRadius: 6, alignItems: 'center' }} onPress={handleLogout}>
            <Text style={[tw.textWhite, tw.fontBold]}>LOG OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
  <View style={[tw.flex1, tw.p6]}>{renderContent()}</View>
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to log out?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setLogoutModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={() => performLogout()}>
                <Text style={styles.modalButtonText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ensure linter recognizes the component display name
(AdminDashboard as any).displayName = 'AdminDashboard';

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F6F6F2" },
  sidebar: {
    width: 250,
    backgroundColor: "#1E2B20",
    padding: 20,
    justifyContent: "space-between",
  },
  logo: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 22,
    marginBottom: 40,
  },
  logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  // set transparent background (white box might come from the image having a white background
  // or from an explicit style). Use contain so the logo scales without cropping.
  logoImage: { width: 60, height: 60, borderRadius: 8, marginRight: 10, backgroundColor: 'transparent', overflow: 'hidden' },
  logoTextContainer: { flexDirection: 'column' },
  logoAppName: { color: '#fff', fontWeight: '700', fontSize: 20 },
  logoRole: { color: '#DADADA', fontSize: 15, marginTop: 2 },
  logoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 0, alignSelf: 'stretch' },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  icon: { marginRight: 10 },
  activeTabButton: { backgroundColor: "#405C45" },
  tabText: { color: "#DADADA", fontSize: 16 },
  activeTabText: { color: "#fff", fontWeight: "600" },
  logoutContainer: { marginTop: 60 },
  loggedInText: { color: "#ccc", fontSize: 12, marginBottom: 4 },
  logoutButton: {
    marginTop: 10,
    backgroundColor: "#404040",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold" },
  mainContent: { flex: 1, padding: 25 },
  contentContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  scrollContent: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  placeholderText: { fontSize: 15, color: "#555", marginBottom: 20 },
  overviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  overviewCard: {
    backgroundColor: "#F4F8F3",
    borderRadius: 10,
    padding: 15,
    flex: 1,
    minWidth: "45%",
    borderLeftWidth: 5,
  },
  overviewLabel: { fontSize: 13, color: "#555" },
  overviewValue: { fontSize: 20, fontWeight: "700", marginTop: 5 },
  overviewSubtitle: { fontSize: 12, color: "#777", marginTop: 4 },
  bayContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: 'center',
    alignContent: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  bayBox: {
    width: 45,
    height: 45,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9F9F9",
    margin: 3,
  },
  // reserved badge - default (tightened padding)
  reservedBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: '#7C0A02', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, zIndex: 5 },
  reservedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  // Tablet-specific reserved badge sizing/position (reduced padding)
  reservedBadgeTablet: { top: -8, right: -12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  reservedBadgeTextTablet: { fontSize: 12 },
  // Very large tablet / high-res displays (e.g. 2000x1200) - slightly reduced padding
  reservedBadgeLarge: { top: -18, right: -18, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  reservedBadgeTextLarge: { fontSize: 14, fontWeight: '800' },
  bayText: { fontWeight: "bold" },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 1,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: { fontSize: 12, color: "#333" },
  legendItemSelected: { backgroundColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  legendTextSelected: { fontWeight: '700', color: '#111' },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  legendCountBadge: { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  legendCountText: { fontSize: 11, color: '#333' },
  clearButton: { backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 },
  clearButtonText: { color: '#444', fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  modalText: { fontSize: 14, color: "#333", marginBottom: 6 },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  modalButtonCancel: { backgroundColor: "#EEE", marginRight: 8 },
  modalButtonConfirm: { backgroundColor: "#C62828" },
  modalButtonText: { color: "#fff", fontWeight: "600" },
});
