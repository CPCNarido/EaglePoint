import React from 'react';
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, Image, Pressable } from 'react-native';

export default function Splash({ message = 'Loading System Data...', onClose, sealSource, noOverlayBackground = false }: { message?: string; onClose?: () => void; sealSource?: any; noOverlayBackground?: boolean }) {
  return (
    <ImageBackground
      source={require("../../assets/Login Page/SplashBG.png")}
      style={styles.container}
      imageStyle={{ backgroundColor: 'transparent' }}
      resizeMode="cover"
    >
      <Pressable style={[styles.overlay, noOverlayBackground ? { backgroundColor: 'transparent' } : {}]} onPress={onClose}>
        <Image source={require('../../assets/General/Logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Eagle Point</Text>
        <Text style={styles.subtitle}>AFPOVAI: Tee Time & Queuing</Text>
           <Image source={require('../../assets/General/Seal.png')} style={styles.seal} resizeMode="contain" />
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 18 }} />
        <Text style={styles.message}>{message}</Text>
        {onClose ? <Text style={styles.tapHint}>Tap anywhere to dismiss</Text> : null}
      </Pressable>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // Match the intended dark green base used in the design so transparent
  // areas in the PNG blend correctly instead of showing white.
  container: { flex: 1, width: '100%', height: '100%', backgroundColor: '#17321d' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(23,50,29,0.35)' },
  logo: { width: 180, height: 180, marginBottom: 12 },
  title: { color: '#fff', fontSize: 36, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#ddd', fontSize: 14 },
  seal: { width: 95, height: 95, marginTop: 8, marginBottom: 8, borderRadius: 44, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  message: { color: '#fff', marginTop: 12 },
  tapHint: { color: 'rgba(255,255,255,0.85)', marginTop: 10, fontSize: 12 },
});
