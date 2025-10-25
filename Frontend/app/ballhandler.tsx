import React, { useState } from 'react';
import { View, Text, Alert, Platform, Modal, TouchableOpacity } from 'react-native';
import { tw } from 'react-native-tailwindcss';
import { useRouter } from 'expo-router';

export default function BallHandler() {
  const router = useRouter();

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      setLogoutModalVisible(true);
      return;
    }

    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => performLogout() },
    ]);
  };

  const [logoutModalVisible, setLogoutModalVisible] = useState<boolean>(false);

  const performLogout = async () => {
    try { setLogoutModalVisible(false); } catch (e) {}
    try {
      const baseUrl = Platform.OS === "android" ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      await fetch(`${baseUrl}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    } catch (e) {}

    try { if (typeof window !== 'undefined' && window.localStorage) {
      ['authToken','token','user','EAGLEPOINT_AUTH'].forEach(k=>window.localStorage.removeItem(k));
    } } catch (e) {}

    try { // @ts-ignore
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      if (AsyncStorage && AsyncStorage.multiRemove) await AsyncStorage.multiRemove(['authToken','token','user','EAGLEPOINT_AUTH']);
    } catch (e) {}

    router.replace('/');
  };

  return (
    <View style={[tw.flex1, tw.itemsCenter, tw.justifyCenter]}>
      <Text style={[tw.text2xl, tw.fontBold]}>Ball Handler Dashboard</Text>
      <Text style={{ marginTop: 16, color: '#555' }} onPress={handleLogout}>Log out</Text>

      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ width: '80%', backgroundColor: '#fff', borderRadius: 8, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10 }}>Confirm Logout</Text>
            <Text style={{ marginBottom: 18 }}>Are you sure you want to log out?</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setLogoutModalVisible(false)} style={{ padding: 8, marginRight: 8 }}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => performLogout()} style={{ padding: 8, backgroundColor: '#C62828', borderRadius: 6 }}>
                <Text style={{ color: '#fff' }}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
