import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import CashierHeader from '../components/CashierHeader';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';

export default function TransactionTab({ userName }: { userName?: string }) {
  const [playerName, setPlayerName] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  void notes; void setNotes;
  // SessionType is fixed to Timed for cashier-created transactions
  const [sessionType] = useState<'Timed' | 'Open'>('Timed');
  const [durationMinutes, setDurationMinutes] = useState<string>('');
  const [durationPickerVisible, setDurationPickerVisible] = useState<boolean>(false);
  const durationOptions = [30, 45, 60, 90, 120];
  const [windowWidth, setWindowWidth] = useState<number>(Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener ? Dimensions.addEventListener('change', ({ window }) => setWindowWidth(window.width)) : undefined;
    return () => { if (sub && typeof sub.remove === 'function') sub.remove(); };
  }, []);
  const isWide = windowWidth >= 900;

  // price per hour (could be dynamic); keep a default for preview calculations
  const [pricePerHour, setPricePerHour] = useState<number>(800);
  void setPricePerHour;

  const computePrice = () => {
    const mins = Number(durationMinutes) || 0;
    if (sessionType === 'Open') return 0;
    // price = hours * pricePerHour
    const hours = mins / 60;
    return Math.round(hours * pricePerHour);
  };

  const confirmTransaction = () => {
    if (!playerName.trim()) {
      Alert.alert('Validation', 'Player name is required');
      return;
    }
    // For cashier flows we require a planned duration so the session is treated as Timed
    if (sessionType === 'Timed') {
      const mins = Number(durationMinutes) || 0;
      if (!mins || mins <= 0) {
        Alert.alert('Validation', 'Please select a planned duration for Timed sessions');
        return;
      }
    }
    Alert.alert('Confirm Transaction', `Create ${sessionType} session for ${playerName} (${receiptNumber || 'no receipt'})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        try {
          // resolve baseUrl similar to other screens (allow override in AsyncStorage)
          let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
          try {
            // @ts-ignore dynamic import
            const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
            const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
            const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
            if (override) baseUrl = override;
          } catch (_e) { void _e; }

          // build request body for unassigned session
          const body: any = { nickname: playerName || undefined };
          if (receiptNumber) body.receipt_number = receiptNumber;
          if (sessionType === 'Timed' && durationMinutes) {
            const mins = Number(durationMinutes) || 0;
            body.planned_duration_minutes = mins;
          }
          if (pricePerHour) body.price_per_hour = String(pricePerHour);

          const url = `${baseUrl}/api/admin/sessions`;
          const res = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!res) throw new Error('No response from server');
            if (!res.ok) {
            let txt = await res.text().catch(() => null);
            try { const json = JSON.parse(txt || '{}'); if (json?.message) txt = json.message; } catch (_e) { void _e; }
            Alert.alert('Server Error', txt || `Failed to create session (status ${res.status})`);
            return;
          }
          const data = await res.json().catch(() => null);
          Alert.alert('Success', `Player row created${data && data.player && data.player.nickname ? ` for ${data.player.nickname}` : ''}`);
          // clear form
          setPlayerName(''); setReceiptNumber(''); setDurationMinutes('');
        } catch (e:any) {
          Alert.alert('Error', (e && e.message) ? e.message : 'Failed to create session');
        }
      } },
    ]);
  };

  return (
    <ScrollView style={styles.scrollContent} contentContainerStyle={styles.contentContainer}>
      <CashierHeader title="Player Transaction" userName={userName} />

      <Text style={styles.pageSubtitle}>Transaction Form</Text>
      <Text style={styles.leadText}>
        This transaction initiates a new player session. Ensure the player’s name and a valid receipt number are accurately recorded before proceeding to Bay Assignment.
      </Text>

      <View style={[styles.row, isWide ? styles.rowWide : styles.rowNarrow]}>
        {/* Left column - Session Details and Configuration */}
        <View style={[styles.colLeft, isWide ? styles.colLeftWide : styles.fullWidth]}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Session Details</Text>

            <View style={styles.rowInline}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Player Name/ Nickname</Text>
                <TextInput style={styles.input} placeholder="Enter the Player’s name" value={playerName} onChangeText={setPlayerName} />
              </View>
            </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Receipt Number</Text>
                <TextInput style={styles.input} placeholder="Enter the Player’s receipt number" value={receiptNumber} onChangeText={setReceiptNumber} />
              </View>
              
          </View>

          <View style={[styles.card, { marginTop: 18 }]}>
            <Text style={styles.cardTitle}>Session Configuration</Text>

            <Text style={[styles.label, { marginTop: 6 }]}>Session Type</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <View style={[styles.radioItem, styles.radioActive]}>
                <View style={styles.radioDot}><View style={styles.radioInner} /></View>
                <Text style={styles.radioLabel}>Timed Session (Fixed Playtime)</Text>
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>Select Duration</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setDurationPickerVisible(true)}>
              <Text style={{ color: durationMinutes ? '#111' : '#8a8a8a' }}>{durationMinutes ? `${durationMinutes} minutes` : 'Select Duration'}</Text>
              <Text style={{ fontWeight: '700' }}>▾</Text>
            </TouchableOpacity>
            <Modal visible={durationPickerVisible} transparent animationType="fade" onRequestClose={() => setDurationPickerVisible(false)}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalBoxSmall}>
                  {durationOptions.map((d) => (
                    <TouchableOpacity key={d} style={styles.modalOption} onPress={() => { setDurationMinutes(String(d)); setDurationPickerVisible(false); }}>
                      <Text style={{ fontSize: 16 }}>{d} minutes</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.modalOption, { marginTop: 8 }]} onPress={() => { setDurationMinutes(''); setDurationPickerVisible(false); }}>
                    <Text style={{ color: '#7a7a7a' }}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </View>
        </View>

        {/* Right column - Summary Preview and Confirm */}
        <View style={[styles.colRight, !isWide ? styles.fullWidth : {}]}>
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Summary Preview</Text>

            <View style={styles.previewRow}><Text style={styles.previewLabel}>Player:</Text><Text style={styles.previewValue}>{playerName || '-'}</Text></View>
            <View style={styles.previewRow}><Text style={styles.previewLabel}>Receipt No.:</Text><Text style={styles.previewValue}>{receiptNumber || '-'}</Text></View>
            <View style={styles.previewRow}><Text style={styles.previewLabel}>Session Type:</Text><Text style={styles.previewValue}>{sessionType}</Text></View>
            <View style={styles.previewRow}><Text style={styles.previewLabel}>Duration:</Text><Text style={styles.previewValue}>{sessionType === 'Open' ? 'Open time' : (durationMinutes ? `${durationMinutes} m` : '-')}</Text></View>
            <View style={[styles.previewRow, { marginTop: 10 }]}>
              <Text style={[styles.previewLabel, { fontWeight: '800' }]}>Price:</Text>
              <Text style={[styles.previewValue, { fontWeight: '800' }]}>{computePrice() ? `₱ ${computePrice()}` : (sessionType === 'Open' ? 'TBD' : '—')}</Text>
            </View>

            <Text style={styles.noteText}>Note: Session is not active until assigned to a Bay by the Dispatcher.</Text>
          </View>

          <TouchableOpacity style={styles.confirmButton} onPress={confirmTransaction}>
            <Text style={styles.confirmButtonText}>+  Confirm Transaction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flex: 1, backgroundColor: '#F4F3EE' },
  contentContainer: { padding: 20, paddingBottom: 48, maxWidth: 760, alignSelf: 'center' },
  pageSubtitle: { fontSize: 22, fontWeight: '800', color: '#123B14', marginTop: 6, marginBottom: 6 },
  leadText: { color: '#777', marginTop: 6, marginBottom: 12, lineHeight: 18, maxWidth: 760 },
  row: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 20, alignItems: 'flex-start' as any },
  colLeft: { flex: 1, minWidth: 420 },
  colRight: { width: 300 },
  rowWide: { flexDirection: 'row' },
  rowNarrow: { flexDirection: 'column' },
  fullWidth: { width: '100%' },
  colLeftWide: { marginRight: 5 },
  card: {
    backgroundColor: '#fbfff9',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6F3E3',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    width: '80%',
    elevation: 4,
    // left accent to mimic screenshot (smaller)
    borderLeftWidth: 8,
    borderLeftColor: '#123B14',
    overflow: 'hidden',
  },
  summaryCard: {
    backgroundColor: '#FBFBF9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9E6D0',
    shadowColor: '#000',
      borderLeftWidth: 8,
    borderLeftColor: '#123B14',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#12411A', marginBottom: 8 },
  rowInline: { flexDirection: 'row', gap: 0 },
  inputGroup: { flex: 1 },
  inputGroupSmall: { width: 200 },
  label: { color: '#667', fontWeight: '600', marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E6EFE5',
  },
  textarea: { height: 90, textAlignVertical: 'top', paddingTop: 10, borderRadius: 8 },
  selectInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#E6EFE5' },
  radioItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EEE' },
  radioActive: { borderColor: '#C6DFA4', backgroundColor: '#F7FBF6' },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#999', alignItems: 'center', justifyContent: 'center', marginRight: 5 },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#12411A' },
  radioLabel: { color: '#333', fontSize: 13 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0, borderBottomColor: '#EEE' },
  previewLabel: { color: '#6b6b6b', fontSize: 13 },
  previewValue: { color: '#1f2b1f', fontWeight: '700' },
  noteText: { marginTop: 10, color: '#666', fontSize: 12, lineHeight: 16 },
  confirmButton: {
    marginTop: 14,
    backgroundColor: '#9CC36B',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmButtonText: { color: '#183217', fontWeight: '800', fontSize: 14 },
  /* modal for duration */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalBoxSmall: { width: 300, backgroundColor: '#fff', borderRadius: 8, padding: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
  modalOption: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
});