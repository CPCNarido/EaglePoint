import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function AuditLogs() {
  const [adminName, setAdminName] = useState<string>('Admin');
  const [now, setNow] = useState<Date>(new Date());
  const [logs, setLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 25; // entries per page for audit logs
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  // dropdown for user filter (anchor to button like BayManagement)
  const [showUserFilterOptions, setShowUserFilterOptions] = useState(false);
  const userFilterButtonRef = React.useRef<any>(null);
  const [userDropdownPos, setUserDropdownPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    fetchAdmin();
    // warm staff list so user modal opens instantly
    fetchStaff();
    fetchLogs();
    return () => clearInterval(t);
  }, []);

  // helper: fetch with timeout using AbortController
  const fetchWithTimeout = async (input: RequestInfo, init?: RequestInit, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(input, { ...(init || {}), signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };
  const baseDefault = 'http://localhost:3000';
  const getBaseUrl = () => (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;
  const POLL_INTERVAL_MS = 15000; // poll every 15s
  const [fetchError, setFetchError] = useState<string | null>(null);

  // polling: refresh logs periodically
  useEffect(() => {
    const id = setInterval(() => {
      // only poll when not actively loading to avoid contention
      if (!loading) fetchLogs(page);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading, startDate, endDate, selectedUserId, page]);

  // Animate user dropdown when it opens
  useEffect(() => {
    if (showUserFilterOptions) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      anim.setValue(0);
    }
  }, [showUserFilterOptions]);

  const fetchAdmin = async () => {
    try {
      const baseUrl = getBaseUrl();
      let res = await fetchWithTimeout(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' }, 4000);
      // If cookie-based auth failed, try Bearer token fallback (native clients store authToken)
      if (!res.ok) {
        try {
          // @ts-ignore - dynamic import to avoid bundler-time dependency
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
          if (token) {
            res = await fetchWithTimeout(`${baseUrl}/api/admin/me`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, 4000);
          }
        } catch {
          // ignore
        }
      }
      if (!res.ok) return;
      const d = await res.json();
      const name = d?.full_name || d?.name || d?.username || 'Admin';
      setAdminName(name);
    } catch {
      // ignore
    }
  };

  const fetchLogs = async (forPage?: number) => {
    try {
      setLoading(true);
      setFetchError(null);
      const baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      const params = new URLSearchParams();
      // request enough rows to cover pages up to `forPage` (server returns newest first)
      const reqPage = forPage ?? page;
      const reqLimit = Math.max(pageSize, reqPage * pageSize);
      params.set('limit', String(reqLimit));
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedUserId) params.set('userId', String(selectedUserId));
      let res = await fetchWithTimeout(`${getBaseUrl()}/api/admin/audit?${params.toString()}`, { method: 'GET', credentials: 'include' }, 5000);
      // fallback to bearer token if cookie-based auth fails
      if (!res.ok) {
        try {
          // @ts-ignore - dynamic import to avoid bundler-time dependency
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
          if (token) {
            res = await fetchWithTimeout(`${getBaseUrl()}/api/admin/audit?${params.toString()}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, 5000);
          }
        } catch {
          // ignore
        }
      }
      if (!res.ok) {
        setLogs([]);
        setFetchError(`Server returned ${res.status}`);
        setLoading(false);
        return;
      }
      const d = await res.json();
      // backend may return legacy array or new { total, rows } shape
      if (Array.isArray(d)) {
        setLogs(d);
        setTotalCount(d.length);
      } else if (d && Array.isArray(d.rows)) {
        setLogs(d.rows);
        setTotalCount(typeof d.total === 'number' ? d.total : d.rows.length);
      } else {
        setLogs([]);
        setTotalCount(0);
      }
    } catch (e) {
      // on abort or network error, clear logs to avoid stale data
      setLogs([]);
      if (e && (e as any).name === 'AbortError') setFetchError('Request timed out');
      else setFetchError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      let res = await fetchWithTimeout(`${getBaseUrl()}/api/admin/staff`, { method: 'GET', credentials: 'include' }, 4000);
      if (!res.ok) {
        try {
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
          if (token) res = await fetchWithTimeout(`${getBaseUrl()}/api/admin/staff`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, 4000);
        } catch {
          // ignore
        }
      }
      if (!res.ok) return setStaff([]);
      const data = await res.json();
      setStaff(Array.isArray(data) ? data : []);
    } catch (e) {
      setStaff([]);
    }
  };

  const applyUserFilter = () => {
    setShowUserFilterOptions(false);
    fetchLogs();
  };

  const clearUserFilter = () => {
    setSelectedUserId(undefined);
    setShowUserFilterOptions(false);
    fetchLogs();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Audit Logs</Text>
          <Text style={styles.subtitle}>{adminName}</Text>
        </View>
        <View>
          <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      <View style={styles.contentCard}>
        <View style={styles.filterCard}>
          <Text style={styles.filterTitle}>System Logs</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.dateInputWrap}>
                <MaterialIcons name="calendar-today" size={18} color="#555" />
                <TextInput
                  placeholder="Start Date (YYYY-MM-DD)"
                  value={startDate}
                  onChangeText={setStartDate}
                  style={styles.dateInput}
                  placeholderTextColor="#666"
                  onFocus={() => setShowStartPicker(true)}
                />
              </View>
              <View style={styles.dateInputWrap}>
                <MaterialIcons name="calendar-today" size={18} color="#555" />
                <TextInput
                  placeholder="End Date (YYYY-MM-DD)"
                  value={endDate}
                  onChangeText={setEndDate}
                  style={styles.dateInput}
                  placeholderTextColor="#666"
                  onFocus={() => setShowEndPicker(true)}
                />
              </View>
              <TouchableOpacity
                ref={userFilterButtonRef}
                style={styles.userFilterButton}
                onPress={() => {
                  fetchStaff();
                  if (userFilterButtonRef.current && userFilterButtonRef.current.measureInWindow) {
                    userFilterButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
                      setUserDropdownPos({ x, y, width, height });
                      setShowUserFilterOptions(true);
                    });
                  } else {
                    setShowUserFilterOptions((s) => !s);
                  }
                }}
              >
                <Text style={{ color: '#333' }}>{selectedUserId ? (staff.find(s => s.id === selectedUserId)?.full_name ?? `User ${selectedUserId}`) : 'Filter by User'}</Text>
                <MaterialIcons name="arrow-drop-down" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: '#2E7D32' }]}
                onPress={() => {
                  const okDate = (s: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
                  if (!okDate(startDate) || !okDate(endDate)) {
                    alert('Please enter dates in YYYY-MM-DD format');
                    return;
                  }
                  fetchLogs();
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Apply </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => fetchLogs()}
                accessibilityLabel="Refresh audit logs"
              >
                <MaterialIcons name="refresh" size={20} color="#123B14" />
              </TouchableOpacity>
            </View>
          </View>

          {Platform.OS === 'web' && (showStartPicker || showEndPicker) && (
            <View style={styles.webDatePickerRow}>
              {showStartPicker && (
                // @ts-ignore - use native HTML input on web for calendar
                <input
                  type="date"
                  value={startDate}
                  onChange={(e: any) => { setStartDate(e.target.value); setShowStartPicker(false); }}
                  onBlur={() => setShowStartPicker(false)}
                  style={{ marginRight: 12 }}
                />
              )}
              {showEndPicker && (
                // @ts-ignore
                <input
                  type="date"
                  value={endDate}
                  onChange={(e: any) => { setEndDate(e.target.value); setShowEndPicker(false); }}
                  onBlur={() => setShowEndPicker(false)}
                />
              )}
            </View>
          )}
        </View>

        {/* User selection dropdown (anchored to the button like BayManagement) */}
        <Modal visible={showUserFilterOptions} transparent animationType="none" onRequestClose={() => setShowUserFilterOptions(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowUserFilterOptions(false)}>
            {userDropdownPos && (
              <Animated.View style={[styles.userFilterOptions, { position: 'absolute', left: userDropdownPos.x, top: userDropdownPos.y + userDropdownPos.height + 6, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}> 
                <View style={[styles.caretContainer, { left: Math.max(6, userDropdownPos.width / 2 - 6) }]} pointerEvents="none">
                  <View style={styles.caret} />
                </View>
                {staff.length === 0 ? (
                  <View style={{ padding: 12, alignItems: 'center' }}>
                    <ActivityIndicator />
                    <Text style={{ marginTop: 6, color: '#666' }}>Loading staff...</Text>
                  </View>
                ) : (
                  staff.map((s: any) => (
                    <TouchableOpacity key={s.id} style={[styles.filterOption, selectedUserId === s.id ? styles.filterOptionActive : {}]} onPress={() => { setSelectedUserId(s.id); setShowUserFilterOptions(false); }}>
                      <Text style={selectedUserId === s.id ? styles.filterOptionTextActive : styles.filterOptionText}>{s.full_name ?? s.username ?? `User ${s.id}`}</Text>
                    </TouchableOpacity>
                  ))
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={styles.clearButton} onPress={clearUserFilter}>
                    <Text style={{ color: '#7A2E2E', fontWeight: '700' }}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </Pressable>
        </Modal>

        <View style={styles.logsCard}>
          <Text style={[styles.recentTitle, { marginTop: 12 }]}>Recent Activity ({logs.length} of {totalCount ?? logs.length} Entries)</Text>
          {loading ? (
            <View style={{ padding: 12, alignItems: 'center' }}>
              <ActivityIndicator size="small" />
              <Text style={{ marginTop: 8, color: '#666' }}>Loading audit logs…</Text>
            </View>
          ) : (
            <View>
              {fetchError && (
                <View style={{ padding: 8, backgroundColor: '#FFF4F0', borderRadius: 6, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#7A2E2E' }}>{fetchError}</Text>
                  <TouchableOpacity onPress={() => fetchLogs()} style={{ backgroundColor: '#EED8D5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ color: '#7A2E2E', fontWeight: '700' }}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.rowHeader}>
                <Text style={[styles.col, styles.colDate]}>Timestamp</Text>
                <Text style={[styles.col, styles.colAction]}>Action</Text>
                <Text style={[styles.col, styles.colUser]}>User</Text>
                <Text style={[styles.col, styles.colRelated]}>Related</Text>
                <Text style={[styles.col, styles.colSession]}>Session Type</Text>
              </View>
              {(() => {
                const startIdx = (page - 1) * pageSize;
                const endIdx = startIdx + pageSize;
                const pageRows = logs.slice(startIdx, endIdx);
                return pageRows.map((l: any) => (
                  <View key={String(l.log_id)} style={styles.row}>
                    <Text style={[styles.col, styles.colDate]}>{new Date(l.timestamp).toLocaleString()}</Text>
                    <Text style={[styles.col, styles.colAction]}>{l.action}</Text>
                    <Text style={[styles.col, styles.colUser]}>{l.employee_name ?? l.employee_id}</Text>
                    <Text style={[styles.col, styles.colRelated]}>{l.related_record ?? ''}</Text>
                    <Text style={[styles.col, styles.colSession]}>{l.session_type ?? ''}</Text>
                  </View>
                ));
              })()}
              {logs.length === 0 && <Text style={styles.placeholderText}>No audit events found.</Text>}
            </View>
          )}
          
          {/* Pagination controls */}
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[styles.pagePrevButton, page === 1 ? styles.pageNavDisabled : {}]}
              onPress={() => {
                const np = Math.max(1, page - 1);
                setPage(np);
                fetchLogs(np);
              }}
              disabled={page === 1}
            >
              <Text style={styles.pagePrevText}>Previous</Text>
            </TouchableOpacity>

            <View style={styles.pageList}>
              {Array.from({ length: Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize)) }).map((_, idx) => {
                const p = idx + 1;
                return (
                  <TouchableOpacity key={p} style={[styles.pageButton, page === p ? styles.pageButtonActive : {}]} onPress={() => { setPage(p); fetchLogs(p); }}>
                    <Text style={page === p ? styles.pageButtonTextActive : styles.pageButtonText}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.pageNextButton, page === Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize)) ? styles.pageNavDisabled : {}]}
              onPress={() => {
                const totalPages = Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize));
                const np = Math.min(totalPages, page + 1);
                setPage(np);
                fetchLogs(np);
              }}
              disabled={page === Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize))}
            >
              <Text style={styles.pageNextText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F6F6F2' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700', color: '#374728' },
  subtitle: { color: '#666', marginBottom: 8 },
  dateText: { textAlign: 'right', fontSize: 12, color: '#555' },
  divider: { height: 1, backgroundColor: '#ccc', marginVertical: 10 },
  contentCard: { backgroundColor: '#fff', borderRadius: 10, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2E3B2B', marginBottom: 8 },
  filterCard: { backgroundColor: '#F4F8F3', borderRadius: 10, padding: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  filterTitle: { fontSize: 15, fontWeight: '700', color: '#2E3B2B', marginBottom: 8 },
  logsCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  recentTitle: { fontSize: 18, fontWeight: '800', color: '#23351F', marginBottom: 10 },
  placeholderText: { color: '#666' },
  webDatePickerRow: { marginTop: 8, marginBottom: 8, display: 'flex', flexDirection: 'row', alignItems: 'center' },
  rowHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e6e6e6', paddingBottom: 6, marginBottom: 6 },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  col: { paddingHorizontal: 6 },
  colDate: { width: 160, color: '#444' },
  colAction: { flex: 1, color: '#333' },
  colUser: { width: 140, color: '#333' },
  colRelated: { width: 120, color: '#333' },
  colSession: { width: 100, color: '#333' },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dateInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, borderRadius: 6, height: 40, borderWidth: 1, borderColor: '#E6E6E6', marginRight: 8 },
  dateInput: { marginLeft: 8, width: 140, height: 36, color: '#333' },
  userFilterButton: { backgroundColor: '#F6F6F2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E6E6E6' },
  refreshButton: { backgroundColor: '#DDEFD0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 10, padding: 12, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalClose: { padding: 6 },
  staffItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f2f2f2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  staffItemSelected: { backgroundColor: '#EEF7E6' },
  staffName: { fontSize: 14, color: '#222' },
  staffMeta: { fontSize: 12, color: '#666' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  clearButton: { backgroundColor: '#FFF0F0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  applyButton: { backgroundColor: '#3A7D2A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  /* Pagination styles copied/adjusted from BayManagement */
  paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  pageList: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pageNavDisabled: { opacity: 0.45 },
  pageButton: { backgroundColor: '#FFF', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#E6E6E6', marginHorizontal: 4 },
  pageButtonActive: { backgroundColor: '#C9DABF', borderColor: '#12411A' },
  pageButtonText: { color: '#333', fontWeight: '700' },
  pageButtonTextActive: { color: '#12411A', fontWeight: '800' },
  pagePrevButton: { backgroundColor: '#17321d', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 },
  pagePrevText: { color: '#fff', fontWeight: '700' },
  pageNextButton: { backgroundColor: '#C9DABF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8 },
  pageNextText: { color: '#12411A', fontWeight: '700' },
  /* Dropdown/filter option styles (for anchored user dropdown) */
  userFilterOptions: { position: 'absolute', right: 0, top: 46, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 20, zIndex: 9999, minWidth: 100 },
  filterOption: { paddingVertical: 8, paddingHorizontal: 12 },
  filterOptionActive: { backgroundColor: '#EAF6E9', borderRadius: 6 },
  filterOptionText: { color: '#333' },
  filterOptionTextActive: { color: '#12411A', fontWeight: '700' },
  caretContainer: { position: 'absolute', top: -8, width: 12, height: 8, alignItems: 'center', justifyContent: 'center' },
  caret: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' },
});
