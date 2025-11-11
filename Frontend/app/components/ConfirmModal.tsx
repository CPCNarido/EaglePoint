import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: '80%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 10, padding: 16 }}>
          {title ? <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 8 }}>{title}</Text> : null}
          {message ? <Text style={{ fontSize: 14, color: '#333', marginBottom: 12 }}>{message}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Pressable onPress={onCancel} style={{ padding: 10 }}>
              <Text style={{ color: '#12411A', fontWeight: '700' }}>{cancelText}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={{ padding: 10 }}>
              <Text style={{ color: '#7E0000', fontWeight: '800' }}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
