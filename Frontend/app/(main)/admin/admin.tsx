import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet, useWindowDimensions, Animated, Image, ImageBackground, AppState, Pressable, TextInput } from "react-native";
import { tw } from 'react-native-tailwindcss';
import { useRouter } from "expo-router";
import { useNavigation } from '@react-navigation/native';
import { logoutAndClear } from '../../_lib/auth';
import { fetchWithAuth } from '../../_lib/fetchWithAuth';
import { useSettings } from '../../lib/SettingsProvider';
import { buildNotification } from '../../lib/notification';
import StaffManagement from "./Tabs/StaffManagement";
import BayManagement from "./Tabs/BayManagement";
import SystemSettings from "./Tabs/SystemSettingsTab";
import ReportsAndAnalytics from "./Tabs/ReportsAndAnalytics";
import TeamChats from "./Tabs/TeamChats";
import AuditLogs from "./Tabs/AuditLogs";
import OverviewCard from '../../components/OverviewCard';
import QuickOverview from '../../components/QuickOverview';
import Legend from './components/Legend';
import InfoPanel from './components/InfoPanel';
import ConfirmModal from '../../components/ConfirmModal';
import { clamp, getColorFromStatus, legendMatchesStatus } from '../utils/uiHelpers';
import { enterFullScreen, exitFullScreen, reloadApp } from '../utils/fullscreen';
import RealTimeBayOverview from '../../components/RealTimeBayOverview';


