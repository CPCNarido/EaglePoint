import React, { useState, useEffect, useRef } from "react";
import DispatcherHeader from "../DispatcherHeader";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  TextInput,
  Modal,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import ErrorModal from '../../../components/ErrorModal';
import Toast from '../../../components/Toast';
import { friendlyMessageFromThrowable } from '../../../lib/errorUtils';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import { isServicemanRole } from '../../utils/staffHelpers';

export default function BayAssignmentScreen({ userName, counts, assignedBays }: { userName?: string; counts?: { availableBays?: number; totalBays?: number; servicemenAvailable?: number; servicemenTotal?: number; waitingQueue?: number }; assignedBays?: number[] | null }) {
  const [players, setPlayers] = useState<any[]>([]);

  const [servicemen, setServicemen] = useState<Array<{id:number;name:string;online?:boolean}>>([]);
  const [busyServicemen, setBusyServicemen] = useState<number[]>([]);

  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [nextServicemanIndex, setNextServicemanIndex] = useState(0);
  const [selectedBay, setSelectedBay] = useState<number | string | null>(null);
  const [bayDropdownOpen, setBayDropdownOpen] = useState(false);
  const [availableBays, setAvailableBays] = useState<number[] | null>(null);
  const [totalBaysCount, setTotalBaysCount] = useState<number | null>(null);
  const dropdownButtonRef = useRef<any>(null);
  const [showBayOptions, setShowBayOptions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  // Serviceman dropdown state (anchored, same behavior as bay dropdown)
  const [selectedServiceman, setSelectedServiceman] = useState<number | null>(null);
  const servDropdownButtonRef = useRef<any>(null);
  const [showServOptions, setShowServOptions] = useState(false);
  const [servDropdownPos, setServDropdownPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const servAnim = useRef(new Animated.Value(0)).current;

  // centralized error modal state
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string>('');
  const [errorModalType, setErrorModalType] = useState<any | null>(null);
  const [errorModalDetails, setErrorModalDetails] = useState<any>(null);
  const [errorModalTitle, setErrorModalTitle] = useState<string | undefined>(undefined);

  const showError = (err: any, fallback?: string) => {
    const friendly = friendlyMessageFromThrowable(err, fallback ?? 'An error occurred');
    setErrorModalType(friendly?.type ?? 'other');
    setErrorModalMessage(friendly?.message ?? (fallback ?? 'An error occurred'));
    setErrorModalDetails(friendly?.details ?? (typeof err === 'string' ? err : null));
    setErrorModalTitle(fallback ?? undefined);
    setErrorModalVisible(true);
  };
  // Toast state for transient success/info messages
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastTitle, setToastTitle] = useState<string | undefined>(undefined);
  const showToast = (title: string | undefined, message: string) => {
    setToastTitle(title);
    setToastMessage(message);
    setToastVisible(true);
  };

  const getNextServiceman = () => {
    const available = servicemen.filter(s => !busyServicemen.includes(Number(s.id)));
    if (!available || available.length === 0) {
      // fallback to full list (round-robin) if none available
      if (!servicemen || servicemen.length === 0) return null;
      return servicemen[nextServicemanIndex % servicemen.length];
    }
    // Try round-robin among available servicemen
    for (let i = 0; i < available.length; i++) {
      const idx = (nextServicemanIndex + i) % available.length;
      const s = available[idx];
      if (s) return s;
    }
    return available[0] || null;
  };

  const confirmAssignment = () => {
    (async () => {
  if (!selectedPlayer) { showError('Select a player first.'); return; }
  if (!selectedBay) { showError('Please select a bay first.'); return; }
  // prefer explicit selected serviceman (only if still available), otherwise fallback to queue logic
  const explicit = selectedServiceman ? servicemen.find((s) => Number(s.id) === Number(selectedServiceman)) : null;
  const svc = explicit && !busyServicemen.includes(Number(explicit.id)) ? explicit : getNextServiceman();
  if (!svc) { showError('No serviceman available.'); return; }

      setAssigning(true);
      try {
        // resolve baseUrl similar to other dispatcher screens
        let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
        try {
          // @ts-ignore dynamic import
          const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
          const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
          const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
          if (override) baseUrl = override;
        } catch {}

        const body: any = { nickname: selectedPlayer.name ?? selectedPlayer.player_name ?? selectedPlayer.nickname ?? null };
        if (svc && svc.id) body.servicemanId = svc.id;
  // POST to server to start session on the chosen bay
  const res = await fetchWithAuth(`${baseUrl}/api/admin/bays/${selectedBay}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res && res.ok) {
          showToast('Assignment Complete', `${selectedPlayer.name} assigned to ${svc.name} (Bay ${selectedBay})`);
          // remove player from queue
          setPlayers((prev) => prev.filter((p) => Number(p.id) !== Number(selectedPlayer.id)));
          // advance nextServicemanIndex to the next id after the chosen serviceman
          try {
            const chosenIdx = servicemen.findIndex((s) => Number(s.id) === Number(svc.id));
            if (chosenIdx >= 0) setNextServicemanIndex(((chosenIdx + 1) % Math.max(1, servicemen.length)));
            else setNextServicemanIndex((i) => (i + 1) % Math.max(1, servicemen.length));
          } catch { setNextServicemanIndex((i) => (i + 1) % Math.max(1, servicemen.length)); }
          setSelectedPlayer(null);
          setSelectedBay(null);
          // clear explicit selection after assignment
          setSelectedServiceman(null);
        } else {
          showError('Server refused assignment.');
        }
      } catch (e) {
        showError(e, 'Assignment failed.');
      } finally {
        setAssigning(false);
      }
    })();
  };

  const renderBadge = (label: string, value: string) => (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {label}: {value}
      </Text>
    </View>
  );

  const renderDropdown = () => (
    <View>
      <TouchableOpacity
        ref={dropdownButtonRef}
        style={styles.dropdownButton}
        onPress={() => {
          // measure and open anchored dropdown similar to BayManagement
              if (dropdownButtonRef.current && dropdownButtonRef.current.measureInWindow) {
            dropdownButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
              setDropdownPos({ x, y, width, height });
              anim.setValue(0);
              setShowBayOptions(true);
              Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
            });
          } else {
            setShowBayOptions(true);
            Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
          }
        }}
      >
        <Text style={styles.dropdownText}>
          {selectedBay ? `Bay ${selectedBay}` : (availableBays ? `Choose Available Bay (${availableBays.length})` : "Choose Available Bay")}
        </Text>
      </TouchableOpacity>

      <Modal visible={showBayOptions} transparent animationType="none" onRequestClose={() => setShowBayOptions(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowBayOptions(false)}>
          {dropdownPos && (
            // make the dropdown the same width as the button it came from; clamp to screen if needed
            <Animated.View style={[styles.filterOptions, { position: 'absolute', left: (() => {
                const screenW = require('react-native').Dimensions.get('window').width;
                const desiredLeft = dropdownPos.x;
                const desiredWidth = dropdownPos.width;
                // clamp so it doesn't overflow the screen with a 12px margin
                if (desiredLeft + desiredWidth > screenW - 12) return Math.max(8, screenW - desiredWidth - 12);
                return desiredLeft;
              })(), top: dropdownPos.y + dropdownPos.height + 6, width: dropdownPos.width, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
              <View style={[styles.caretContainer, { left: Math.max(6, dropdownPos.width / 2 - 6) }]} pointerEvents="none">
                <View style={styles.caret} />
              </View>
              {/* make the options scrollable so long lists don't overflow the screen */}
              <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {(availableBays && availableBays.length > 0 ? availableBays : Array.from({ length: 45 }).map((_,i)=>i+1)).map((n:any) => (
                    <TouchableOpacity key={`bay-${n}`} style={[styles.filterOption, selectedBay === n ? styles.filterOptionActive : null]} onPress={() => { setSelectedBay(n); setShowBayOptions(false); }} activeOpacity={0.7}>
                      <Text style={[styles.filterOptionText, selectedBay === n ? styles.filterOptionTextActive : null]}>{`Bay ${n}`}</Text>
                      {selectedBay === n && <Text style={styles.checkMark}>✓</Text>}
                    </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </View>
  );

  const renderServDropdown = () => (
    <View>
      <TouchableOpacity
        ref={servDropdownButtonRef}
        style={styles.dropdownButton}
        onPress={() => {
            if (servDropdownButtonRef.current && servDropdownButtonRef.current.measureInWindow) {
            servDropdownButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
              setServDropdownPos({ x, y, width, height });
              servAnim.setValue(0);
              setShowServOptions(true);
              Animated.timing(servAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
            });
          } else {
            setShowServOptions(true);
            Animated.timing(servAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
          }
        }}
      >
        <Text style={styles.dropdownText}>
          {selectedServiceman ? (servicemen.find(s => s.id === selectedServiceman)?.name ?? `Serviceman ${selectedServiceman}`) : (() => {
            const available = servicemen.filter(s => !busyServicemen.includes(Number(s.id)));
            return `Choose Serviceman (${available.length})`;
          })()}
        </Text>
      </TouchableOpacity>

      <Modal visible={showServOptions} transparent animationType="none" onRequestClose={() => setShowServOptions(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowServOptions(false)}>
          {servDropdownPos && (
            <Animated.View style={[styles.filterOptions, { position: 'absolute', left: (() => {
                const screenW = require('react-native').Dimensions.get('window').width;
                const desiredLeft = servDropdownPos.x;
                const desiredWidth = servDropdownPos.width;
                if (desiredLeft + desiredWidth > screenW - 12) return Math.max(8, screenW - desiredWidth - 12);
                return desiredLeft;
              })(), top: servDropdownPos.y + servDropdownPos.height + 6, width: servDropdownPos.width, opacity: servAnim, transform: [{ translateY: servAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
              <View style={[styles.caretContainer, { left: Math.max(6, servDropdownPos.width / 2 - 6) }]} pointerEvents="none">
                <View style={styles.caret} />
              </View>
              <ScrollView style={{ maxHeight: 250}} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {servicemen.filter((s:any) => !busyServicemen.includes(Number(s.id))).map((s:any) => (
                  <TouchableOpacity key={`svc-${s.id}`} style={[styles.filterOption, selectedServiceman === s.id ? styles.filterOptionActive : null]} onPress={() => { setSelectedServiceman(s.id); setShowServOptions(false); }} activeOpacity={0.7}>
                    <Text style={[styles.filterOptionText, selectedServiceman === s.id ? styles.filterOptionTextActive : null]}>{s.name}</Text>
                    {selectedServiceman === s.id && <Text style={styles.checkMark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </View>
  );

  // Clear explicit selection if that serviceman becomes busy or disappears
  useEffect(() => {
    if (selectedServiceman == null) return;
    const stillAvailable = servicemen.some(s => Number(s.id) === Number(selectedServiceman) && !busyServicemen.includes(Number(s.id)));
    if (!stillAvailable) setSelectedServiceman(null);
  }, [busyServicemen, servicemen]);

  // Fetch players waiting (unassigned) and servicemen on mount
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

        // Fetch recent sessions and filter for players without bay assignment and not ended
        try {
          const res = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions?limit=1000`, { method: 'GET' });
          if (res && res.ok) {
            const rows = await res.json();
            // rows may be array of mapped sessions; select those with no bay_no and no end_time
            const waiting = Array.isArray(rows) ? rows.filter((r: any) => !r.bay_no && !r.end_time) : [];
            if (mounted) setPlayers(waiting.map((w: any) => ({ id: w.player_id, name: w.player_name ?? w.session_id, receipt: w.session_id, note: '' })));
          }
        } catch (e) { /* ignore */ }

        // Fetch servicemen (include online flag). Only show servicemen who are currently "present"
        // i.e. have a clock-in and have NOT clocked out. If attendance fetch fails, fall back to full staff list.
        try {
          const r2 = await fetchWithAuth(`${baseUrl}/api/admin/staff`, { method: 'GET' });
          let staff: any[] = [];
          if (r2 && r2.ok) staff = await r2.json();

          // try to fetch attendance rows to determine who is present
          try {
            const rAtt = await fetchWithAuth(`${baseUrl}/api/admin/attendance`, { method: 'GET' });
            if (rAtt && rAtt.ok) {
              const rows = await rAtt.json();
              const presentSet = new Set<number>();
              if (Array.isArray(rows)) {
                for (const row of rows) {
                  const empId = Number(row?.employee_id ?? row?.employeeId ?? row?.staff_id ?? row?.staffId ?? row?.serviceman_id ?? row?.servicemanId ?? null);
                  const hasClockIn = !!(row?.clock_in || row?.clockIn || row?.start_time || row?.startTime);
                  const hasClockOut = !!(row?.clock_out || row?.clockOut || row?.end_time || row?.endTime);
                  if (!Number.isNaN(empId) && hasClockIn && !hasClockOut) presentSet.add(empId);
                }
              }

              const svc = Array.isArray(staff) ? staff.filter((s: any) => isServicemanRole(s.role)).sort((a: any,b: any)=> (a.employee_id||0)-(b.employee_id||0)) : [];
              // only include those who are present
              const filtered = svc.filter((s: any) => presentSet.has(Number(s.employee_id)));
              if (mounted) setServicemen(filtered.map((s: any) => ({ id: s.employee_id, name: s.full_name || s.username, online: !!s.online })));
            } else {
              // attendance fetch failed, fall back to staff-only list
              const svc = Array.isArray(staff) ? staff.filter((s: any) => isServicemanRole(s.role)).sort((a: any,b: any)=> (a.employee_id||0)-(b.employee_id||0)) : [];
              if (mounted) setServicemen(svc.map((s: any) => ({ id: s.employee_id, name: s.full_name || s.username, online: !!s.online })));
            }
          } catch (e) {
            // attendance fetch errored - fall back to staff-only list
            const svc = Array.isArray(staff) ? staff.filter((s: any) => isServicemanRole(s.role)).sort((a: any,b: any)=> (a.employee_id||0)-(b.employee_id||0)) : [];
            if (mounted) setServicemen(svc.map((s: any) => ({ id: s.employee_id, name: s.full_name || s.username, online: !!s.online })));
          }
        } catch (e) { /* ignore */ }

        // Fetch bay overview so we can list actual available bays (matches mock dropdown behavior)
        try {
          const r3 = await fetchWithAuth(`${baseUrl}/api/admin/overview`, { method: 'GET' });
          if (r3 && r3.ok) {
            const ov = await r3.json();
            const rows = ov?.bays || ov?.bayList || ov || [];
            if (Array.isArray(rows)) {
              const avail: number[] = [];
              const busyIds: number[] = [];
              // set total bay count
              if (mounted) setTotalBaysCount(rows.length);
              for (const b of rows) {
                const bayNo = Number(b?.bay_number ?? b?.bayNo ?? b?.bay_no ?? b?.bay ?? null);
                const rawSession = b?.session;
                const sessionAction = rawSession && typeof rawSession === 'object' ? (rawSession.action || rawSession.status || rawSession.type || rawSession.session_type) : rawSession;
                const sessionCandidate = String(b?.status ?? sessionAction ?? b?.session_type ?? b?.sessionType ?? b?.type ?? b?.bay_status ?? b?.action ?? '').toString();
                const sessionLower = (sessionCandidate || '').toLowerCase();
                // detect reserved / special-use markers in data (various possible keys)
                const isReservedFlag = !!(b?.reserved || b?.is_reserved || b?.reserved_for || sessionLower.includes('reserved') || sessionLower.includes('specialuse') || sessionLower === 'specialuse' || String(b?.status) === 'Reserved');
                const isSpecialFlag = !!(b?.special_use || b?.specialUse || b?.is_special_use || b?.specialuse || sessionLower.includes('special') || sessionLower.includes('specialuse'));
                const isAvailableRaw = ((!b?.player && !b?.player_name) || sessionLower.includes('available') || (sessionLower.includes('timed') && !b?.player));
                const isAvailable = isAvailableRaw && !isReservedFlag && !isSpecialFlag;
                if (!Number.isNaN(bayNo) && isAvailable) avail.push(bayNo);
                // try to extract serviceman id from various possible keys so we can mark them as busy
                const maybeIds = [b?.serviceman_id, b?.servicemanId, b?.serviceman?.employee_id, b?.serviceman?.id, b?.assigned_employee_id, b?.assignee_id, b?.serviceman_employee_id, b?.employee_id, b?.servicemanEmployeeId];
                for (const mid of maybeIds) {
                  if (mid != null) {
                    const n = Number(mid);
                    if (!Number.isNaN(n) && !busyIds.includes(n)) busyIds.push(n);
                  }
                }
              }
              if (mounted) {
                setAvailableBays(avail.sort((a,b)=>a-b));
                setBusyServicemen(busyIds);
              }
            }
          }
        } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <View style={styles.container}>
      {/* Main Section - no sidebar, full width */}
      <View style={styles.mainContent}>
        <DispatcherHeader title="Bay Assignment" subtitle={userName ? `Dispatcher ${userName}` : 'Dispatcher'} counts={counts} assignedBays={assignedBays} showBadges={true} />

        {/* Main Columns */}
        <View style={styles.columns}>
          {/* Left - Player Queue */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Player Queue</Text>
            <Text style={styles.cardSubtitle}>
              Entries from Cashier: {players.length} Players
            </Text>

            <ScrollView style={{ height: 400 }}>
              {players.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  onPress={() => setSelectedPlayer(player)}
                  style={[
                    styles.playerItem,
                    selectedPlayer?.id === player.id && styles.playerItemActive,
                  ]}
                >
                  <View>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerReceipt}>{player.receipt}</Text>
                    <Text style={styles.playerNote}>Note: {player.note}</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setSelectedPlayer(player);
                      confirmAssignment();
                    }}
                    style={styles.assignButton}
                  >
                    {assigning && selectedPlayer?.id === player.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.assignButtonText}>Assign</Text>
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Right - New Assignment */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New Assignment</Text>

            {/* Player Box */}
            <View style={styles.infoBox}>
              {selectedPlayer ? (
                <>
                  <Text style={styles.infoBoxName}>{selectedPlayer.name}</Text>
                  <Text style={styles.infoBoxReceipt}>{selectedPlayer.receipt}</Text>
                </>
              ) : (
                <Text style={styles.warningText}>
                  Select a player from the queue to begin
                </Text>
              )}
            </View>

            {/* Dropdown */}
            <View style={{ marginTop: 10 }}>{renderDropdown()}</View>

            {/* Serviceman */}
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>
                Assign Serviceman (Required for Timed Session)
              </Text>
              <View style={{ marginTop: 6 }}>{renderServDropdown()}</View>
            </View>

            {/* Notes */}
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>Notes</Text>
              <Text>{selectedPlayer?.note || "VIP-Guest Priority"}</Text>
            </View>

            {/* Confirm */}
            <TouchableOpacity
              onPress={confirmAssignment}
              disabled={!selectedPlayer || assigning}
              style={[
                styles.confirmButton,
                !selectedPlayer && styles.confirmButtonDisabled,
              ]}
            >
              {assigning ? (
                <ActivityIndicator color="#1c2b1d" />
              ) : (
                <Text
                  style={[
                    styles.confirmButtonText,
                    !selectedPlayer && styles.confirmButtonTextDisabled,
                  ]}
                >
                  CONFIRM ASSIGNMENT
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
  <ErrorModal visible={errorModalVisible} errorType={errorModalType} errorMessage={errorModalMessage} errorDetails={errorModalDetails} onClose={() => setErrorModalVisible(false)} />
  <Toast visible={toastVisible} title={toastTitle} message={toastMessage} onClose={() => setToastVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#f9f9f9" },

  

  /* Main Content */
  mainContent: { flex: 1, padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLeft: { flexDirection: 'column' },
  headerSubtitle: { color: '#6b6b6b', marginTop: 4 },
  headerDivider: { height: 1, backgroundColor: '#e6e6e6', marginBottom: 16, marginTop: 6 },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#1c2b1d" },
  badgeRow: { flexDirection: "row" },
  badge: {
    backgroundColor: "#e6f0e5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#c8e0c3",
    marginLeft: 6,
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#314c31" },

  /* Columns */
  columns: { flexDirection: "row", gap: 12 },

  /* Card */
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  cardSubtitle: { color: "#666", marginBottom: 10 },

  /* Player List */
  playerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderRadius: 6,
  },
  playerItemActive: { backgroundColor: "#e8f5e9" },
  playerName: { fontWeight: "bold" },
  playerReceipt: { fontSize: 12, color: "#555" },
  playerNote: { fontSize: 11, color: "#888" },
  assignButton: {
    backgroundColor: "#17321d",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  assignButtonText: { color: "#fff", fontWeight: "600" },

  /* Info Boxes */
  infoBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8f8f8",
    marginTop: 10,
  },
  infoBoxLabel: { color: "#666", fontSize: 13 },
  infoBoxName: { fontWeight: "600", marginTop: 4 },
  infoBoxReceipt: { color: "#666" },
  warningText: { color: "red", fontWeight: "600" },

  /* Dropdown */
  dropdownButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "#f8f8f8",
  },
  dropdownText: { fontSize: 15 },
  dropdownList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    backgroundColor: "white",
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  // Modal styles (shared small set)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 10, padding: 12, width: '90%', maxWidth: 720 },
  modalButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  modalButtonCancel: { backgroundColor: '#EEE', marginRight: 8 },
  modalButtonCancelText: { color: '#333', fontWeight: '600' },

  /* Confirm */
  confirmButton: {
    backgroundColor: "#a8d5a3",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  confirmButtonDisabled: { backgroundColor: "#ccc" },
  confirmButtonText: {
    textAlign: "center",
    fontWeight: "700",
    color: "#1c2b1d",
  },
  confirmButtonTextDisabled: { color: "#666" },
  // modernized, semi-transparent dropdown card
  filterOptions: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
    zIndex: 9999,
  },
  caretContainer: { position: 'absolute', top: -8, width: 14, height: 10, alignItems: 'center', justifyContent: 'center' },
  // caret uses a semi-transparent bottom color to blend with the card
  caret: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255,255,255,0.92)'
  },
  filterOption: { paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 6 },
  filterOptionActive: { backgroundColor: 'rgba(18,65,26,0.06)' },
  filterOptionText: { color: '#333', fontSize: 15 },
  filterOptionTextActive: { color: '#12411A', fontWeight: '700' },
  checkMark: { color: '#12411A', fontWeight: '800', marginLeft: 12 },
});
