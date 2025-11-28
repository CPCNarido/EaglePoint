import React, { useEffect, useState } from "react";
import DispatcherHeader from "../DispatcherHeader";
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, useWindowDimensions, Platform, TextInput } from "react-native";
import ErrorModal from '../../../components/ErrorModal';
import ConfirmModal from '../../../components/ConfirmModal';
import { useGlobalModal } from '../../../components/GlobalModalProvider';
import Toast from '../../../components/Toast';
import { friendlyMessageFromThrowable } from '../../../lib/errorUtils';
import { MaterialIcons } from "@expo/vector-icons";
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import { isServicemanRole } from '../../utils/staffHelpers';

type BayRow = {
  bay_id: number;
  bay_number: string | number;
  status: string | null;
  originalStatus?: string | null;
  player_name?: string | null;
  player?: { nickname?: string; full_name?: string; player_id?: number } | null;
  end_time?: string | null;
  total_balls?: number | null;
};

const getColorFromStatus = (status: string | null) => {
  switch (String(status)) {
    case 'Maintenance':
      return '#C62828';
    case 'Occupied':
    case 'Assigned':
      return '#A3784E';
    case 'Open':
    case 'OpenTime':
      return '#BF930E';
    case 'SpecialUse':
    case 'Reserved':
      return '#6A1B9A'; // purple for reserved/special use
    case 'Available':
    default:
      return '#2E7D32';
  }
};

const getStatusLabel = (status: string | null) => {
  const s = String(status ?? '').trim();
  if (!s) return 'Available';
  if (s === 'SpecialUse') return 'Reserved';
  return s;
};