type OverviewItem = { title: string; value: string; subtitle: string; color: string };

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const router = useRouter();
  // navigation (used to hide parent tab bar when entering fullscreen)
  const navigation: any = useNavigation();

  const handleLogout = () => {
    // Always show the centralized logout modal for consistent behavior
    setLogoutModalVisible(true);
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
  // live clock for header
  const [now, setNow] = useState<Date>(new Date());
  const settings = useSettings();
  const prevTotalRef = React.useRef<number | null>(null);
  const [highlightedBays, setHighlightedBays] = useState<number[]>([]);
  // Selected bay for info popup
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [selectedBayDetails, setSelectedBayDetails] = useState<any>(null);
  // width of the bay container to compute column-based offsets for InfoPanel
  const [bayContainerWidth, setBayContainerWidth] = useState<number>(0);
  const BAY_BOX_TOTAL = 45; // approximate bay width + horizontal margins (45 + 6)
  // Notifications for countdown alerts (10-minute warnings) and remaining-time map
  const [notifications, setNotifications] = useState<Array<{ id: string; bay: number; message: string; when: number; threshold?: 't10' | 't5' | 't0' }>>([]);
  const [remainingMap, setRemainingMap] = useState<Record<number, number>>({});
  const notifiedRef = React.useRef<Record<number, Set<string>>>({});

  // (Testing helpers removed)

  const dismissNotification = (id: string) => {
    try { setNotifications((prev) => (prev || []).filter((n) => n.id !== id)); } catch {}
  };


  // (Testing helpers removed)

  // Use the same transient overlay behavior as System Settings but with a fade-out
  // and longer auto-dismiss. Queue notifications and show them one at a time.
  const ADMIN_NOTIF_DURATION_MS = 6000; // 6s (longer than default)
  const adminNotifTimer = React.useRef<number | null>(null);
  const [adminShowSavedNotification, setAdminShowSavedNotification] = useState<boolean>(false);
  const notifAnimRef = React.useRef(new Animated.Value(0));

  // When a new notification is added and overlay isn't showing, animate in and schedule auto-dismiss
  useEffect(() => {
    try {
      if ((notifications || []).length > 0 && !adminShowSavedNotification) {
  setAdminShowSavedNotification(true);
  // animate in
  try { Animated.timing(notifAnimRef.current, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(); } catch {}
        if (adminNotifTimer.current) { clearTimeout(adminNotifTimer.current as number); adminNotifTimer.current = null; }
        adminNotifTimer.current = window.setTimeout(() => {
          // animate out then remove first notification
          try {
            Animated.timing(notifAnimRef.current, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start(() => {
              setNotifications((prev) => (prev || []).slice(1));
              setAdminShowSavedNotification(false);
            });
          } catch (e) {
            // fallback immediate
            setNotifications((prev) => (prev || []).slice(1));
            setAdminShowSavedNotification(false);
          }
          adminNotifTimer.current = null;
        }, ADMIN_NOTIF_DURATION_MS) as unknown as number;
      }
    } catch (e) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);
  // Prevent overlapping overview fetches
  const isFetchingRef = React.useRef(false);
  // Track recent user interactions to avoid spamming fullscreen calls
  const lastInteractionRef = React.useRef<number>(0);
  const interactionDebounceMs = 800;

  const handleUserInteraction = () => {
    try {
      const nowTs = Date.now();
      if (nowTs - lastInteractionRef.current < interactionDebounceMs) return;
      lastInteractionRef.current = nowTs;
      if (!isFullscreen) {
        // best-effort entrance to fullscreen when user interacts
        try { enterFullScreen(); } catch {}
      }
    } catch {}
  };

  // Keep a serialized snapshot of the last overview we saw so we can detect server-side changes.
  const prevOverviewJsonRef = React.useRef<string | null>(null);

  // Apply an incoming overview payload while preserving UI transient state
  const applyOverviewUpdate = (newData: any) => {
    try {
      const json = JSON.stringify(newData);
      prevOverviewJsonRef.current = json;
    } catch {}

    try {
      // If a bay is currently selected, update its raw details if present in the new payload
      if (selectedBay != null && newData && Array.isArray(newData.bays)) {
        const found = newData.bays.find((b: any) => String(b?.bay_number ?? b?.bay_id) === String(selectedBay));
        if (found) {
          setSelectedBayDetails((prev: any) => {
            if (!prev) return prev;
            const player = prev.player ?? found.player_name ?? found.player ?? '—';
            const balls = prev.ballsUsed ?? found.total_balls ?? found.balls_used ?? found.bucket_count ?? found.transactions_count ?? '—';
            return { ...prev, raw: found, player, ballsUsed: balls };
          });
        }
      }
    } catch {}

    // Finally update overview state so UI refreshes the bay grid and derived maps
    try { setOverview(newData); } catch {}
  };

  // Responsive helper: treat large screens/tablets specially
  const { width, height } = useWindowDimensions();
  const isTablet = Math.max(width, height) >= 900;
  const isLargeTablet = width >= 1800 || height >= 1200;
  // Responsive badge sizing and small position nudge (move left a few pixels)
  // Scale relative to a 1200px baseline and clamp to avoid extreme sizes
  const badgeScale = clamp(width / 1200, 0.9, 1.3);
  const baseBadgeFont = isLargeTablet ? 14 : isTablet ? 12 : 10;
  const responsiveBadgeFontSize = Math.round(baseBadgeFont * badgeScale);

   const nudgeLeftPx = 8;
   const badgeFontOffsetPx = -4;

   const badgeMinWidth = 50;
   const badgeMinHeight = 15;
  const baseRight = isLargeTablet ? -18 : isTablet ? -12 : -8;
  const adjustedBadgeRight = baseRight + nudgeLeftPx; // less negative => moves left



  // Legend filter state: support multi-select so users can highlight multiple statuses
  const [legendFilter, setLegendFilter] = useState<string[]>([]);
  // toggle between default legend and session-type legend
  const [showSessionLegend, setShowSessionLegend] = useState<boolean>(false);

  // Persist showSessionLegend across reloads using AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        // dynamic import to avoid bundler-time dependency
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        if (!AsyncStorage || !AsyncStorage.getItem) return;
        const v = await AsyncStorage.getItem('admin:showSessionLegend');
        if (v !== null) {
          setShowSessionLegend(v === '1' || v === 'true');
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        if (!AsyncStorage || !AsyncStorage.setItem) return;
        await AsyncStorage.setItem('admin:showSessionLegend', showSessionLegend ? '1' : '0');
      } catch (e) {
        // ignore
      }
    })();
  }, [showSessionLegend]);
  // Fullscreen state (toggle system UI + lock orientation)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    // Animated values map for bay fill overlays. Keyed by `bay-{num}`.
    const bayAnimMap = React.useRef<Record<string, Animated.Value>>({});

    // Helper to infer session_type when the backend doesn't provide it.
    const inferSessionType = (b: any) => {
      try {
        const original = String(b?.originalStatus ?? b?.status ?? '');
        if (original === 'SpecialUse') return 'Reserved';
        const start = b?.start_time ?? (b?.player && (b.player as any).start_time) ?? null;
        const end = b?.end_time ?? b?.assignment_end_time ?? null;
        const hasPlayer = !!(b?.player && (b.player.nickname || b.player.player_id));
        if (hasPlayer && start && !end) return 'Open';
        if (end) return 'Timed';
        return null;
      } catch (e) { return null; }
    };

    // Animate bay overlay opacity when legendFilter or overview changes
    React.useEffect(() => {
      const total = Number(settings.totalAvailableBays ?? 45);
      const animations: Animated.CompositeAnimation[] = [];
      for (let i = 1; i <= total; i++) {
        const key = `bay-${i}`;
        // decide status for bay i from overview when present
        const bayData = overview?.bays?.find((x: any) => String(x.bay_number) === String(i) || String(x.bay_id) === String(i));
        // When session legend is active, prefer the typed session_type otherwise fall back to status
        const statusToMatch = showSessionLegend ? (bayData?.session_type ?? inferSessionType(bayData)) : (bayData?.status ?? null);
        const isActive = legendMatchesStatus(legendFilter, statusToMatch ?? null);
        if (!bayAnimMap.current[key]) bayAnimMap.current[key] = new Animated.Value(isActive ? 1 : 0);
  animations.push(Animated.timing(bayAnimMap.current[key], { toValue: isActive ? 1 : 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }));
      }
      if (animations.length) Animated.parallel(animations).start();
    }, [legendFilter, overview, settings.totalAvailableBays]);

    // legendMatchesStatus moved to ./utils/uiHelpers

    // Fullscreen helpers: dynamically import Expo modules so the code is resilient
    // enterFullScreen / exitFullScreen moved to ./utils/fullscreen

  useEffect(() => {
    // live clock updater (updates every second)
    const tick = setInterval(() => setNow(new Date()), 1000);
    // cleanup
    return () => clearInterval(tick);
  }, []);

  // Countdown evaluator: compute remaining times and emit 10-minute notifications once per bay
  useEffect(() => {
    const iv = setInterval(() => {
      try {
        if (!overview || !Array.isArray(overview.bays)) return;
        const nowTs = Date.now();
        const nextMap: Record<number, number> = {};
        const newNotifs: Array<any> = [];

        for (const b of overview.bays) {
          const num = Number(b?.bay_number ?? b?.bay_id ?? NaN);
          if (Number.isNaN(num)) continue;
          const endTs = b?.end_time ? new Date(b.end_time).getTime() : (b?.assignment_end_time ? new Date(b.assignment_end_time).getTime() : null);
          if (endTs && Number.isFinite(endTs)) {
            const msLeft = endTs - nowTs;
            nextMap[num] = msLeft;

            // ensure set exists
            if (!notifiedRef.current[num]) notifiedRef.current[num] = new Set<string>();

            // thresholds: 10min, 5min, expired
            const TEN = 10 * 60 * 1000;
            const FIVE = 5 * 60 * 1000;

            // 10-minute warning (when remaining between 10 and 5 minutes)
            if (msLeft <= TEN && msLeft > FIVE && !notifiedRef.current[num].has('t10')) {
              const msg = `Bay ${num} has ${Math.max(1, Math.ceil(msLeft / (1000 * 60)))}m remaining`;
              newNotifs.push({ id: `bay-${num}-t10-${Date.now()}`, bay: num, message: msg, when: Date.now(), threshold: 't10' });
              notifiedRef.current[num].add('t10');
            }

            // 5-minute warning (when remaining between 5 minutes and 0)
            if (msLeft <= FIVE && msLeft > 0 && !notifiedRef.current[num].has('t5')) {
              const msg = `Bay ${num} has ${Math.max(1, Math.ceil(msLeft / (1000 * 60)))}m remaining`;
              newNotifs.push({ id: `bay-${num}-t5-${Date.now()}`, bay: num, message: msg, when: Date.now(), threshold: 't5' });
              notifiedRef.current[num].add('t5');
            }

            // time reached (expired)
            if (msLeft <= 0 && !notifiedRef.current[num].has('t0')) {
              const msg = `Bay ${num} time is up`;
              newNotifs.push({ id: `bay-${num}-t0-${Date.now()}`, bay: num, message: msg, when: Date.now(), threshold: 't0' });
              notifiedRef.current[num].add('t0');
            }
          }
        }

        // merge newNotifs into the existing notification queue, avoiding duplicates
        if (newNotifs.length > 0) {
          setNotifications((prev) => {
            const existing = prev || [];
            const existingIds = new Set(existing.map((n: any) => n.id));
            const merged = [...existing];
            for (const n of newNotifs) if (!existingIds.has(n.id)) merged.push(n);
            // keep a reasonable history cap
            const MAX = 80;
            return merged.slice(-MAX);
          });
        }

        // update remaining map every tick
        setRemainingMap(nextMap);
      } catch (e) { void e; }
    }, 1000);
    return () => clearInterval(iv);
  }, [overview]);

  // fetchOverview is used from multiple places (initial load, polling, and tab changes)
  const fetchOverview = React.useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
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
  const res = await fetchWithAuth(`${baseUrl}/api/admin/overview`, { method: 'GET' });
      if (!res.ok) {
        setOverview(null);
        return;
      }
      const data = await res.json();
      try {
        const dataJson = JSON.stringify(data);
        // If we've previously loaded an overview, treat a differing payload as a DB change and reload the app.
        if (prevOverviewJsonRef.current && prevOverviewJsonRef.current !== dataJson) {
          try { applyOverviewUpdate(data); } catch {}
          return;
        }
        prevOverviewJsonRef.current = dataJson;
      } catch {}
      setOverview(data);
    } catch {
      setOverview(null);
    } finally {
      setLoadingOverview(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // initial fetch
    fetchOverview();

    // Poll every 2 seconds so dashboard reflects DB changes more quickly
    const interval = setInterval(() => {
      fetchOverview();
    }, 2000);

    // Listen for explicit update events (emitted by other components after mutations)
    // Debounce: wait 2s after an update event before reloading so DB writes have propagated
    let overviewUpdateTimer: any = null;
    const onOverviewUpdated = () => {
      try { if (overviewUpdateTimer) clearTimeout(overviewUpdateTimer); } catch {}
      overviewUpdateTimer = setTimeout(() => {
        try { fetchOverview(); } catch {}
      }, 2000);
    };
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
        let d: any = null;
        try {
          const r = await fetchWithAuth(`${baseUrl}/api/admin/me`, { method: 'GET' });
          if (r.ok) d = await r.json();
        } catch {}
        if (!d) {
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
        if (overviewUpdateTimer) clearTimeout(overviewUpdateTimer);
      } catch {}
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('overview:updated', onOverviewUpdated as EventListener);
      } catch {}
    };
  }, [fetchOverview]);

  // ensure we exit fullscreen mode if the component unmounts while fullscreen is active
  useEffect(() => {
    return () => {
      if (isFullscreen) {
        try { exitFullScreen(); } catch {}
      }
    };
  }, []);

  // Try Server-Sent Events (SSE) stream from backend to immediately receive overview updates
  useEffect(() => {
    let es: any = null;
    (async () => {
      try {
        let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
        try {
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
          if (override) baseUrl = override;
        } catch {}

        // Only try SSE where EventSource exists (web or RN environment with polyfill)
        if (typeof EventSource !== 'undefined') {
          // Build a stream URL that matches the backend chat SSE endpoint. EventSource
          // cannot set headers, so include a token query param when available.
          let token: string | null = null;
          try {
            if (typeof window !== 'undefined' && window.localStorage) token = window.localStorage.getItem('authToken');
          } catch {}
          if (!token) {
            try {
              // @ts-ignore
              const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
              const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
              if (AsyncStorage && AsyncStorage.getItem) token = await AsyncStorage.getItem('authToken');
            } catch {}
          }

          const streamBase = baseUrl.replace(/\/$/, '');
          // Use the chats SSE endpoint on the server which supports ?token= fallback
          const streamUrl = token ? `${streamBase}/api/admin/chats/stream?token=${encodeURIComponent(token)}` : `${streamBase}/api/admin/chats/stream`;
          try {
            es = new EventSource(streamUrl);
            es.onmessage = (ev: any) => {
              try {
                const payload = JSON.parse(ev.data);
                // If we've previously loaded an overview, treat this SSE event as a DB change
                // and reload the whole app. For the very first payload we just populate overview.
                (async () => {
                  try {
                    const json = JSON.stringify(payload);
                    if (prevOverviewJsonRef.current && prevOverviewJsonRef.current !== json) {
                      try { applyOverviewUpdate(payload); } catch {}
                    } else {
                      setOverview(payload);
                      prevOverviewJsonRef.current = json;
                    }
                  } catch {}
                })();
              } catch {}
            };
            es.onerror = () => {
              try { es.close(); } catch {}
            };
          } catch {}
        }
      } catch {}
    })();

    return () => {
      try { if (es) es.close(); } catch {}
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

  // Re-enter fullscreen whenever the app becomes active (foreground).
  useEffect(() => {
    const handleAppState = (next: string) => {
      try {
        if (next === 'active') {
          if (!isFullscreen) enterFullScreen().catch(() => {});
        }
      } catch {}
    };

    // AppState API changed in newer RN; use addEventListener where available
    let sub: any = null;
    try {
      if ((AppState as any).addEventListener) {
        sub = AppState.addEventListener('change', handleAppState);
      } else if (AppState.addEventListener) {
        sub = AppState.addEventListener('change', handleAppState);
      }
    } catch {
      // ignore
    }

    return () => {
      try { sub?.remove?.(); } catch {}
    };
  }, [isFullscreen]);

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

  // Legend, OverviewCard and the small InfoPanel were extracted to separate files in
  // order to make them reusable by other screens (user side, Team Chats, etc.).

  // Compute bay color for admin grid. When showSessionLegend is active we color
  // by session type (stopwatch/open, timed, reserved). Otherwise fall back to
  // the classic status-based coloring.
  const getAdminBayColor = (b: any) => {
    try {
      if (showSessionLegend) {
        const original = String(b?.originalStatus ?? b?.status ?? '');
        // If there's a start_time (player.start_time or top-level start_time), treat as Open/Stopwatch
        const startStr = b?.start_time ?? (b?.player && (b.player as any).start_time) ?? null;
        if (startStr) return '#BF930E'; // Open/Stopwatch (orange)
        // Timed sessions have an end_time
        const endStr = b?.end_time ?? b?.assignment_end_time ?? null;
        if (endStr) return '#D18B3A'; // Timed (distinct brown/orange)
        if (original === 'SpecialUse') return '#6A1B9A'; // Reserved (purple)
        return '#2E7D32'; // Available green
      }
      return getColorFromStatus(String(b?.status ?? 'Available'));
    } catch (e) { return '#2E7D32'; }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return (
          <ScrollView style={styles.scrollContent}>
            <View style={styles.contentContainer}>
              {/* Header banner with welcome text inside imagoe, date/time below */}
              <ImageBackground
                source={require('../../../assets/General/AdminHeroImage.png')}
                style={styles.headerBannerImage}
                imageStyle={{ borderRadius: 12 }}
              >
                <Text style={styles.sectionTitle}>Admin Dashboard</Text>
                <View style={styles.headerBannerOverlay}>
                  <Text style={styles.headerBannerTitle}>Welcome back, {adminName}!</Text>
                  <View style={styles.headerDateTimeRow}>
                    <Text style={styles.headerBannerDate}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                    <Text style={styles.headerBannerTime}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                </View>
              </ImageBackground>
              

              {/* Quick Overview */}
              <Text style={styles.sectionTitle}>Quick Overview</Text>
              <View>
                <QuickOverview overview={overview} settings={settings} currencySymbol={settings.currencySymbol} />
              </View>

              {/* Real-Time Bay Overview (extracted to a reusable component) */}
              <View>
                {/* Use the shared component so other roles can reuse the bay overview */}
                {/* @ts-ignore */}
                <RealTimeBayOverview overview={overview} settings={settings} highlightedBays={highlightedBays} />
              </View>

            </View>
          </ScrollView>
        );

      case "Staff Management":
        return <StaffManagement />;

      case "Bay Management":
        return <BayManagement />;

      case "System Settings":
        return <SystemSettings />;

      case "Report & Analytics":
        return <ReportsAndAnalytics />;

      case "Team Chats":
        return <TeamChats />;

      case "Audit Logs":
        return <AuditLogs />;

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

  // When switching tabs, refresh settings and overview so the UI reflects latest DB values.
  const handleTabPress = async (name: string) => {
    try {
      if (name === activeTab) return;
      // Switch UI immediately for a smooth user experience
      setActiveTab(name);
      // Refresh typed settings and overview in background (do not block the tab switch)
      (async () => {
        try { await settings.refresh(); } catch {}
        try { await fetchOverview(); } catch {}
      })();
    } catch (e) {
      // fallback to tab switch on error
      setActiveTab(name);
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
    <View
      style={[tw.flex1, tw.flexRow, { backgroundColor: '#F6F6F2' }]}
      // capture top-level interactions and try to re-enter fullscreen (non-blocking)
      onStartShouldSetResponder={() => { handleUserInteraction(); return false; }}
      onTouchStart={() => { handleUserInteraction(); }}
    >
      {/* Sidebar */}
      {/* @ts-ignore - attach data-role to the DOM element on web for print CSS */}
      <View // @ts-ignore
        data-role="sidebar"
        style={[tw.w64, tw.p5, { backgroundColor: '#1E2B20', justifyContent: 'space-between' }]}
      >
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
            onPress={() => handleTabPress(tab.name)}
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
      {/* @ts-ignore - attach data-role to the DOM element on web for print CSS */}
  <View // @ts-ignore
    data-role="main"
    style={[tw.flex1, tw.p6]}>{renderContent()}</View>
      {/* Transient saved-style overlay (matches System Settings behavior) */}
      {adminShowSavedNotification && (notifications || []).length > 0 && (
        <Pressable
          style={styles.notifOverlay}
          onPress={() => {
            try {
              // when user taps overlay, reset auto-dismiss timer
              if (adminNotifTimer.current) { clearTimeout(adminNotifTimer.current as number); adminNotifTimer.current = null; }
              adminNotifTimer.current = window.setTimeout(() => {
                try {
                  Animated.timing(notifAnimRef.current, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start(() => {
                    setNotifications((prev) => (prev || []).slice(1));
                    setAdminShowSavedNotification(false);
                  });
                } catch (e) {
                  setNotifications((prev) => (prev || []).slice(1));
                  setAdminShowSavedNotification(false);
                }
              }, ADMIN_NOTIF_DURATION_MS) as unknown as number;
            } catch (e) { /* ignore */ }
          }}
        >
    <Animated.View style={[styles.notifBox, { opacity: notifAnimRef.current, transform: [{ translateY: notifAnimRef.current.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }] }>
            <TouchableOpacity
              style={styles.notifClose}
              onPress={() => {
                try {
                  if (adminNotifTimer.current) { clearTimeout(adminNotifTimer.current as number); adminNotifTimer.current = null; }
                } catch {}
                try {
                  Animated.timing(notifAnimRef.current, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start(() => {
                    setNotifications((prev) => (prev || []).slice(1));
                    setAdminShowSavedNotification(false);
                  });
                } catch (e) {
                  setNotifications((prev) => (prev || []).slice(1));
                  setAdminShowSavedNotification(false);
                }
              }}
            >
              <Text style={{ color: '#2E3B2B', fontWeight: '800' }}>×</Text>
            </TouchableOpacity>
            {(() => {
              const first = (notifications || [])[0];
              // determine severity from remainingMap or threshold
              const threshold = (first as any)?.threshold;
              let prefSeverity: 'low' | 'medium' | 'high' | undefined = undefined;
              if (threshold === 't10') prefSeverity = 'low';
              else if (threshold === 't5') prefSeverity = 'medium';
              else if (threshold === 't0') prefSeverity = 'high';
              const built = buildNotification(first, remainingMap, first?.message ?? '', { defaultTitle: first?.message ?? 'Notification', preferredType: 'bay', preferredSeverity: prefSeverity });
              // choose visuals based on severity
              const notifBg = built.severity === 'high' ? '#FDECEA' : built.severity === 'medium' ? '#FFF9E6' : '#EAF6EE';
              const titleColor = built.severity === 'high' ? '#7E0000' : built.severity === 'medium' ? '#8A6B00' : '#1B5E20';
              return (
                <>
                  <Animated.View style={{ backgroundColor: notifBg, padding: 0, borderRadius: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {MaterialIcons ? <MaterialIcons name={built.icon as any} size={18} color={titleColor} style={{ marginRight: 8 }} /> : null}
                      <Text style={[styles.notifTitle, { color: titleColor }]}>{built.title}</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 8 }} />
                    <Text style={styles.notifBody}>{built.body}</Text>
                  </Animated.View>
                </>
              );
            })()}
          </Animated.View>
        </Pressable>
      )}
      <ConfirmModal
        visible={logoutModalVisible}
        title="Confirm Logout"
        message="Are you sure you want to log out?"
        confirmText="Log out"
        cancelText="Cancel"
        onConfirm={performLogout}
        onCancel={() => setLogoutModalVisible(false)}
      />
      {/* (Preview modal removed) */}
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
  headerBannerImage: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    marginBottom: 8,
    marginTop:30,
    backgroundColor: 'transparent',
  },
  headerBannerOverlay: { flex: 1, justifyContent: 'space-between', padding: 16, alignItems: 'flex-start' },
  headerBannerTitle: { color: '#fff',marginTop:12, fontSize: 20, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  headerBannerDate: { color: '#fff', marginBottom: 4, marginTop: 50, fontSize: 13 ,fontWeight: '600' },
  headerBannerTime: { color: '#fff', fontSize: 13, fontWeight: '600' },
  headerDateTimeRow: { marginBottom: 12 },
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
  /* Info panel above clicked bay */
  infoPanel: { position: 'absolute', bottom: 56, left: '50%', transform: [{ translateX: -80 }], zIndex: 50, alignItems: 'center' },
  infoCaret: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff', marginBottom: -1 },
  infoCard: { minWidth: 160, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 8, borderWidth: 1, borderColor: '#E6E6E6' },
  infoTitle: { fontWeight: '800', color: '#17321d', marginBottom: 6 },
  infoRow: { fontSize: 13, color: '#333', marginBottom: 4 },
  // highlight styling for the bay that has its InfoPanel open
  selectedBayBox: { borderWidth: 3, borderColor: '#FFD54F', shadowColor: '#FFD54F', shadowOpacity: 0.35, shadowRadius: 6, elevation: 6 },
  // small caret placed above the bay box to indicate it is the active selection
  selectedBayCaret: { position: 'absolute', top: -10, left: '50%', marginLeft: -8, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#000', zIndex: 9999 },
  notificationsPanel: { position: 'absolute', right: 20, top: 90, width: 260, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 10, borderWidth: 1, borderColor: '#E6E6E6', zIndex: 2000, maxHeight: 420 },
  notifItem: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 6, borderRadius: 6, backgroundColor: '#FFF' },
  // Alternate styles that match System Settings "Saved" notification
  notifItemAlt: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E6E6', marginBottom: 8, borderRadius: 8, backgroundColor: '#F4F8F3' },
  notifTitleAlt: { fontSize: 15, color: '#2E3B2B', fontWeight: '800' },
  notifBodyAlt: { fontSize: 13, color: '#444', marginTop: 6 },
  notifDismissButtonAlt: { backgroundColor: 'transparent', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  // legacy simple styles (kept for backward compatibility)
  notifMessage: { fontSize: 13, color: '#111', fontWeight: '700' },
  notifTime: { fontSize: 12, color: '#666', marginTop: 4 },
  notifDismissButton: { backgroundColor: '#C62828', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  // Transient overlay styles (match System Settings)
  notifOverlay: { position: 'absolute', top: 18, right: 18, zIndex: 9999 },
  notifBox: { width: 300, maxWidth: '90%', backgroundColor: '#F4F8F3', borderRadius: 8, padding: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 4 },
  notifClose: { position: 'absolute', top: 8, right: 8, padding: 6 },
  notifTitle: { fontSize: 16, fontWeight: '800', color: '#2E3B2B', paddingRight: 28 },
  notifBody: { fontSize: 14, color: '#444', marginTop: 6 },
});
