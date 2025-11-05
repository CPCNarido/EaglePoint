import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

type BayRow = {
  bay_id: number;
  bay_number: string | number;
  status: string | null;
  player_name?: string | null;
  player?: { nickname?: string; full_name?: string; player_id?: number } | null;
  end_time?: string | null;
  total_balls?: number | null;
};

const getColorFromStatus = (status: string | null) => {
  switch (String(status)) {
    case 'Maintenance':
      return '#C62828';
    case 'Occupied':
    case 'Assigned':
      return '#A3784E';
    case 'Open':
    case 'OpenTime':
      return '#BF930E';
    case 'Available':
    default:
      return '#2E7D32';
  }
};

export default function DashboardTab() {
  const [overview, setOverview] = useState<any | null>(null);
  const [bays, setBays] = useState<BayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBay, setSelectedBay] = useState<BayRow | null>(null);
  const { width } = useWindowDimensions();

  // determine baseUrl similarly to Admin UI (supports override)
  const resolveBaseUrl = async () => {
    let baseUrl = PlatformOS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
    try {
      // dynamic require to avoid bundler trouble
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (AsyncStorage) {
        const override = await AsyncStorage.getItem('backendBaseUrlOverride');
        if (override) baseUrl = override;
      }
    } catch {}
    return baseUrl;
  };

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const baseUrl = await resolveBaseUrl();
      const res = await fetch(`${baseUrl}/api/dispatcher/overview`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        setOverview(null);
        return;
      }
      const data = await res.json();
      setOverview(data);
    } catch (e) {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchBays = async () => {
    try {
      const baseUrl = await resolveBaseUrl();
      const res = await fetch(`${baseUrl}/api/dispatcher/bays`, { method: 'GET', credentials: 'include' });
      if (!res.ok) return setBays([]);
      const data = await res.json();
      setBays(Array.isArray(data) ? data : []);
    } catch (e) {
      setBays([]);
    }
  };

  useEffect(() => {
    // initial load and polling
    fetchOverview();
    fetchBays();
    const iv = setInterval(() => {
      fetchOverview();
      fetchBays();
    }, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderOverviewCards = () => {
    const total = overview?.totalBays ?? '—';
    const available = overview?.availableBays ?? '—';
    const occupied = overview?.occupiedBays ?? '—';
    const staff = overview?.staffOnDuty ?? '—';
    return (
      <View style={styles.overviewContainer}>
        <View style={[styles.overviewCard, { borderLeftColor: '#2E7D32' }]}>
          <Text style={styles.overviewTitle}>Available Bays</Text>
          <Text style={[styles.overviewValue, { color: '#2E7D32' }]}>{String(available)}</Text>
          <Text style={styles.overviewSubtitle}>{`${available} / ${total}`}</Text>
        </View>
        <View style={[styles.overviewCard, { borderLeftColor: '#33691E' }]}>
          <Text style={styles.overviewTitle}>Staff On Duty</Text>
          <Text style={[styles.overviewValue, { color: '#33691E' }]}>{String(staff)}</Text>
          <Text style={styles.overviewSubtitle}>Total staff</Text>
        </View>
        <View style={[styles.overviewCard, { borderLeftColor: '#BF930E' }]}>
          <Text style={styles.overviewTitle}>Occupied</Text>
          <Text style={[styles.overviewValue, { color: '#BF930E' }]}>{String(occupied)}</Text>
          <Text style={styles.overviewSubtitle}>Bays currently occupied</Text>
        </View>
        <View style={[styles.overviewCard, { borderLeftColor: '#C62828' }]}>
          <Text style={styles.overviewTitle}>Next Tee Time</Text>
          <Text style={[styles.overviewValue, { color: '#C62828' }]}>{overview?.nextTeeTime ? (overview.nextTeeTime === 'Bay Ready' ? 'Bay Ready' : new Date(overview.nextTeeTime).toLocaleTimeString()) : '—'}</Text>
          <Text style={styles.overviewSubtitle}>{overview?.nextTeeTime && overview.nextTeeTime !== 'Bay Ready' ? new Date(overview.nextTeeTime).toLocaleDateString() : ''}</Text>
        </View>
      </View>
    );
  };

  const renderBays = () => {
    const total = Number(overview?.totalBays ?? 45);
    const grid = Array.from({ length: total }).map((_, idx) => {
      const num = idx + 1;
      const row = bays.find((b) => String(b.bay_number) === String(num) || String(b.bay_id) === String(num));
      const status = row?.status ?? 'Available';
      const color = getColorFromStatus(status);
      const player = row?.player_name ?? row?.player?.nickname ?? '—';
      const time = (() => {
        try {
          const end = row?.end_time ? new Date(row.end_time) : null;
          if (!end) return '—';
          const ms = end.getTime() - Date.now();
          if (ms <= 0) return '0m 0s';
          const mins = Math.floor(ms / (1000 * 60));
          const secs = Math.floor((ms % (1000 * 60)) / 1000);
          return `${mins}m ${secs}s`;
        } catch { return '—'; }
      })();

      return (
        <TouchableOpacity key={num} style={[styles.bayBox, { borderColor: color }]} onPress={() => setSelectedBay(row ?? null)}>
          <View style={[styles.statusCapsule, { backgroundColor: color }]}>
            <Text style={styles.statusCapsuleText}>{status} #{num}</Text>
          </View>
          <Text style={styles.bayInfo}>{player}</Text>
          <Text style={styles.timeText}>{time}</Text>
        </TouchableOpacity>
      );
    });
    return <View style={styles.bayContainer}>{grid}</View>;
  };

  if (loading) return <View style={{ padding: 20 }}><ActivityIndicator /></View>;

  return (
    <ScrollView style={styles.scrollArea}>
      <View style={styles.contentBox}>
        <Text style={styles.welcomeText}>Welcome back, Dispatcher!</Text>
        <Text style={styles.dateText}>{new Date().toLocaleString()}</Text>
        <Text style={styles.sectionTitle}>Quick Overview</Text>
        {renderOverviewCards()}

        <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Real-Time Bay Monitoring</Text>
        {renderBays()}

        {/* Edit Modal */}
        <Modal visible={!!selectedBay} transparent animationType="slide" onRequestClose={() => setSelectedBay(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              {selectedBay ? (
                <>
                  <Text style={styles.modalTitle}>Bay {selectedBay.bay_number}</Text>
                  <Text style={styles.modalText}>Status: {selectedBay.status}</Text>
                  <Text style={styles.modalText}>Player: {selectedBay.player_name ?? (selectedBay.player?.nickname ?? '—')}</Text>
                  <Text style={styles.modalText}>Balls used: {String(selectedBay.total_balls ?? '—')}</Text>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedBay(null)}>
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

// small compatibility helper for dynamic platform imports used above
const PlatformOS = typeof (global as any).navigator !== 'undefined' && (global as any).navigator.product === 'ReactNative' ? (require('react-native').Platform.OS) : (typeof process !== 'undefined' && process.env && process.env.PLATFORM === 'android' ? 'android' : 'web');

const styles = StyleSheet.create({
  scrollArea: { flex: 1 },
  contentBox: { padding: 16 },
  welcomeText: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  dateText: { color: '#666', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
  overviewContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderLeftWidth: 5, width: '47%', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  overviewTitle: { fontSize: 14, fontWeight: '600' },
  overviewValue: { fontSize: 20, fontWeight: 'bold', marginVertical: 5 },
  overviewSubtitle: { color: '#555', fontSize: 12 },
  bayContainer: { flexWrap: 'wrap', flexDirection: 'row', gap: 10 },
  bayBox: { width: 180, borderWidth: 2, borderRadius: 12, padding: 10, backgroundColor: '#fff', margin: 6 },
  statusCapsule: { paddingVertical: 6, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  statusCapsuleText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  bayInfo: { fontSize: 13, color: '#222' },
  timeText: { fontSize: 12, color: '#666', marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalBox: { backgroundColor: '#fff', borderRadius: 10, padding: 20, width: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalText: { fontSize: 14, color: '#333', marginBottom: 6 },
  closeButton: { marginTop: 10, backgroundColor: '#007bff', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: '700' },
});
