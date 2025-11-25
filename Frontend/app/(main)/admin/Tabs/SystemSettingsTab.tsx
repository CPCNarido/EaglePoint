import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator, Modal, Pressable, Switch, Image } from 'react-native';
import ErrorModal from '../../../components/ErrorModal';
import Toast from '../../../components/Toast';
import { friendlyMessageFromThrowable } from '../../../lib/errorUtils';
import { tw } from 'react-native-tailwindcss';
import { useSettings } from '../../../lib/SettingsProvider';
import { fetchWithAuth } from '../../../_lib/fetchWithAuth';
import { buildNotification } from '../../../lib/notification';

export default function SystemSettingsTab() {
  const provider = useSettings();
  // header info
  const [adminName, setAdminName] = useState<string>('Admin');
  const [now, setNow] = useState<Date>(new Date());
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

  // centralized error modal state
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string>('');
  const [errorModalType, setErrorModalType] = useState<any | null>(null);
  const [errorModalDetails, setErrorModalDetails] = useState<any>(null);
  const [errorModalTitle, setErrorModalTitle] = useState<string | undefined>(undefined);

  void errorModalTitle;

  const showError = (err: any, fallback?: string) => {
    const friendly = friendlyMessageFromThrowable(err, fallback ?? 'An error occurred');
    setErrorModalType(friendly?.type ?? 'other');
    setErrorModalMessage(friendly?.message ?? (fallback ?? 'An error occurred'));
    setErrorModalDetails(friendly?.details ?? (typeof err === 'string' ? err : null));
    setErrorModalTitle(fallback ?? undefined);
    setErrorModalVisible(true);
  };
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTitle, setToastTitle] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | undefined>(undefined);
  const showToast = (title?: string, msg?: string) => { setToastTitle(title); setToastMessage(msg); setToastVisible(true); };

  useEffect(() => {
    // init from provider and fresh fetch
    setSiteName(provider.siteName ?? siteName);
    setCurrencySymbol(provider.currencySymbol ?? currencySymbol);
    setTotalAvailableBays(String(provider.totalAvailableBays ?? totalAvailableBays));
    fetchSettings();
    fetchAdminInfo();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
  const res = await fetchWithAuth(`${baseUrl}/api/admin/settings`, { method: 'GET' });
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

  const fetchAdminInfo = async () => {
    try {
      const res = await fetchWithAuth(`${baseUrl}/api/admin/me`, { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json();
      const name = data?.full_name || data?.name || data?.username || data?.displayName || 'Admin';
      setAdminName(name);
    } catch {
      // ignore
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
      showError('Total Available Bays must be a positive integer', 'Validation');
      return;
    }
    if (!Number.isFinite(tee) || tee <= 0) {
      showError('Tee interval must be a positive number', 'Validation');
      return;
    }
    if (!Number.isFinite(bucket) || bucket < 0) {
      showError('Ball bucket warning threshold must be 0 or greater', 'Validation');
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
      showError('Site name cannot be empty', 'Validation');
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
  if (!Number.isFinite(t) || t < 0) { showError('Timed session rate must be 0 or greater', 'Validation'); return; }
  if (!Number.isFinite(o) || o < 0) { showError('Open time rate must be 0 or greater', 'Validation'); return; }
    savePayload({
      timedSessionRate: t,
      openTimeRate: o,
    });
  };

  // Upload seal image to backend and refresh settings on success
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Centralized upload handler that accepts either a web File or a RN-style { uri, name, type }
  const uploadFromFile = async (fileObj: any) => {
    if (!fileObj) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (Platform.OS === 'web') {
        // fileObj is a File
        form.append('file', fileObj as any);
      } else {
        // react-native expects { uri, name, type }
        const name = fileObj.name || `seal-${Date.now()}.png`;
        const type = fileObj.type || 'image/png';
        // @ts-ignore
        form.append('file', { uri: fileObj.uri, name, type });
      }

  const r = await fetchWithAuth(`${baseUrl}/api/admin/settings/seal`, { method: 'POST', body: form });
      if (!r.ok) {
        const txt = await r.text().catch(() => 'Upload failed');
        showError(txt || 'Upload failed', 'Upload failed');
        return;
      }
      const body = await r.json().catch(() => null);
      const url = body?.url ?? null;
  try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('settings:updated')); } catch {}
  try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('overview:updated')); } catch {}
  showToast('Uploaded', url ? 'Seal uploaded successfully.' : 'Uploaded; settings refreshed.');
    } catch (e: any) {
      console.warn('Seal upload failed', e);
      showError(e, 'Upload failed');
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };
  const pickAndUpload = async () => {
    try {
      // dynamic import so we don't require DocumentPicker in web/native builds where it's not present
      // dynamic import - ts-ignore so build doesn't require the module at compile time
      // (it may not be present in some environments)
      // @ts-ignore
      // eslint-disable-next-line import/no-unresolved
      const docPicker = await import('expo-document-picker').catch(() => null);
      if (!docPicker || !docPicker.getDocumentAsync) {
        showError('File picker is not available in this environment. Use the web admin UI to upload a seal.', 'Not supported');
        return;
      }
      const res = await docPicker.getDocumentAsync({ type: 'image/*' });
      if (!res || res.type !== 'success') return;

      // Use uploadFromFile to handle web/native differences
      if (Platform.OS === 'web') {
        // fetch the uri to get a Blob and wrap as File
        const name = res.name || `seal-${Date.now()}.png`;
        const blob = await (await fetch(res.uri)).blob();
        // @ts-ignore File constructor available in browsers
        const file = new File([blob], name, { type: blob.type || 'image/png' });
        await uploadFromFile(file);
      } else {
        await uploadFromFile({ uri: res.uri, name: res.name || `seal-${Date.now()}.png`, type: (res.mimeType as string) || 'image/png' });
      }
    } catch (e: any) {
        console.warn('Seal upload failed', e);
        showError(e, 'Upload failed');
      } finally {
      setUploading(false);
    }
  };

  const performConfirmSave = async () => {
    if (!confirmPayload) return;
    setConfirmSaving(true);
    setSaving(true);
    try {
      const res = await fetch(`${baseUrl}/api/admin/settings`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirmPayload) });
      if (!res.ok) {
        const t = await res.text();
        showError(t || 'Failed saving settings', 'Failed');
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
      showError('Error saving settings');
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
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.pageTitle}>System Settings (Connected)</Text>
                <Text style={styles.subtitle}>{`Welcome back, ${adminName}!`}</Text>
              </View>
              <View>
                <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
              </View>
            </View>
            <View style={styles.divider} />

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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Branding</Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: '#444', marginBottom: 6 }}>Splash Seal</Text>
              {provider?.sealUrl ? (
                <Image source={{ uri: provider.sealUrl }} style={{ width: 96, height: 96, borderRadius: 8, marginBottom: 8, backgroundColor: '#FFF' }} resizeMode="contain" />
              ) : (
                <View style={{ width: 96, height: 96, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ color: '#777' }}>No Seal</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#C9DABF' }]} onPress={pickAndUpload} disabled={uploading}>
                  {uploading ? <ActivityIndicator size="small" color="#12411A" /> : <Text style={[styles.saveButtonText]}>Upload (web/native)</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#EEE' }]} onPress={() => { try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('settings:updated')); } catch {} }}>
                  <Text style={{ color: '#12411A', fontWeight: '700' }}>Refresh</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: '#666', marginTop: 8, fontSize: 12 }}>Upload PNG to update splash seal. Max 2MB. Use the web UI or supported native pickers.</Text>

              {/* Web-only drag & drop area */}
              {Platform.OS === 'web' ? (
                // @ts-ignore - using native DOM drag events on web
                <div
                  onDragOver={(e: any) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e: any) => { e.preventDefault(); setDragActive(false); }}
                  onDrop={async (e: any) => {
                    try {
                      e.preventDefault();
                      setDragActive(false);
                      const files = e.dataTransfer?.files;
                      if (!files || files.length === 0) return;
                      const f = files[0];
                      // Only accept images
                      if (!f.type || !f.type.startsWith('image/')) {
                        showError('Please drop an image file (PNG/JPEG)', 'Invalid file');
                        return;
                      }
                      await uploadFromFile(f);
                    } catch (err) {
                      console.warn('Drop upload failed', err);
                    }
                  }}
                  style={{ marginTop: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: dragActive ? '#12411A' : '#DDD', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <div style={{ pointerEvents: 'none' }}>
                    <div style={{ fontSize: 13, color: dragActive ? '#12411A' : '#666' }}><strong>Drag & drop an image file here to upload</strong></div>
                    <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>Or click Upload (web/native) to pick a file</div>
                  </div>
                </div>
              ) : null}
            </View>
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
                {(() => {
                  const built = buildNotification(null, null, 'Changes have been successfully made.', { defaultTitle: 'Report Notification', preferredType: 'success' });
                  return (
                    <>
                      <Text style={styles.notifTitle}>{built.title}</Text>
                      <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 8 }} />
                      <Text style={styles.notifBody}>{built.body}</Text>
                    </>
                  );
                })()}
              </View>
        </Pressable>
      )}
      <ErrorModal visible={errorModalVisible} errorType={errorModalType} errorMessage={errorModalMessage} errorDetails={errorModalDetails} onClose={() => setErrorModalVisible(false)} />
      <Toast visible={toastVisible} title={toastTitle} message={toastMessage} onClose={() => setToastVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, position: 'relative' },
  container: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#2E3B2B', marginBottom: 8 },
  subtitle: { color: '#666', marginBottom: 10 },
  dateText: { textAlign: 'right', fontSize: 12, color: '#555' },
  divider: { height: 1, backgroundColor: '#ccc', marginVertical: 10 },
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
