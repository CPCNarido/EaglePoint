import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Dimensions, useWindowDimensions, TextInput } from 'react-native';
import { tw } from 'react-native-tailwindcss';
import { useSettings } from '../../../lib/SettingsProvider';
import ErrorModal from '../../../components/ErrorModal';
import { friendlyMessageFromThrowable } from '../../../lib/errorUtils';

export default function ReportsAndAnalytics() {
  useSettings();
  const [loading, setLoading] = useState(false);
  // header info
  const [adminName, setAdminName] = useState<string>('Admin');
  const [now, setNow] = useState<Date>(new Date());
  const [summary, setSummary] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // centralized error modal state
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string>('');
  const [errorModalType, setErrorModalType] = useState<any | null>(null);
  const [errorModalDetails, setErrorModalDetails] = useState<any>(null);
  const baseDefault = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  const baseUrl = (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;
  const screenWidth = Dimensions.get('window').width - 60; // container padding
  const lineChartWidth = Math.min(screenWidth, 720);
  // Default web chart size values. These can be edited at runtime by the
  // small "Chart sizes" control; edits are persisted to AsyncStorage.
  const DEFAULT_WEB_CHART_SIZE = {
    pieWidth: Math.min(screenWidth * 0.5, 350),
    pieHeight: 150,
    barWidth: 700,
    barHeight: 300,
    // gap between pie and bar (and other chart columns) on web
    chartGap: 30,
    lineWidth: lineChartWidth,
    lineHeight: 50,
  } as const;

  const [WEB_CHART_SIZE, setWebChartSize] = useState(() => ({ ...DEFAULT_WEB_CHART_SIZE }));
  const [showChartSizeEditor, setShowChartSizeEditor] = useState(false);
  // Native (non-web) chart gap - kept as a separate tweakable value so device
  // layout remains unchanged by default but can be overridden via AsyncStorage.
  const DEFAULT_NATIVE_CHART_GAP = 12;
  const [NATIVE_CHART_GAP, setNativeChartGap] = useState<number>(DEFAULT_NATIVE_CHART_GAP);

  // load persisted overrides from AsyncStorage (if available)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // @ts-ignore - dynamic import to avoid bundler-time dependency
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        if (!AsyncStorage) return;
        // load web chart overrides
        const raw = await AsyncStorage.getItem('reports:webChartSize');
        if (raw) {
          try {
            const parsed = JSON.parse(raw || '{}');
            if (mounted && parsed && typeof parsed === 'object') setWebChartSize((s) => ({ ...s, ...parsed }));
          } catch {}
        }
        // load native gap override (optional)
        try {
          const rawGap = await AsyncStorage.getItem('reports:nativeChartGap');
          if (rawGap != null) {
            const v = parseInt(rawGap as any, 10);
            if (!Number.isNaN(v) && mounted) setNativeChartGap(v);
          }
        } catch {}
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const persistWebChartSize = async (next: any) => {
    try {
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (!AsyncStorage) return;
      await AsyncStorage.setItem('reports:webChartSize', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const persistNativeChartGap = async (next: number) => {
    try {
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (!AsyncStorage) return;
      await AsyncStorage.setItem('reports:nativeChartGap', String(next));
    } catch {
      // ignore
    }
  };

  const { width, height } = useWindowDimensions();
  const isTablet = Math.max(width, height) >= 900; // match root layout heuristic
  const isWeb = Platform.OS === 'web';
  // per-web layout column styles: make two columns that sit side-by-side on wide screens
  // For web we size columns by the WEB_CHART_SIZE values; for native (phone/tablet)
  // use flexible columns so the layout adapts to available width. Previously the
  // non-web right column used a fixed web bar width which caused disorientation
  // on larger devices (tablets). Use flex:1 so two columns sit side-by-side on
  // tablets and stack naturally on narrow screens.
  const leftColStyle: any = isWeb ? { width: Math.min(WEB_CHART_SIZE.pieWidth, screenWidth * 0.48) } : { flex: 1 };
  const rightColStyle: any = isWeb ? { width: Math.min(WEB_CHART_SIZE.barWidth, screenWidth * 0.48) } : { flex: 1 };

  const chartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    decimalPlaces: 0,
    color: (opacity: number = 1) => `rgba(18,65,26,${opacity})`,
  labelColor: (opacity: number = 1) => `rgba(102,102,102,${opacity})`,
    style: { borderRadius: 8 },
    propsForBackgroundLines: { stroke: '#F0F0F0' },
  };

  // filter states removed per design - only report selector remains
  const reportOptions = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
  ];
  const [selectedReport, setSelectedReport] = useState<string>(reportOptions[0].key);
  // Pagination for the detailed session report (follows BayManagement logic)
  const [page, setPage] = useState<number>(1);
  const pageSize = 8; // entries per page
  const ROW_HEIGHT = 52; // approximate per-row height to keep table size consistent
  const totalPages = Math.max(1, Math.ceil((sessions || []).length / pageSize));

  useEffect(() => {
    // reset to first page when report selector or sessions list change
    setPage(1);
  }, [selectedReport, sessions.length]);

  // fetch summary/sessions when selected report changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSummary(); }, [selectedReport]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSessions(); }, [selectedReport]);

  // dynamic chart loader
  const [WebCharts, setWebCharts] = useState<any>(null);
  const [ChartJsOnly, setChartJsOnly] = useState<boolean>(false);
  const [RNChartKit, setRNChartKit] = useState<any>(null);
  useEffect(() => {
    // Allow a dev override to skip loading any chart libraries on web/native.
    // This helps avoid runtime issues where a native-only chart or svg lib
    // tries to render unsupported elements (like the "arc" element) on web.
    // By default we do NOT skip charts so installing the web shim enables
    // react-native-chart-kit on web. To intentionally skip charts set
    // window.__EAGLEPOINT_SKIP_WEB_CHARTS__ = true in the browser console.
    const SKIP_WEB_CHARTS = !!((global as any).__EAGLEPOINT_SKIP_WEB_CHARTS__);

    if (SKIP_WEB_CHARTS && Platform.OS === 'web') {
      setWebCharts(null);
      setChartJsOnly(false);
      setRNChartKit(null);
      return;
    }

    if (Platform.OS === 'web') {
      // Try to load react-chartjs-2 first (gives React components). If it fails due to peer deps
      // we fall back to using chart.js directly and a small canvas renderer. Also ensure
      // essential Chart.js scales/elements are registered to avoid runtime errors like
      // "category is not a registered scale".
      (async () => {
        try {
          // @ts-ignore
          const rc2 = await import('react-chartjs-2');
          setWebCharts(rc2);
        } catch (_e) {
          console.warn('react-chartjs-2 not available, falling back to chart.js canvas renderer', _e);
          setWebCharts(null);
          setChartJsOnly(true);
        }

        // Try to import chart.js and register the common scales/elements/plugins
        try {
          // Import the chart.js module (not /auto) so we can register specific pieces
          // @ts-ignore
          const ch = await import('chart.js');
          const ChartLib = ch && (ch.Chart || ch);
          const { CategoryScale, LinearScale, TimeScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler } = ch as any;
          if (ChartLib && typeof ChartLib.register === 'function') {
            try {
              ChartLib.register(CategoryScale, LinearScale, TimeScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);
            } catch (regErr) {
              // ignore registration errors
            }
          }
        } catch (err) {
          // ignore - registration is best-effort
        }
      })();
    } else {
      // dynamic import for native chart-kit to avoid bundling on web
      (async () => {
        try {
          // @ts-ignore
          const mod = await import('react-native-chart-kit');
          setRNChartKit(mod);
        } catch (_err) {
          console.warn('Failed to load react-native-chart-kit', _err);
          setRNChartKit(null);
        }
      })();
    }
  }, []);

  // fetch admin info and live clock
  useEffect(() => {
    fetchAdminInfo();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // human-friendly scope label based on selected report
  const scopeLabelText = (() => {
    switch (selectedReport) {
      case 'daily': return 'Showing: today';
      case 'weekly': return 'Showing: last 7 days';
      case 'monthly': return 'Showing: this month';
      case 'yearly': return 'Showing: this year';
      default: return '';
    }
  })();

  const fetchAdminInfo = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const name = data?.full_name || data?.name || data?.username || data?.displayName || 'Admin';
      setAdminName(name);
    } catch {
      // ignore
    }
  };

  // A very small wrapper component that renders a Chart.js chart directly into a canvas.
  // This avoids depending on `react-chartjs-2` and therefore avoids its React peerDep.
  const ChartJsCanvas: React.FC<{ type: string; data: any; options?: any; style?: any }> = ({ type, data, options, style }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartRef = useRef<any>(null);
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          // dynamically import chart.js/auto at runtime; this has no react peer deps
          // @ts-ignore
          const mod = await import('chart.js/auto');
          const ChartCtor = (mod && (mod.default || mod.Chart)) || mod;
          if (!mounted) return;
          if (!canvasRef.current) return;
          const ctx = (canvasRef.current as any).getContext('2d');
          if (chartRef.current) {
            try { chartRef.current.destroy(); } catch {}
            chartRef.current = null;
          }
          // @ts-ignore
          chartRef.current = new ChartCtor(ctx, { type, data, options });
        } catch (_e) {
          console.error('Failed to render Chart.js canvas', _e);
        }
      })();
        return () => {
        mounted = false;
        if (chartRef.current) try { chartRef.current.destroy(); } catch {}
      };
  // shallow stringify data/options so changes re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(data), JSON.stringify(options)]);

    return (
      // @ts-ignore - canvas is fine on web
      <canvas ref={canvasRef} style={style || { width: '100%', height: 200 }} />
    );
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ reportType: selectedReport });
      const res = await fetch(`${baseUrl}/api/admin/reports/summary?${params.toString()}`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('reports/summary failed', res.status, text);
        setErrorMsg(`Failed to load summary: ${res.status} ${text ? '- ' + text : ''}`);
        return;
      }
      const data = await res.json();
      setSummary(data);
    } catch (_e) {
      console.error('reports/summary error', _e);
      setErrorMsg(String(_e));
    } finally { setLoading(false); }
  };

  const fetchSessions = async () => {
    try {
      const params = new URLSearchParams({ reportType: selectedReport });
      const res = await fetch(`${baseUrl}/api/admin/reports/sessions?${params.toString()}`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('reports/sessions failed', res.status, text);
        setErrorMsg(`Failed to load sessions: ${res.status} ${text ? '- ' + text : ''}`);
        return;
      }
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (_e) {
      console.error('reports/sessions error', _e);
      setErrorMsg(String(_e));
    }
  };

  // client-side helpers: filter sessions by selectedReport scope and compute a summary fallback
  const filterSessionsByScope = (sess: any[], reportType: string) => {
    if (!Array.isArray(sess)) return [];
    const now = new Date();
    if (reportType === 'daily') {
      return sess.filter(s => {
        const d = new Date(s.start_time);
        return d.toDateString() === now.toDateString();
      });
    }
    if (reportType === 'weekly') {
      // last 7 days including today
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return sess.filter(s => {
        const d = new Date(s.start_time);
        return d >= start && d < end;
      });
    }
    if (reportType === 'monthly') {
      const year = now.getFullYear();
      const month = now.getMonth();
      return sess.filter(s => {
        const d = new Date(s.start_time);
        return d.getFullYear() === year && d.getMonth() === month;
      });
    }
    if (reportType === 'yearly') {
      const year = now.getFullYear();
      return sess.filter(s => {
        const d = new Date(s.start_time);
        return d.getFullYear() === year;
      });
    }
    return sess;
  };

  const computeSummaryFromSessions = (sess: any[]) => {
    const filtered = Array.isArray(sess) ? sess : [];
    const totalSessions = filtered.length;
    const totalBuckets = filtered.reduce((acc, s) => acc + (s.total_buckets || 0), 0);
    const durations: number[] = filtered.map(s => (s.duration_minutes != null ? s.duration_minutes : (s.end_time && s.start_time ? (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000 : 0))).filter(v => v > 0);
    const totalMinutes = durations.reduce((a, b) => a + b, 0);
    const avgMinutes = durations.length ? Math.round(totalMinutes / durations.length) : 0;
    const avgSessionDurationHuman = avgMinutes >= 60 ? `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m` : `${avgMinutes}m`;
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10; // one decimal

    // estimate bay utilization: use unique bays seen or fallback to 30
    const baySet = new Set(filtered.map(s => String(s.bay_no)).filter(Boolean));
    const availableBays = baySet.size || 30;
    // period minutes depends on scope; approximate from earliest to latest for more accurate weekly/monthly ranges
    let periodDays = 1;
    if (selectedReport === 'daily') periodDays = 1;
    else if (selectedReport === 'weekly') periodDays = 7;
    else if (selectedReport === 'monthly') periodDays = (() => { const n = new Date().getFullYear(); const m = new Date().getMonth(); return new Date(n, m+1, 0).getDate(); })();
    else if (selectedReport === 'yearly') periodDays = 365;
    const periodMinutes = Math.max(1, periodDays * 24 * 60);
    const utilization = Math.min(100, Math.round((totalMinutes / (availableBays * periodMinutes)) * 100));

    return {
      totalSessions,
      totalBuckets,
      avgSessionDurationHuman,
      totalHours,
      bayUtilizationRate: utilization,
      // placeholder fields for change indicators
      totalSessionsChange: '',
      totalBucketsChange: '',
      avgSessionDurationChange: '',
      totalHoursChange: '',
      bayUtilizationChange: '',
    } as any;
  };

  // computed summary from client-side sessions filtered by scope
  const clientFiltered = filterSessionsByScope(sessions, selectedReport);
  const clientSummary = computeSummaryFromSessions(clientFiltered);
  // prefer client-side computed values so the UI updates immediately when the selector changes
  // but allow server summary fields to be used when client can't compute them
  const displaySummary = { ...(summary || {}), ...clientSummary };

  // delegate export logic to shared helper (testable)
  const onDownload = async (reportType = 'full') => {
    try {
      const { exportReport } = await import('../../../lib/reportExport');
  const typeToUse = reportType || selectedReport;
  const res = await exportReport({ baseUrl, reportType: typeToUse, format: 'pdf' } as any);
      if (!res.ok) showError('Export failed' + (res.error ? ': ' + res.error : ''));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Export error', e);
      showError(e, 'Export failed');
    }
  };

  const onPrint = async (reportType?: string) => {
    try {
      if (Platform.OS === 'web') {
        // simple browser print; prefer print preview flow via onPrintPreview()
        await onPrintPreview(reportType || selectedReport);
        return;
      }
      // On native platforms, fall back to export (PDF) which the device can open/print using native viewers
      await onDownload(reportType || selectedReport);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Print error', e);
      showError('Print failed');
    }
  };

  const onPrintPreview = async (reportType?: string) => {
    const typeToUse = reportType || selectedReport;
    if (Platform.OS !== 'web') {
      // fallback: generate PDF and let native open it via onDownload
      await onDownload(typeToUse);
      return;
    }
    try {
      const fileModeUrl = `${baseUrl}/api/admin/reports/export?file=1&format=pdf`;
      const body = { reportType: typeToUse };
      const res = await fetch(fileModeUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        showError('Failed to generate preview: ' + res.status);
        return;
      }
      const contentType = res.headers.get('Content-Type') || '';
      let blob: Blob | null = null;
      if (typeof res.arrayBuffer === 'function') {
        const ab = await res.arrayBuffer();
        blob = new Blob([ab], { type: contentType || 'application/pdf' });
      }
      if (!blob) blob = await res.blob().catch(() => null);
      if (!blob) {
        showError('Preview failed: no PDF returned');
        return;
      }
      const url = URL.createObjectURL(blob);
      // open in new tab/window for PDF preview (browser will show print preview controls)
      const w = window.open(url, '_blank');
      if (!w) {
        // popup blocked - open in same tab
        window.location.href = url;
      }
      // Do not revoke immediately so the browser can load it; revoke after a delay
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60_000);
    } catch (e) {
      console.error('Preview error', e);
      showError(e, 'Failed to open preview');
    }
  };

  const showError = (err: any, fallback?: string) => {
    const friendly = friendlyMessageFromThrowable(err, fallback ?? 'An error occurred');
    setErrorModalType(friendly?.type ?? 'other');
    setErrorModalMessage(friendly?.message ?? (fallback ?? 'An error occurred'));
    setErrorModalDetails(friendly?.details ?? (typeof err === 'string' ? err : null));
    setErrorModalVisible(true);
  };

  // Overview modal removed - simplified UI

  // filters removed per updated design

  if (loading) return (
    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#2E7D32" /></View>
  );

  return (
    <ScrollView style={[tw.flex1, { backgroundColor: '#F6F6F2' }]}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Reports & Analytics</Text>
            <Text style={styles.subtitle}>{`Welcome back, ${adminName}!`}</Text>
          </View>
          <View>
            <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
            <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
          </View>
        </View>
        <View style={styles.divider} />

        {errorMsg ? (
          <View style={{ backgroundColor: '#FCE4E4', padding: 10, borderRadius: 6, marginTop: 8 }}>
            <Text style={{ color: '#611A15', fontWeight: '700' }}>Error</Text>
            <Text style={{ color: '#611A15' }}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Report Export Tool (header matching design) */}
        <View style={[styles.card, { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, marginRight: 16 }}>Report Export Tool</Text>

            <View style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 12, borderWidth: 1, borderColor: '#E6E6E6', flexDirection: 'row', alignItems: 'center', minWidth: 320 }}>
              <Text style={{ fontSize: 12, color: '#666', marginRight: 8 }}>Select Report:</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore - use native select on web for accessibility
                <select value={selectedReport} onChange={(e: any) => setSelectedReport(e.target.value)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', appearance: 'none' }}>
                  {reportOptions.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              ) : (
                <TouchableOpacity onPress={() => {
                  const idx = reportOptions.findIndex((r) => r.key === selectedReport);
                  const next = idx === -1 || idx === reportOptions.length - 1 ? reportOptions[0].key : reportOptions[idx + 1].key;
                  setSelectedReport(next);
                }} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text>{reportOptions.find((r) => r.key === selectedReport)?.label}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={[styles.downloadButton, { backgroundColor: '#9CCB7D', paddingHorizontal: 18, paddingVertical: 10 }]} onPress={() => onPrintPreview(selectedReport)}>
              <Text style={[styles.downloadText, { color: '#123315' }]}>Print Preview</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Performance Summary */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Performance Summary</Text>
          <Text style={styles.helper}>Overview metrics for the selected time period</Text>
          <Text style={{ color: '#666', marginTop: 6 }}>{scopeLabelText}</Text>

          {/* filters removed per updated design */}

          <View style={styles.metricsGrid}>
            <View style={[styles.metricTile, { borderLeftColor: '#9CCC65' }]}>
              <Text style={styles.metricLabel}>Total Sessions</Text>
              <Text style={styles.metricValueLarge}>{displaySummary ? String(displaySummary.totalSessions) : '—'}</Text>
              <Text style={styles.metricSub}>{displaySummary?.totalSessionsChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#F9A825' }]}>
              <Text style={styles.metricLabel}>Total Buckets Dispensed</Text>
              <Text style={styles.metricValueLarge}>{displaySummary ? String(displaySummary.totalBuckets) : '—'}</Text>
              <Text style={styles.metricSub}>{displaySummary?.totalBucketsChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#7E57C2' }]}>
              <Text style={styles.metricLabel}>Avg. Session Duration</Text>
              <Text style={styles.metricValueLarge}>{displaySummary ? displaySummary.avgSessionDurationHuman : '—'}</Text>
              <Text style={styles.metricSub}>{displaySummary?.avgSessionDurationChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#4DB6AC' }]}>
              <Text style={styles.metricLabel}>Total Play Duration</Text>
              <Text style={styles.metricValueLarge}>{displaySummary ? (displaySummary.totalHours ? `${displaySummary.totalHours} Hrs` : '—') : '—'}</Text>
              <Text style={styles.metricSub}>{displaySummary?.totalHoursChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#29421A' }]}>
              <Text style={styles.metricLabel}>Bay Utilization Rate</Text>
              <Text style={styles.metricValueLarge}>{displaySummary ? (displaySummary.bayUtilizationRate != null ? `${Math.round(displaySummary.bayUtilizationRate)}%` : '—') : '—'}</Text>
              <Text style={styles.metricSub}>{displaySummary?.bayUtilizationChange ?? ''}</Text>
            </View>
          </View>
        </View>

        {/* Operational Trends */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Operational Trends</Text>
          <Text style={styles.helper}>Session breakdown, bay usage, and session volume over time</Text>

          <View style={{ flexDirection: 'row', marginTop: 12, gap: isWeb ? WEB_CHART_SIZE.chartGap : NATIVE_CHART_GAP }}>
            {/* Left: Pie */}
            <View style={leftColStyle}>
                <View style={styles.chartBox}>
                  <Text style={{ fontWeight: '700', marginBottom: 8 }}>Session Type Breakdown</Text>
                  {clientFiltered.length === 0 ? <Text style={styles.helper}>No session data</Text> : (
                    (() => {
                      const counts: Record<string, number> = {};
                      for (const s of clientFiltered) counts[s.session_type] = (counts[s.session_type] || 0) + 1;
                      const timed = counts['Timed'] || 0;
                      const open = counts['Open'] || 0;
                      const pieData = [
                        { name: 'Timed', population: timed, color: '#a9b694', legendFontColor: '#333', legendFontSize: 12 },
                        { name: 'Open Time', population: open, color: '#2d382d', legendFontColor: '#333', legendFontSize: 12 },
                      ];
                      // if on web and react-chartjs-2 available, use it for better SVG rendering
                      if (Platform.OS === 'web') {
                        if (WebCharts) {
                          const Pie = WebCharts.Pie;
                          const labels = pieData.map((p: any) => p.name);
                          const data = pieData.map((p: any) => p.population);
                          const backgroundColor = pieData.map((p: any) => p.color);
                          // On web, let the parent column control the width; use 100% so the
                          // chart fills the column we sized above (leftColStyle).
                          return (
                            <View style={{ width: '100%', alignItems: 'center' }}>
                              <Pie data={{ labels, datasets: [{ data, backgroundColor }] }} options={{ responsive: true, plugins: { legend: { display: true } } }} />
                            </View>
                          );
                        }
                        if (ChartJsOnly) {
                          const labels = pieData.map((p: any) => p.name);
                          const data = { labels, datasets: [{ data: pieData.map((p: any) => p.population), backgroundColor: pieData.map((p: any) => p.color) }] };
                          return (
                            <View style={{ width: '100%' }}>
                              <ChartJsCanvas type="pie" data={data} options={{ responsive: true, plugins: { legend: { display: true } } }} style={{ width: '100%', height: WEB_CHART_SIZE.pieHeight }} />
                            </View>
                          );
                        }
                      }
                      // fallback/native: use react-native-chart-kit (dynamically loaded)
                      if (RNChartKit && RNChartKit.PieChart) {
                        const P = RNChartKit.PieChart;
                        return (
                          <P
                            data={pieData}
                            width={Math.min(screenWidth * 0.5, 420)}
                            height={160}
                            chartConfig={chartConfig}
                            accessor="population"
                            backgroundColor="transparent"
                            paddingLeft="-40"
                            absolute
                          />
                        );
                      }
                      // final fallback: simple view
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={{ width: 110, height: 110, borderRadius: 8, backgroundColor: '#F5F7F3', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 22, fontWeight: '800' }}>{Math.round((pieData[0].population / (pieData[0].population + pieData[1].population || 1)) * 100)}%</Text>
                            <Text style={{ color: '#666' }}>Timed</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700' }}>{pieData[0].population} Timed</Text>
                            <Text style={{ color: '#666', marginBottom: 8 }}>{pieData[1].population} Open</Text>
                          </View>
                        </View>
                      );
                    })()
                  )}
                </View>
            </View>

            {/* Right: Bar */}
            <View style={rightColStyle}>
              <View style={styles.chartBox}>
                <Text style={{ fontWeight: '700', marginBottom: 8 }}>Bay Usage Ranking</Text>
                  {(() => {
                  const usage: Record<string, number> = {};
                  for (const s of clientFiltered) {
                    if (!s.bay_no) continue;
                    usage[s.bay_no] = (usage[s.bay_no] || 0) + (s.duration_minutes || 0);
                  }
                  const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 6);
                  const labels = entries.map(e => e[0]);
                  const data = entries.map(e => e[1]);
                  if (!entries.length) return <Text style={styles.helper}>No data</Text>;
                  if (Platform.OS === 'web') {
                    if (WebCharts) {
                      const Bar = WebCharts.Bar;
                      const dataSet = { labels, datasets: [{  label: 'Minutes', data, backgroundColor: labels.map(() => '#12411A') }] };
                      return (
                        <View style={{ width: '100%' }}>
                          <Bar data={dataSet} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                        </View>
                      );
                    }
                    if (ChartJsOnly) {
                      const dataSet = { labels, datasets: [{ label: 'Minutes', data, backgroundColor: labels.map(() => '#12411A') }] };
                      return (
                        <View style={{ width: '100%', height: WEB_CHART_SIZE.barHeight }}>
                          <ChartJsCanvas type="bar" data={dataSet} options={{ responsive: true, plugins: { legend: { display: false } }, maintainAspectRatio: false }} style={{ width: '100%', height: WEB_CHART_SIZE.barHeight }} />
                        </View>
                      );
                    }
                    const max = entries[0][1] || 1;
                    return entries.map(([bay, mins]) => (
                      <View key={bay} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ width: 28, color: '#666' }}>{bay}</Text>
                        <View style={{ flex: 1, height: 10, backgroundColor: '#EEE', borderRadius: 4, marginHorizontal: 8 }}>
                          <View style={{ width: `${Math.round((mins / max) * 100)}%`, height: 10, backgroundColor: '#12411A', borderRadius: 4 }} />
                        </View>
                        <Text style={{ width: 48, textAlign: 'right', color: '#666' }}>{mins}m</Text>
                      </View>
                    ));
                  }
                  if (RNChartKit && RNChartKit.BarChart) {
                    const B = RNChartKit.BarChart;
                    return (
                      <B
                        data={{ labels, datasets: [{ data }] }}
                        width={Math.min(260, screenWidth * 0.45)}
                        height={160}
                        chartConfig={chartConfig}
                        fromZero
                        showValuesOnTopOfBars={false}
                        style={{ paddingRight: 12 }}
                      />
                    );
                  }
                  // final fallback
                  return entries.map(([bay, mins]) => (
                    <View key={bay} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ width: 28, color: '#666' }}>{bay}</Text>
                      <View style={{ flex: 1, height: 10, backgroundColor: '#EEE', borderRadius: 4, marginHorizontal: 8 }}>
                        <View style={{ width: `${Math.round((mins / (entries[0][1] || 1)) * 100)}%`, height: 10, backgroundColor: '#12411A', borderRadius: 4 }} />
                      </View>
                      <Text style={{ width: 48, textAlign: 'right', color: '#666' }}>{mins}m</Text>
                    </View>
                  ));
                })()}
              </View>
            </View>
          </View>

          {/* Line chart below */}
          <View style={{ marginTop: 12 }}>
              <View style={styles.chartBox}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>Total Session Volume Over Time</Text>
              <View style={{ minHeight: 120 }}>
                {(() => {
                          if (!sessions.length) return <Text style={styles.helper}>No data</Text>;

                          // Build time buckets depending on selectedReport
                          const buildBuckets = (sess: any[], reportType: string) => {
                            if (!sess || !sess.length) return { labels: [], values: [] };
                            const now = new Date();

                            // DAILY: only sessions for today, bucketed by hour (0..23)
                            if (reportType === 'daily') {
                              const buckets: number[] = Array.from({ length: 24 }, () => 0);
                              const labels: string[] = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
                              for (const s of sess) {
                                const d = new Date(s.start_time);
                                if (d.toDateString() !== now.toDateString()) continue;
                                const h = d.getHours();
                                buckets[h] = (buckets[h] || 0) + 1;
                              }
                              return { labels, values: buckets };
                            }

                            // WEEKLY: last 7 days (including today), labels are short weekday names
                            if (reportType === 'weekly') {
                              const buckets: Record<string, number> = {};
                              const labels: string[] = [];
                              for (let i = 6; i >= 0; i--) {
                                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                                const key = d.toISOString().slice(0, 10);
                                buckets[key] = 0;
                                labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
                              }
                              for (const s of sess) {
                                const key = new Date(s.start_time).toISOString().slice(0, 10);
                                if (buckets[key] !== undefined) buckets[key] = (buckets[key] || 0) + 1;
                              }
                              return { labels, values: Object.entries(buckets).map(([, v]) => v) };
                            }

                            // MONTHLY: only sessions for the current month, bucketed by day-of-month (1..lastDay)
                            if (reportType === 'monthly') {
                              const year = now.getFullYear();
                              const month = now.getMonth();
                              const lastDay = new Date(year, month + 1, 0).getDate();
                              const buckets: number[] = Array.from({ length: lastDay }, () => 0);
                              const labels: string[] = Array.from({ length: lastDay }, (_, i) => String(i + 1));
                              for (const s of sess) {
                                const d = new Date(s.start_time);
                                if (d.getFullYear() !== year || d.getMonth() !== month) continue;
                                const day = d.getDate();
                                buckets[day - 1] = (buckets[day - 1] || 0) + 1;
                              }
                              return { labels, values: buckets };
                            }

                            // YEARLY: only sessions for the current year, bucketed by month (Jan..Dec)
                            if (reportType === 'yearly') {
                              const year = now.getFullYear();
                              const buckets: number[] = Array.from({ length: 12 }, () => 0);
                              const labels: string[] = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1).toLocaleString(undefined, { month: 'short' }));
                              for (const s of sess) {
                                const d = new Date(s.start_time);
                                if (d.getFullYear() !== year) continue;
                                const m = d.getMonth();
                                buckets[m] = (buckets[m] || 0) + 1;
                              }
                              return { labels, values: buckets };
                            }

                            return { labels: [], values: [] };
                          };

                          const { labels, values } = buildBuckets(sessions, selectedReport);
                  if (Platform.OS === 'web') {
                    if (WebCharts) {
                      const Line = WebCharts.Line;
                      const dataSet = { labels, datasets: [{ label: 'Sessions', data: values, borderColor: '#12411A', backgroundColor: 'rgba(18,65,26,0.1)' }] };
                      return (
                        <View style={{ width: '100%' }}>
                          <Line data={dataSet} options={{ responsive: true, plugins: { legend: { display: false } } }} />
                        </View>
                      );
                    }
                    if (ChartJsOnly) {
                      const dataSet = { labels, datasets: [{ label: 'Sessions', data: values, borderColor: '#12411A', backgroundColor: 'rgba(18,65,26,0.1)' }] };
                      return (
                        <View style={{ width: '100%', height: WEB_CHART_SIZE.lineHeight }}>
                          <ChartJsCanvas type="line" data={dataSet} options={{ responsive: true, plugins: { legend: { display: false } } }} style={{ width: '100%', height: WEB_CHART_SIZE.lineHeight }} />
                        </View>
                      );
                    }
                    const max = Math.max(...values, 1);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 }}>
                        {values.map((v, idx) => {
                          const h = Math.round((v / max) * 100);
                          return (
                            <View key={String(idx)} style={{ flex: 1, alignItems: 'center' }}>
                              <View style={{ width: '80%', height: h, backgroundColor: '#C9DABF', borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
                              <Text style={{ fontSize: 10, color: '#666', marginTop: 6 }}>{labels[idx]}</Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  }
                  // native: react-native-chart-kit LineChart if available
                  if (RNChartKit && RNChartKit.LineChart) {
                    const L = RNChartKit.LineChart;
                    // Build two-series style similar to your design: one for timed, one for open if available
                    const series = [{ data: values, color: () => '#a9b694' }];
                    return (
                      <L
                        data={{ labels, datasets: series }}
                        width={lineChartWidth}
                        height={160}
                        chartConfig={chartConfig}
                        bezier
                        style={{ paddingRight: 12 }}
                      />
                    );
                  }
                  // fallback simple bars
                  const max = Math.max(...values, 1);
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 }}>
                      {values.map((v, idx) => (
                        <View key={String(idx)} style={{ flex: 1, alignItems: 'center' }}>
                          <View style={{ width: '80%', height: Math.round((v / max) * 100), backgroundColor: '#C9DABF', borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
                          <Text style={{ fontSize: 10, color: '#666', marginTop: 6 }}>{labels[idx]}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </View>
          </View>
        </View>

        {/* Detailed Session Report */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Detailed Session Report</Text>
          <Text style={styles.helper}>Filter and export recent sessions</Text>
          <Text style={{ color: '#666', marginTop: 6 }}>{scopeLabelText}</Text>

          {/* Hide download buttons on tablet to avoid interrupting layout */}
          {!isTablet && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.downloadButton} onPress={() => onPrintPreview(selectedReport)}>
                <Text style={styles.downloadText}>Print Preview</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ marginTop: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', padding: 10, backgroundColor: '#F4F6F2' }}>
              <Text style={{ width: 90, fontWeight: '700', color: '#666' }}>Session ID</Text>
              <Text style={{ flex: 1, fontWeight: '700', color: '#666' }}>Player Name</Text>
              <Text style={{ width: 60, fontWeight: '700', color: '#666', textAlign: 'right' }}>Bay</Text>
              <Text style={{ width: 140, fontWeight: '700', color: '#666' }}>Start / End</Text>
              <Text style={{ width: 80, fontWeight: '700', color: '#666' }}>Type</Text>
              <Text style={{ width: 80, fontWeight: '700', color: '#666', textAlign: 'right' }}>Duration</Text>
              <Text style={{ width: 80, fontWeight: '700', color: '#666', textAlign: 'right' }}>Buckets</Text>
            </View>
              {sessions.length === 0 ? (
              <View style={{ minHeight: ROW_HEIGHT * pageSize, padding: 18, justifyContent: 'center' }}><Text style={styles.helper}>No sessions to show</Text></View>
            ) : (
              (() => {
                const startIdx = (page - 1) * pageSize;
                const endIdx = startIdx + pageSize;
                const paginated = (sessions || []).slice(startIdx, endIdx);
                const rows = paginated.map((s, idx) => (
                  <View key={String(s.player_id) + '-' + (s.session_id || startIdx + idx)} style={{ flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0', minHeight: ROW_HEIGHT }}>
                    <Text style={{ width: 90, color: '#333' }}>{s.session_id}</Text>
                    <Text style={{ flex: 1, color: '#333' }}>{s.player_name ?? '-'}</Text>
                    <Text style={{ width: 60, color: '#333', textAlign: 'right' }}>{s.bay_no ?? '-'}</Text>
                    <Text style={{ width: 140, color: '#333' }}>{s.start_time ? (new Date(s.start_time)).toLocaleString() : '-'}{s.end_time ? '\n' + (new Date(s.end_time)).toLocaleString() : ''}</Text>
                    <Text style={{ width: 80, color: '#333' }}>{s.session_type}</Text>
                    <Text style={{ width: 80, color: '#333', textAlign: 'right' }}>{s.duration_minutes != null ? `${s.duration_minutes}m` : '-'}</Text>
                    <Text style={{ width: 80, color: '#333', textAlign: 'right' }}>{s.total_buckets ?? 0}</Text>
                  </View>
                ));
                const placeholders: any[] = [];
                for (let i = paginated.length; i < pageSize; i++) {
                  placeholders.push(
                    <View key={`empty-${i}`} style={{ flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0', minHeight: ROW_HEIGHT }}>
                      <Text style={{ width: 90, color: 'transparent' }}>-</Text>
                      <Text style={{ flex: 1, color: 'transparent' }}>-</Text>
                      <Text style={{ width: 60, color: 'transparent' }}>-</Text>
                      <Text style={{ width: 140, color: 'transparent' }}>-</Text>
                      <Text style={{ width: 80, color: 'transparent' }}>-</Text>
                      <Text style={{ width: 80, color: 'transparent' }}>-</Text>
                      <Text style={{ width: 80, color: 'transparent' }}>-</Text>
                    </View>
                  );
                }
                return (<>{rows}{placeholders}</>);
              })()
            )}
          </View>
          {/* Pagination controls for sessions */}
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
        </View>

      </View>
      {/* Overview functionality removed */}
      <ErrorModal visible={errorModalVisible} errorType={errorModalType} errorMessage={errorModalMessage} errorDetails={errorModalDetails} onClose={() => setErrorModalVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700', color: '#2E3B2B' },
  subtitle: { color: '#666', marginBottom: 10 },
  dateText: { textAlign: 'right', fontSize: 12, color: '#555' },
  divider: { height: 1, backgroundColor: '#ccc', marginVertical: 10 },
  cardRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  metricCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, flex: 1, alignItems: 'center', borderLeftWidth: 6, borderLeftColor: '#C9DABF' },
  metricLabel: { fontSize: 13, color: '#666' },
  metricValue: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  metricTile: { backgroundColor: '#fff', padding: 12, borderRadius: 8, flexBasis: '30%', minWidth: 160, marginRight: 12, marginBottom: 12, borderLeftWidth: 6 },
  metricValueLarge: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  metricSub: { color: '#666', marginTop: 6, fontSize: 12 },
  chartBox: { backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 18, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  helper: { color: '#666', marginTop: 8 },
  downloadButton: { backgroundColor: '#C9DABF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6 },
  downloadText: { color: '#12411A', fontWeight: '700' },
  /* Pagination styles */
  paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  pagePrevButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E6E6' },
  pagePrevText: { color: '#333' },
  pageNextButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginLeft: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E6E6' },
  pageNextText: { color: '#333' },
  pageNavDisabled: { opacity: 0.4 },
  pageList: { flexDirection: 'row', alignItems: 'center' },
  pageButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, marginHorizontal: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E6E6' },
  pageButtonActive: { backgroundColor: '#12411A', borderColor: '#12411A' },
  pageButtonText: { color: '#333' },
  pageButtonTextActive: { color: '#fff' },
});
