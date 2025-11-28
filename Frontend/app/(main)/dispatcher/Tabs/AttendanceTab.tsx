import React, { useState, useMemo, useEffect, useRef } from "react";
import { Platform, Animated, Easing, ScrollView, Dimensions ,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  SafeAreaView,
  Switch,
  Alert,
} from 'react-native';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import { isServicemanRole, isStaffActive, formatTimestamp, getRoleCategory } from '../../utils/staffHelpers';

import { PieChart } from 'react-native-chart-kit';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import DispatcherHeader from "../DispatcherHeader";
void ScrollView;
void isStaffActive;
import { useGlobalModal } from '../../../components/GlobalModalProvider';

export default function AttendanceTab(props?: any) {
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  // Raw attendance rows from backend (used to merge into staff view)
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  void attendanceRows;
  void setAttendanceRows;
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Role / Status filters (two-column filter UI)
  const roleOptions = ["Dispatcher", "Serviceman", "BallHandler", "Other"];
  const statusOptions = ["Present", "Absent", "Clocked Out", "No Record"];
  const [selectedRoles, setSelectedRoles] = useState<string[]>([...roleOptions]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...statusOptions]);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [editing, setEditing] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Batch update state removed: logs are no longer stored locally

  const globalModal = useGlobalModal();

  // inline clock-in editing (use native time picker)
  const [editingClockInId, setEditingClockInId] = useState<string | null>(null);
  const [editingClockDate, setEditingClockDate] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // ✅ Dynamic summary calculation

  const { presentCount, absentCount, clockedOutCount, totalCount, servicemenPresentCount, totalServicemen } = useMemo(() => {
    let present = 0, absent = 0, out = 0;
    let servicemenPresent = 0, servicemenTotal = 0;
    attendanceData.forEach((item) => {
      // prefer normalized attendanceStatus when available
      const att = String(item.attendanceStatus ?? item.status ?? '').toLowerCase();
      if (att === 'present') present++;
      else if (att === 'absent') absent++;
      else if (att === 'clocked out' || att === 'clockedout' || att === 'clocked_out') out++;

      // track servicemen counts using alias detection
      try {
        const role = item.group ?? item.role ?? '';
        if (isServicemanRole(role)) {
          servicemenTotal++;
          if (att === 'present') servicemenPresent++;
        }
      } catch (_e) {
        void _e;
      }
    });

    // finalize counts
    const total = attendanceData.length;
    return {
      presentCount: present,
      absentCount: absent,
      clockedOutCount: out,
      totalCount: total,
      servicemenPresentCount: servicemenPresent,
      totalServicemen: servicemenTotal,
    };
  }, [attendanceData]);
  void totalCount;
  void servicemenPresentCount;
  void totalServicemen;
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { Present: 0, Absent: 0, 'Clocked Out': 0, 'No Record': 0 };
    attendanceData.forEach((it) => {
      const sc = String(it.attendanceStatus ?? it.status ?? 'No Record');
      const key = sc === 'Present' ? 'Present' : sc === 'Absent' ? 'Absent' : sc === 'Clocked Out' ? 'Clocked Out' : 'No Record';
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [attendanceData]);

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    roleOptions.forEach((r) => (m[r] = 0));
    attendanceData.forEach((it) => {
      const role = String(it.group ?? it.role ?? '');
      const cat = getRoleCategory(role) || 'Other';
      m[cat] = (m[cat] || 0) + 1;
    });
    return m;
  }, [attendanceData]);

  const filteredData = useMemo(() => {
    const q = String(search ?? '').trim().toLowerCase();
    return attendanceData.filter((it) => {
      const role = String(it.group ?? it.role ?? '');
      const cat = getRoleCategory(role) || 'Other';
      const status = String(it.attendanceStatus ?? it.status ?? 'No Record');
      if (!selectedRoles.includes(cat)) return false;
      if (!selectedStatuses.includes(status)) return false;
      if (filterClockedOutOnly && !it.clockOutRaw) return false;
      if (!q) return true;
      return (String(it.name ?? '').toLowerCase().includes(q) || String(it.userId ?? '').toLowerCase().includes(q));
    });
  }, [attendanceData, selectedRoles, selectedStatuses, search]);

  // Quick toggle for showing only clocked-out staff in the list
  const [filterClockedOutOnly, setFilterClockedOutOnly] = useState(false);

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const toggleStatusFilter = (st: string) => {
    setSelectedStatuses((prev) => (prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]));
  };

  // Select / Clear helpers for quick filter operations
  const selectAllRoles = () => setSelectedRoles([...roleOptions]);
  const clearAllRoles = () => setSelectedRoles([]);
  const selectAllStatuses = () => setSelectedStatuses([...statusOptions]);
  const clearAllStatuses = () => setSelectedStatuses([]);

  // Resolve backend base URL. Use global override when present (same approach as StaffManagement).
  const baseDefault = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  const resolveBaseUrl = () => {
    return (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;
  };

  // Fetch attendance rows from backend and cache them
  const fetchAttendanceRows = async () => {
    try {
      const baseUrl = resolveBaseUrl();
      const res = await fetchWithAuth(`${baseUrl}/api/admin/attendance`, { method: 'GET' });
      if (!res || !res.ok) {
        setAttendanceRows([]);
        return [];
      }
      const rows = await res.json();
      setAttendanceRows(Array.isArray(rows) ? rows : []);
      return Array.isArray(rows) ? rows : [];
    } catch (_e) {
      void _e;
      setAttendanceRows([]);
      return [];
    }
  };

  // Helper to call the attendance clock endpoint (uses centralized fetchWithAuth)
  const apiClock = async (employeeId: number | string, type: 'in' | 'out', timestamp?: string) => {
    try {
      const baseUrl = resolveBaseUrl();
      const body: any = { employeeId: Number(employeeId), type };
      if (timestamp) body.timestamp = String(timestamp);
      const res = await fetchWithAuth(`${baseUrl}/api/admin/attendance/clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res) throw new Error('No response from server');
      if (!res.ok) {
        let txt = '';
        try { txt = await res.text(); } catch (_e) { void _e; }
        throw new Error(`Request failed: ${res.status} ${res.statusText} ${txt}`);
      }
      return await res.json();
    } catch (e: any) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

  // Load staff list from backend and map to attendance rows.
  const fetchStaff = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const baseUrl = resolveBaseUrl();
      const res = await fetchWithAuth(`${baseUrl}/api/admin/staff`, { method: 'GET' });
      if (!res) {
        setFetchError('No response from server');
        setAttendanceData([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        let bodyText = '';
        try { bodyText = await res.text(); } catch (_e) { void _e; }
        setFetchError(`Request failed: ${res.status} ${res.statusText} ${bodyText ? '- ' + bodyText : ''}`);
        setAttendanceData([]);
        setLoading(false);
        return;
      }
      const rows = await res.json();
      if (Array.isArray(rows)) {
        // fetch attendance rows and merge
        const attRows = await fetchAttendanceRows();
        const mapped = rows.map((s: any) => {
          const empId = Number(s.employee_id ?? s.id ?? s.employeeId ?? null);
          const found = attRows.find((a: any) => Number(a.employee_id) === empId || String(a.employee_id) === String(empId));
          // derive a normalized attendance status for UI & filters
          let attendanceStatus = 'No Record';
          const hasClockIn = !!(found && found.clock_in);
          const hasClockOut = !!(found && found.clock_out);
          if (hasClockIn && !hasClockOut) attendanceStatus = 'Present';
          else if (hasClockIn && hasClockOut) attendanceStatus = 'Clocked Out';
          else {
            const raw = String((found?.notes ?? found?.status ?? found?.source ?? '')).toLowerCase();
            // accept any mention of 'absent' in notes/source/status (e.g. 'Marked absent')
            if (raw.includes('absent')) attendanceStatus = 'Absent';
          }

          return ({
            id: String(empId ?? s.username ?? Math.random()),
            employee_id: empId,
            name: s.full_name ?? s.username ?? String(empId ?? ''),
            userId: s.username ?? String(empId ?? ''),
            group: s.role ?? '',
            // use normalized attendanceStatus as the canonical status shown on the UI
            status: attendanceStatus,
            attendanceStatus,
            clockInRaw: found && found.clock_in ? found.clock_in : null,
            clockOutRaw: found && found.clock_out ? found.clock_out : null,
            clockIn: found && found.clock_in ? formatTimestamp(found.clock_in) : '',
            clockOut: found && found.clock_out ? formatTimestamp(found.clock_out) : '',
          });
        });
        setAttendanceData(mapped);
      } else {
        setAttendanceData([]);
      }
    } catch (e: any) {
      setFetchError(String(e?.message ?? e));
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated drawer state for filters
  const animFilter = useRef(new Animated.Value(showFilters ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(animFilter, { toValue: showFilters ? 0 : 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [showFilters, animFilter]);

  // Chip component with press animation
  const Chip: React.FC<{ label: string; count?: number | string; active?: boolean; onPress?: () => void; onBadgePress?: () => void }> = ({ label, count, active, onPress, onBadgePress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const handlePressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
    const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    return (
      <Animated.View style={{ transform: [{ scale }], marginRight: 8, marginBottom: 8 }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          style={[styles.chip, active ? styles.chipActive : {}]}
        >
          <Animated.Text style={styles.chipText}>{label}</Animated.Text>
          <TouchableOpacity onPress={onBadgePress} style={[styles.countBadge, typeof count === 'number' ? {} : {}]}>
            <Text style={styles.countBadgeText}>{String(count ?? '')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    );
  };
    void Chip;

  const toggleStatus = async (id: string) => {
    if (!editing) return;
    const item = attendanceData.find((a) => a.id === id);
    if (!item) return;
    const wantIn = item.status !== 'Present';
    try {
      await apiClock(item.id, wantIn ? 'in' : 'out');
      await fetchStaff();
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message ?? e));
    }
  };

  const handleBatchAttendance = () => {
    setBatchMode(!batchMode);
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    if (!batchMode) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Determine selected rows' statuses to control which batch actions are allowed.
  const selectedStatusesSet = React.useMemo(() => {
    const s = new Set<string>();
    try {
      for (const id of selectedIds) {
        const it = attendanceData.find((a) => String(a.id) === String(id));
        const st = String(it?.attendanceStatus ?? it?.status ?? 'No Record');
        s.add(st);
      }
    } catch (_e) { void _e; }
    return s;
  }, [selectedIds, attendanceData]);

  const allSelectedNoStatus = selectedIds.length > 0 && selectedStatusesSet.size === 1 && (Array.from(selectedStatusesSet)[0] === 'No Record' || Array.from(selectedStatusesSet)[0] === '');
  const allSelectedPresent = selectedIds.length > 0 && selectedStatusesSet.size === 1 && Array.from(selectedStatusesSet)[0] === 'Present';

  const markSelected = () => {
    (async () => {
      const logs: any[] = [];
      try {
        for (const id of selectedIds) {
          try {
            const rec = await apiClock(id, 'in');
            logs.push({ employeeId: id, ok: true });
            console.log('Batch Clock-In success', { employeeId: id, attendance_id: rec?.attendance_id, rec });
          } catch (err: any) {
            logs.push({ employeeId: id, ok: false });
            console.warn('Batch Clock-In failed', { employeeId: id, error: String(err?.message ?? err) });
          }
        }
  // Refresh staff and attendance rows so UI reflects DB changes
  await fetchStaff();
    // Show concise result: on success use centralized modal, otherwise show failure
    try {
      const failed = (logs || []).filter((l) => !l.ok).length;
      if (failed === 0) {
        try { globalModal.showSuccess('Batch', 'Success'); } catch (_e) { /* ignore */ }
      } else {
        Alert.alert('Batch', `${failed} Failed`);
      }
    } catch (_e) { Alert.alert('Batch', 'Completed'); }
      } catch (e: any) {
        Alert.alert('Batch', 'Failed');
      } finally {
        setBatchMode(false);
        setSelectedIds([]);
      }
    })();
  };

  const handleBatchClockOut = () => {
    (async () => {
      const logs: any[] = [];
      try {
        for (const id of selectedIds) {
          try {
            const rec = await apiClock(id, 'out');
            logs.push({ employeeId: id, ok: true });
            console.log('Batch Clock-Out success', { employeeId: id, attendance_id: rec?.attendance_id, rec });
          } catch (err: any) {
            logs.push({ employeeId: id, ok: false });
            console.warn('Batch Clock-Out failed', { employeeId: id, error: String(err?.message ?? err) });
          }
        }
  // Refresh staff and attendance rows so UI reflects DB changes
  await fetchStaff();
    try {
      const failed = (logs || []).filter((l) => !l.ok).length;
      if (failed === 0) {
        try { globalModal.showSuccess('Batch', 'Success'); } catch (_e) { /* ignore */ }
      } else {
        Alert.alert('Batch', `${failed} Failed`);
      }
    } catch (_e) { Alert.alert('Batch', 'Completed'); }
      } catch (e: any) {
        Alert.alert('Batch', 'Failed');
      } finally {
        setSelectedIds([]);
        setBatchMode(false);
      }
    })();
  };

  // Mark all staff who do NOT have a clock-in as Absent (confirmation + batch)
  const markOthersAsAbsent = () => {
    Alert.alert(
      'Confirm',
      'Mark all staff who do NOT have a clock-in as Absent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: () => {
            (async () => {
              const logs: any[] = [];
              try {
                const baseUrl = resolveBaseUrl();
                const others = attendanceData
                  .filter((it) => !it.clockInRaw)
                  .map((it) => Number(it.employee_id ?? it.id))
                  .filter((n) => Number.isFinite(n));

                if (others.length > 0) {
                  try {
                    const res = await fetchWithAuth(`${baseUrl}/api/admin/attendance/mark-absent`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ employeeIds: others }),
                    });
                    if (!res || !res.ok) throw new Error(`Request failed: ${res?.status} ${res?.statusText}`);
                    const json = await res.json();
                    // json is expected to be an array of per-employee results
                    for (const r of Array.isArray(json) ? json : [json]) {
                        if (r && r.ok) {
                        logs.push({ employeeId: r.employeeId ?? null, ok: true });
                        console.log('Batch Mark as Absent success', { employeeId: r?.employeeId ?? null, attendance_id: r?.attendance_id ?? null, r });
                      } else {
                        logs.push({ employeeId: r?.employeeId ?? null, ok: false });
                        console.warn('Batch Mark as Absent failed', { employeeId: r?.employeeId ?? null, error: r?.error ?? 'Unknown error' });
                      }
                    }
                    } catch (err: any) {
                    logs.push({ employeeIds: others, ok: false });
                    console.warn('Batch Mark as Absent failed', { employeeIds: others, error: String(err?.message ?? err) });
                  }
                }

                await fetchStaff();
                try {
                  const failed = (logs || []).filter((l) => !l.ok).length;
                  if (failed === 0) {
                    // clear any stored logs and use centralized success modal
                    try { globalModal.showSuccess('Batch', 'Success'); } catch (_e) { /* ignore */ }
                  } else {
                    Alert.alert('Batch', `${failed} Failed`);
                  }
                } catch (_e) { Alert.alert('Batch', 'Completed'); }
              } catch (e: any) {
                Alert.alert('Mark Others Failed', String(e?.message ?? e));
              } finally {
                setBatchMode(false);
                setSelectedIds([]);
              }
            })();
          }
        }
      ]
    );
  };



  const incomingCounts = props?.counts ?? {};
  const incomingAssigned = props?.assignedBays ?? undefined;
  const userNameProp = props?.userName ?? undefined;

  // Pie chart dataset for summary
  const pieData = useMemo(() => {
    const present = presentCount || 0;
    const absent = absentCount || 0;
    const out = clockedOutCount || 0;
    const _total = Math.max(1, present + absent + out);
    void _total;
    return [
      { name: 'Present', population: present, color: '#6A7337', legendFontColor: '#333', legendFontSize: 12 },
      { name: 'Absent', population: absent, color: '#c62828', legendFontColor: '#333', legendFontSize: 12 },
      { name: 'Clocked Out', population: out, color: '#AEB3B8', legendFontColor: '#333', legendFontSize: 12 },
    ].filter((d) => d.population > 0);
  }, [presentCount, absentCount, clockedOutCount]);

  const windowWidth = Dimensions.get('window').width;
  const presentPct = useMemo(() => {
    const tot = Math.max(1, presentCount + absentCount + clockedOutCount);
    return Math.round((presentCount / tot) * 100);
  }, [presentCount, absentCount, clockedOutCount]);

  // Format a time-only string (HH:MM) from either raw ISO or existing formatted string
  const formatTimeOnly = (rawOrFormatted?: string | null) => {
    if (!rawOrFormatted) return '------';
    try {
      const d = new Date(rawOrFormatted);
      if (!isNaN(d.getTime())) {
        const hh = d.getHours();
        const mm = d.getMinutes();
        const hh12 = hh % 12 === 0 ? 12 : hh % 12;
        const ampm = hh >= 12 ? 'PM' : 'AM';
        return `${String(hh12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
      }
    } catch (_e) { void _e; }
    // fallback: try to extract time with regex
    const m = String(rawOrFormatted).match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : '------';
  };

  const startEditClockIn = (item: any) => {
    setEditingClockInId(item.id);
    // prefer raw ISO if present
    let baseDate = new Date();
    if (item.clockInRaw) {
      const d = new Date(item.clockInRaw);
      if (!isNaN(d.getTime())) baseDate = d;
    } else if (item.clockIn) {
      const parsed = new Date(item.clockIn);
      if (!isNaN(parsed.getTime())) baseDate = parsed;
    }
    setEditingClockDate(baseDate);
    // open picker immediately for quick selection
    setShowTimePicker(true);
  };

  const saveEditClockIn = async (item: any) => {
    if (!editingClockInId) return;
    try {
      const now = new Date();
      const src = editingClockDate ?? now;
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), src.getHours(), src.getMinutes(), 0, 0);
      const iso = dt.toISOString();
      await apiClock(item.id, 'in', iso);
      await fetchStaff();
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message ?? e));
    } finally {
      setEditingClockInId(null);
      setEditingClockDate(null);
      setShowTimePicker(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <DispatcherHeader title="Attendance" subtitle={userNameProp ? `Dispatcher ${userNameProp}` : 'Dispatcher'} counts={incomingCounts} assignedBays={incomingAssigned} showBadges={true} />

      <View style={styles.summaryBarCombined}>
        <View style={styles.pieContainer}>
          {pieData.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', height: 110 }}>
              <Text style={{ color: '#666' }}>No data</Text>
            </View>
          ) : (
            <PieChart
              data={pieData.map((d) => ({ name: d.name, population: d.population, color: d.color, legendFontColor: d.legendFontColor, legendFontSize: d.legendFontSize }))}
              width={Math.min(windowWidth - 60, 220)}
              height={120}
              chartConfig={{
                backgroundGradientFrom: '#fff',
                backgroundGradientTo: '#fff',
                color: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
                decimalPlaces: 0,
              }}
              accessor={'population'}
              backgroundColor={'transparent'}
              paddingLeft={'50'}
              center={[0, 0]}
              hasLegend={false}
            />
          )}
          <View style={styles.pieCenterOverlay}>
            <Text style={{ fontSize: 12, color: '#fffdfdff', fontWeight: '700' }}>{presentPct}%</Text>
            <Text style={{ fontSize: 11, color: '#ffffffff' }}>Present</Text>
          </View>
        </View>

        <View style={styles.statusCardsColumn}>
          <TouchableOpacity style={[styles.statCard, !filterClockedOutOnly ? styles.statCardActive : {}]} onPress={() => { setSelectedStatuses(['Present']); setFilterClockedOutOnly(false); }}>
            <View style={[styles.statDot, { backgroundColor: '#6A7337' }]} />
            <Text style={styles.statText}>Present</Text>
            <Text style={styles.statNumber}>{presentCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.statCard, {}]} onPress={() => { setSelectedStatuses(['Absent']); setFilterClockedOutOnly(false); }}>
            <View style={[styles.statDot, { backgroundColor: '#c62828' }]} />
            <Text style={styles.statText}>Absent</Text>
            <Text style={styles.statNumber}>{absentCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.statCard, filterClockedOutOnly ? styles.statCardActive : {}]} onPress={() => { setFilterClockedOutOnly((s) => !s); if (!filterClockedOutOnly) setSelectedStatuses([...statusOptions]); }}>
            <View style={[styles.statDot, { backgroundColor: '#AEB3B8' }]} />
            <Text style={styles.statText}>Clocked Out</Text>
            <Text style={styles.statNumber}>{clockedOutCount}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 12 }}><Text>Loading staff…</Text></View>
      ) : fetchError ? (
        <View style={{ padding: 12 }}>
          <Text style={{ color: '#b00020', marginBottom: 8 }}>{fetchError}</Text>
          <TouchableOpacity onPress={() => fetchStaff()} style={{ padding: 8, backgroundColor: '#eee', borderRadius: 6, alignSelf: 'flex-start' }}>
            <Text>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (!attendanceData || attendanceData.length === 0) ? (
        <View style={{ padding: 12 }}>
          <Text>No staff found.</Text>
          <TouchableOpacity onPress={() => fetchStaff()} style={{ padding: 8, backgroundColor: '#eee', borderRadius: 6, alignSelf: 'flex-start', marginTop: 8 }}>
            <Text>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search by Name or User ID"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <TouchableOpacity
          style={[styles.button, { backgroundColor: editing ? "#999" : "#4CAF50" }]}
          onPress={() => setEditing(!editing)}
        >
          <Text style={styles.buttonText}>
            {editing ? "Stop Editing" : "Start Editing"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: batchMode ? "#999" : "#d4a017" }]}
          onPress={handleBatchAttendance}
        >
          <Text style={styles.buttonText}>
            {batchMode ? "Exit Batch" : "Batch Attendance"}
          </Text>
        </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: showFilters ? '#1976d2' : '#777' }]}
            onPress={() => setShowFilters((s) => !s)}
          >
            <Text style={styles.buttonText}>{showFilters ? 'Hide Filters' : 'Show Filters'}</Text>
          </TouchableOpacity>
      </View>
        {/* Two-column filters: Roles (left) and Status (right) */}
        {showFilters && (
          <View style={styles.filtersCard}>
            <View style={styles.filtersHeader}>
              <Text style={styles.filterLabel}>Filters</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity style={styles.smallFilterBtn} onPress={selectAllRoles}>
                  <Text style={styles.smallFilterBtnText}>All Roles</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallFilterBtn} onPress={clearAllRoles}>
                  <Text style={styles.smallFilterBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.chipsRow}>
              {roleOptions.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => toggleRole(r)}
                  style={[styles.chip, selectedRoles.includes(r) ? styles.chipActive : {}]}
                >
                  <Text style={styles.chipText}>{r}</Text>
                  <View style={styles.countBadge}><Text style={styles.countBadgeText}>{roleCounts[r] ?? 0}</Text></View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.filtersHeader, { marginTop: 8 }]}>
              <Text style={styles.filterLabel}>Status</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity style={styles.smallFilterBtn} onPress={selectAllStatuses}>
                  <Text style={styles.smallFilterBtnText}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallFilterBtn} onPress={clearAllStatuses}>
                  <Text style={styles.smallFilterBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.chipsRow}>
              {statusOptions.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleStatusFilter(s)}
                  style={[styles.chip, selectedStatuses.includes(s) ? styles.chipActive : {}]}
                >
                  <Text style={styles.chipText}>{s}</Text>
                  <View style={[styles.countBadge, s === 'Present' ? { backgroundColor: '#2e7d32' } : s === 'Absent' ? { backgroundColor: '#c62828' } : s === 'Clocked Out' ? { backgroundColor: '#AEB3B8' } : { backgroundColor: '#666' }]}>
                    <Text style={styles.countBadgeText}>{statusCounts[s] ?? 0}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

      {batchMode && (
        <View style={styles.batchActions}>
          <TouchableOpacity
            style={[
              styles.batchButton,
              { backgroundColor: allSelectedNoStatus ? "#c8e6c9" : "#ddd", opacity: allSelectedNoStatus ? 1 : 0.5 },
            ]}
            onPress={markSelected}
            disabled={!allSelectedNoStatus}
          >
            <Text style={styles.batchButtonText}>Batch Clock-In & Mark Present</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.batchButton,
              { backgroundColor: allSelectedPresent ? "#b3cde0" : "#ddd", opacity: allSelectedPresent ? 1 : 0.5 },
            ]}
            onPress={handleBatchClockOut}
            disabled={!allSelectedPresent}
          >
            <Text style={styles.batchButtonText}>Batch Clock-Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.batchButton,
              { backgroundColor: allSelectedNoStatus ? "#f8d7da" : "#ddd", opacity: allSelectedNoStatus ? 1 : 0.5 },
            ]}
            onPress={markOthersAsAbsent}
            disabled={!allSelectedNoStatus}
          >
            <Text style={styles.batchButtonText}>Mark Others As Absent</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        style={styles.table}
        ListHeaderComponent={
          <View style={styles.tableHeader}>
            <Text style={[styles.tableText, styles.colName]}>Name</Text>
            <Text style={styles.tableText}>User ID</Text>
            <Text style={styles.tableText}>Group</Text>
            <Text style={styles.tableText}>Attendance</Text>
            <Text style={styles.tableText}>Status</Text>
            <Text style={styles.tableText}>Clock-In</Text>
            <Text style={styles.tableText}>Clock-Out</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => { if (batchMode) toggleSelect(item.id); else if (editing) { startEditClockIn(item); } else toggleStatus(item.id); }}>
            <View
              style={[
                styles.tableRow,
                batchMode && selectedIds.includes(item.id)
                  ? { backgroundColor: "#e3f2fd" }
                  : {},
              ]}
            >
              {batchMode ? (
                <View style={styles.checkbox}>
                  <Text>{selectedIds.includes(item.id) ? "☑️" : "⬜"}</Text>
                </View>
              ) : (
                <Switch value={item.attendanceStatus === "Present"} disabled />
              )}
              <Text style={[styles.tableText, styles.colName]}>{item.name}</Text>
              <Text style={styles.tableText}>{item.userId}</Text>
              <Text style={styles.tableText}>{item.group}</Text>
              <Text style={styles.tableText}>{item.attendanceStatus ?? item.status ?? 'No Record'}</Text>
              <Text
                style={[
                  styles.status,
                  { backgroundColor: item.attendanceStatus === "Present" ? "#c8e6c9" : item.attendanceStatus === 'Clocked Out' ? '#e0e0e0' : '#ffcdd2' },
                ]}
              >
                {item.attendanceStatus ?? item.status}
              </Text>
              {editing && editingClockInId === item.id ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <TouchableOpacity onPress={() => setShowTimePicker(true)} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff', borderRadius: 6 }}>
                    <Text style={{ fontWeight: '700' }}>{editingClockDate ? formatTimeOnly(editingClockDate.toISOString()) : 'Set time'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => saveEditClockIn(item)} style={{ marginLeft: 8 }}>
                    <Text style={{ color: '#1976d2', fontWeight: '700' }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingClockInId(null); setEditingClockDate(null); setShowTimePicker(false); }} style={{ marginLeft: 8 }}>
                    <Text style={{ color: '#777' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.tableText}>{formatTimeOnly(item.clockInRaw ?? item.clockIn)}</Text>
              )}
              <Text style={styles.tableText}>{formatTimeOnly(item.clockOutRaw ?? item.clockOut)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <DateTimePickerModal
        isVisible={showTimePicker}
        mode="time"
        date={editingClockDate ?? new Date()}
        onConfirm={(date) => { setEditingClockDate(date); setShowTimePicker(false); }}
        onCancel={() => setShowTimePicker(false)}
        is24Hour={false}
      />

      {/* Manual entry removed — inline editing available when editing mode is active */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f7f4", padding: 10 },
  header: { marginVertical: 10 },
  title: { fontSize: 22, fontWeight: "bold", color: "#2d3e2f" },
  subtitle: { fontSize: 16, color: "#555" },
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    elevation: 2,
  },
  summaryBarCombined: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 2,
  },
  pieContainer: { width: 140, alignItems: 'center', justifyContent: 'center' },
  pieCenterOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  statusCardsColumn: { flex: 1, marginLeft: 12 },
  statCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 10, marginBottom: 8, backgroundColor: '#fbfbfb' },
  statCardActive: { borderWidth: 1, borderColor: '#1976d2', backgroundColor: '#eaf4ff' },
  statDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  statText: { flex: 1, fontWeight: '700', color: '#2d3e2f' },
  statNumber: { fontWeight: '800', color: '#333' },
  summaryItem: { alignItems: "center", flex: 1 },
  summaryText: { fontWeight: "600", fontSize: 14 },
  summaryNumber: { fontSize: 18, fontWeight: "bold", color: "#333" },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 10,
    padding: 10,
    backgroundColor: "#e3e6e0",
    borderRadius: 8,
  },
  searchRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  searchInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    marginRight: 5,
  },
  button: { padding: 10, borderRadius: 8, marginLeft: 5 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  table: { backgroundColor: "#fff", borderRadius: 8 },
  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 8,
    backgroundColor: "#eaeaea",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  checkbox: { width: 30, alignItems: "center" },
  tableText: { flex: 1, textAlign: "center", fontSize: 12 },
  colName: { flex: 1.5 },
  status: {
    flex: 1,
    textAlign: "center",
    borderRadius: 6,
    paddingVertical: 3,
    fontWeight: "600",
  },
  manualEntryButton: {
    marginTop: 15,
    backgroundColor: "#a4c489",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  manualEntryText: { color: "#2d3e2f", fontWeight: "bold" },
  batchActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 10,
  },
  batchButton: {
    padding: 10,
    borderRadius: 8,
    width: "30%",
    alignItems: "center",
  },
  batchButtonText: { fontWeight: "600", color: "#2d3e2f" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#f3f7f2",
    borderRadius: 10,
    padding: 20,
    width: "85%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2d3e2f",
    marginBottom: 5,
  },
  separator: {
    borderBottomWidth: 1,
    borderColor: "#ccc",
    marginVertical: 10,
  },
  label: {
    fontWeight: "600",
    color: "#2d3e2f",
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#eef2e8",
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },
  modalButton: {
    padding: 10,
    borderRadius: 6,
    marginLeft: 10,
    width: 90,
    alignItems: "center",
  },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  filterColumn: { flex: 1, backgroundColor: '#fff', padding: 8, borderRadius: 8, marginRight: 6 },
  filterLabel: { fontWeight: '700', marginBottom: 6 },
  filterButton: { padding: 8, borderRadius: 6, backgroundColor: '#f3f3f3', marginBottom: 6 },
  filterButtonActive: { backgroundColor: '#cfe8ff' },
  filterControls: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8 },
  smallFilterBtn: { backgroundColor: '#eef6ff', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, marginRight: 8 },
  smallFilterBtnText: { color: '#064e9c', fontWeight: '700', fontSize: 12 },
  filtersCard: { backgroundColor: '#fff', padding: 10, borderRadius: 10, marginVertical: 8, elevation: 2 },
  filtersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f3f3', marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: '#cfe8ff', borderWidth: 1, borderColor: '#1976d2' },
  chipText: { fontWeight: '700', marginRight: 8 },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#999', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  countBadgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
});
