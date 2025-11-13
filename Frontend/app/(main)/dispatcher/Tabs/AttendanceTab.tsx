import React, { useState, useMemo, useEffect } from "react";
import { Platform } from 'react-native';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import { isServicemanRole, isStaffActive, formatTimestamp } from '../../utils/staffHelpers';
import {
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
} from "react-native";

export default function AttendanceTab(_props?: any) {
  const [attendanceData, setAttendanceData] = useState<Array<any>>([]);
  // Raw attendance rows from backend (used to merge into staff view)
  const [attendanceRows, setAttendanceRows] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualVisible, setManualVisible] = useState(false);

  // Batch update logs: record per-employee result when performing batch updates
  const [batchLogs, setBatchLogs] = useState<Array<any>>([]);
  const [showBatchLogs, setShowBatchLogs] = useState(false);

  const [selectedStaff, setSelectedStaff] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");

  // ✅ Dynamic summary calculation

  const { presentCount, absentCount, clockedOutCount, totalCount, servicemenPresentCount, totalServicemen } = useMemo(() => {
    let present = 0, absent = 0, out = 0;
    let servicemenPresent = 0, servicemenTotal = 0;
    attendanceData.forEach((item) => {
      if (item.status === "Present" && !item.clockOut) present++;
      else if (item.status === "Absent") absent++;
      else if (item.status === "Present" && item.clockOut) out++;

      // track servicemen counts using alias detection and only counting staff considered "active"
      try {
        const role = item.group ?? item.role ?? '';
        if (isServicemanRole(role)) {
          servicemenTotal += 1;
          if (item.status === 'Present' && !item.clockOut) servicemenPresent += 1;
        }
      } catch (e) {
        // ignore malformed items
      }
    });
    return {
      presentCount: present,
      absentCount: absent,
      clockedOutCount: out,
      totalCount: attendanceData.length,
      servicemenPresentCount: servicemenPresent,
      totalServicemen: servicemenTotal,
    };
  }, [attendanceData]);

  const filteredData = attendanceData.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.userId.toLowerCase().includes(search.toLowerCase())
  );

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
    } catch (e) {
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
        try { txt = await res.text(); } catch (e) { /* ignore */ }
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
        try { bodyText = await res.text(); } catch {}
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
          return ({
            id: String(empId ?? s.username ?? Math.random()),
            employee_id: empId,
            name: s.full_name ?? s.username ?? String(empId ?? ''),
            userId: s.username ?? String(empId ?? ''),
            group: s.role ?? '',
            status: found ? (found.clock_out ? 'Present (Clocked-Out)' : 'Present') : 'No Record',
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

  const markSelected = () => {
    (async () => {
      const logs: Array<any> = [];
      try {
        for (const id of selectedIds) {
          try {
            const rec = await apiClock(id, 'in');
            logs.push({ employeeId: id, ok: true, attendance: rec });
            console.log('[Attendance][Batch][IN] success', { employeeId: id, attendance_id: rec?.attendance_id, rec });
          } catch (err: any) {
            logs.push({ employeeId: id, ok: false, error: String(err?.message ?? err) });
            console.warn('[Attendance][Batch][IN] failed', { employeeId: id, error: String(err?.message ?? err) });
          }
        }
  setBatchLogs(logs);
  setShowBatchLogs(true);
  // Refresh staff and attendance rows so UI reflects DB changes
  await fetchStaff();
        Alert.alert('Batch Update', 'Selected staff marked Present. See logs for details.');
      } catch (e: any) {
        Alert.alert('Batch Update Failed', String(e?.message ?? e));
      } finally {
        setBatchMode(false);
        setSelectedIds([]);
      }
    })();
  };

  const handleBatchClockOut = () => {
    (async () => {
      const logs: Array<any> = [];
      try {
        for (const id of selectedIds) {
          try {
            const rec = await apiClock(id, 'out');
            logs.push({ employeeId: id, ok: true, attendance: rec });
            console.log('[Attendance][Batch][OUT] success', { employeeId: id, attendance_id: rec?.attendance_id, rec });
          } catch (err: any) {
            logs.push({ employeeId: id, ok: false, error: String(err?.message ?? err) });
            console.warn('[Attendance][Batch][OUT] failed', { employeeId: id, error: String(err?.message ?? err) });
          }
        }
  setBatchLogs(logs);
  setShowBatchLogs(true);
  // Refresh staff and attendance rows so UI reflects DB changes
  await fetchStaff();
        Alert.alert('Batch Clock-Out', 'Clock-Out time applied for selected Present staff. See logs for details.');
      } catch (e: any) {
        Alert.alert('Batch Clock-Out Failed', String(e?.message ?? e));
      } finally {
        setSelectedIds([]);
        setBatchMode(false);
      }
    })();
  };

  const handleManualEntry = () => setManualVisible(true);

  const handleApplyManual = () => {
    (async () => {
      try {
        const match = attendanceData.find(
          (item) =>
            item.name.toLowerCase() === selectedStaff.toLowerCase() ||
            item.userId.toLowerCase() === selectedStaff.toLowerCase()
        );
        if (!match) {
          Alert.alert('Not found', 'No matching staff member found');
          return;
        }

        if (clockIn && clockIn.trim().length > 0) {
          let ts: string | undefined = undefined;
          try {
            const parsed = new Date(clockIn);
            ts = isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
          } catch (e) { ts = undefined; }
          await apiClock(match.id, 'in', ts);
        } else {
          await apiClock(match.id, 'in');
        }

        if (clockOut && clockOut.trim().length > 0) {
          let ts2: string | undefined = undefined;
          try {
            const parsed2 = new Date(clockOut);
            ts2 = isNaN(parsed2.getTime()) ? undefined : parsed2.toISOString();
          } catch (e) { ts2 = undefined; }
          await apiClock(match.id, 'out', ts2);
        }

        await fetchStaff();
        Alert.alert('Manual Entry', 'Manual time(s) applied');
      } catch (e: any) {
        Alert.alert('Manual Entry Failed', String(e?.message ?? e));
      } finally {
        setSelectedStaff('');
        setClockIn('');
        setClockOut('');
        setManualVisible(false);
      }
    })();
  };

  const handleCancelManual = () => setManualVisible(false);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Eagle Point Dispatcher</Text>
        <Text style={styles.subtitle}>Attendance</Text>
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryText, { color: "#2e7d32" }]}>🟢 Present</Text>
          <Text style={styles.summaryNumber}>{presentCount}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryText, { color: "#c62828" }]}>🔴 Absent</Text>
          <Text style={styles.summaryNumber}>{absentCount}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryText, { color: "#424242" }]}>⚪ Clocked Out</Text>
          <Text style={styles.summaryNumber}>{clockedOutCount}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryText, { color: "#1565c0" }]}>👥 Total</Text>
          <Text style={styles.summaryNumber}>{totalCount}</Text>
        </View>
      </View>

      <View style={styles.infoBar}>
        <Text>Available Bays: 30/45</Text>
        <Text>Servicemen: {servicemenPresentCount}/{totalServicemen}</Text>
        <Text>Waiting Queue: 5</Text>
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
      </View>

      {batchMode && (
        <View style={styles.batchActions}>
          <TouchableOpacity
            style={[styles.batchButton, { backgroundColor: "#c8e6c9" }]}
            onPress={markSelected}
          >
            <Text style={styles.batchButtonText}>Batch Clock-In & Mark Present</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.batchButton, { backgroundColor: "#b3cde0" }]}
            onPress={handleBatchClockOut}
          >
            <Text style={styles.batchButtonText}>Batch Clock-Out</Text>
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
            <Text style={styles.tableText}>Status</Text>
            <Text style={styles.tableText}>Clock-In</Text>
            <Text style={styles.tableText}>Clock-Out</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => (batchMode ? toggleSelect(item.id) : toggleStatus(item.id))}>
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
                <Switch value={item.status === "Present"} disabled />
              )}
              <Text style={[styles.tableText, styles.colName]}>{item.name}</Text>
              <Text style={styles.tableText}>{item.userId}</Text>
              <Text style={styles.tableText}>{item.group}</Text>
              <Text
                style={[
                  styles.status,
                  { backgroundColor: item.status === "Present" ? "#c8e6c9" : "#ffcdd2" },
                ]}
              >
                {item.status}
              </Text>
              <Text style={styles.tableText}>{item.clockIn || "------"}</Text>
              <Text style={styles.tableText}>{item.clockOut || "------"}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.manualEntryButton} onPress={handleManualEntry}>
        <Text style={styles.manualEntryText}>+ Manual Entry</Text>
      </TouchableOpacity>

      <Modal visible={manualVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Manual Time Correction</Text>
            <View style={styles.separator} />

            <Text style={styles.label}>Select Staff Member</Text>
            <TextInput
              placeholder="Enter Player’s Name or Nickname"
              value={selectedStaff}
              onChangeText={setSelectedStaff}
              style={styles.input}
            />

            <Text style={styles.label}>Clock-In Time</Text>
            <TextInput
              placeholder="e.g., 08:00 AM"
              value={clockIn}
              onChangeText={setClockIn}
              style={styles.input}
            />

            <Text style={styles.label}>Clock-Out Time (optional)</Text>
            <TextInput
              placeholder="e.g., 05:00 PM"
              value={clockOut}
              onChangeText={setClockOut}
              style={styles.input}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#cde3b6" }]}
                onPress={handleCancelManual}
              >
                <Text style={{ color: "#2d3e2f", fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#8b1e1e" }]}
                onPress={handleApplyManual}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Batch logs modal - shows per-employee DB result for recent batch operations */}
      <Modal visible={showBatchLogs} transparent animationType="fade" onRequestClose={() => setShowBatchLogs(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: 400 }]}>
            <Text style={styles.modalTitle}>Batch Update Logs</Text>
            <View style={styles.separator} />
            <View style={{ maxHeight: 280 }}>
              {batchLogs.length === 0 ? (
                <Text>No entries</Text>
              ) : (
                batchLogs.map((l, idx) => (
                  <View key={String(idx)} style={{ paddingVertical: 6 }}>
                    {l.ok ? (
                      <Text style={{ color: '#2e7d32' }}>{`[OK] ${l.employeeId} → attendance_id=${l.attendance?.attendance_id ?? 'N/A'}`}</Text>
                    ) : (
                      <Text style={{ color: '#c62828' }}>{`[ERR] ${l.employeeId} → ${l.error}`}</Text>
                    )}
                    {l.ok && l.attendance ? <Text style={{ color: '#444', fontSize: 11 }}>{JSON.stringify(l.attendance)}</Text> : null}
                  </View>
                ))
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#EEE' }]} onPress={() => setShowBatchLogs(false)}>
                <Text style={{ color: '#333', fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    width: "45%",
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
});
