import React, { useState, useEffect, useRef } from "react";
import DispatcherHeader from "../DispatcherHeader";
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Platform, Modal } from "react-native";
import ErrorModal from '../../../components/ErrorModal';
import { friendlyMessageFromThrowable } from '../../../lib/errorUtils';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import { isServicemanRole } from '../../utils/staffHelpers';

export default function SessionControlTab({ userName, counts, assignedBays }: { userName?: string; counts?: { availableBays?: number; totalBays?: number; servicemenAvailable?: number; servicemenTotal?: number; waitingQueue?: number }; assignedBays?: number[] | null }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const listRef = useRef<FlatList<any> | null>(null);

  // Fetch live sessions (reports) and keep only active/current sessions (bay assigned and no end_time)
  const fetchSessions = async () => {
    try {
      let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) baseUrl = override;
      } catch {}

      // include bearer token fallback for native/mobile where cookies may not be present
      let headers: any = {};
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}

  const r = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions?limit=1000`, { method: 'GET', headers });
      if (r && r.ok) {
        const rows = await r.json();
        // Prefer typed `session_type` when present; treat timed sessions with a future
        // end_time as active. Also accept bay indicators under multiple possible keys.
        const active = Array.isArray(rows) ? rows.filter((s: any) => {
          const hasBay = !!(s.bay_no || s.bay || s.bay_number || s.bayNo);
          if (!hasBay) return false;
          const st = String(s.session_type ?? '').toLowerCase();
          if (st === 'open') return true;
          if (st === 'timed') {
            // Prefer server-provided `session_started`. If absent, fall back to
            // end_time being in the future.
            if (s.session_started === true) return true;
            if (!s.end_time && !s.endTime) return false;
            try { const et = new Date(s.end_time ?? s.endTime); return !isNaN(et.getTime()) && et.getTime() > Date.now(); } catch (_e) { void _e; return false; }
          }
          // Fallback: include rows with null end_time or end_time in the future
          if (s.end_time == null && s.endTime == null) return true;
          try { const et = new Date(s.end_time ?? s.endTime); return !isNaN(et.getTime()) && et.getTime() > Date.now(); } catch (_e) { void _e; return false; }
        }) : [];
        // normalize objects to a simple shape for the UI
        const normalized = active.map((s: any, ix: number) => ({
          id: s.session_id ?? s.id ?? ix,
          bay: Number(s.bay_no ?? s.bay ?? s.bay_number ?? s.bayNo),
          name: (s.player_name ?? s.name ?? s.nickname ?? (s.player && (s.player.name || s.player.full_name))) || 'Player',
          type: s.session_type ?? s.type ?? (s.timed ? 'Timed' : 'Open Time'),
          handler: s.serviceman_name ?? s.handler ?? (s.serviceman && (s.serviceman.full_name || s.serviceman.username)) ?? '-',
          duration: s.duration_text ?? s.duration ?? 'N/A',
          raw: s,
        }));
        setSessions(normalized);
      }
    } catch (_e) { void _e; // ignore
    }
  };

  useEffect(() => { let mounted = true; fetchSessions(); return () => { mounted = false; }; }, []);
  // fetch servicemen for edit dropdown
  useEffect(() => {
    let mounted = true;
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
        // attach bearer token if available (fallback) in addition to credentials
        let staffHeaders: any = {};
        try {
          // @ts-ignore
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
          if (token) staffHeaders['Authorization'] = `Bearer ${token}`;
        } catch {}
  const r = await fetchWithAuth(`${baseUrl}/api/admin/staff`, { method: 'GET', headers: staffHeaders });
          if (r && r.ok) {
            const rows = await r.json();
            if (!mounted) return;
            const svc = Array.isArray(rows) ? rows.filter((s:any) => isServicemanRole(s.role)) : [];
            setServicemen(svc);
          }
      } catch (_e) { void _e; // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filteredSessions = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(s.name).toLowerCase().includes(q) || String(s.id).toLowerCase().includes(q) || String(s.raw?.receipt || s.raw?.note || '').toLowerCase().includes(q);
  });

  // Pagination (6 entries per page)
  const [page, setPage] = useState<number>(1);
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil((filteredSessions || []).length / pageSize));

  useEffect(() => {
    // reset to first page when search or sessions change
    setPage(1);
  }, [search, sessions.length]);

  const paginatedSessions = (filteredSessions || []).slice((page - 1) * pageSize, page * pageSize);
  // Add placeholders to keep table height stable (pageSize rows)
  const displayData = (() => {
    const items = Array.isArray(paginatedSessions) ? [...paginatedSessions] : [];
    const missing = pageSize - items.length;
    for (let i = 0; i < missing; i++) items.push({ __placeholder: true, _placeholderIndex: i });
    return items;
  })();

  // action UI state
  const [actionLoading, setActionLoading] = useState(false);

  // central error modal state
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [errorModalType, setErrorModalType] = useState<'credentials'|'network'|'server'|'timeout'|'other'|null>(null);
  const [errorModalDetails, setErrorModalDetails] = useState<any>(null);

  const showError = (err: any, fallback?: string) => {
    const friendly = friendlyMessageFromThrowable(err, fallback ?? 'An error occurred');
    setErrorModalType(friendly.type ?? null);
    setErrorModalMessage(friendly.message ?? (fallback ?? 'An error occurred'));
    setErrorModalDetails(friendly.details ?? (typeof err === 'string' ? err : null));
    setErrorModalVisible(true);
  };

  // in-component toast for non-blocking success feedback
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg: string, ms: number = 2200) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), ms);
  };

  // in-app confirmation modal state (used instead of Alert.alert for consistency)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmActionFn, setConfirmActionFn] = useState<(() => void) | null>(null);

  // edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [servicemen, setServicemen] = useState<any[]>([]);
  const [editServicemanId, setEditServicemanId] = useState<string | number | null>(null);

  // extend modal state
  const [extendModalVisible, setExtendModalVisible] = useState(false);
  const [extendTarget, setExtendTarget] = useState<any | null>(null);
  const [extendMinutes, setExtendMinutes] = useState('15');

  const handleEditSave = async () => {
    if (!editTarget) return;
    setActionLoading(true);
    try {
      let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) baseUrl = override;
      } catch {}

      // Attempt to PATCH the session record. Assumption: endpoint exists
      const payload: any = { player_name: editName };
      if (editServicemanId != null) payload.serviceman_id = editServicemanId;

      const headers: any = { 'Content-Type': 'application/json' };
      try {
        // attach bearer token fallback if present
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}

      const r = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions/${editTarget.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        await fetchSessions();
        setEditModalVisible(false);
        showToast('Session updated');
        } else {
        const txt = await r.text().catch(() => 'Failed');
        showError(`Edit failed: ${txt}`);
      }
    } catch (_e) {
      showError(_e);
    } finally { setActionLoading(false); }
  };

  const handleExtendSave = async () => {
    if (!extendTarget) return;
    setActionLoading(true);
    try {
      let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) baseUrl = override;
      } catch {}

      // Assumption: backend supports POST /api/admin/sessions/{id}/extend with { minutes }
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}

      const r = await fetchWithAuth(`${baseUrl}/api/admin/sessions/${extendTarget.id}/extend`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ minutes: Number(extendMinutes || 0) }),
      });
      if (r.ok) {
        await fetchSessions();
        setExtendModalVisible(false);
        showToast(`Extended ${Number(extendMinutes || 0)}m`);
        } else {
        const txt = await r.text().catch(() => 'Failed');
        showError(`Extend failed: ${txt}`);
      }
    } catch (_e) {
      showError(_e);
    } finally { setActionLoading(false); }
  };

  const handleEndSession = async (item: any) => {
    setActionLoading(true);
    try {
      let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) baseUrl = override;
      } catch {}

      // Use admin override endpoint to end a session on a bay
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}

      const r = await fetchWithAuth(`${baseUrl}/api/admin/bays/${item.bay}/override`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'end', sessionId: item.id }),
      });
      if (r.ok) {
        await fetchSessions();
        showToast('Session ended');
        } else {
        const txt = await r.text().catch(() => 'Failed');
        showError(`End failed: ${txt}`);
      }
    } catch (_e) {
      showError(_e);
    } finally { setActionLoading(false); }
  };

  const handleStartSession = async (item: any) => {
    setActionLoading(true);
    try {
      let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
        if (override) baseUrl = override;
      } catch {}

      // Start: reuse existing start endpoint - may require nickname/servicemanId
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}

      const r = await fetchWithAuth(`${baseUrl}/api/admin/bays/${item.bay}/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ nickname: item.name }),
      });
      if (r.ok) {
        await fetchSessions();
        showToast('Session started');
        } else {
        const txt = await r.text().catch(() => 'Failed');
        showError(`Start failed: ${txt}`);
      }
    } catch (e) { void e;
      showError(e);
    } finally { setActionLoading(false); }
  };

  // ensure fetchSessions available to handlers
  const openEditModalFor = (item: any) => {
    setEditTarget(item);
    setEditName(item.name ?? '');
    // try to preselect serviceman from raw payload
    const raw = item.raw || {};
    const svcId = raw.serviceman_id ?? raw.serviceman?.employee_id ?? raw.serviceman?.id ?? raw.handler_id ?? raw.handler?.id ?? raw.assigned_serviceman_id ?? null;
    setEditServicemanId(svcId ?? null);
    setEditModalVisible(true);
  };

  const openExtendModalFor = (item: any) => {
    setExtendTarget(item);
    setExtendMinutes('15');
    setExtendModalVisible(true);
  };

  const confirmEnd = (item: any) => {
    setConfirmTitle('Confirm End Session');
    setConfirmMessage(`End session for ${item.name || 'player'} on bay ${item.bay}?`);
    setConfirmActionFn(() => () => handleEndSession(item));
    setConfirmModalVisible(true);
  };

  const confirmStart = (item: any) => {
    setConfirmTitle('Confirm Start Session');
    setConfirmMessage(`Start session for ${item.name || 'player'} on bay ${item.bay}?`);
    setConfirmActionFn(() => () => handleStartSession(item));
    setConfirmModalVisible(true);
  };

  const renderSession = ({ item }: { item: any }) => {
    if (item && item.__placeholder) {
      return (
        <View style={styles.row}>
          <Text style={[styles.cell, { color: 'transparent' }]}>-</Text>
          <Text style={[styles.cell, { color: 'transparent' }]}>-</Text>
          <Text style={[styles.cell, { color: 'transparent' }]}>-</Text>
          <Text style={[styles.cell, { color: 'transparent' }]}>-</Text>
          <Text style={[styles.cell, { color: 'transparent' }]}>-</Text>
          <View style={[styles.cell, styles.actionCell]}>
            <Text style={{ color: 'transparent' }}>-</Text>
          </View>
        </View>
      );
    }
    const type = (item.type || '').toString();
    const isTimed = /timed/i.test(type);
    const isOpen = /open/i.test(type);
    const isSpecial = /special|reserve|reserved|special use/i.test(type);

    return (
      <View style={styles.row}>
        <Text style={styles.cell}>{item.bay}</Text>
        <Text style={styles.cell}>{item.name}</Text>
        <Text style={styles.cell}>{item.type}</Text>
        <Text style={styles.cell}>{item.handler}</Text>
        <Text style={styles.cell}>{item.duration}</Text>
        <View style={[styles.cell, styles.actionCell]}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEditModalFor(item)}>
            <Text style={styles.btnText}>Edit</Text>
          </TouchableOpacity>

          {isTimed && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => openExtendModalFor(item)}>
              <Text style={styles.btnText}>Extend</Text>
            </TouchableOpacity>
          )}

          {isOpen && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => confirmEnd(item)}>
              <Text style={styles.btnText}>End</Text>
            </TouchableOpacity>
          )}

          {isSpecial && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => confirmStart(item)}>
              <Text style={styles.btnText}>Start</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <DispatcherHeader title="Session Control" subtitle="Active sessions and quick controls" counts={counts} assignedBays={assignedBays} showBadges={true} />

      {/* Main Content: search, session list - keep header as-is above */}
  <View style={styles.main}>
        <Text style={styles.sectionTitle}>Edit/Cancel</Text>
        <Text style={styles.sectionDesc}>
          The Session Control page displays all ongoing and scheduled sessions. It allows real-time management
          of active matches, including player assignments, staff allocation, and session timing.
        </Text>

        {/* Assigned bays summary (current only) */}
        {assignedBays && assignedBays.length > 0 ? (
          <View style={styles.assignedRow}>
            <Text style={{ marginRight: 8, fontWeight: '600' }}>Assigned Bays:</Text>
            {assignedBays.map((b) => (
              <TouchableOpacity
                key={String(b)}
                style={styles.assignedPill}
                onPress={() => {
                  // try to scroll to the session in the list for this bay
                  const idx = sessions.findIndex((s) => Number(s.bay) === Number(b));
                  if (idx >= 0 && listRef.current) {
                    try { listRef.current.scrollToIndex({ index: idx, animated: true }); }
                    catch { /* fallthrough */ }
                  } else {
                    showError(`No active session found for bay ${b}`);
                  }
                }}
              >
                <Text style={styles.assignedPillText}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#666', marginBottom: 10 }}>No active bay assignments</Text>
        )}

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Search Player Name, Receipt ID, or Note"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>

        {/* Table Header */}
        <View style={[styles.row, styles.headerRow]}>
          <Text style={styles.headerCell}>Bay No.</Text>
          <Text style={styles.headerCell}>Player Name</Text>
          <Text style={styles.headerCell}>Session Type</Text>
          <Text style={styles.headerCell}>Service Man</Text>
          <Text style={styles.headerCell}>Duration</Text>
          <Text style={[styles.headerCell, styles.actionHeader]}>Action</Text>
        </View>

        {/* Table Rows */}
        <FlatList
          ref={(r) => { listRef.current = r; }}
          data={displayData}
          renderItem={renderSession}
          keyExtractor={(item, idx) => item && item.__placeholder ? `empty-${item._placeholderIndex}-${idx}` : String(item.id)}
          initialNumToRender={20}
          getItemLayout={(data, index) => ({ length: 56, offset: 56 * index, index })}
        />

        {/* Pagination controls */}
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

        {/* Edit modal - edit player name and serviceman */}
        <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Edit Session</Text>
              <Text style={{ marginBottom: 6 }}>Player Name</Text>
              <TextInput value={editName} onChangeText={setEditName} style={styles.modalInput} />
              <Text style={{ marginTop: 10, marginBottom: 6 }}>Assign Service Man</Text>
              <ScrollView style={{ maxHeight: 160, marginBottom: 8 }}>
                {servicemen.map((s) => (
                  <TouchableOpacity key={String(s.id ?? s.employee_id ?? s.employeeId)} onPress={() => setEditServicemanId(s.employee_id ?? s.id ?? s.employeeId)} style={[styles.servOption, (editServicemanId === (s.employee_id ?? s.id ?? s.employeeId)) && styles.servOptionActive]}>
                    <Text style={(editServicemanId === (s.employee_id ?? s.id ?? s.employeeId)) ? styles.servOptionTextActive : styles.servOptionText}>{s.full_name ?? s.username ?? s.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={handleEditSave} disabled={actionLoading}>
                  <Text style={styles.modalButtonConfirmText}>{actionLoading ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Extend modal */}
        <Modal visible={extendModalVisible} transparent animationType="fade" onRequestClose={() => setExtendModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Extend Session</Text>
              <Text style={{ marginBottom: 6 }}>Add minutes</Text>
              <TextInput value={extendMinutes} onChangeText={setExtendMinutes} keyboardType="numeric" style={styles.modalInput} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setExtendModalVisible(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={handleExtendSave} disabled={actionLoading}>
                  <Text style={styles.modalButtonConfirmText}>{actionLoading ? 'Extending...' : 'Extend'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {/* Confirm modal (in-app) */}
        <Modal visible={confirmModalVisible} transparent animationType="fade" onRequestClose={() => setConfirmModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{confirmTitle}</Text>
              <Text style={{ marginBottom: 12 }}>{confirmMessage}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setConfirmModalVisible(false)}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={() => { setConfirmModalVisible(false); if (confirmActionFn) confirmActionFn(); }}>
                  <Text style={styles.modalButtonConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Toast */}
        {toastVisible && (
          <View style={styles.toastBox} pointerEvents="none">
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}
        <ErrorModal
          visible={errorModalVisible}
          errorType={errorModalType}
          errorMessage={errorModalMessage}
          errorDetails={errorModalDetails}
          onClose={() => setErrorModalVisible(false)}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'column' },
  title: { fontSize: 20, fontWeight: '700', color: '#1c2b1d' },
  headerSubtitle: { color: '#6b6b6b', marginTop: 4 },
  headerDivider: { height: 1, backgroundColor: '#e6e6e6', marginBottom: 16, marginTop: 6 },

  /* Main content */
  main: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  sectionDesc: { color: '#666', marginBottom: 10, fontSize: 13 },

  searchContainer: { marginBottom: 15 },
  searchInput: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },

  row: { flexDirection: 'row', borderBottomColor: '#ccc', borderBottomWidth: 1, paddingVertical: 10 },
  cell: { flex: 1, textAlign: 'center', fontSize: 13 },
  headerRow: { backgroundColor: '#e7f0e2', paddingVertical: 12 },
  headerCell: { flex: 1, textAlign: 'center', fontWeight: 'bold' },

  actionCell: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  editBtn: { backgroundColor: '#b8d7a3', padding: 6, borderRadius: 5, width: 60 },
  cancelBtn: { backgroundColor: '#7b0f0f', padding: 6, borderRadius: 5, width: 60 },
  btnText: { color: '#fff', textAlign: 'center', fontSize: 12 },
  actionHeader: { flex: 1, textAlign: 'center' },

  text: { color: '#666', marginTop: 8 },
  assignedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  assignedPill: { backgroundColor: '#eef7ec', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#c8e0c3', marginRight: 8 },
  assignedPillText: { color: '#12411A', fontWeight: '700' },
  /* Modal / serviceman list styles */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '92%', backgroundColor: '#fbfff9', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10, color: '#123b16' },
  modalInput: { borderWidth: 1, borderColor: '#e2e8e2', borderRadius: 10, padding: 10, backgroundColor: '#fff' },
  servOption: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f4f7f4' },
  servOptionActive: { backgroundColor: '#e6f4e6' },
  servOptionText: { color: '#0f2f13' },
  servOptionTextActive: { color: '#0b5a0b', fontWeight: '700' },
  modalButton: { paddingVertical: 10, paddingHorizontal: 14, marginLeft: 8, borderRadius: 8 },
  modalButtonCancel: { backgroundColor: '#f3f4f3' },
  modalButtonConfirm: { backgroundColor: '#1f7a2a' },
  modalButtonCancelText: { color: '#333', fontWeight: '600' },
  modalButtonConfirmText: { color: '#fff', fontWeight: '700' },
  toastBox: { position: 'absolute', bottom: 28, left: 24, right: 24, backgroundColor: 'rgba(0,0,0,0.8)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' },
  toastText: { color: '#fff', fontWeight: '600' },
  /* Pagination styles (match BayManagement) */
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
});
