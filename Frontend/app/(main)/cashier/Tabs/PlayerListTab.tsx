// ActivePlayerList.js
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, ActivityIndicator , Platform } from 'react-native';
import CashierHeader from '../components/CashierHeader';

import { fetchWithAuth } from '../../../_lib/fetchWithAuth';

type SessionRow = {
  player_id: number;
  session_id: string;
  player_name: string | null;
  bay_no: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  session_type: string | null;
  total_buckets?: number;
  price_per_hour?: number;
};

export default function ActivePlayerList({ userName }: { userName?: string }) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  // default to showing only Assigned (active bay-occupied) players
  const [filter, setFilter] = useState<'All' | 'Unassigned' | 'Assigned'>('Assigned');

  const buildBaseUrl = async () => {
    let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
    try {
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
      if (override) baseUrl = override;
    } catch {}
    return baseUrl;
  };

  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = await buildBaseUrl();
      const res = await fetchWithAuth(`${baseUrl}/api/admin/reports/sessions?limit=1000`, { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data = await res.json();
      // API returns either an array or { rows, total }
      const list = Array.isArray(data) ? data : (data.rows || []);
      // Prefer typed `session_type` + `session_started` from the server when
      // available. Fallback to legacy end_time heuristics when those fields
      // aren't present on the payload.
      const activeOnly = (list || []).filter((s: any) => {
        if (!s) return false;
        const st = String(s.session_type ?? '').toLowerCase();
        if (st === 'open') return true;
        if (st === 'timed') {
          // Timed sessions are active only after the server reports them started,
          // or if the end_time is still in the future as a fallback.
          if (s.session_started === true) return true;
          if (s.end_time) {
            try {
                const et = new Date(s.end_time);
                if (!isNaN(et.getTime())) return et.getTime() > Date.now();
              } catch (_e) { void _e; }
          }
          return false;
        }
        // Fallback: include rows with null end_time or end_time in the future
        if (s.end_time == null) return true;
        try {
          const et = new Date(s.end_time);
          if (!isNaN(et.getTime())) return et.getTime() > Date.now();
        } catch (_e) { void _e; }
        return false;
      });
      setRows(activeOnly as SessionRow[]);
    } catch (e: any) {
      setError(e?.message || 'Failed loading players');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
    const interval = setInterval(() => fetchPlayers(), 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatus = (r: SessionRow) => {
    // Determine assigned/unassigned preferring the typed `session_type` from the DB.
    const isAssigned = (() => {
      const st = String((r.session_type ?? '')).toLowerCase();
      const hasBay = (r.bay_no != null && String(r.bay_no).trim() !== '') || (r as any).bay_id != null;
      // If a bay is present, consider the session assigned
      if (hasBay) return true;
      // Open sessions (DB says 'open') are considered assigned in cashier view
      if (st === 'open') return true;
      // Timed sessions are considered assigned only after they have started
      if (st === 'timed') return !!(r as any).session_started;
      // Fallback: treat presence of bay_no as assigned
      return !!r.bay_no;
    })();
    if (isAssigned) return 'Active';
    return 'Unassigned';
  };

  const getStatusStyle = (status: string) => {
    if (status === 'Active') return { color: '#2e7d32' };
    if (status === 'Overridden') return { color: '#c62828' };
    return { color: '#b8860b' };
  };

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    return rows.filter((r) => {
      // Use the same assigned heuristic as getStatus (prefer DB session_type)
      const st = String((r.session_type ?? '')).toLowerCase();
      const hasBay = (r.bay_no != null && String(r.bay_no).trim() !== '') || (r as any).bay_id != null;
      const isAssigned = hasBay ? true : (st === 'open' ? true : st === 'timed' ? !!(r as any).session_started : !!r.bay_no);
      if (filter === 'Unassigned' && isAssigned) return false;
      if (filter === 'Assigned' && !isAssigned) return false;
      if (!q) return true;
      const name = String(r.player_name ?? '').toLowerCase();
      const sid = String(r.session_id ?? '').toLowerCase();
      const bay = String(r.bay_no ?? '').toLowerCase();
      return name.includes(q) || sid.includes(q) || bay.includes(q);
    });
  }, [rows, query, filter]);

  // Pagination (client-side) based on filtered results
  const [page, setPage] = useState<number>(1);
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset page to 1 when filters/search or rows change
  useEffect(() => {
    setPage(1);
  }, [query, filter, rows.length]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const renderItem = ({ item }: { item: SessionRow }) => (
    <View style={styles.tableRow}>
      <Text style={styles.cell}>{item.session_id}</Text>
      <Text style={styles.cell}>{item.player_name ?? '-'}</Text>
      <Text style={styles.cell}>{item.bay_no ?? '-'}</Text>
      <Text style={styles.cell}>{item.player_id}</Text>
      <Text style={styles.cell}>{item.session_type ?? '-'}</Text>
      <Text style={styles.cell}>{item.duration_minutes != null ? `${item.duration_minutes}m` : '-'}</Text>
      <Text style={styles.cell}>{item.total_buckets ?? '-'}</Text>
      <Text style={[styles.cell, getStatusStyle(getStatus(item))]}>{getStatus(item)}</Text>
    </View>
  );

  const renderHeader = () => (
    <View>
      <CashierHeader title="Active Player List" userName={userName} />

      <Text style={styles.sectionTitle}>Player Queue</Text>
      <Text style={styles.sectionDesc}>
        The Player Queue page displays all players currently waiting to join a match or session. It allows real-time monitoring of player positions in the queue, estimated wait times, and matchmaking status.
      </Text>

      {/* Controls bubble separated from the table */}
      <View style={styles.controlsCard}>
        <View style={styles.searchContainer}>
          <TextInput value={query} onChangeText={setQuery} style={styles.searchInput} placeholder="Search Player Name, Session ID, or Bay" />
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilter(filter === 'All' ? 'Unassigned' : filter === 'Unassigned' ? 'Assigned' : 'All')}>
            <Text style={styles.filterText}>Show: {filter} ▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Table header inside its own card */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={styles.headerCell}>Session ID</Text>
          <Text style={styles.headerCell}>Player Name</Text>
          <Text style={styles.headerCell}>Bay</Text>
          <Text style={styles.headerCell}>Player ID</Text>
          <Text style={styles.headerCell}>Type</Text>
          <Text style={styles.headerCell}>Duration</Text>
          <Text style={styles.headerCell}>Buckets</Text>
          <Text style={styles.headerCell}>Status</Text>
        </View>

        {error ? <Text style={{ color: 'red', marginTop: 10 }}>{error}</Text> : null}
      </View>
    </View>
  );
  void renderHeader;

  const listEmpty = () => (
    <View style={{ paddingVertical: 20 }}>
      {loading ? <ActivityIndicator style={{ marginTop: 10 }} /> : <Text style={{ color: '#666' }}>No players to show.</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContent}>
        <CashierHeader title="Active Player List" userName={userName} />

        <Text style={styles.sectionTitle}>Player Queue</Text>
        <Text style={styles.sectionDesc}>
          The Player Queue page displays all players currently waiting to join a match or session. It allows real-time monitoring of player positions in the queue, estimated wait times, and matchmaking status.
        </Text>

        <View style={styles.controlsCard}>
          <View style={styles.searchContainer}>
            <TextInput value={query} onChangeText={setQuery} style={styles.searchInput} placeholder="Search Player Name, Session ID, or Bay" />
            <TouchableOpacity style={styles.filterBtn} onPress={() => setFilter(filter === 'All' ? 'Unassigned' : filter === 'Unassigned' ? 'Assigned' : 'All')}>
              <Text style={styles.filterText}>Show: {filter} ▼</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.headerCell}>Session ID</Text>
            <Text style={styles.headerCell}>Player Name</Text>
            <Text style={styles.headerCell}>Bay</Text>
            <Text style={styles.headerCell}>Player ID</Text>
            <Text style={styles.headerCell}>Type</Text>
            <Text style={styles.headerCell}>Duration</Text>
            <Text style={styles.headerCell}>Buckets</Text>
            <Text style={styles.headerCell}>Status</Text>
          </View>

          <FlatList
            data={paginated}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.player_id) + String(item.session_id)}
            ListEmptyComponent={listEmpty}
            style={{ marginTop: 8 }}
          />

          {/* Pagination controls (client-side) */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f5f3' },
  mainContent: { flex: 1, padding: 20 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#2e362c' },
  subTitle: { fontSize: 16, color: '#666', marginBottom: 4 },
  timestamp: { fontSize: 12, color: '#888', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2e362c', marginBottom: 6 },
  sectionDesc: { fontSize: 13, color: '#666', marginBottom: 14 },
  searchContainer: { flexDirection: 'row', marginBottom: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginRight: 10 },
  filterBtn: { backgroundColor: '#e9ebe7', padding: 10, borderRadius: 6, justifyContent: 'center' },
  filterText: { color: '#333', fontSize: 13 },
  controlsCard: {
    backgroundColor: '#f6f9f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e6efe6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  tableCard: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eaeff0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e9ebe7', paddingVertical: 10, borderRadius: 6 },
  headerCell: { flex: 1, fontWeight: '700', color: '#333', textAlign: 'center', fontSize: 13 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingVertical: 8 },
  cell: { flex: 1, textAlign: 'center', color: '#333', fontSize: 13 },
  /* Pagination styles */
  paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  pageNavDisabled: { opacity: 0.5 },
  pageList: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  pageButton: { backgroundColor: '#FFF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#E6E6E6' },
  pageButtonActive: { backgroundColor: '#C9DABF', borderColor: '#12411A' },
  pageButtonText: { color: '#333', fontWeight: '700' },
  pageButtonTextActive: { color: '#12411A', fontWeight: '800' },
  pagePrevButton: { backgroundColor: '#17321d', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, marginRight: 12 },
  pagePrevText: { color: '#fff', fontWeight: '700' },
  pageNextButton: { backgroundColor: '#C9DABF', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginLeft: 12 },
  pageNextText: { color: '#12411A', fontWeight: '700' },
});
