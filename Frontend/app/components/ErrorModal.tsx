import React, { useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from './Toast';

type ErrorType = 'credentials'|'network'|'server'|'timeout'|'other'|'validation'|null;

export default function ErrorModal({
  visible,
  errorType,
  errorMessage,
  errorDetails,
  onClose,
  onRetry,
}: {
  visible: boolean;
  errorType: ErrorType;
  errorMessage: string;
  errorDetails?: any;
  onClose: () => void;
  onRetry?: () => void;
}) {


  const [toastVisible, setToastVisible] = useState(false);
  const [toastTitle, setToastTitle] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | undefined>(undefined);

  const showLocalToast = (title?: string, msg?: string) => { setToastTitle(title); setToastMessage(msg); setToastVisible(true); };

  const handleOpenSaved = async () => {
    try {
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const v = await AsyncStorage?.getItem?.('lastLoginError');
      console.debug('lastLoginError', v ? JSON.parse(v) : null);
      // remove persisted diagnostic after showing
      if (AsyncStorage) await AsyncStorage.removeItem('lastLoginError');
      showLocalToast('Saved', 'Last error logged to console for inspection');
    } catch (e) {
      console.warn('Failed reading lastLoginError', e);
      showLocalToast('Error', 'Failed reading saved diagnostics');
    }
  };

  const title = errorType === 'credentials' ? 'Incorrect username or password' : (errorType === 'network' ? 'Internet connection problem' : (errorType === 'validation' ? 'Please check the form' : 'Error'));
  const headerBg = errorType === 'credentials' ? '#FDECEA' : errorType === 'network' ? '#FFF4E5' : errorType === 'validation' ? '#F0F7FF' : '#F6F6F6';
  const iconName = errorType === 'credentials' ? 'lock' : errorType === 'network' ? 'wifi-off' : errorType === 'validation' ? 'info-outline' : 'error-outline';

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: '40%', backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ padding: 14, backgroundColor: headerBg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name={iconName as any} size={20} color={errorType === 'credentials' ? '#9B2C2C' : '#333'} style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: errorType === 'credentials' ? '#9B2C2C' : '#333' }}>{title}</Text>
            </View>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={{ marginBottom: 10 }}>{errorMessage}</Text>
            {errorType === 'other' && errorDetails ? (
              <ScrollView style={{ maxHeight: 220, marginBottom: 12 }}>
                <Text selectable>{JSON.stringify(errorDetails, null, 2)}</Text>
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              {errorType !== 'credentials' && onRetry ? (
                <Pressable onPress={onRetry} style={{ padding: 10 }}>
                  <Text style={{ color: '#1E2B20', fontWeight: '700' }}>Retry</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={async () => { try { const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null); const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule; if (AsyncStorage) await AsyncStorage.removeItem('lastLoginError'); } catch {} onClose(); }} style={{ padding: 10, marginRight: 8 }}>
                <Text style={{ color: '#1E2B20', fontWeight: '600' }}>Close</Text>
              </Pressable>
              {typeof __DEV__ !== 'undefined' && __DEV__ ? (
                <Pressable onPress={handleOpenSaved} style={{ padding: 10 }}>
                  <Text style={{ color: '#1E2B20', fontWeight: '600' }}>Open Saved</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
    <Toast visible={toastVisible} title={toastTitle} message={toastMessage} onClose={() => setToastVisible(false)} />
    </>
  );
}
