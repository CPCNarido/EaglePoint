import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { tw } from "react-native-tailwindcss";
import { useSettings } from '../../../lib/SettingsProvider';

export default function BayManagement() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  // dynamic bays loaded from backend
  const [bays, setBays] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showFilterOptions, setShowFilterOptions] = useState(false);
  const filterButtonRef = React.useRef<any>(null);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const anim = React.useRef(new Animated.Value(0)).current;
  // action dropdown refs/state
  // action list (inline buttons)
  const actionList = ['End Session', 'Lock Bay for Maintenance', 'Reserved'];
  const filterOptions = [
    'All',
    'Available',
    'Open Time',
    'Timed Session',
    'Maintenance',
  ];

  const baseDefault = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  const baseUrl = (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;

  // fetchOverview is intentionally invoked once on mount; fetchOverview is defined below.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchOverview();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // use settings to ensure we show the expected count even if backend doesn't provide all rows
  const settings = useSettings();

  // Animate dropdown when it opens
  // anim is a stable ref; we intentionally only re-run this effect when showFilterOptions changes
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (showFilterOptions) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      anim.setValue(0);
    }
  }, [showFilterOptions]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // (action dropdown removed — using inline buttons)

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/admin/overview`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        // try fallback endpoint
        const tryRes = await fetch(`${baseUrl}/api/admin/bays`, { method: 'GET', credentials: 'include' });
        if (!tryRes.ok) { setBays([]); return; }
        const tryData = await tryRes.json();
        mapAndSetBays(tryData?.bays || tryData || []);
        return;
      }
      const data = await res.json();
      mapAndSetBays(data?.bays || data?.bayList || data || []);
    } catch {
      setBays([]);
    } finally {
      setLoading(false);
    }
  };

  const mapAndSetBays = (raw: any[]) => {
    const mapped = (raw || []).map((b: any) => {
      const bayNo = b?.bay_number ?? b?.bay_id ?? b?.bayNo ?? b?.bay_no ?? b?.bay ?? '—';
      const bayId = b?.bay_id ?? b?.bayId ?? null;
      const player = b?.player?.nickname ?? b?.playerName ?? b?.player_name ?? b?.player ?? (b?.status === 'Maintenance' ? 'Maintenance' : '—');
      const session = b?.status ?? b?.session ?? b?.sessionType ?? (b?.player ? 'Timed Session' : 'N/A');
      const time = b?.timeRange ?? (b?.start_time && b?.end_time ? `${new Date(b.start_time).toLocaleTimeString()} - ${new Date(b.end_time).toLocaleTimeString()}` : b?.time ?? 'N/A');
      return { bayNo, bayId, player, session, time };
    });
    // If server didn't return a full bay list, augment with empty "Available" bays up to the configured total
    const configuredTotal = Number(settings.totalAvailableBays ?? 45);
    if ((mapped || []).length < configuredTotal) {
      const existingNos = new Set(mapped.map((m: any) => Number(m.bayNo)));
      const extras: any[] = [];
      for (let i = 1; i <= configuredTotal; i++) {
        if (!existingNos.has(i)) {
          extras.push({ bayNo: i, player: '—', session: 'Available', time: 'N/A' });
        }
      }
      setBays([...mapped, ...extras]);
    } else {
      setBays(mapped);
    }
  };

  // Override controls state
  const [selectedBayInput, setSelectedBayInput] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [showOverrideConfirm, setShowOverrideConfirm] = useState<boolean>(false);
  const [overrideTarget, setOverrideTarget] = useState<{ bayNo: any; player?: string } | null>(null);
  const [, setOverrideBusy] = useState<boolean>(false);
  const [showOverrideSuccess, setShowOverrideSuccess] = useState<boolean>(false);
  const overrideTimerRef = React.useRef<any>(null);

  // Derived list after search + filter
  const displayedBays = useMemo(() => {
    const q = (search || '').toLowerCase().trim();
    return (bays || []).filter((b) => {
      if (q) {
        if (String(b.bayNo).toLowerCase().includes(q)) return true;
        if ((b.player || '').toLowerCase().includes(q)) return true;
        return false;
      }
      return true;
    }).filter((b) => {
      if (!filter || filter === 'All') return true;
      return (b.session || '').toLowerCase().includes(filter.toLowerCase());
    });
  }, [bays, search, filter]);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil((displayedBays || []).length / pageSize));

  useEffect(() => {
    // reset to first page when filters/search or bay list change
    setPage(1);
  }, [search, filter, bays.length]);

  const paginatedBays = (displayedBays || []).slice((page - 1) * pageSize, page * pageSize);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (overrideTimerRef.current) clearTimeout(overrideTimerRef.current);
    };
  }, []);

  const getColor = (sessionType: string) => {
    const s = (sessionType || '').toLowerCase();
    // Match the legend colors used in the dashboard
    if (s.includes('maintenance') || s === 'n/a') return '#C62828'; // Maintenance (red)
    if (s.includes('assigned')) return '#A3784E'; // Assigned (brown)
    if (s.includes('open') || s.includes('open time')) return '#BF930E'; // Open (yellow)
    if (s.includes('timed') || s.includes('timed session') || s.includes('available')) return '#2E7D32'; // Available/Timed (green)
    return '#333';
  };

  return (
    <ScrollView style={[tw.flex1, { backgroundColor: "#F6F6F2" }]}>
      <View style={[styles.container]}>
        <Text style={styles.pageTitle}>Bay Management</Text>
        <Text style={styles.subTitle}>Welcome back, Admin!</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Real-Time Bay Monitoring */}
        <Text style={styles.sectionTitle}>Real - Time Bay Monitoring</Text>

        <View style={styles.searchFilterRow}>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color="#555" style={{ marginHorizontal: 8 }} />
            <TextInput
              placeholder="Search by Name or Bay No."
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              placeholderTextColor="#888"
            />
          </View>
          <View style={styles.filterWrapper}>
            <TouchableOpacity ref={filterButtonRef} style={styles.filterButton} onPress={() => {
              // measure the button and open a modal-based dropdown so it appears above everything
              if (filterButtonRef.current && filterButtonRef.current.measureInWindow) {
                filterButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
                  setDropdownPos({ x, y, width, height });
                  setShowFilterOptions(true);
                });
              } else {
                setShowFilterOptions((s) => !s);
              }
            }}>
              <Text style={styles.filterText}>Filter: {filter}</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#333" />
            </TouchableOpacity>
          </View>
        </View>

  

        {/* Table */}
          <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 1 }]}>Bay No.</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>Player</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>Session Type</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>Time Range</Text>
          </View>

          {loading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#2E7D32" />
            </View>
          ) : (displayedBays.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#666' }}>No bays found</Text>
            </View>
          ) : (paginatedBays.map((bay, index) => (
             <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1, color: getColor(bay.session) }]}>
                {bay.bayNo}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, color: getColor(bay.session) }]}>
                {bay.player}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, color: getColor(bay.session) }]}>
                {bay.session}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, color: getColor(bay.session) }]}>
                {bay.time}
              </Text>
            </View>
          ))))}
        </View>

  {/* Pagination controls (moved below the table) */}
        <View style={styles.paginationRow}>
          <TouchableOpacity
            style={[styles.pagePrevButton, page === 1 ? styles.pageNavDisabled : {}]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <Text style={styles.pagePrevText}>Previous</Text>
          </TouchableOpacity>

          <View style={styles.pageList}>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const p = idx + 1;
              return (
                <TouchableOpacity key={p} style={[styles.pageButton, page === p ? styles.pageButtonActive : {}]} onPress={() => setPage(p)}>
                  <Text style={page === p ? styles.pageButtonTextActive : styles.pageButtonText}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.pageNextButton, page === totalPages ? styles.pageNavDisabled : {}]}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <Text style={styles.pageNextText}>Next</Text>
          </TouchableOpacity>
        </View>

        {/* Modal dropdown for filter options so it always appears above the table */}
        <Modal visible={showFilterOptions} transparent animationType="none" onRequestClose={() => setShowFilterOptions(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilterOptions(false)}>
            {dropdownPos && (
              <Animated.View style={[styles.filterOptions, { position: 'absolute', left: dropdownPos.x, top: dropdownPos.y + dropdownPos.height + 6, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}> 
                {/* caret arrow positioned above the dropdown, centered to the button */}
                <View style={[styles.caretContainer, { left: Math.max(6, dropdownPos.width / 2 - 6) }]} pointerEvents="none">
                  <View style={styles.caret} />
                </View>
                {filterOptions.map((opt) => (
                  <TouchableOpacity key={opt} style={[styles.filterOption, filter === opt ? styles.filterOptionActive : {}]} onPress={() => { setFilter(opt); setShowFilterOptions(false); }}>
                    <Text style={filter === opt ? styles.filterOptionTextActive : styles.filterOptionText}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}
          </Pressable>
        </Modal>

        {/* Action options are rendered as inline buttons (one-line) below */}
                    {/* Override Section */}
        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>
          Session Override & Direct Control
        </Text>
        <Text style={styles.sectionDescription}>
          Use this panel to manually adjust bay status, end sessions, or perform maintenance overrides.
        </Text>

        <View style={styles.overrideBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Choose Bay</Text>
            <TextInput value={selectedBayInput} onChangeText={setSelectedBayInput} placeholder="Bay number (e.g. 5)" style={[styles.dropdown, { paddingHorizontal: 12 }]} placeholderTextColor="#666" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Select Action</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 8 }}>
              {actionList.map((opt) => (
                <TouchableOpacity key={opt} style={[styles.actionItem, selectedAction === opt ? styles.actionItemActive : {}]} onPress={() => setSelectedAction(opt)}>
                  <Text style={selectedAction === opt ? styles.actionItemTextActive : styles.actionItemText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.overrideButton} onPress={() => {
            // Open confirm modal
            if (!selectedBayInput || !selectedAction) return alert('Please select a bay number and an action');
            // try to find player name for the bay
            const found = (bays || []).find((b) => String(b.bayNo) === String(selectedBayInput));
            setOverrideTarget({ bayNo: selectedBayInput, player: found?.player });
            setShowOverrideConfirm(true);
          }}>
            <Text style={styles.overrideButtonText}>Override</Text>
          </TouchableOpacity>
        </View>

        {/* Confirm Override Modal (matches provided design) */}
        <Modal visible={showOverrideConfirm} transparent animationType="fade" onRequestClose={() => setShowOverrideConfirm(false)}>
          <Pressable style={styles.confirmOverlay} onPress={() => setShowOverrideConfirm(false)}>
            <Pressable style={styles.overrideConfirmBox} onPress={() => {}}>
              <Text style={styles.overrideConfirmTitle}>Confirm Override Session</Text>
              <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
              <Text style={styles.overrideConfirmBody}>
                {overrideTarget?.player ? (
                  <>Are you sure you want to override the session at Bay #{overrideTarget?.bayNo} (Player: {overrideTarget.player})?</>
                ) : (
                  <>Are you sure you want to {selectedAction?.toLowerCase() || 'override the session'} at Bay #{overrideTarget?.bayNo}? There is currently no active player assigned to this bay.</>
                )}
              </Text>
              <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <TouchableOpacity style={[styles.cancelButton, { backgroundColor: '#C9DABF' }]} onPress={() => setShowOverrideConfirm(false)}>
                  <Text style={[styles.cancelButtonText, { color: '#12411A' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmButton, { backgroundColor: '#7E0000' }]} onPress={async () => {
                  // perform override
                  if (!overrideTarget) return;
                  setOverrideBusy(true);
                  try {
                    const bayNo = overrideTarget.bayNo;
                    const bayId = overrideTarget.bayId ?? null;
                    // primary endpoint: POST /api/admin/bays/:bayNo/override
                    let res = await fetch(`${baseUrl}/api/admin/bays/${bayNo}/override`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: selectedAction, bayId }),
                    });
                    if (!res.ok) {
                      // fallback to generic endpoint
                      res = await fetch(`${baseUrl}/api/admin/override`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bayNo, action: selectedAction, bayId }),
                      });
                    }
                    if (!res.ok) {
                      const t = await res.text();
                      alert('Override failed: ' + t);
                    } else {
                      setShowOverrideConfirm(false);
                      setShowOverrideSuccess(true);
                      // auto-close success popup after 2s
                      overrideTimerRef.current = setTimeout(() => {
                        setShowOverrideSuccess(false);
                        overrideTimerRef.current = null;
                      }, 2000);
                      // refresh bays
                      fetchOverview();
                      // notify other parts of the app (dashboard) to refresh immediately
                      try {
                          if (typeof window !== 'undefined' && window.dispatchEvent) {
                            window.dispatchEvent(new Event('overview:updated'));
                          }
                        } catch {}
                    }
                  } catch {
                    alert('Error performing override');
                  } finally {
                    setOverrideBusy(false);
                  }
                }}>
                  <Text style={styles.confirmButtonText}>Override</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Override success acknowledgement popup */}
        <Modal visible={showOverrideSuccess} transparent animationType="fade" onRequestClose={() => setShowOverrideSuccess(false)}>
          <View style={styles.approvalOverlay}>
            <View style={styles.approvalCard}>
              <Text style={styles.approvalCardTitle}>Override Applied</Text>
              <View style={styles.approvalDivider} />
              <Text style={styles.approvalCardBody}>The override has been applied successfully.</Text>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}



const styles = StyleSheet.create({
  container: { padding: 20 },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2E3B2B",
  },
  subTitle: { color: "#666", marginBottom: 10 },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2E3B2B",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: "#555",
    marginBottom: 10,
  },
  searchFilterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    overflow: 'visible',
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 5,
    flex: 1,
    height: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#333" },
  filterButton: {
    backgroundColor: "#D5E2C6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    height: 40,
    marginLeft: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  filterText: { fontSize: 14, color: "#333", marginRight: 4 },
  filterOption: { paddingVertical: 8, paddingHorizontal: 12 },
  filterOptionActive: { backgroundColor: '#EAF6E9', borderRadius: 6 },
  filterOptionText: { color: '#333' },
  filterOptionTextActive: { color: '#12411A', fontWeight: '700' },
  filterWrapper: { position: 'relative', overflow: 'visible' },
  caretContainer: { position: 'absolute', top: -8, width: 12, height: 8, alignItems: 'center', justifyContent: 'center' },
  caret: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' },
  filterOptions: { position: 'absolute', right: 0, top: 46, backgroundColor: '#fff', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 20, zIndex: 9999 },
  /* Pagination styles */
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
  tableContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    padding: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#E9F0E4",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#000000ff",
    // Add a clear bottom border so the header is visually separated from rows
  },
  headerCell: {
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    color: "#2E3B2B",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingVertical: 8,
  },
  tableCell: {
    textAlign: "center",
    fontSize: 13,
    color: "#333",
  },
  overrideBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 5, color: "#333" },
  dropdown: {
    backgroundColor: "#F8F8F8",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: "#D8D8D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { color: "#555", fontSize: 13 },
  overrideButton: {
    backgroundColor: "#7C0A02",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    height: 40,
    justifyContent: "center",
  },
  overrideButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  /* Confirm override modal styles */
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  overrideConfirmBox: { width: '90%', maxWidth: 520, backgroundColor: '#F4F8F3', borderRadius: 10, padding: 18 },
  overrideConfirmTitle: { fontSize: 20, fontWeight: '800', color: '#7E0000', marginBottom: 8 },
  overrideConfirmBody: { fontSize: 15, color: '#444', marginBottom: 6 },
  cancelButton: { backgroundColor: '#C9DABF', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginRight: 8 },
  cancelButtonText: { color: '#12411A', fontWeight: '700' },
  confirmButton: { backgroundColor: '#7E0000', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  confirmButtonText: { color: '#fff', fontWeight: '700' },
  /* Success acknowledgement styles (approval card) */
  approvalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  approvalCard: { width: '88%', maxWidth: 560, backgroundColor: '#F3FBF1', borderRadius: 10, paddingVertical: 18, paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 6, borderWidth: 1, borderColor: '#E6F3E3' },
  approvalCardTitle: { fontSize: 18, fontWeight: '800', color: '#123B14', marginBottom: 8 },
  approvalDivider: { height: 1, backgroundColor: '#D7EAD6', marginVertical: 10 },
  approvalCardBody: { fontSize: 14, color: '#6B6B6B', lineHeight: 20 },
  actionButton: { backgroundColor: '#EEE', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 },
  actionButtonActive: { backgroundColor: '#C9DABF', borderWidth: 1, borderColor: '#12411A' },
  actionButtonText: { color: '#333' },
  actionButtonTextActive: { color: '#12411A', fontWeight: '700' },
  /* Inline action item buttons (one-line) */
  actionItem: { backgroundColor: '#EEE', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#EEE' },
  actionItemActive: { backgroundColor: '#C9DABF', borderColor: '#12411A' },
  actionItemText: { color: '#333', fontWeight: '600' },
  actionItemTextActive: { color: '#12411A', fontWeight: '800' },
});
