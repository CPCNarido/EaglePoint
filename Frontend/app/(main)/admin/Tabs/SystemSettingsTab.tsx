import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator, Alert, Modal, Pressable, Switch } from 'react-native';
import { tw } from 'react-native-tailwindcss';
import { useSettings } from '../../../lib/SettingsProvider';

export default function SystemSettingsTab() {
  const provider = useSettings();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<Record<string, any> | null>(null);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [showSavedNotification, setShowSavedNotification] = useState(false);
  const notifTimer = useRef<number | null>(null);
  const [confirmBodyText, setConfirmBodyText] = useState('Do you want to confirm the changes you made? This may affect areas of operations. Please proceed with caution.');

  // Local form state (strings to make inputs simple)
  const [totalAvailableBays, setTotalAvailableBays] = useState(String(provider.totalAvailableBays ?? 45));
  const [teeInterval, setTeeInterval] = useState('10');
  const [bucketWarning, setBucketWarning] = useState('5');
  const [siteName, setSiteName] = useState(provider.siteName ?? 'Eagle Point');
  const [currencySymbol, setCurrencySymbol] = useState(provider.currencySymbol ?? '₱');
  const [enableReservations, setEnableReservations] = useState<boolean>(provider.enableReservations ?? true);
  const [timedRate, setTimedRate] = useState('500');
  const [openRate, setOpenRate] = useState('500');

  const baseDefault = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  const baseUrl = (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;

  useEffect(() => {
    // init from provider and fresh fetch
    setSiteName(provider.siteName ?? siteName);
    setCurrencySymbol(provider.currencySymbol ?? currencySymbol);
    setTotalAvailableBays(String(provider.totalAvailableBays ?? totalAvailableBays));
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/admin/settings`, { method: 'GET', credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.siteName || data.siteTitle) setSiteName(String(data.siteName ?? data.siteTitle ?? siteName));
      if (data.currencySymbol) setCurrencySymbol(String(data.currencySymbol));
      if (data.enableReservations !== undefined) setEnableReservations(String(data.enableReservations) === 'true' || data.enableReservations === true);

      if (data.totalAvailableBays) setTotalAvailableBays(String(data.totalAvailableBays));
      if (data.standardTeeIntervalMinutes) setTeeInterval(String(data.standardTeeIntervalMinutes));
      if (data.ballBucketWarningThreshold) setBucketWarning(String(data.ballBucketWarningThreshold));

      if (data.timedSessionRate) setTimedRate(String(data.timedSessionRate));
      if (data.openTimeRate) setOpenRate(String(data.openTimeRate));
      
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const savePayload = (payload: Record<string, any>) => {
    setConfirmBodyText('Do you want to confirm the changes you made? This may affect areas of operations. Please proceed with caution.');
    setConfirmPayload(payload);
    setConfirmVisible(true);
  };

  const saveOperational = () => {
    // validate numeric inputs
    const total = Number(totalAvailableBays);
    const tee = Number(teeInterval);
    const bucket = Number(bucketWarning);
    if (!Number.isFinite(total) || !Number.isInteger(total) || total <= 0) {
      Alert.alert('Validation', 'Total Available Bays must be a positive integer');
      return;
    }
    if (!Number.isFinite(tee) || tee <= 0) {
      Alert.alert('Validation', 'Tee interval must be a positive number');
      return;
    }
    if (!Number.isFinite(bucket) || bucket < 0) {
      Alert.alert('Validation', 'Ball bucket warning threshold must be 0 or greater');
      return;
    }

    savePayload({
      totalAvailableBays: total,
      standardTeeIntervalMinutes: tee,
      ballBucketWarningThreshold: bucket,
    });
  };

  const saveGeneral = () => {
    if (!siteName || String(siteName).trim().length === 0) {
      Alert.alert('Validation', 'Site name cannot be empty');
      return;
    }
    savePayload({
      siteName,
      currencySymbol,
      enableReservations,
    });
  };

  const savePricing = () => {
    const t = Number(timedRate);
    const o = Number(openRate);
    if (!Number.isFinite(t) || t < 0) { Alert.alert('Validation', 'Timed session rate must be 0 or greater'); return; }
    if (!Number.isFinite(o) || o < 0) { Alert.alert('Validation', 'Open time rate must be 0 or greater'); return; }
    savePayload({
      timedSessionRate: t,
      openTimeRate: o,
    });
  };

  const performConfirmSave = async () => {
    if (!confirmPayload) return;
    setConfirmSaving(true);
    setSaving(true);
    try {
      const res = await fetch(`${baseUrl}/api/admin/settings`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirmPayload) });
      if (!res.ok) {
        const t = await res.text();
        Alert.alert('Failed', t || 'Failed saving settings');
        return;
      }

      setShowSavedNotification(true);
      // notify provider and others
  try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('settings:updated')); } catch {}
  try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('overview:updated')); } catch {}

      setConfirmVisible(false);
      setConfirmPayload(null);

      // auto-dismiss
      if (notifTimer.current) { clearTimeout(notifTimer.current); notifTimer.current = null; }
      notifTimer.current = window.setTimeout(() => {
        setShowSavedNotification(false);
        notifTimer.current = null;
      }, 2000) as unknown as number;
    } catch {
      Alert.alert('Error', 'Error saving settings');
    } finally {
      setConfirmSaving(false);
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (notifTimer.current) { clearTimeout(notifTimer.current as unknown as number); notifTimer.current = null; }
    };
  }, []);

  if (loading) return (
    <View style={{ padding: 20, alignItems: 'center' }}>
      <ActivityIndicator size="small" color="#2E7D32" />
    </View>
  );

  return (
    <View style={styles.rootContainer}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={[tw.flex1, { backgroundColor: '#F6F6F2' }]}>
        <View style={styles.container}>
          <Text style={styles.pageTitle}>System Settings (Connected)</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Operational Parameters</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Total Available Bays</Text>
              <TextInput value={totalAvailableBays} onChangeText={setTotalAvailableBays} style={styles.input} keyboardType='number-pad' />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Standard Tee Time Interval (Minutes)</Text>
              <TextInput value={teeInterval} onChangeText={setTeeInterval} style={styles.input} keyboardType='number-pad' />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Ball Bucket Warning Threshold</Text>
              <TextInput value={bucketWarning} onChangeText={setBucketWarning} style={styles.input} keyboardType='number-pad' />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={saveOperational} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>General Settings</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Site Name</Text>
              <TextInput value={siteName} onChangeText={setSiteName} style={styles.input} />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Currency Symbol</Text>
              <TextInput value={currencySymbol} onChangeText={setCurrencySymbol} style={styles.input} />
            </View>
            <View style={[styles.row, { alignItems: 'center' }]}>
              <Text style={styles.label}>Enable Reservations</Text>
              <Switch value={enableReservations} onValueChange={setEnableReservations} />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={saveGeneral} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pricing Configuration</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Timed Session Rate ({provider.currencySymbol}/hour)</Text>
              <TextInput value={timedRate} onChangeText={setTimedRate} style={styles.input} keyboardType='number-pad' />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Open Time Rate ({provider.currencySymbol}/hour)</Text>
              <TextInput value={openRate} onChangeText={setOpenRate} style={styles.input} keyboardType='number-pad' />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={savePricing} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>

      {/* Confirm Modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.confirmOverlay} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmBox} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Confirm Changes</Text>
            <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
            <Text style={styles.confirmBody}>{confirmBodyText}</Text>
            <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity style={[styles.cancelButton, { backgroundColor: '#C9DABF' }]} onPress={() => setConfirmVisible(false)}>
                <Text style={[styles.cancelButtonText, { color: '#12411A' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmButton, { backgroundColor: '#7E0000' }]} onPress={performConfirmSave} disabled={confirmSaving}>
                <Text style={styles.confirmButtonText}>{confirmSaving ? 'Saving...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notification */}
      {showSavedNotification && (
        <Pressable
          style={styles.notifOverlay}
          onPress={() => {
            if (notifTimer.current) { clearTimeout(notifTimer.current as unknown as number); }
            notifTimer.current = window.setTimeout(() => { setShowSavedNotification(false); notifTimer.current = null; }, 2000) as unknown as number;
          }}
        >
          <View style={styles.notifBox}>
            <TouchableOpacity style={styles.notifClose} onPress={() => { if (notifTimer.current) { clearTimeout(notifTimer.current as unknown as number); notifTimer.current = null; } setShowSavedNotification(false); }}>
              <Text style={{ color: '#2E3B2B', fontWeight: '800' }}>×</Text>
            </TouchableOpacity>
            <Text style={styles.notifTitle}>Report Notification</Text>
            <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 8 }} />
            <Text style={styles.notifBody}>Changes have been successfully made.</Text>
          </View>
        </Pressable>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, position: 'relative' },
  container: { padding: 20 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#2E3B2B', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 18, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EEF6EE', paddingVertical: 12 },
  label: { flex: 1, color: '#444' },
  input: { width: 100, backgroundColor: '#F8F8F8', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#DDD', textAlign: 'center' },
  saveButton: { marginTop: 12, alignSelf: 'flex-end', backgroundColor: '#C9DABF', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 6 },
  saveButtonText: { color: '#12411A', fontWeight: '700' },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  confirmBox: { width: '90%', maxWidth: 520, backgroundColor: '#F4F8F3', borderRadius: 10, padding: 18 },
  confirmTitle: { fontSize: 20, fontWeight: '800', color: '#2E3B2B', marginBottom: 8 },
  confirmBody: { fontSize: 15, color: '#444', marginBottom: 6 },
  cancelButton: { backgroundColor: '#C9DABF', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginRight: 8 },
  cancelButtonText: { color: '#12411A', fontWeight: '700' },
  confirmButton: { backgroundColor: '#7E0000', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  confirmButtonText: { color: '#fff', fontWeight: '700' },
  notifOverlay: { position: 'absolute', top: 18, right: 18, zIndex: 9999 },
  notifBox: { width: 300, maxWidth: '90%', backgroundColor: '#F4F8F3', borderRadius: 8, padding: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 4 },
  notifClose: { position: 'absolute', top: 8, right: 8, padding: 6 },
  notifTitle: { fontSize: 16, fontWeight: '800', color: '#2E3B2B', paddingRight: 28 },
  notifBody: { fontSize: 14, color: '#444', marginTop: 6 },
});
