import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import ErrorModal from '../../../components/ErrorModal';

export default function AuditLogs() {
  const [adminName, setAdminName] = useState<string>('Admin');
  const [now, setNow] = useState<Date>(new Date());
  const [logs, setLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 8; // entries per page for audit logs
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  // dropdown for user filter (anchor to button like BayManagement)
  const [showUserFilterOptions, setShowUserFilterOptions] = useState(false);
  const userFilterButtonRef = React.useRef<any>(null);
  const [userDropdownPos, setUserDropdownPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  // guard to prevent immediate reopen after modal close
  const lastModalCloseRef = useRef<number>(0);
  // guard to prevent rapid open/close flicker when opening modal
  const modalOpenLockRef = useRef<boolean>(false);
  // ignore backdrop presses until this timestamp (ms) to avoid opener click propagation
  const modalBackdropIgnoreUntilRef = useRef<number>(0);

  useEffect(() => {
    // initial warm-up calls
    fetchAdmin();
    // warm staff list so user modal opens instantly
    fetchStaff();
    fetchLogs();
    return () => {};
  }, []);

  // keep the `now` clock ticking except while a date modal is open (reduces re-renders)
  useEffect(() => {
    let t: any = null;
    if (!showStartPicker && !showEndPicker) {
      t = setInterval(() => setNow(new Date()), 1000);
    } else {
      // update once so UI shows correct time while picker is open
      setNow(new Date());
    }
    return () => { if (t) clearInterval(t); };
  }, [showStartPicker, showEndPicker]);

  // Debug: trace picker visibility changes
  useEffect(() => {
    console.log('[AuditLogs] showStartPicker ->', showStartPicker, Date.now());
  }, [showStartPicker]);
  useEffect(() => {
    console.log('[AuditLogs] showEndPicker ->', showEndPicker, Date.now());
  }, [showEndPicker]);

  // helper: fetch with timeout wrapper around fetchWithAuth
  const fetchAuthWithTimeout = async (input: RequestInfo, init?: RequestInit, timeout = 5000) => {
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout));
    try {
      const res = await Promise.race([fetchWithAuth(String(input), init || {}), timeoutPromise]);
      return res as Response;
    } catch (e) {
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
      Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
    } else {
      anim.setValue(0);
    }
  }, [showUserFilterOptions]);

  const fetchAdmin = async () => {
    try {
      const baseUrl = getBaseUrl();
      let res = await fetchAuthWithTimeout(`${baseUrl}/api/admin/me`, { method: 'GET' }, 4000);
      if (!res.ok) return;
      const d = await res.json();
      const name = d?.full_name || d?.name || d?.username || 'Admin';
      setAdminName(name);
    } catch {
      // ignore
    }
  };

  const fetchLogs = async (forPage?: number, opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    try {
      if (!silent) setLoading(true);
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
      let res = await fetchAuthWithTimeout(`${getBaseUrl()}/api/admin/audit?${params.toString()}`, { method: 'GET' }, 5000);
      if (!res.ok) {
        if (!silent) setLogs([]);
        setFetchError(`Server returned ${res.status}`);
        if (!silent) setLoading(false);
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
        if (!silent) setLogs([]);
        setTotalCount(0);
      }
    } catch (e) {
      // on abort or network error, avoid clearing logs when silent to prevent disorientation
      if (!silent) setLogs([]);
      if (e && (e as any).name === 'AbortError') setFetchError('Request timed out');
      else setFetchError('Network error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      let res = await fetchAuthWithTimeout(`${getBaseUrl()}/api/admin/staff`, { method: 'GET' }, 4000);
      if (!res.ok) return setStaff([]);
      const data = await res.json();
      setStaff(Array.isArray(data) ? data : []);
    } catch (e) {
      setStaff([]);
    }
  };

  // Simple calendar modal for native devices (lightweight, no external deps)
  const CalendarModal: React.FC<{ visible: boolean; value?: string; onClose: () => void; onSelect: (isoDate: string) => void; label?: string }> = ({ visible, value, onClose, onSelect, label }) => {
    const [viewYear, setViewYear] = useState<number>(() => (value ? Number(value.split('-')[0]) : new Date().getFullYear()));
    const [viewMonth, setViewMonth] = useState<number>(() => (value ? Number(value.split('-')[1]) - 1 : new Date().getMonth()));
    const [selected, setSelected] = useState<Date | null>(() => (value ? new Date(value) : null));

    useEffect(() => {
      if (value) {
        setSelected(new Date(value));
        setViewYear(Number(value.split('-')[0]));
        setViewMonth(Number(value.split('-')[1]) - 1);
      }
    }, [value]);

    const [allowInteract, setAllowInteract] = useState<boolean>(false);
    useEffect(() => {
      if (visible) {
        // single concise log on open
        console.log('[AuditLogs] CalendarModal opened', label ?? 'unknown', 'ignoreUntil=', modalBackdropIgnoreUntilRef.current);
        setAllowInteract(false);
        const t = setTimeout(() => setAllowInteract(true), 600);
        return () => clearTimeout(t);
      } else {
        setAllowInteract(false);
      }
    }, [visible, value, label]);

    const startOfMonth = (y: number, m: number) => new Date(y, m, 1);
    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

    const getMatrix = (y: number, m: number) => {
      const first = startOfMonth(y, m);
      const startWeekday = first.getDay(); // 0..6 (Sun..Sat)
      const total = daysInMonth(y, m);
      const weeks: Array<Array<number | null>> = [];
      let day = 1 - startWeekday;
      while (day <= total) {
        const week: Array<number | null> = [];
        for (let i = 0; i < 7; i++) {
          if (day < 1 || day > total) week.push(null);
          else week.push(day);
          day += 1;
        }
        weeks.push(week);
      }
      return weeks;
    };

    const weeks = getMatrix(viewYear, viewMonth);

    const formatIso = (y: number, m: number, d: number) => {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    };

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { /* ignore system back */ }} onShow={() => { /* stabilize */ }}>
        <View style={styles.modalOverlay}>
          {/* non-click-through backdrop spacer to capture taps */}
          <Pressable style={{ flex: 1 }} onPress={() => { /* ignore backdrop presses */ }} />
          <View style={styles.calendarModal} pointerEvents="box-none">
            <View pointerEvents={allowInteract ? 'auto' : 'none'}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity onPress={() => {
                  if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1);
                }} style={styles.navButton}>
                  <MaterialIcons name="chevron-left" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.calendarTitle}>{new Date(viewYear, viewMonth).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity onPress={() => {
                  if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1);
                }} style={styles.navButton}>
                  <MaterialIcons name="chevron-right" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarGridHeader}>
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => <Text key={d} style={styles.calendarGridHeaderText}>{d}</Text>)}
              </View>
              <View style={styles.calendarGrid}>
                {weeks.map((week, wi) => (
                  <View key={`w-${wi}`} style={styles.calendarWeek}>
                    {week.map((day, di) => {
                      const isSelected = selected && day && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
                      return (
                        <TouchableOpacity key={`d-${di}`} style={[styles.dayCell, isSelected ? styles.dayCellSelected : {}]} disabled={!day} onPress={() => { if (day) setSelected(new Date(viewYear, viewMonth, day)); }}>
                          <Text style={isSelected ? styles.dayCellTextSelected : styles.dayCellText}>{day ? String(day) : ''}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
              <View style={styles.calendarFooter}>
                <TouchableOpacity style={[styles.clearButton, { backgroundColor: '#EEE' }]} onPress={() => { 
                  if (Date.now() < (modalBackdropIgnoreUntilRef.current || 0)) { console.log('[AuditLogs] CalendarModal Clear ignored (early press)'); return; }
                  console.log('[AuditLogs] CalendarModal Clear'); setSelected(null); onSelect(''); onClose(); }}>
                  <Text style={{ color: '#333', fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={[styles.applyButton, { marginRight: 8 }]} onPress={() => { 
                  if (Date.now() < (modalBackdropIgnoreUntilRef.current || 0)) { console.log('[AuditLogs] CalendarModal Apply ignored (early press)'); return; }
                  console.log('[AuditLogs] CalendarModal Apply', selected); if (selected) onSelect(formatIso(selected.getFullYear(), selected.getMonth(), selected.getDate())); onClose(); }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clearButton]} onPress={() => { 
                  if (Date.now() < (modalBackdropIgnoreUntilRef.current || 0)) { console.log('[AuditLogs] CalendarModal Cancel ignored (early press)'); return; }
                  console.log('[AuditLogs] CalendarModal Cancel'); onClose(); }}>
                  <Text style={{ color: '#333', fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Try to dynamically load a native date picker (react-native-modal-datetime-picker)
  const [NativePickerComponent, setNativePickerComponent] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      try {
        // dynamic import - may not be installed in all environments, silence typescript check
        // @ts-ignore
        const mod = await import('react-native-modal-datetime-picker');
        setNativePickerComponent(mod?.default ?? mod);
      } catch (e) {
        // package not installed or failed to load - we'll fall back to the in-file calendar
        setNativePickerComponent(null);
      }
    })();
  }, []);

  const formatDateIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
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
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Open start date calendar"
                    onPress={() => {
                      const now = Date.now();
                      console.log('[AuditLogs] start-open-press', now);
                      if (modalOpenLockRef.current) return;
                      if (now - lastModalCloseRef.current < 700) return;
                      // acquire open-lock; only release it when the modal actually closes
                      modalOpenLockRef.current = true;
                      // set ignore window immediately (covers opener propagation) and delay open
                      modalBackdropIgnoreUntilRef.current = Date.now() + 1500;
                      console.log('[AuditLogs] set modalBackdropIgnoreUntil ->', modalBackdropIgnoreUntilRef.current);
                      setTimeout(() => { 
                        setShowStartPicker(true); 
                      }, 150);
                    }}
                    style={[styles.dateInput, { justifyContent: 'center' }]}
                  >
                  <Text style={{ color: startDate ? '#111' : '#888' }}>{startDate || 'Start Date (YYYY-MM-DD)'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.dateInputWrap}>
                <MaterialIcons name="calendar-today" size={18} color="#555" />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open end date calendar"
                  onPress={() => {
                    const now = Date.now();
                    console.log('[AuditLogs] end-open-press', now);
                    if (modalOpenLockRef.current) return;
                    if (now - lastModalCloseRef.current < 700) return;
                    // acquire open-lock; only release it when the modal actually closes
                    modalOpenLockRef.current = true;
                    modalBackdropIgnoreUntilRef.current = Date.now() + 1500;
                    console.log('[AuditLogs] set modalBackdropIgnoreUntil ->', modalBackdropIgnoreUntilRef.current);
                    setTimeout(() => { 
                      setShowEndPicker(true); 
                    }, 150);
                  }}
                  style={[styles.dateInput, { justifyContent: 'center' }]}
                >
                  <Text style={{ color: endDate ? '#111' : '#888' }}>{endDate || 'End Date (YYYY-MM-DD)'}</Text>
                </TouchableOpacity>
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

          {/* Calendar / native date picker (native modal preferred; fallback to CalendarModal) */}
          {
            Platform.OS !== 'web' && NativePickerComponent ? (
              (() => {
                const NP = NativePickerComponent;
                return (
                  <>
                    <NP
                      isVisible={showStartPicker}
                      mode="date"
                      // @ts-ignore
                      date={startDate ? new Date(startDate) : new Date()}
                      onConfirm={(d: Date) => { console.log('[AuditLogs] NativePicker onConfirm start', d); setStartDate(formatDateIso(d)); lastModalCloseRef.current = Date.now(); setShowStartPicker(false); modalOpenLockRef.current = false; }}
                      onCancel={() => { console.log('[AuditLogs] NativePicker onCancel start'); lastModalCloseRef.current = Date.now(); setShowStartPicker(false); modalOpenLockRef.current = false; }}
                    />
                    <NP
                      isVisible={showEndPicker}
                      mode="date"
                      // @ts-ignore
                      date={endDate ? new Date(endDate) : new Date()}
                      onConfirm={(d: Date) => { console.log('[AuditLogs] NativePicker onConfirm end', d); setEndDate(formatDateIso(d)); lastModalCloseRef.current = Date.now(); setShowEndPicker(false); modalOpenLockRef.current = false; }}
                      onCancel={() => { console.log('[AuditLogs] NativePicker onCancel end'); lastModalCloseRef.current = Date.now(); setShowEndPicker(false); modalOpenLockRef.current = false; }}
                    />
                  </>
                );
              })()
            ) : (
              <>
                {showStartPicker && (
                  <CalendarModal
                    label="start"
                    visible={true}
                    value={startDate}
                    onClose={() => { lastModalCloseRef.current = Date.now(); setShowStartPicker(false); modalOpenLockRef.current = false; }}
                    onSelect={(v) => { if (v) setStartDate(v); lastModalCloseRef.current = Date.now(); setShowStartPicker(false); modalOpenLockRef.current = false; }}
                  />
                )}
                {showEndPicker && (
                  <CalendarModal
                    label="end"
                    visible={true}
                    value={endDate}
                    onClose={() => { lastModalCloseRef.current = Date.now(); setShowEndPicker(false); modalOpenLockRef.current = false; }}
                    onSelect={(v) => { if (v) setEndDate(v); lastModalCloseRef.current = Date.now(); setShowEndPicker(false); modalOpenLockRef.current = false; }}
                  />
                )}
              </>
            )
          }
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
                  <>
                    <View style={styles.dropdownSearchRow}>
                      <TextInput
                        accessibilityLabel="Search users"
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChangeText={setUserSearchTerm}
                        style={styles.dropdownSearchInput}
                        placeholderTextColor="#888"
                      />
                      <TouchableOpacity onPress={() => { setUserSearchTerm(''); }} style={styles.dropdownSearchClear} accessibilityLabel="Clear user search">
                        <MaterialIcons name="close" size={18} color="#666" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.dropdownOptionsScroll} nestedScrollEnabled={true}>
                      {staff
                        .filter((s: any) => {
                          if (!userSearchTerm) return true;
                          try {
                            const term = userSearchTerm.toLowerCase();
                            const name = (s.full_name || s.username || '').toLowerCase();
                            return name.includes(term) || String(s.id).includes(term);
                          } catch {
                            return true;
                          }
                        })
                        .map((s: any) => (
                          <TouchableOpacity
                            key={s.id}
                            style={[styles.filterOption, selectedUserId === s.id ? styles.filterOptionActive : {}]}
                            onPress={() => { setSelectedUserId(s.id); setShowUserFilterOptions(false); setUserSearchTerm(''); }}
                          >
                            <Text style={selectedUserId === s.id ? styles.filterOptionTextActive : styles.filterOptionText}>{s.full_name ?? s.username ?? `User ${s.id}`}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </>
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
              {/* Replace inline fetch error box with central ErrorModal for consistent UX */}
              <ErrorModal
                visible={!!fetchError}
                errorType={'other'}
                errorMessage={fetchError ?? ''}
                errorDetails={null}
                onClose={() => setFetchError(null)}
                onRetry={() => { setFetchError(null); fetchLogs(); }}
              />
              <View style={styles.rowHeader}>
                <Text style={[styles.col, styles.colDate]}>Timestamp</Text>
                <Text style={[styles.col, styles.colAction]}>Action</Text>
                <Text style={[styles.col, styles.colUser]}>User</Text>
                <Text style={[styles.col, styles.colRelated]}>Related</Text>
                <Text style={[styles.col, styles.colSession]}>Session Type</Text>
              </View>
              <View style={styles.rowsContainer}>
                <ScrollView style={styles.rowsScroll} nestedScrollEnabled={true}>
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
                </ScrollView>
              </View>
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
                fetchLogs(np, { silent: true });
              }}
              disabled={page === 1}
            >
              <Text style={styles.pagePrevText}>Previous</Text>
            </TouchableOpacity>

            <View style={styles.pageList}>
              {(() => {
                const totalPages = Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize));
                const computePages = (cur: number, total: number) => {
                  if (total <= 4) return Array.from({ length: total }, (_, i) => i + 1);
                  if (cur <= 4) return [1, 2, 3, 4, 'ellipsis', total];
                  if (cur >= total - 2) return [1, 'ellipsis', total - 3, total - 2, total - 1, total];
                  return [cur - 2, cur - 1, cur, 'ellipsis', total];
                };
                const pagesToRender = computePages(page, totalPages);
                return pagesToRender.map((p: any, idx: number) => {
                  if (p === 'ellipsis') return (<Text key={`ellipsis-${idx}`} style={{ paddingHorizontal: 8 }}>…</Text>);
                  const num = Number(p);
                  return (
                    <TouchableOpacity key={`page-${num}`} style={[styles.pageButton, page === num ? styles.pageButtonActive : {}]} onPress={() => { setPage(num); fetchLogs(num, { silent: true }); }}>
                      <Text style={page === num ? styles.pageButtonTextActive : styles.pageButtonText}>{num}</Text>
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>

            <TouchableOpacity
              style={[styles.pageNextButton, page === Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize)) ? styles.pageNavDisabled : {}]}
              onPress={() => {
                const totalPages = Math.max(1, Math.ceil((totalCount ?? logs.length) / pageSize));
                const np = Math.min(totalPages, page + 1);
                setPage(np);
                fetchLogs(np, { silent: true });
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
  dropdownSearchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  dropdownSearchInput: { flex: 1, height: 36, paddingHorizontal: 8, backgroundColor: '#F6F6F2', borderRadius: 6, borderWidth: 1, borderColor: '#E6E6E6', color: '#222' },
  dropdownSearchClear: { marginLeft: 8, padding: 6 },
  dropdownOptionsScroll: { maxHeight: 220, marginTop: 6 },
  filterOption: { paddingVertical: 8, paddingHorizontal: 12 },
  filterOptionActive: { backgroundColor: '#EAF6E9', borderRadius: 6 },
  filterOptionText: { color: '#333' },
  filterOptionTextActive: { color: '#12411A', fontWeight: '700' },
  caretContainer: { position: 'absolute', top: -8, width: 12, height: 8, alignItems: 'center', justifyContent: 'center' },
  caret: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' },
  rowsContainer: { height: 360, overflow: 'hidden', marginTop: 6 },
  rowsScroll: { paddingRight: 8 },
  calendarModal: { backgroundColor: '#fff', borderRadius: 10, padding: 12, width: 320, alignSelf: 'center', marginTop: 80, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 20 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navButton: { padding: 6 },
  calendarTitle: { fontSize: 16, fontWeight: '700', color: '#23351F' },
  calendarGridHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  calendarGridHeaderText: { width: 40, textAlign: 'center', color: '#666', fontWeight: '700' },
  calendarGrid: { },
  calendarWeek: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dayCell: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  dayCellSelected: { backgroundColor: '#C9DABF' },
  dayCellText: { color: '#333' },
  dayCellTextSelected: { color: '#12411A', fontWeight: '800' },
  calendarFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
});