export default function DashboardTab({ userName, counts, assignedBays }: { userName?: string; counts?: { availableBays?: number; totalBays?: number; servicemenAvailable?: number; servicemenTotal?: number; waitingQueue?: number }; assignedBays?: number[] | null }) {
  const [overview, setOverview] = useState<any | null>(null);
  const [bays, setBays] = useState<BayRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Pagination for bay grid: show pageSize bays per page (4 per row * 3 rows)
  const [page, setPage] = useState<number>(1);
  const pageSize = 12;
  const [selectedBay, setSelectedBay] = useState<BayRow | null>(null);
  // Action modals for bay operations
  const [reserveName, setReserveName] = useState<string>('');
  const [reserveReason, setReserveReason] = useState<string>('');
  const [openName, setOpenName] = useState<string>('');
  const [openReason, setOpenReason] = useState<string>('');
  const [assignServicemanName, setAssignServicemanName] = useState<string>('');
  const [showReserveModal, setShowReserveModal] = useState<boolean>(false);
  const [showOpenTimeModal, setShowOpenTimeModal] = useState<boolean>(false);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  // Edit modal state for dispatcher to edit serviceman/player
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editPlayerName, setEditPlayerName] = useState<string>('');
  const [editServicemanId, setEditServicemanId] = useState<number | null>(null);
  const [servicemen, setServicemen] = useState<any[]>([]);
  const [editActionLoading, setEditActionLoading] = useState<boolean>(false);
  // toast for small success messages
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastTitle, setToastTitle] = useState<string | undefined>(undefined);
  const _showToast = (title: string | undefined, msg: string, ms: number = 2000) => {
    setToastTitle(title);
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), ms);
  };
  // mark intentionally-unused function as used
  void _showToast;
  // Note: use centralized ErrorModal with `errorModalType='success'` for success messages

  // Helper to safely extract a server-sent message from the result returned by postJson
  const extractServerMessage = (res: any) => {
    try {
      if (!res) return null;
      const pb = res.parsedBody;
      if (pb) {
        if (typeof pb === 'string') return pb;
        if (typeof pb === 'object') {
          // common shapes: { message: '...', error: '...' }
          return (pb.message ?? pb.error ?? (pb.detail ?? null)) as any;
        }
      }
      if (res?.error && typeof res.error === 'object') return res.error.message ?? String(res.error);
      if (res?.error && typeof res.error === 'string') return res.error;
      return null;
    } catch (_e) { void _e; return null; }
  };
  // stopwatch map: bayNumber/string -> start timestamp (ms)
  const [stopwatches, setStopwatches] = useState<Record<string, number>>({});
  // lightweight tick state to re-render stopwatch displays every second
  const [, setTick] = useState(0);
  // compact/minimize bay grid for batch actions
  const [minimizeBays, setMinimizeBays] = useState<boolean>(false);
  // batch end in-progress
  const [batchEnding, setBatchEnding] = useState<boolean>(false);
  // selected bays for batch end
  const [batchSelectedBays, setBatchSelectedBays] = useState<(number | string)[]>([]);
  // selection mode: when true tapping a bay toggles selection instead of opening per-bay modal
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const { width: _width } = useWindowDimensions();
  // mark intentionally-unused local to satisfy linter
  void _width;

  // centralized error modal state
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string>('');
  const [errorModalType, setErrorModalType] = useState<any | null>(null);
  const [errorModalDetails, setErrorModalDetails] = useState<any>(null);
  const [_errorModalTitle, setErrorModalTitle] = useState<string | undefined>(undefined);
  void _errorModalTitle;

  // Global modal API (centralized success/error modal)
  const globalModal = useGlobalModal();

  const showError = (err: any, fallback?: string) => {
    const friendly = friendlyMessageFromThrowable(err, fallback ?? 'An error occurred');
    setErrorModalType(friendly?.type ?? 'other');
    setErrorModalMessage(friendly?.message ?? (fallback ?? 'An error occurred'));
    setErrorModalDetails(friendly?.details ?? (typeof err === 'string' ? err : null));
    setErrorModalTitle(fallback ?? undefined);
    setErrorModalVisible(true);
  };
  // Confirm modal state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ title?: string; message?: string; confirmText?: string; cancelText?: string; onConfirm?: () => void }>({});
  const showConfirm = (cfg: { title?: string; message?: string; confirmText?: string; cancelText?: string; onConfirm?: () => void }) => {
    setConfirmConfig(cfg || {});
    setConfirmVisible(true);
  };
  
  const getPageSizeLocal = () => minimizeBays ? 20 : pageSize;

  const formatMsForDisplay = (ms: number) => {
    try {
      if (ms <= 0) return '0:00';
      const totalSecs = Math.floor(ms / 1000);
      if (totalSecs >= 3600) {
        const hrs = Math.floor(totalSecs / 3600);
        const rem = totalSecs % 3600;
        const mins = Math.floor(rem / 60);
        const secs = rem % 60;
        const hh = String(hrs).padStart(2, '0');
        const mm = String(mins).padStart(2, '0');
        const ss = String(secs).padStart(2, '0');
        return `${hh}:${mm}:${ss} hrs`;
      }
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const mm = String(mins).padStart(2, '0');
      const ss = String(secs).padStart(2, '0');
      return `${mm}:${ss} mins`;
    } catch (_e) { void _e; return '—'; }
  };

  // Compute display time for a bay: prefer explicit stopwatch, otherwise only
  // show elapsed/remaining when the session is considered started (balls >= 1).
  // NOTE: intentionally ignore any server-provided `session_started` hint and
  // rely only on delivered-ball counts to match admin/cashier behavior exactly.
  const computeBayTime = (row: any, fallbackNum: number) => {
    try {
      const id = String(row?.bay_number ?? row?.bay_id ?? fallbackNum);
      // explicit client-side stopwatch wins
      const swStart = stopwatches?.[id];
      if (swStart) {
        const elapsed = Date.now() - swStart;
        if (elapsed <= 0) return { time: '0:00', timeLabel: 'Time:' };
        return { time: formatMsForDisplay(elapsed), timeLabel: 'Time:' };
      }

      // Determine whether the session should be considered started.
      // Use only delivered-ball counts (>=1) to decide — do not use
      // server-side `session_started` hints. This keeps dispatcher in sync
      // with admin/cashier which start timers only when a ball has been
      // delivered.
      const balls = Number(row?.total_balls ?? row?.balls_used ?? row?.bucket_count ?? row?.transactions_count ?? row?.totalBuckets ?? row?.totalBalls ?? 0) || 0;
      const sessionStarted = balls >= 1;

      // If the session hasn't started yet, show a not-started indicator
      if (!sessionStarted) return { time: '—', timeLabel: '' };

      // Session started: for *timed* sessions prefer showing remaining time
      // (when `end_time` is present). Otherwise fall back to elapsed time
      // derived from `start_time`. This prevents timed sessions from being
      // displayed as open/stopwatch when an `end_time` exists.
      const end = row?.end_time ? new Date(row.end_time) : null;
      if (end && !isNaN(end.getTime())) {
        const ms = end.getTime() - Date.now();
        if (ms <= 0) return { time: 'Expired', timeLabel: 'Remaining:' };
        return { time: formatMsForDisplay(ms), timeLabel: 'Remaining:' };
      }

      // No valid end_time: show elapsed time if a start_time is present
      const startStr = (row as any)?.start_time ?? (row?.player && (row.player as any).start_time) ?? null;
      if (startStr) {
        const ts = new Date(startStr).getTime();
        if (!isNaN(ts)) {
          const elapsed = Date.now() - ts;
          if (elapsed <= 0) return { time: '0:00', timeLabel: 'Time:' };
          return { time: formatMsForDisplay(elapsed), timeLabel: 'Time:' };
        }
      }

      return { time: '—', timeLabel: '' };
    } catch (_e) { return { time: '—', timeLabel: '' }; }
  };

  const getVisibleBayIds = () => {
    const total = Number(overview?.totalBays ?? 45);
    const pageSizeLocal = getPageSizeLocal();
    const startIdx = (page - 1) * pageSizeLocal;
    const endIdx = Math.min(startIdx + pageSizeLocal, total);
    const ids: (number | string)[] = [];
    for (let idx = startIdx; idx < endIdx; idx++) {
      const num = idx + 1;
      const row = bays.find((b) => String(b.bay_number) === String(num) || String(b.bay_id) === String(num));
      ids.push(row?.bay_number ?? row?.bay_id ?? num);
    }
    return ids;
  };

  const selectVisible = () => {
    try {
      const ids = getVisibleBayIds();
      const activeIds = ids.filter((id) => {
        const b = (bays || []).find((x) => String(x.bay_number) === String(id) || String(x.bay_id) === String(id));
        const s = String(b?.status ?? '').toLowerCase();
        return !!(s && (s.includes('occupied') || s.includes('assigned') || s.includes('open') || s.includes('opentime') || s.includes('timed')));
      });
      setBatchSelectedBays((prev) => {
        const copy = Array.from(prev || []);
        for (const id of activeIds) {
          if (copy.findIndex((x) => String(x) === String(id)) < 0) copy.push(id);
        }
        return copy;
      });
    } catch {}
  };

  const selectAllActive = () => {
    try {
      const ids = (bays || []).filter((b) => {
        const s = String(b?.status ?? '').toLowerCase();
        return !!(s && (s.includes('occupied') || s.includes('assigned') || s.includes('open') || s.includes('opentime') || s.includes('timed')));
      }).map((b) => b?.bay_number ?? b?.bay_id).filter(Boolean);
      setBatchSelectedBays(Array.from(new Set(ids)) as any);
    } catch {}
  };

  // determine baseUrl similarly to Admin UI (supports override)
  const resolveBaseUrl = async () => {
    let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
    try {
      // @ts-ignore dynamic import to avoid bundler issues on web
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) {
          // Quick health probe for the override. If it's reachable, return it.
          try {
            const controller = new AbortController();
            const t = setTimeout(() => { try { controller.abort(); } catch {} }, 1500);
            const url = `${override.replace(/\/$/, '')}/api/health`;
            const r = await fetch(url, { method: 'GET', signal: controller.signal }).catch(() => null);
            clearTimeout(t);
            if (r && r.ok) {
              baseUrl = override;
            } else {
              // remove stale override so subsequent resolution can fall back
              try { await AsyncStorage.removeItem('backendBaseUrlOverride'); } catch {}
              console.warn('Removed unreachable backendBaseUrlOverride', override);
            }
          } catch (e) { void e;
            try { await AsyncStorage.removeItem('backendBaseUrlOverride'); } catch {}
          }
        }
    } catch {}
    return baseUrl;
  };

  // Prevent overlapping overview fetches
  const isFetchingRef = React.useRef(false);
  const prevOverviewJsonRef = React.useRef<string | null>(null);

  const fetchOverview = React.useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    let showGlobalLoading = false;
    try {
      // Only show the global loading spinner for the initial load. Subsequent
      // polling should update data silently to avoid flicker.
      showGlobalLoading = prevOverviewJsonRef.current == null;
      if (showGlobalLoading) setLoading(true);
      const baseUrl = await resolveBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/api/dispatcher/overview`, { method: 'GET' });
      if (!res.ok) {
        if (showGlobalLoading) setLoading(false);
        setOverview(null);
        return;
      }
      const data = await res.json();
      try {
        const dataJson = JSON.stringify(data);
        // If payload changed, update; otherwise skip to avoid extra renders
        if (prevOverviewJsonRef.current !== dataJson) {
          prevOverviewJsonRef.current = dataJson;
          setOverview(data);
        }
      } catch {
        setOverview(data);
      }
    } catch (e) { void e;
      setOverview(null);
    } finally {
      // Turn off the spinner only if we turned it on earlier
      if (showGlobalLoading) setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const fetchBays = async () => {
    try {
      const baseUrl = await resolveBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/api/dispatcher/bays`, { method: 'GET' });
  if (!res.ok) return setBays([]);
  const data = await res.json();
      setBays(Array.isArray(data) ? data : []);
    } catch (_e) { void _e; setBays([]); }
  };

  // When bays load, initialize stopwatches from server-provided start_time so
  // stopwatches survive logout/login or full page reloads.
  useEffect(() => {
    try {
      setStopwatches((prev) => {
        const copy = { ...prev };
        (bays || []).forEach((b) => {
          try {
            const id = String(b.bay_number ?? b.bay_id ?? '');
            if (!id) return;
            // If we already have a stopwatch for this bay, keep it
            if (copy[id]) return;
            // Only initialize for open/occupied sessions without an end_time
            const isOpen = !b.end_time;
            if (!isOpen) return;
            // Prefer top-level start_time, then player.start_time
            const startStr = (b as any).start_time ?? (b.player && (b.player as any).start_time) ?? null;
            if (!startStr) return;
            // Diagnostic: log candidate stopwatch initialization
            try {
              const balls = Number((b as any).total_balls ?? (b as any).balls_used ?? (b as any).bucket_count ?? (b as any).transactions_count ?? 0) || 0;
              try { console.debug('[Dashboard] stopwatch candidate', { id, startStr, balls }); } catch (_e) { void _e; }
              if (balls < 1) return;
            } catch (_e) { void _e; return; }
            const ts = new Date(startStr).getTime();
            if (!isNaN(ts)) {
              try { console.debug('[Dashboard] initializing stopwatch', { id, ts }); } catch (_e) { void _e; }
              copy[id] = ts;
            }
          } catch (_e) { void _e; /* ignore per-bay errors */ }
        });
        return copy;
      });
          } catch (_e) { void _e; }
  }, [bays]);

  // small helper to POST JSON to an endpoint
  const postJson = async (url: string, body?: any) => {
    try {
      const res = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      // Attempt to parse JSON/text body for better error messages. We keep
      // backward-compatible shape by returning an object with `ok` and
      // `status` so existing checks like `res && res.ok` continue to work.
      let parsedBody: any = null;
      try {
        // clone if Response-like so we don't consume body elsewhere
        // @ts-ignore
        if (res && typeof res.clone === 'function' && typeof res.clone().json === 'function') {
          try { parsedBody = await res.clone().json(); } catch { try { parsedBody = await res.clone().text(); } catch {} }
        }
      } catch (e) { void e;
        // ignore parse errors
      }
      return { ok: !!(res && (res as any).ok), status: res ? (res as any).status : null, parsedBody, response: res };
    } catch (e) { void e;
      return { ok: false, status: null, parsedBody: null, response: null, error: e };
    }
  };

  // --- Timed-session end handling & notifications ---
  // Keep track of scheduled timers so we can clear/reschedule when bay data changes
  const scheduledTimersRef = React.useRef<Record<string, any>>({});
  // Ensure we only notify once per session end event for a bay until it becomes occupied again
  const notifiedRef = React.useRef<Record<string, boolean>>({});

  const playNotification = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = 880;
            o.connect(g);
            g.connect(ctx.destination);
            g.gain.value = 0.001;
            o.start();
            // ramp up then down for a small beep
            g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
            setTimeout(() => { try { o.stop(); ctx.close(); } catch {} }, 450);
          }
        } catch (e) { void e;
          // ignore audio failures on web
        }
        return;
      }

      // Native: try Expo Haptics first, fallback to Vibration
      try {
        // dynamic import so bundler won't break if expo-haptics isn't present in some environments
        // @ts-ignore
        const Haptics = await import('expo-haptics').catch(() => null);
        if (Haptics && Haptics.notificationAsync) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
      } catch (e) { void e;
        // ignore
      }

      try {
        const { Vibration } = await import('react-native');
        Vibration.vibrate?.(300);
      } catch {}
    } catch {}
  };

  const notifyAndReleaseBay = React.useCallback(async (bayNum: number | string) => {
    // guard: if we've already notified for this bay, skip
    try { if (notifiedRef.current[String(bayNum)]) return; } catch {}
    try {
      // Play a short notification sound or haptic
      playNotification();

      // Optimistically mark the bay available locally so dispatcher sees immediate change
      setBays((prev) => {
        return (prev || []).map((b) => {
          const match = String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum);
          if (!match) return b;
          return { ...b, status: 'Available', player_name: null, player: null, end_time: null, total_balls: null };
        });
      });

      // Try to notify backend to end the session. Try a couple of plausible endpoints; failures are non-fatal.
      try {
        const baseUrl = await resolveBaseUrl();
        // First, try the admin override endpoint (known API): action 'End Session'
        try {
          const res = await fetchWithAuth(`${baseUrl}/api/admin/bays/${bayNum}/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'End Session' }) });
          if (!(res && res.ok)) {
            // fallback to a couple of legacy/alternative endpoints if admin override isn't present
            const candidates = [
              `${baseUrl}/api/dispatcher/bays/${bayNum}/end`,
              `${baseUrl}/api/session/end`,
            ];
            for (const url of candidates) {
              try {
                const body = url.endsWith('/end') ? undefined : JSON.stringify({ bayNo: bayNum });
                const r2 = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
                if (r2 && (r2.ok || r2.status === 404 || r2.status === 405)) {
                  if (r2.ok) break;
                }
              } catch (_e) { void _e; }
            }
          }
        } catch (e) { void e;
          // ignore and attempt fallbacks
          const candidates = [
            `${baseUrl}/api/dispatcher/bays/${bayNum}/end`,
            `${baseUrl}/api/session/end`,
          ];
          for (const url of candidates) {
            try {
              const body = url.endsWith('/end') ? undefined : JSON.stringify({ bayNo: bayNum });
              const r2 = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
              if (r2 && (r2.ok || r2.status === 404 || r2.status === 405)) {
                if (r2.ok) break;
              }
            } catch (_e) { void _e; }
          }
        }
      } catch (e) { void e;
        // ignore backend errors
      }

      // mark notified so we don't repeat for same session
      notifiedRef.current[String(bayNum)] = true;

  // Stop any running stopwatch for this bay (we're releasing it)
  try { setStopwatches((prev) => { const copy = { ...prev }; delete copy[String(bayNum)]; return copy; }); } catch {}

      // refresh overview in background so server-side state is eventually reflected
      try { fetchOverview(); } catch {}
    } catch (e) { void e;
      // ignore notify errors
    }
  }, [resolveBaseUrl, fetchOverview]);

  // End session on server and ensure DB records the session end. Returns true on success.
  const endSessionOnServer = React.useCallback(async (bayNum: number | string) => {
    try {
      const baseUrl = await resolveBaseUrl();
      // First try admin override endpoint which should record and end session
      try {
        const res = await fetchWithAuth(`${baseUrl}/api/admin/bays/${bayNum}/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'End Session' }) });
        if (res && res.ok) return true;
      } catch (e) { void e;
        // continue to fallbacks
      }

      // Fallback endpoints
      const candidates = [
        `${baseUrl}/api/dispatcher/bays/${bayNum}/end`,
        `${baseUrl}/api/session/end`,
      ];
      for (const url of candidates) {
        try {
          const body = url.endsWith('/end') ? undefined : JSON.stringify({ bayNo: bayNum });
          const r2 = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          if (r2 && r2.ok) return true;
        } catch (e) { void e; /* ignore and try next */ }
      }
    } catch (e) { void e;
      // ignore
    }
    return false;
  }, [resolveBaseUrl]);

  // openBatchModal removed — selection is handled inline via isSelecting

  const toggleBatchSelect = (id: number | string) => {
    try {
      // Only allow selecting active bays
      const bay = (bays || []).find((b) => String(b.bay_number) === String(id) || String(b.bay_id) === String(id));
      const s = String(bay?.status ?? '').toLowerCase();
      const active = !!(s && (s.includes('occupied') || s.includes('assigned') || s.includes('open') || s.includes('opentime') || s.includes('timed')));
      if (!active) {
        // ignore attempts to select inactive bays
        return;
      }
      setBatchSelectedBays((prev) => {
        const copy = Array.from(prev || []);
        const idx = copy.findIndex((x) => String(x) === String(id));
        if (idx >= 0) { copy.splice(idx, 1); return copy; }
        copy.push(id);
        return copy;
      });
    } catch {}
  };

  const performBatchEnd = React.useCallback(async () => {
    try {
      if (!batchSelectedBays || batchSelectedBays.length === 0) {
        try { showError('No bays selected'); } catch {}
        return;
      }
      setBatchEnding(true);
      let success = 0, failed = 0;
      for (const bayNum of batchSelectedBays) {
        try {
          const ok = await endSessionOnServer(bayNum);
          if (ok) {
            success++;
            // ensure local stopwatch for this bay is cleared
            try { setStopwatches((prev) => { const copy = { ...prev }; delete copy[String(bayNum)]; return copy; }); } catch {}
            // mark notified so we don't re-notify for the same session
            try { notifiedRef.current[String(bayNum)] = true; } catch {}
          } else {
            failed++;
          }
          // small throttle so we don't overwhelm backend
          await new Promise((r) => setTimeout(r, 120));
        } catch (_e) { void _e; failed++; }
      }
      // After all attempts, fetch authoritative state from server so DB changes are reflected
      try { await fetchOverview(); await fetchBays(); } catch {}
          setBatchEnding(false);
          // after batch end, exit selection mode and clear selections
          setIsSelecting(false);
          setBatchSelectedBays([]);
          try {
            // show a clear summary of results (completed / failed)
            globalModal.showSuccess('Batch End Results', `Completed: ${success}\nFailed: ${failed}`);
          } catch (_e) { /* ignore UI show errors */ }
    } catch (e) { void e;
      setBatchEnding(false);
      try { showError('An error occurred performing the batch end.'); } catch {}
    }
  }, [batchSelectedBays, endSessionOnServer, fetchOverview, fetchBays]);

  // tick effect for stopwatches (re-renders every 1s)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Whenever bays change, schedule timers for timed sessions that will end
  useEffect(() => {
    // clear timers for bays that no longer exist or changed
    const newTimers: Record<string, any> = {};
    const keep = new Set<string>();
    (bays || []).forEach((b) => {
      const id = String(b.bay_number ?? b.bay_id ?? '');
      if (!id) return;
      // if bay has no end_time, clear any scheduled timer and reset notified flag
      if (!b.end_time) {
        try { if (scheduledTimersRef.current[id]) { clearTimeout(scheduledTimersRef.current[id]); } } catch {}
        try { delete scheduledTimersRef.current[id]; } catch {}
        notifiedRef.current[id] = false;
        return;
      }
      // parse end_time; ensure it's a Date string
      let end: Date | null = null;
      try { end = new Date(b.end_time); if (isNaN(end.getTime())) end = null; } catch { end = null; }
      if (!end) return;
      const ms = end.getTime() - Date.now();
      // If already passed and we haven't notified, mark as notified and notify immediately
      if (ms <= 0 && !notifiedRef.current[id]) {
        try { notifiedRef.current[id] = true; } catch {}
        notifyAndReleaseBay(id);
        return;
      }
      // If time remaining is reasonable (< 24h) schedule a timer
      if (ms > 0 && ms < 1000 * 60 * 60 * 24 && !scheduledTimersRef.current[id]) {
        const t = setTimeout(() => {
          notifyAndReleaseBay(id);
          try { delete scheduledTimersRef.current[id]; } catch {}
        }, ms + 250); // small buffer
        scheduledTimersRef.current[id] = t;
        newTimers[id] = t;
        keep.add(id);
      }
    });

    // cleanup timers that are no longer needed
    Object.keys(scheduledTimersRef.current || {}).forEach((k) => {
      if (!keep.has(k)) {
        try { clearTimeout(scheduledTimersRef.current[k]); } catch {}
        try { delete scheduledTimersRef.current[k]; } catch {}
      }
    });

    return () => {
      // component unmount: clear all scheduled timers
      Object.values(scheduledTimersRef.current || {}).forEach((t) => { try { clearTimeout(t); } catch {} });
      scheduledTimersRef.current = {};
    };
  }, [bays, notifyAndReleaseBay]);

  useEffect(() => {
    // initial load
    fetchOverview();
    fetchBays();

    // Poll every 2 seconds (matches admin behavior). Use a guarded fetchOverview
    // to avoid overlapping requests.
    const interval = setInterval(() => {
      try { fetchOverview(); } catch { }
      try { fetchBays(); } catch { }
    }, 2000);

    // Debounced explicit update event handling (other parts of the app can
    // dispatch `overview:updated` to request a reload). Wait 2s after the
    // event before reloading so DB writes have propagated.
    let overviewUpdateTimer: any = null;
    const onOverviewUpdated = () => {
      try { if (overviewUpdateTimer) clearTimeout(overviewUpdateTimer); } catch {}
      overviewUpdateTimer = setTimeout(() => { try { fetchOverview(); } catch {} }, 2000);
    };
    try {
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('overview:updated', onOverviewUpdated as EventListener);
    } catch {}

    return () => {
      clearInterval(interval);
      try { if (overviewUpdateTimer) clearTimeout(overviewUpdateTimer); } catch {}
      try { if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('overview:updated', onOverviewUpdated as EventListener); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for explicit stopwatch clear events from other dispatcher screens
  useEffect(() => {
    const onClear = (ev: any) => {
      try {
        const bay = (ev && ev.detail && (ev.detail.bay ?? ev.detail.bayNo)) ?? (ev && ev.bay) ?? null;
        if (!bay) return;
        try { setStopwatches((prev) => { const copy = { ...prev }; delete copy[String(bay)]; return copy; }); } catch {}
        try { console.debug('[Dashboard] cleared stopwatch for bay', bay); } catch (_e) { void _e; }
      } catch (_e) { void _e; }
    };
    try { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('stopwatch:clear', onClear as EventListener); } catch (_e) { void _e; }
    return () => { try { if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('stopwatch:clear', onClear as EventListener); } catch (_e) { void _e; } };
  }, []);

  const renderOverviewCards = () => {
    const total = overview?.totalBays ?? '—';
    const available = overview?.availableBays ?? '—';
    const occupied = overview?.occupiedBays ?? '—';
    const staff = overview?.staffOnDuty ?? '—';
    return (
      <View style={styles.overviewContainer}>
        <View style={[styles.overviewCard, { borderLeftColor: '#2E7D32' }]}>
          <Text style={styles.overviewTitle}>Available Bays</Text>
          <Text style={[styles.overviewValue, { color: '#2E7D32' }]}>{String(available)}</Text>
          <Text style={styles.overviewSubtitle}>{`${available} / ${total}`}</Text>
        </View>
        <View style={[styles.overviewCard, { borderLeftColor: '#33691E' }]}>
          <Text style={styles.overviewTitle}>Staff On Duty</Text>
          <Text style={[styles.overviewValue, { color: '#33691E' }]}>{String(staff)}</Text>
          <Text style={styles.overviewSubtitle}>Total staff</Text>
        </View>
        <View style={[styles.overviewCard, { borderLeftColor: '#BF930E' }]}>
          <Text style={styles.overviewTitle}>Occupied</Text>
          <Text style={[styles.overviewValue, { color: '#BF930E' }]}>{String(occupied)}</Text>
          <Text style={styles.overviewSubtitle}>Bays currently occupied</Text>
        </View>
        <View style={[styles.overviewCard, { borderLeftColor: '#C62828' }]}>
          <Text style={styles.overviewTitle}>Next Tee Time</Text>
          <Text style={[styles.overviewValue, { color: '#C62828' }]}>{overview?.nextTeeTime ? (overview.nextTeeTime === 'Bay Ready' ? 'Bay Ready' : new Date(overview.nextTeeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—'}</Text>
          <Text style={styles.overviewSubtitle}>{overview?.nextTeeTime && overview.nextTeeTime !== 'Bay Ready' ? new Date(overview.nextTeeTime).toLocaleDateString() : ''}</Text>
        </View>
      </View>
    );
  };

  const renderBays = () => {
    const total = Number(overview?.totalBays ?? 45);
    const grid = Array.from({ length: total }).map((_, idx) => {
      const num = idx + 1;
      const row = bays.find((b) => String(b.bay_number) === String(num) || String(b.bay_id) === String(num));
      const status = row?.status ?? 'Available';
      const color = getColorFromStatus(status);
      const player = row?.player_name ?? row?.player?.nickname ?? '—';
      

      const { time, timeLabel } = computeBayTime(row, num);

      const displayNumber = row?.bay_number ?? num;
  const bayId = row?.bay_number ?? row?.bay_id ?? num;
  const isSelected = (batchSelectedBays || []).findIndex((x) => String(x) === String(bayId)) >= 0;
  const s = String(row?.status ?? '').toLowerCase();
  const isActive = !!(s && (s.includes('occupied') || s.includes('assigned') || s.includes('open') || s.includes('opentime') || s.includes('timed')));
      return (
        <TouchableOpacity
          key={num}
          style={[styles.bayBox, minimizeBays ? styles.bayBoxCompact : {}, { borderColor: color, position: 'relative' }]}
          onPress={() => isSelecting ? (isActive ? toggleBatchSelect(bayId) : null) : setSelectedBay(row ?? null)}
          onLongPress={() => { if (isActive) toggleBatchSelect(bayId); }}
        >
          {/* Checkbox overlay shown when selection mode is active or bay is pre-selected (only for active bays) */}
          {(isSelecting || isSelected) && isActive ? (
            <View style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 6, backgroundColor: isSelected ? '#333' : 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <MaterialIcons name={isSelected ? 'check-box' : 'check-box-outline-blank'} size={18} color={isSelected ? '#fff' : '#333'} />
            </View>
          ) : null}

          <View style={[styles.statusCapsule, { backgroundColor: color }]}> 
            <Text style={styles.statusCapsuleText}>{getStatusLabel(status)}</Text>
            <Text style={styles.bayNumberText}>Bay {String(displayNumber)}</Text>
          </View>
          <Text style={styles.bayInfo}>{player}</Text>
          <Text style={styles.timeText}>{timeLabel ? `${timeLabel} ${time}` : time}</Text>
        </TouchableOpacity>
      );
    });
    return <View style={styles.bayContainer}>{grid}</View>;
  };
  
  // Paginated render wrapper: return the paginated grid and pagination controls
  const renderPaginatedBays = () => {
    const total = Number(overview?.totalBays ?? 45);
    const grid = Array.from({ length: total }).map((_, idx) => {
      const num = idx + 1;
      const row = bays.find((b) => String(b.bay_number) === String(num) || String(b.bay_id) === String(num));
      const status = row?.status ?? 'Available';
      const color = getColorFromStatus(status);
      const player = row?.player_name ?? row?.player?.nickname ?? '—';
      const { time, timeLabel } = computeBayTime(row, num);

      const displayNumber = row?.bay_number ?? num;
      const bayId = row?.bay_number ?? row?.bay_id ?? num;
      const isSelected = (batchSelectedBays || []).findIndex((x) => String(x) === String(bayId)) >= 0;
      const s = String(row?.status ?? '').toLowerCase();
      const isActive = !!(s && (s.includes('occupied') || s.includes('assigned') || s.includes('open') || s.includes('opentime') || s.includes('timed')));
      return (
        <TouchableOpacity
          key={num}
          style={[styles.bayBox, minimizeBays ? styles.bayBoxCompact : {}, { borderColor: color, position: 'relative' }]}
          onPress={() => isSelecting ? (isActive ? toggleBatchSelect(bayId) : null) : setSelectedBay(row ?? null)}
          onLongPress={() => { if (isActive) toggleBatchSelect(bayId); }}
        >
          {/* Checkbox overlay shown when selection mode is active or bay is pre-selected (only for active bays) */}
          {(isSelecting || isSelected) && isActive ? (
            <View style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 6, backgroundColor: isSelected ? '#333' : 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <MaterialIcons name={isSelected ? 'check-box' : 'check-box-outline-blank'} size={18} color={isSelected ? '#fff' : '#333'} />
            </View>
          ) : null}

          <View style={[styles.statusCapsule, { backgroundColor: color }]}> 
            <Text style={styles.statusCapsuleText}>{getStatusLabel(status)}</Text>
            <Text style={styles.bayNumberText}>Bay {String(displayNumber)}</Text>
          </View>
          <Text style={styles.bayInfo}>{player}</Text>
          <Text style={styles.timeText}>{timeLabel ? `${timeLabel} ${time}` : time}</Text>
        </TouchableOpacity>
      );
    });

  const pageSizeLocal = minimizeBays ? 20 : pageSize;
  const startIdx = (page - 1) * pageSizeLocal;
  const endIdx = startIdx + pageSizeLocal;
  const paginated = grid.slice(startIdx, endIdx);

  const totalPages = Math.max(1, Math.ceil(grid.length / pageSizeLocal));

    return (
      <>
        <View style={styles.bayContainer}>{paginated}</View>
        <View style={styles.paginationRow}>
          <TouchableOpacity
            style={[styles.pagePrevButton, page === 1 ? styles.pageNavDisabled : {}]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <Text style={styles.pagePrevText}>Previous</Text>
          </TouchableOpacity>

          <View style={styles.pageList}>
            {(() => {
              const computePages = (cur: number, total: number) => {
                if (total <= 4) return Array.from({ length: total }, (_, i) => i + 1);
                if (cur <= 4) return [1, 2, 3, 4, 'ellipsis', total];
                if (cur >= total - 2) return [1, 'ellipsis', total - 3, total - 2, total - 1, total];
                return [cur - 2, cur - 1, cur, 'ellipsis', total];
              };
              const pages = computePages(page, totalPages);
              return pages.map((p: any, idx: number) => {
                if (p === 'ellipsis') return (<Text key={`ell-${idx}`} style={{ paddingHorizontal: 8 }}>…</Text>);
                const num = Number(p);
                return (
                  <TouchableOpacity key={`page-${num}`} style={[styles.pageButton, page === num ? styles.pageButtonActive : {}]} onPress={() => setPage(num)}>
                    <Text style={page === num ? styles.pageButtonTextActive : styles.pageButtonText}>{num}</Text>
                  </TouchableOpacity>
                );
              });
            })()}
          </View>

          <TouchableOpacity
            style={[styles.pageNextButton, page === totalPages ? styles.pageNavDisabled : {}]}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <Text style={styles.pageNextText}>Next</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  // Handler for saving edits to an assignment. Uses existing logic but is
  // extracted so we can show a confirmation dialog before executing.
  const handleEditSave = async () => {
    if (!selectedBay) return setShowEditModal(false);
    setEditActionLoading(true);
    try {
      const bayNum = selectedBay.bay_number ?? selectedBay.bay_id;
      const baseUrl = await resolveBaseUrl();
      let didOk = false;
      let lastRes: any = null;
      let sessionId: any = (selectedBay as any)?.raw?.session_id ?? (selectedBay as any)?.raw?.id ?? (selectedBay as any)?.raw?.session?.id ?? (selectedBay as any)?.raw?.session?.session_id ?? (selectedBay as any)?.session_id ?? (selectedBay as any)?.id ?? null;

      // If session id is not present on the bay shape, try to find an active session via reports
      if (!sessionId) {
        try {
          const listRes = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions?limit=1000`, { method: 'GET' });
          lastRes = listRes;
          if (listRes && listRes.ok) {
            const rows = await listRes.json();
            if (Array.isArray(rows)) {
              const active = rows.find((s: any) => (Number(s.bay_no) === Number(bayNum) || String(s.bay_no) === String(bayNum)) && !s.end_time);
              if (active) {
                sessionId = active.id ?? active.session_id ?? active._id ?? null;
              }
            }
          }
        } catch (e) { void e;
          // Ignore internal lookup failures; final error UI will surface server response.
        }
      }

      if (sessionId) {
        try {
          const r = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_name: editPlayerName || undefined, serviceman_id: editServicemanId ?? undefined }) });
          lastRes = r;
          if (r && r.ok) {
            didOk = true;
          }
        } catch (e) { void e;
          // fall through to other attempts
        }
      }

      if (!didOk) {
        try {
          const r2 = await fetchWithAuth(`${baseUrl}/api/admin/bays/${bayNum}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerName: editPlayerName || null, servicemanId: editServicemanId }) });
          lastRes = r2;
          if (r2 && r2.ok) didOk = true;
        } catch (e) { void e;
          // ignore
        }
      }

      if (didOk) {
        setBays((prev) => (prev || []).map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, player_name: editPlayerName || b.player_name } as BayRow : b));
        try { await fetchOverview(); await fetchBays(); } catch {}
        // Close the edit modal and show centralized success modal
        try { setShowEditModal(false); } catch {}
        try {
          globalModal.showSuccess('Updated', 'Assignment updated');
        } catch {}
      } else {
        try {
          const serverMsg = extractServerMessage(lastRes);
          const statusPart = lastRes && (lastRes.status || lastRes.status === 0) ? `status=${lastRes.status}` : 'status=unknown';
          const urlPart = lastRes && (lastRes.url || (lastRes?.response && lastRes.response.url)) ? (lastRes.url ?? lastRes.response.url) : 'url=unknown';
          const msg = serverMsg ?? `Update failed: endpoint not found or request rejected (${statusPart} ${urlPart})`;
          showError(msg, 'Update failed');
        } catch (err) {
          showError(err, 'Update failed');
        }
      }
    } catch (e) { void e;
      try { showError(e, 'Update failed'); } catch {}
    } finally {
      setEditActionLoading(false);
      setShowEditModal(false);
    }
  };

  if (loading) return <View style={{ padding: 20 }}><ActivityIndicator /></View>;

  return (
    <>
    <ScrollView style={styles.scrollArea}>
      <View style={styles.contentBox}>
  <DispatcherHeader title="Dashboard" subtitle={userName ? `Dispatcher ${userName}` : 'Dispatcher'} counts={counts} assignedBays={assignedBays} showBadges={true} showBanner={true} bannerSource={require('../../../../assets/General/DispatcherHeroImg.png')} />
        <Text style={styles.sectionTitle}>Quick Overview</Text>
        {renderOverviewCards()}

        <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Real-Time Bay Monitoring</Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={() => setMinimizeBays((v) => !v)}>
            <MaterialIcons name={minimizeBays ? 'unfold-less' : 'unfold-more'} size={18} color="#333" />
            <Text style={{ marginLeft: 8, color: '#333', fontWeight: '700' }}>{minimizeBays ? 'Compact View' : 'Normal View'}</Text>
          </TouchableOpacity>

          {isSelecting ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={{ backgroundColor: '#EEE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={() => { setIsSelecting(false); setBatchSelectedBays([]); }}>
                <Text style={{ color: '#333', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ backgroundColor: '#EEE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={selectVisible}>
                <Text style={{ color: '#333', fontWeight: '700' }}>Select Visible</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ backgroundColor: '#EEE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={selectAllActive}>
                <Text style={{ color: '#333', fontWeight: '700' }}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#C62828' },
                  (batchEnding || !(batchSelectedBays && batchSelectedBays.length > 0)) ? styles.modalButtonConfirmDisabled : null,
                ]}
                onPress={() => {
                  if (batchEnding) return;
                  if (!batchSelectedBays || batchSelectedBays.length === 0) {
                    try { showError('No bays selected. Tap bay blocks to select.'); } catch {}
                    return;
                  }
                  showConfirm({
                    title: 'Confirm Batch End',
                    message: `End ${batchSelectedBays.length} selected bay(s)? This will attempt to end the session for each selected bay.`,
                    confirmText: 'End',
                    cancelText: 'Cancel',
                    onConfirm: () => { try { performBatchEnd(); } catch {} },
                  });
                }}
                disabled={batchEnding || !(batchSelectedBays && batchSelectedBays.length > 0)}
              >
                {batchEnding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{`End Selected (${batchSelectedBays.length || 0})`}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={{ backgroundColor: batchEnding ? '#CCC' : '#C62828', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, position: 'relative' }} onPress={() => { if (batchEnding) return; setIsSelecting(true); setBatchSelectedBays([]); }} disabled={batchEnding}>
              {batchEnding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Batch End Sessions</Text>}
              {batchSelectedBays && batchSelectedBays.length > 0 ? (
                <View style={styles.badgeCircle}>
                  <Text style={styles.badgeText}>{String(batchSelectedBays.length)}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        </View>

        {renderPaginatedBays()}

        {/* Inline selection mode used instead of modal — selection UI is on bay blocks and header controls */}

        {/* Edit Modal - contextual actions based on bay status */}
        <Modal visible={!!selectedBay} transparent animationType="fade" onRequestClose={() => setSelectedBay(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              {selectedBay ? (
                <>
                  <Text style={styles.modalTitle}>Bay {selectedBay.bay_number}</Text>
                  <Text style={styles.modalText}>Status: {selectedBay.status}</Text>
                  <Text style={styles.modalText}>Player: {selectedBay.player_name ?? (selectedBay.player?.nickname ?? '—')}</Text>
                  <Text style={styles.modalText}>Balls used: {String(selectedBay.total_balls ?? '—')}</Text>

                  {/* Contextual actions */}
                  <View style={{ marginTop: 12 }}>
                    {(() => {
                      const s = String(selectedBay.status || 'Available').toLowerCase();
                      // Occupied / Assigned / Open / Timed -> End Session
                      if (s.includes('occupied') || s.includes('assigned') || s.includes('timed') || s === 'open' || s === 'opentime') {
                        return (
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                              <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={async () => {
                                setActionLoading(true);
                                try {
                                  const bayNum = selectedBay.bay_number ?? selectedBay.bay_id;
                                  // Timed session: use timer-based notify flow for automatic release; for manual end prefer server-confirmed end
                                  const baseUrl = await resolveBaseUrl();
                                  const res = await postJson(`${baseUrl}/api/admin/bays/${bayNum}/override`, { action: 'End Session' });
                                  if (res && res.ok) {
                                    // Only update UI after server confirms
                                    setBays((prev) => prev.map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, status: 'Available', player_name: null, player: null, end_time: null, total_balls: null } : b));
                                    try { await fetchOverview(); await fetchBays(); } catch {}
                                  } else {
                                    // server didn't accept: refresh overview to reflect true state
                                    try { await fetchOverview(); await fetchBays(); } catch {}
                                    try { const msg = extractServerMessage(res) ?? 'Failed to end session. Server did not accept the request.'; showError(msg); } catch {}
                                  }
                                } catch (e) { void e;
                                  try { fetchOverview(); } catch {}
                                } finally {
                                  setActionLoading(false);
                                  // clear modal selection and stop any stopwatch for this bay
                                  try {
                                    const idToClear = selectedBay?.bay_number ?? selectedBay?.bay_id;
                                    setSelectedBay(null);
                                    setStopwatches((prev) => { const copy = { ...prev }; delete copy[String(idToClear)]; return copy; });
                                  } catch {}
                                }
                              }}>
                              {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>End Session</Text>}
                            </TouchableOpacity>
                            {/* Edit button to modify player name / serviceman for occupied bays */}
                              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={async () => {
                              // open edit modal and fetch servicemen
                              try {
                                const baseUrl = await resolveBaseUrl();
                                setEditPlayerName(selectedBay?.player_name ?? (selectedBay?.player?.nickname ?? ''));
                                // pre-select current serviceman if present on bay (support multiple possible shapes)
                                const currentSvcId = (selectedBay as any)?.serviceman_id ?? (selectedBay as any)?.serviceman?.id ?? (selectedBay as any)?.raw?.serviceman_id ?? (selectedBay as any)?.raw?.serviceman?.id ?? null;
                                setEditServicemanId(currentSvcId ?? null);
                                setShowEditModal(true);
                                // fetch staff list and filter servicemen
                                try {
                                  const r = await fetchWithAuth(`${baseUrl}/api/admin/staff`, { method: 'GET' });
                                  if (r && r.ok) {
                                    const rows = await r.json();
                                    const svc = Array.isArray(rows) ? rows.filter((s:any) => isServicemanRole(s.role)) : [];
                                    setServicemen(svc);
                                  }
                                } catch (e) { void e; /* ignore fetch failure, still open modal */ }
                                } catch (e) { void e; try { showError(e); } catch {} }
                            }}>
                              <Text style={styles.modalButtonCancelText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setSelectedBay(null)}>
                              <Text style={styles.modalButtonCancelText}>Close</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }

                      // Reserved -> Start Session (opens assign modal)
                      // If bay was reserved (SpecialUse / Reserved), allow a direct Start Session
                      const originalStatus = String(selectedBay.originalStatus ?? selectedBay.status ?? 'Available').toLowerCase();
                      if (originalStatus.includes('reserved') || originalStatus === 'specialuse') {
                        return (
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                            <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={() => {
                              // Confirm before starting session for a reserved bay
                              try {
                                showConfirm({
                                  title: 'Start Session',
                                  message: 'Are you sure you want to start the session for this reserved bay?',
                                  confirmText: 'Start',
                                  cancelText: 'Cancel',
                                  onConfirm: async () => {
                                    setActionLoading(true);
                                    try {
                                      const bayNum = selectedBay.bay_number ?? selectedBay.bay_id;
                                      const baseUrl = await resolveBaseUrl();
                                      const res = await postJson(`${baseUrl}/api/admin/bays/${bayNum}/start`, { nickname: selectedBay.player_name ?? null });
                                        if (res && res.ok) {
                                        // Do not locally set start_time or start a stopwatch here.
                                        // Session should be considered started only when a ball
                                        // is delivered (balls >= 1) and reported by the server.
                                        setBays((prev) => prev.map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, status: 'Occupied', player_name: selectedBay.player_name ?? null } : b));
                                        try { await fetchOverview(); await fetchBays(); } catch {}
                                      } else {
                                        try { await fetchOverview(); await fetchBays(); } catch {}
                                        try { const msg = extractServerMessage(res) ?? 'Failed to start session. Server did not accept the request.'; showError(msg); } catch {}
                                      }
                                    } catch (e) { void e;
                                      try { await fetchOverview(); } catch {}
                                    } finally {
                                      setActionLoading(false);
                                      setSelectedBay(null);
                                    }
                                  }
                                });
                              } catch (e) { void e;
                                // fallback: attempt to start without confirmation
                                (async () => {
                                  setActionLoading(true);
                                  try {
                                    const bayNum = selectedBay.bay_number ?? selectedBay.bay_id;
                                    const baseUrl = await resolveBaseUrl();
                                    const res = await postJson(`${baseUrl}/api/admin/bays/${bayNum}/start`, { nickname: selectedBay.player_name ?? null });
                                      if (res && res.ok) {
                                        // Do not set start_time locally; wait for server activity (balls)
                                        setBays((prev) => prev.map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, status: 'Occupied', player_name: selectedBay.player_name ?? null } : b));
                                        try { await fetchOverview(); await fetchBays(); } catch {}
                                    } else {
                                      try { await fetchOverview(); await fetchBays(); } catch {}
                                      try { const msg = extractServerMessage(res) ?? 'Failed to start session. Server did not accept the request.'; showError(msg); } catch {}
                                    }
                                  } catch (err) { void err;
                                    try { await fetchOverview(); } catch {}
                                  } finally {
                                    setActionLoading(false);
                                    setSelectedBay(null);
                                  }
                                })();
                              }
                            }}>
                              {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Start Session</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setSelectedBay(null)}>
                              <Text style={styles.modalButtonCancelText}>Close</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }

                      // Available -> Reserve or Open Time
                      return (
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                          <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={() => { setShowOpenTimeModal(true); }}>
                                    <Text style={styles.modalButtonText}>Open Time</Text>
                                  </TouchableOpacity>
                          <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => { setShowReserveModal(true); }}>
                            <Text style={styles.modalButtonCancelText}>Reserve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setSelectedBay(null)}>
                            <Text style={styles.modalButtonCancelText}>Close</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })()}
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </Modal>

        {/* Reserve modal */}
        <Modal visible={showReserveModal} transparent animationType="fade" onRequestClose={() => setShowReserveModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Reserve Bay {selectedBay?.bay_number}</Text>
              <TextInput placeholder="Name" value={reserveName} onChangeText={setReserveName} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 }} />
              <TextInput placeholder="Reason" value={reserveReason} onChangeText={setReserveReason} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowReserveModal(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm, (!(reserveName && reserveName.trim()) || actionLoading) ? styles.modalButtonConfirmDisabled : null]}
                  disabled={!(reserveName && reserveName.trim()) || actionLoading}
                  onPress={async () => {
                  setActionLoading(true);
                  try {
                    const bayNum = selectedBay?.bay_number ?? selectedBay?.bay_id;
                    const baseUrl = await resolveBaseUrl();
                    // debug logs removed
                    const res = await postJson(`${baseUrl}/api/admin/bays/${bayNum}/override`, { action: 'Reserved', name: reserveName || null });
                    if (res && res.ok) {
                      setBays((prev) => prev.map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, status: 'Reserved', player_name: reserveName } : b));
                      try { await fetchOverview(); await fetchBays(); } catch {}
                    } else {
                      try { await fetchOverview(); await fetchBays(); } catch {}
                      try { const msg = extractServerMessage(res) ?? 'Failed to reserve bay. Server did not accept the request.'; showError(msg); } catch {}
                    }
                  } catch (e) { void e;
                    try { fetchOverview(); } catch {}
                  } finally {
                    setActionLoading(false);
                    setShowReserveModal(false);
                    setSelectedBay(null);
                  }
                }}>
                  {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Reserve</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit modal - edit player name and assigned serviceman */}
        <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Edit Assignment - Bay {selectedBay?.bay_number}</Text>
              <Text style={{ marginBottom: 6 }}>Player Name</Text>
              <TextInput value={editPlayerName} onChangeText={setEditPlayerName} style={styles.modalInput} />
              <Text style={{ marginTop: 10, marginBottom: 6 }}>Assign Service Man (optional)</Text>
              <ScrollView style={{ maxHeight: 160, marginBottom: 8 }}>
                {servicemen.length === 0 ? (
                  <Text style={{ color: '#666' }}>No servicemen available</Text>
                ) : (
                  servicemen.map((s) => (
                    <TouchableOpacity key={String(s.id ?? s.employee_id ?? s.employeeId)} onPress={() => setEditServicemanId(s.employee_id ?? s.id ?? s.employeeId)} style={[styles.servOption, (editServicemanId === (s.employee_id ?? s.id ?? s.employeeId)) && styles.servOptionActive]}>
                      <Text style={(editServicemanId === (s.employee_id ?? s.id ?? s.employeeId)) ? styles.servOptionTextActive : styles.servOptionText}>{s.full_name ?? s.username ?? s.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowEditModal(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={() => {
                  showConfirm({
                    title: 'Confirm Update',
                    message: 'Save changes to this assignment?',
                    confirmText: 'Save',
                    cancelText: 'Cancel',
                    onConfirm: () => { try { handleEditSave(); } catch {} }
                  });
                }} disabled={editActionLoading}>
                  {editActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Open Time modal */}
        <Modal visible={showOpenTimeModal} transparent animationType="fade" onRequestClose={() => setShowOpenTimeModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Open Time - Bay {selectedBay?.bay_number}</Text>
              <TextInput placeholder="Name" value={openName} onChangeText={setOpenName} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 }} />
              <TextInput placeholder="Reason" value={openReason} onChangeText={setOpenReason} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 }} />
              <TextInput placeholder="Optional Serviceman" value={assignServicemanName} onChangeText={setAssignServicemanName} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowOpenTimeModal(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm, (!(openName && openName.trim()) || actionLoading) ? styles.modalButtonConfirmDisabled : null]} onPress={async () => {
                  // Validate name is present before attempting to open time
                  if (!openName || !openName.trim()) {
                    try { showError('Please enter a name for the open session', 'Validation'); } catch {};
                    return;
                  }
                  setActionLoading(true);
                  try {
                    const bayNum = selectedBay?.bay_number ?? selectedBay?.bay_id;
                    const baseUrl = await resolveBaseUrl();
                    const res = await postJson(`${baseUrl}/api/admin/bays/${bayNum}/start`, { nickname: openName || null, servicemanName: assignServicemanName || null });
                      if (res && res.ok) {
                      // For open time, don't start stopwatch until first ball
                      setBays((prev) => prev.map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, status: 'Open', player_name: openName } : b));
                      try { await fetchOverview(); await fetchBays(); } catch {}
                    } else {
                      try { await fetchOverview(); await fetchBays(); } catch {}
                      try { const msg = extractServerMessage(res) ?? 'Failed to start open time. Server did not accept the request.'; showError(msg); } catch {}
                    }
                  } catch (e) { void e;
                    try { fetchOverview(); } catch {}
                  } finally {
                    setActionLoading(false);
                    setShowOpenTimeModal(false);
                    setSelectedBay(null);
                  }
                }}
                  disabled={!(openName && openName.trim()) || actionLoading}
                >
                  {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Start Open Time</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Assign serviceman / Start Session modal for Reserved */}
        <Modal visible={showAssignModal} transparent animationType="fade" onRequestClose={() => setShowAssignModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Start Session - Bay {selectedBay?.bay_number}</Text>
              <TextInput placeholder="Assign Serviceman (optional)" value={assignServicemanName} onChangeText={setAssignServicemanName} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowAssignModal(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm, ((!selectedBay?.player_name && !selectedBay?.player?.nickname && !selectedBay?.player?.full_name) || actionLoading) ? styles.modalButtonConfirmDisabled : null]}
                  disabled={((!selectedBay?.player_name && !selectedBay?.player?.nickname && !selectedBay?.player?.full_name) || actionLoading)}
                  onPress={async () => {
                    // Require a player name before starting a regular Start Session
                    const nickname = selectedBay?.player_name ?? selectedBay?.player?.nickname ?? selectedBay?.player?.full_name ?? null;
                    if (!nickname || !String(nickname).trim()) {
                      try { showError('Please enter a name for the session', 'Validation'); } catch {}
                      return;
                    }
                    setActionLoading(true);
                    try {
                      const bayNum = selectedBay?.bay_number ?? selectedBay?.bay_id;
                      const baseUrl = await resolveBaseUrl();
                      const res = await postJson(`${baseUrl}/api/admin/bays/${bayNum}/start`, { nickname: nickname, servicemanName: assignServicemanName || null });
                      if (res && res.ok) {
                        // Don't set start_time locally; rely on server to report ball deliveries
                        setBays((prev) => prev.map(b => (String(b.bay_number) === String(bayNum) || String(b.bay_id) === String(bayNum)) ? { ...b, status: 'Occupied', player_name: b.player_name ?? null } : b));
                        try { await fetchOverview(); await fetchBays(); } catch {}
                      } else {
                        try { await fetchOverview(); await fetchBays(); } catch {}
                        try { const msg = extractServerMessage(res) ?? 'Failed to start session. Server did not accept the request.'; showError(msg); } catch {}
                      }
                    } catch (e) { void e;
                      try { fetchOverview(); } catch {}
                    } finally {
                      setActionLoading(false);
                      setShowAssignModal(false);
                      setSelectedBay(null);
                    }
                  }}>
                  {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Start</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  <ErrorModal visible={errorModalVisible} errorType={errorModalType} errorMessage={errorModalMessage} errorDetails={errorModalDetails} onClose={() => setErrorModalVisible(false)} />
  <ConfirmModal visible={confirmVisible} title={confirmConfig.title} message={confirmConfig.message} confirmText={confirmConfig.confirmText} cancelText={confirmConfig.cancelText} onConfirm={() => { try { confirmConfig.onConfirm && confirmConfig.onConfirm(); } catch {} setConfirmVisible(false); }} onCancel={() => setConfirmVisible(false)} />
  {/* Success messages use centralized ErrorModal with type='success' */}
  <Toast visible={toastVisible} title={toastTitle} message={toastMessage} onClose={() => setToastVisible(false)} />

    </>
  );
}



const styles = StyleSheet.create({
  scrollArea: { flex: 1 },
  contentBox: { padding: 16 },
  welcomeText: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  dateText: { color: '#666', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
  overviewContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderLeftWidth: 5, width: '47%', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  overviewTitle: { fontSize: 14, fontWeight: '600' },
  overviewValue: { fontSize: 20, fontWeight: 'bold', marginVertical: 5 },
  overviewSubtitle: { color: '#555', fontSize: 12 },
  // Show four bay boxes per row where possible. Use percentage width with
  // sensible min/max so layout stays stable on narrow screens and large tablets.
  bayContainer: { flexWrap: 'wrap', flexDirection: 'row', gap: 10 },
  bayBox: { flexBasis: '23%', width: '23%', minWidth: 100, maxWidth: 200, borderWidth: 2, borderRadius: 12, padding: 10, backgroundColor: '#fff', margin: 2 },
  // compact bay box for minimize mode
  bayBoxCompact: { minWidth: 70, maxWidth: 140, padding: 6, borderRadius: 8 },
  statusCapsule: { paddingVertical: 6, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  statusCapsuleText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  bayNumberText: { color: '#fff', fontWeight: '700', fontSize: 12, marginTop: 4 },
  bayInfo: { fontSize: 13, color: '#222' },
  timeText: { fontSize: 12, color: '#666', marginTop: 4 },
  // Pagination controls for bay grid
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent:'center', marginTop: 12, flexWrap: 'wrap' },
  pagePrevButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f0f0f0', borderRadius: 6 },
  pageNextButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f0f0f0', borderRadius: 6 },
  pageNavDisabled: { opacity: 0.5 },
  pagePrevText: { color: '#333', fontWeight: '600' },
  pageNextText: { color: '#333', fontWeight: '600' },
  pageList: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  pageButton: { paddingHorizontal: 8, paddingVertical: 6, marginHorizontal: 4, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
  pageButtonActive: { backgroundColor: '#333' },
  pageButtonText: { color: '#333', fontWeight: '600' },
  pageButtonTextActive: { color: '#fff', fontWeight: '700' },
  // Make overlay cover the entire screen (absolute) so it works correctly on web
  // and in nested layouts where flex:1 may not fill the viewport.
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 1000,
  },
  modalBox: { backgroundColor: '#fff', borderRadius: 10, padding: 20, width: '50%', maxWidth: 720 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalText: { fontSize: 14, color: '#333', marginBottom: 6 },
  // Standard modal button group (matches app-wide modal style)
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 5, marginTop: 10 },
  modalButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  modalButtonCancel: { backgroundColor: '#EEE', marginRight: 8 },
  modalButtonCancelText: { color: '#333', fontWeight: '600' },
  modalButtonConfirm: { backgroundColor: '#C62828', marginRight: 8 },
  modalButtonDisabled: { opacity: 0.35 },
  modalButtonConfirmDisabled: { opacity: 0.35 },
  modalButtonText: { color: '#fff', fontWeight: '600' },
  modalInput: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, backgroundColor: '#fff' },
  servOption: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f4f7f4' },
  servOptionActive: { backgroundColor: '#e6f4e6' },
  servOptionText: { color: '#0f2f13' },
  servOptionTextActive: { color: '#0b5a0b', fontWeight: '700' },
  closeButton: { marginTop: 10, backgroundColor: '#007bff', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginRight: 8 },
  closeButtonText: { color: '#fff', fontWeight: '700' },
  badgeCircle: { position: 'absolute', top: -8, right: -8, backgroundColor: '#333', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
