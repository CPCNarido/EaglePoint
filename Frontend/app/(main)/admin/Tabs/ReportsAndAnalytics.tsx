import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Dimensions, useWindowDimensions } from 'react-native';
import { tw } from 'react-native-tailwindcss';
import { useSettings } from '../../../lib/SettingsProvider';
import { useRef } from 'react';
const noop = () => {};

export default function ReportsAndAnalytics() {
  const settings = useSettings();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  const screenWidth = Dimensions.get('window').width - 40; // container padding
  const { width, height } = useWindowDimensions();
  const isTablet = Math.max(width, height) >= 900; // match root layout heuristic

  const chartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    decimalPlaces: 0,
    color: (opacity: number = 1) => `rgba(18,65,26,${opacity})`,
    labelColor: (opacity: number = 1) => `rgba(102,102,102,${opacity})`,
    style: { borderRadius: 8 },
    propsForBackgroundLines: { stroke: '#F0F0F0' },
  };

  // filter states
  const timeOptions = ['Last 10 Days', 'Last Month', 'Last Year'];
  const [timeRange, setTimeRange] = useState(timeOptions[0]);
  const sessionTypeOptions = ['All', 'Timed', 'Open'];
  const [sessionTypeFilter, setSessionTypeFilter] = useState(sessionTypeOptions[0]);
  const [bayFilter, setBayFilter] = useState<'All' | string>('All');

  useEffect(() => { fetchSummary(); }, [timeRange, sessionTypeFilter, bayFilter]);
  useEffect(() => { fetchSessions(); }, [timeRange, sessionTypeFilter, bayFilter]);

  // dynamic chart loader
  const [WebCharts, setWebCharts] = useState<any>(null);
  const [ChartJsOnly, setChartJsOnly] = useState<boolean>(false);
  const [RNChartKit, setRNChartKit] = useState<any>(null);
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Try to load react-chartjs-2 first (gives React components). If it fails due to peer deps
      // we fall back to using chart.js directly and a small canvas renderer.
      (async () => {
        try {
          // @ts-ignore
          const rc2 = await import('react-chartjs-2');
          setWebCharts(rc2);
        } catch (e) {
          console.warn('react-chartjs-2 not available, falling back to chart.js canvas renderer', e);
          setWebCharts(null);
          setChartJsOnly(true);
          // ensure chart.js is present later when rendering; we don't throw here.
        }
      })();
    } else {
      // dynamic import for native chart-kit to avoid bundling on web
      (async () => {
        try {
          // @ts-ignore
          const mod = await import('react-native-chart-kit');
          setRNChartKit(mod);
        } catch (err) {
          console.warn('Failed to load react-native-chart-kit', err);
          setRNChartKit(null);
        }
      })();
    }
  }, []);

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
            try { chartRef.current.destroy(); } catch (e) {}
            chartRef.current = null;
          }
          // @ts-ignore
          chartRef.current = new ChartCtor(ctx, { type, data, options });
        } catch (e) {
          console.error('Failed to render Chart.js canvas', e);
        }
      })();
      return () => {
        mounted = false;
        if (chartRef.current) try { chartRef.current.destroy(); } catch (e) {}
      };
    // shallow stringify data/options so changes re-render
    }, [type, JSON.stringify(data), JSON.stringify(options)]);

    return (
      // @ts-ignore - canvas is fine on web
      <canvas ref={canvasRef} style={style || { width: '100%', height: 200 }} />
    );
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ timeRange, sessionType: sessionTypeFilter, bay: bayFilter });
      const res = await fetch(`${baseUrl}/api/admin/reports/summary?${params.toString()}`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('reports/summary failed', res.status, text);
        setErrorMsg(`Failed to load summary: ${res.status} ${text ? '- ' + text : ''}`);
        return;
      }
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      console.error('reports/summary error', e);
      setErrorMsg(String(e));
    } finally { setLoading(false); }
  };

  const fetchSessions = async () => {
    try {
      const params = new URLSearchParams({ timeRange, sessionType: sessionTypeFilter, bay: bayFilter });
      const res = await fetch(`${baseUrl}/api/admin/reports/sessions?${params.toString()}`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('reports/sessions failed', res.status, text);
        setErrorMsg(`Failed to load sessions: ${res.status} ${text ? '- ' + text : ''}`);
        return;
      }
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('reports/sessions error', e);
      setErrorMsg(String(e));
    }
  };

  const onDownload = async (reportType = 'full') => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/reports/export`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportType }) });
      if (!res.ok) return alert('Export failed');
      const data = await res.json();
      if (!data || !data.csv) return alert('No CSV returned');
      const csv = data.csv;
      // trigger download in web
      if (typeof window !== 'undefined' && window.navigator && (window.navigator as any).msSaveOrOpenBlob === undefined) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${reportType}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        // fallback: show CSV in alert (non-web)
        alert('Export ready. Copy from alert.');
        console.log(csv.slice(0, 1000));
      }
    } catch (e) {
      alert('Export failed');
    }
  };

  if (loading) return (
    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#2E7D32" /></View>
  );

  return (
    <ScrollView style={[tw.flex1, { backgroundColor: '#F6F6F2' }]}>
      <View style={styles.container}>
        <Text style={styles.title}>Reports & Analytics</Text>
        <Text style={styles.subtitle}>Admin Reports & Analytics</Text>

        {errorMsg ? (
          <View style={{ backgroundColor: '#FCE4E4', padding: 10, borderRadius: 6, marginTop: 8 }}>
            <Text style={{ color: '#611A15', fontWeight: '700' }}>Error</Text>
            <Text style={{ color: '#611A15' }}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Report Export Tool */}
        <View style={[styles.card, { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ fontWeight: '700' }}>Report Export Tool</Text>
          {/* Hide export controls on tablet to avoid UI disorientation */}
          {!isTablet && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 6, marginRight: 8 }}>
                <Text>Select Report:</Text>
              </View>
              <TouchableOpacity style={styles.downloadButton} onPress={() => onDownload('full')}>
                <Text style={styles.downloadText}>Download</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Performance Summary */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Performance Summary</Text>
          <Text style={styles.helper}>Overview metrics for the selected time period</Text>

          {/* quick filters */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setTimeRange(timeOptions[(timeOptions.indexOf(timeRange) + 1) % timeOptions.length])} style={{ backgroundColor: '#F4F6F2', padding: 8, borderRadius: 6 }}>
              <Text>{timeRange}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSessionTypeFilter(sessionTypeOptions[(sessionTypeOptions.indexOf(sessionTypeFilter) + 1) % sessionTypeOptions.length])} style={{ backgroundColor: '#F4F6F2', padding: 8, borderRadius: 6 }}>
              <Text>{sessionTypeFilter}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBayFilter(bayFilter === 'All' ? 'All' : 'All')} style={{ backgroundColor: '#F4F6F2', padding: 8, borderRadius: 6 }}>
              <Text>{bayFilter}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricTile, { borderLeftColor: '#9CCC65' }]}>
              <Text style={styles.metricLabel}>Total Sessions</Text>
              <Text style={styles.metricValueLarge}>{summary ? String(summary.totalSessions) : '—'}</Text>
              <Text style={styles.metricSub}>{summary?.totalSessionsChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#F9A825' }]}>
              <Text style={styles.metricLabel}>Total Buckets Dispensed</Text>
              <Text style={styles.metricValueLarge}>{summary ? String(summary.totalBuckets) : '—'}</Text>
              <Text style={styles.metricSub}>{summary?.totalBucketsChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#7E57C2' }]}>
              <Text style={styles.metricLabel}>Avg. Session Duration</Text>
              <Text style={styles.metricValueLarge}>{summary ? summary.avgSessionDurationHuman : '—'}</Text>
              <Text style={styles.metricSub}>{summary?.avgSessionDurationChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#4DB6AC' }]}>
              <Text style={styles.metricLabel}>Total Play Duration</Text>
              <Text style={styles.metricValueLarge}>{summary ? (summary.totalHours ? `${summary.totalHours} Hrs` : '—') : '—'}</Text>
              <Text style={styles.metricSub}>{summary?.totalHoursChange ?? ''}</Text>
            </View>

            <View style={[styles.metricTile, { borderLeftColor: '#29421A' }]}>
              <Text style={styles.metricLabel}>Bay Utilization Rate</Text>
              <Text style={styles.metricValueLarge}>{summary ? (summary.bayUtilizationRate != null ? `${Math.round(summary.bayUtilizationRate)}%` : '—') : '—'}</Text>
              <Text style={styles.metricSub}>{summary?.bayUtilizationChange ?? ''}</Text>
            </View>
          </View>
        </View>

        {/* Operational Trends */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Operational Trends</Text>
          <Text style={styles.helper}>Session breakdown, bay usage, and session volume over time</Text>

          <View style={{ flexDirection: 'row', marginTop: 12, gap: 12 }}>
            {/* Left: Pie */}
            <View style={{ flex: 1 }}>
                <View style={styles.chartBox}>
                  <Text style={{ fontWeight: '700', marginBottom: 8 }}>Session Type Breakdown</Text>
                  {sessions.length === 0 ? <Text style={styles.helper}>No session data</Text> : (
                    (() => {
                      const counts: Record<string, number> = {};
                      for (const s of sessions) counts[s.session_type] = (counts[s.session_type] || 0) + 1;
                      const timed = counts['Timed'] || 0;
                      const open = counts['Open'] || 0;
                      const pieData = [
                        { name: 'Timed', population: timed, color: '#9CCC65', legendFontColor: '#666', legendFontSize: 12 },
                        { name: 'Open', population: open, color: '#C9DABF', legendFontColor: '#666', legendFontSize: 12 },
                      ];
                      // if on web and react-chartjs-2 available, use it for better SVG rendering
                      if (Platform.OS === 'web') {
                        if (WebCharts) {
                          const Pie = WebCharts.Pie;
                          const labels = pieData.map((p: any) => p.name);
                          const data = pieData.map((p: any) => p.population);
                          const backgroundColor = pieData.map((p: any) => p.color);
                          return (
                            <View style={{ width: screenWidth * 0.5 }}>
                              <Pie data={{ labels, datasets: [{ data, backgroundColor }] }} options={{ responsive: true, plugins: { legend: { display: true } } }} />
                            </View>
                          );
                        }
                        if (ChartJsOnly) {
                          const labels = pieData.map((p: any) => p.name);
                          const data = { labels, datasets: [{ data: pieData.map((p: any) => p.population), backgroundColor: pieData.map((p: any) => p.color) }] };
                          return (
                            <View style={{ width: screenWidth * 0.5 }}>
                              <ChartJsCanvas type="pie" data={data} options={{ responsive: true, plugins: { legend: { display: true } } }} style={{ width: screenWidth * 0.5, height: 160 }} />
                            </View>
                          );
                        }
                      }
                      // fallback/native: use react-native-chart-kit (dynamically loaded)
                      if (Platform.OS !== 'web' && RNChartKit && RNChartKit.PieChart) {
                        const P = RNChartKit.PieChart;
                        return (
                          <P
                            data={pieData}
                            width={screenWidth * 0.45}
                            height={120}
                            chartConfig={chartConfig}
                            accessor="population"
                            backgroundColor="transparent"
                            paddingLeft="0"
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
            <View style={{ width: 260 }}>
              <View style={styles.chartBox}>
                <Text style={{ fontWeight: '700', marginBottom: 8 }}>Bay Usage Ranking</Text>
                {(() => {
                  const usage: Record<string, number> = {};
                  for (const s of sessions) {
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
                      const dataSet = { labels, datasets: [{ label: 'Minutes', data, backgroundColor: labels.map(() => '#12411A') }] };
                      return (
                        <View style={{ width: 260 }}>
                          <Bar data={dataSet} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                        </View>
                      );
                    }
                    if (ChartJsOnly) {
                      const dataSet = { labels, datasets: [{ label: 'Minutes', data, backgroundColor: labels.map(() => '#12411A') }] };
                      return (
                        <View style={{ width: 260, height: 160 }}>
                          <ChartJsCanvas type="bar" data={dataSet} options={{ responsive: true, plugins: { legend: { display: false } }, maintainAspectRatio: false }} style={{ width: 260, height: 160 }} />
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
                  // native path: use dynamically loaded RNChartKit.BarChart
                  if (RNChartKit && RNChartKit.BarChart) {
                    const B = RNChartKit.BarChart;
                    return (
                      <B
                        data={{ labels, datasets: [{ data }] }}
                        width={220}
                        height={120}
                        chartConfig={chartConfig}
                        yAxisLabel={''}
                        yAxisSuffix={''}
                        withHorizontalLabels={false}
                        showValuesOnTopOfBars={false}
                        fromZero
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
                  const days: Record<string, number> = {};
                  const now = new Date();
                  const labels: string[] = [];
                  for (let i = 9; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                    const key = d.toISOString().slice(0, 10);
                    days[key] = 0;
                    labels.push(key.slice(5));
                  }
                  for (const s of sessions) {
                    const key = (new Date(s.start_time)).toISOString().slice(0, 10);
                    if (days[key] !== undefined) days[key] = (days[key] || 0) + 1;
                  }
                  const values = Object.entries(days).map(([, v]) => v);
                  if (Platform.OS === 'web') {
                    if (WebCharts) {
                      const Line = WebCharts.Line;
                      const dataSet = { labels, datasets: [{ label: 'Sessions', data: values, borderColor: '#12411A', backgroundColor: 'rgba(18,65,26,0.1)' }] };
                      return (
                        <View style={{ width: screenWidth }}>
                          <Line data={dataSet} options={{ responsive: true, plugins: { legend: { display: false } } }} />
                        </View>
                      );
                    }
                    if (ChartJsOnly) {
                      const dataSet = { labels, datasets: [{ label: 'Sessions', data: values, borderColor: '#12411A', backgroundColor: 'rgba(18,65,26,0.1)' }] };
                      return (
                        <View style={{ width: screenWidth, height: 160 }}>
                          <ChartJsCanvas type="line" data={dataSet} options={{ responsive: true, plugins: { legend: { display: false } } }} style={{ width: screenWidth, height: 160 }} />
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
                    return (
                      <L
                        data={{ labels, datasets: [{ data: values }] }}
                        width={screenWidth}
                        height={140}
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

          {/* Hide download buttons on tablet to avoid interrupting layout */}
          {!isTablet && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.downloadButton} onPress={() => onDownload('full')}>
                <Text style={styles.downloadText}>Download Full Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.downloadButton, { backgroundColor: '#EEE' }]} onPress={() => onDownload('overview')}>
                <Text style={[styles.downloadText, { color: '#333' }]}>Download Overview</Text>
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
              <View style={{ padding: 18 }}><Text style={styles.helper}>No sessions to show</Text></View>
            ) : (
              sessions.slice(0, 40).map((s) => (
                <View key={String(s.player_id)} style={{ flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                  <Text style={{ width: 90, color: '#333' }}>{s.session_id}</Text>
                  <Text style={{ flex: 1, color: '#333' }}>{s.player_name ?? '-'}</Text>
                  <Text style={{ width: 60, color: '#333', textAlign: 'right' }}>{s.bay_no ?? '-'}</Text>
                  <Text style={{ width: 140, color: '#333' }}>{s.start_time ? (new Date(s.start_time)).toLocaleString() : '-'}{s.end_time ? '\n' + (new Date(s.end_time)).toLocaleString() : ''}</Text>
                  <Text style={{ width: 80, color: '#333' }}>{s.session_type}</Text>
                  <Text style={{ width: 80, color: '#333', textAlign: 'right' }}>{s.duration_minutes != null ? `${s.duration_minutes}m` : '-'}</Text>
                  <Text style={{ width: 80, color: '#333', textAlign: 'right' }}>{s.total_buckets ?? 0}</Text>
                </View>
              ))
            )}
          </View>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#2E3B2B' },
  subtitle: { color: '#666', marginBottom: 10 },
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
});
