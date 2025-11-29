import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert } from 'react-native';
// custom dropdown used instead of external Picker to avoid extra dependency
import { fetchWithAuth } from '../../_lib/fetchWithAuth';

export default function BucketTracker({ userName, overview, onRefresh, onPushRecentLog }: { userName?: string; overview?: any; onRefresh?: () => Promise<void> | void; onPushRecentLog?: (payload: any) => void }) {
  const [bayNumber, setBayNumber] = React.useState('');
  const [bucketCount, setBucketCount] = React.useState('');
  const [totalDelivered, setTotalDelivered] = React.useState(0);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  // derive active bays from overview when provided
  const activeBays = React.useMemo(() => {
    try {
      const bays = overview?.bays ?? [];
      return bays.filter((b: any) => String(b.status) === 'Occupied' && b.player).map((b: any) => ({
        id: b.bay_id ?? b.bay_number ?? b.bayNo ?? b.bay,
        bay_number: b.bay_number ?? b.bayNo ?? b.bay,
        player: b.player?.nickname ?? b.player?.full_name ?? b.player?.name ?? (b.player ?? null),
      }));
    } catch (_e) { return []; }
  }, [overview]);

  React.useEffect(() => {
    // derive initial totalDelivered from overview if present, but prefer server daily summary
    async function fetchDailyTotal() {
      try {
        const baseUrl = await resolveBaseUrl();
        const url = `${baseUrl}/api/admin/reports/summary?reportType=daily`;
        const res = await fetchWithAuth(url, { method: 'GET' });
        if (res && res.ok) {
          const json = await res.json();
          const val = Number(json?.totalBuckets ?? json?.total_buckets ?? json?.totalBuckets ?? 0) || 0;
          setTotalDelivered(val);
          return;
        }
      } catch (_e) {
        // ignore and fallback to overview value below
      }

      try {
        if (overview && typeof overview.total_delivered === 'number') setTotalDelivered(overview.total_delivered);
      } catch (_e) { /* ignore */ }
    }

    void fetchDailyTotal();
  }, [overview]);

  async function resolveBaseUrl() {
    let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
    try {
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
      if (override) baseUrl = override;
    } catch (_e) { void _e; }
    return baseUrl;
  }

  const handleConfirm = async () => {
    if (!bayNumber) return Alert.alert('Missing bay', 'Please enter a bay number.');
    if (!bucketCount) return Alert.alert('Missing count', 'Please enter a bucket count.');
    try {
      const baseUrl = await resolveBaseUrl();
      const url = `${baseUrl}/api/admin/bays/${encodeURIComponent(bayNumber)}/hand-over`;
      const res = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket_count: Number(bucketCount) }) });
      if (res.ok) {
        // refresh daily total from server to keep authoritative daily count
        try {
          const sBase = await resolveBaseUrl();
          const sUrl = `${sBase}/api/admin/reports/summary?reportType=daily`;
          const sres = await fetchWithAuth(sUrl, { method: 'GET' });
          if (sres && sres.ok) {
            const json = await sres.json();
            const val = Number(json?.totalBuckets ?? json?.total_buckets ?? json?.totalBuckets ?? 0) || 0;
            setTotalDelivered(val);
          } else {
            setTotalDelivered((t) => t + Number(bucketCount));
          }
        } catch (_e) {
          setTotalDelivered((t) => t + Number(bucketCount));
        }
        setBayNumber('');
        setBucketCount('');
        // inform parent dashboard to append a recent-log entry
        try {
          if (typeof onPushRecentLog === 'function') {
            onPushRecentLog({ bay_no: bayNumber, added_buckets: Number(bucketCount) || 0, total_balls: null, raw: { source: 'bucket-tracker', action: 'hand-over' } });
          }
        } catch (_e) { void _e; }
        Alert.alert('Success', 'Bucket recorded');
        if (onRefresh) await onRefresh();
      } else {
        let details = '';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) details = JSON.stringify(await res.json()); else details = await res.text();
        } catch (_e) { void _e; }
        Alert.alert('Failed', `Failed to record bucket${details ? ': ' + String(details).slice(0,200) : ''}`);
      }
    } catch (e) {
      Alert.alert('Error', 'Unexpected error');
      console.warn('BucketTracker.handleConfirm', e);
    }
  };

  const addBucket = async (bay: any) => {
    try {
      const bayNo = bay?.bay_number ?? bay?.id ?? bay;
      if (!bayNo) return;
      const baseUrl = await resolveBaseUrl();
      const url = `${baseUrl}/api/admin/bays/${encodeURIComponent(bayNo)}/hand-over`;
      const res = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket_count: 1 }) });
      if (res.ok) {
        // refresh daily total from server to keep authoritative daily count
        try {
          const baseUrl = await resolveBaseUrl();
          const sUrl = `${baseUrl}/api/admin/reports/summary?reportType=daily`;
          const sres = await fetchWithAuth(sUrl, { method: 'GET' });
          if (sres && sres.ok) {
            const json = await sres.json();
            const val = Number(json?.totalBuckets ?? json?.total_buckets ?? json?.totalBuckets ?? 0) || 0;
            setTotalDelivered(val);
          } else {
            setTotalDelivered((t) => t + 1);
          }
        } catch (_e) {
          setTotalDelivered((t) => t + 1);
        }
        // inform parent dashboard to append a recent-log entry
        try {
          if (typeof onPushRecentLog === 'function') {
            onPushRecentLog({ bay_no: bayNo, added_buckets: 1, total_balls: null, raw: { source: 'bucket-tracker', action: 'hand-over' } });
          }
        } catch (_e) { void _e; }
        Alert.alert('Success', 'Bucket recorded');
        if (onRefresh) await onRefresh();
      } else {
        let details = '';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) details = JSON.stringify(await res.json()); else details = await res.text();
        } catch (_e) { void _e; }
        Alert.alert('Failed', `Failed to record bucket${details ? ': ' + String(details).slice(0,200) : ''}`);
      }
    } catch (e) {
      Alert.alert('Error', 'Unexpected error');
      console.warn('BucketTracker.addBucket', e);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Bucket Tracker</Text>
          <Text style={styles.subtitle}>Ball Handler {userName ?? ''}</Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeText}>Total Bucket Delivered: {totalDelivered}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Quick Restock Entry</Text>
        </View>
        <View style={styles.columns}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Manual Ball Entry</Text>
            <Text style={styles.panelHelper}>Enter a bay number or use the list below to record a restock delivery.</Text>

            <Text style={styles.fieldLabel}>Bay Number (1-45)</Text>
            {activeBays && activeBays.length > 0 ? (
              <View>
                <TouchableOpacity style={styles.pickerButton} onPress={() => setDropdownOpen((s) => !s)}>
                  <Text style={styles.pickerText}>
                    {bayNumber
                      ? (() => {
                          const sel = activeBays.find((b: any) => String(b.bay_number ?? b.id) === String(bayNumber));
                          return sel ? `#${sel.bay_number ?? sel.id} — ${sel.player ?? ''}` : String(bayNumber);
                        })()
                      : 'Select Bay...'}
                  </Text>
                  <Text style={styles.caret}>▾</Text>
                </TouchableOpacity>
                {dropdownOpen && (
                  <View style={styles.dropdownList}>
                    <ScrollView style={{ maxHeight: 240 }}>
                      {activeBays.map((b: any, i: number) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setBayNumber(String(b.bay_number ?? b.id));
                            setDropdownOpen(false);
                          }}
                        >
                          <Text>{`#${b.bay_number ?? b.id} — ${b.player ?? ''}`}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            ) : (
              <TextInput
                placeholder="Enter the Bay No."
                value={bayNumber}
                onChangeText={setBayNumber}
                style={styles.input}
              />
            )}

            <Text style={styles.fieldLabel}>Buckets</Text>
            <TextInput
              placeholder="Enter the Bucket to be added"
              value={bucketCount}
              onChangeText={setBucketCount}
              keyboardType="numeric"
              style={styles.input}
            />

            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmTxt}>Confirm</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Act Bay List</Text>
            <Text style={styles.panelHelper}>Select from current active bays for quick restock.</Text>
            <ScrollView style={styles.scrollList}>
              {activeBays.map((bay: any, idx: number) => (
                <View key={idx} style={styles.bayItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bayTitle}>Bay #{bay.bay_number ?? bay.id}</Text>
                    <Text style={styles.bayPlayer}>Player Name: {bay.player}</Text>
                  </View>
                  <TouchableOpacity style={styles.addBtn} onPress={() => addBucket(bay)}>
                    <Text style={styles.addTxt}>+1 Bucket</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8F6', borderTopLeftRadius: 20, padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#666' },
  totalBadge: { backgroundColor: '#E6F8EE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  totalBadgeText: { color: '#1f7a3a', fontWeight: '700' },
  card: { backgroundColor: '#F7FBF8', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E6EFE6', alignSelf: 'center', width: '100%', maxWidth: 1100 },
  cardHeader: { borderBottomWidth: 1, borderBottomColor: '#E3E9E3', paddingBottom: 12, marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: '700' },
  columns: { flexDirection: 'row' },
  panel: { flex: 1, marginRight: 12, backgroundColor: '#FFFFFF', padding: 18, borderRadius: 10, borderWidth: 1, borderColor: '#EEF7EE', minHeight: 360 },
  panelTitle: { fontWeight: '700', fontSize: 16, marginBottom: 6 },
  panelHelper: { color: '#666', marginBottom: 12 },
  fieldLabel: { color: '#666', marginBottom: 6, marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#FFFFFF', marginVertical: 8 },
  confirmBtn: { backgroundColor: '#C6DFA4', height: 48, borderRadius: 8, marginTop: 12, alignItems: 'center', justifyContent: 'center', width: '100%' },
  confirmTxt: { fontWeight: '700' },
  scrollList: { height: 320 },
  bayItem: { backgroundColor: '#F1F6F1', padding: 12, borderRadius: 8, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bayTitle: { fontWeight: '700', marginBottom: 4 },
  bayPlayer: { color: '#666' },
  addBtn: { backgroundColor: '#C6DFA4', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  addTxt: { fontWeight: '700' },
  pickerWrap: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden', marginVertical: 8, backgroundColor: '#fff' },
  picker: { height: 44 },
  pickerButton: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, backgroundColor: '#fff', marginVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerText: { color: '#333' },
  caret: { color: '#666', marginLeft: 8 },
  dropdownList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#fff', marginTop: 6 },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#F1F1F1' },
});
