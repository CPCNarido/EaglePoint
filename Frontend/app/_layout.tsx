import { Stack } from "expo-router";
import React, { useEffect } from 'react';
import SettingsProvider from './lib/SettingsProvider';
import Presence from './lib/presence';
import { enterFullScreen, exitFullScreen } from './(main)/utils/fullscreen';
import { Keyboard } from 'react-native';

export default function RootLayout() {
  useEffect(() => {
    let mounted = true;

    // Ensure presence is established for logged-in user when the app layout mounts
    (async () => {
      try {
        await Presence.ensureConnected();
      } catch (_e) { /* non-fatal */ }
    })();

    // Lightweight global interaction handler: any pointer/keyboard interaction
    // triggers a best-effort ensureConnected so presence is re-established
    const onUserInteraction = () => {
      try { void Presence.ensureConnected(); } catch (_e) { /* ignore */ }
    };
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pointerdown', onUserInteraction, { passive: true } as any);
        window.addEventListener('keydown', onUserInteraction, { passive: true } as any);
      }
    } catch (_e) { }
    // Try to enter full-screen on start
    (async () => {
      if (!mounted) return;
      try {
        await enterFullScreen();
      } catch (_e) { void _e; }
    })();

    // When the keyboard opens on many Android/tablet setups while in immersive mode,
    // the OS may pan the entire window causing content to shift unexpectedly. As a
    // pragmatic fix, exit immersive/fullscreen while the keyboard is visible so the
    // system can handle resizing; re-enter fullscreen on keyboard hide.
    const onKeyboardShow = async () => {
      try {
        // Only do this on platforms where immersive mode impacts keyboard behavior
        await exitFullScreen();
      } catch (_e) { void _e; }
    };
    const onKeyboardHide = async () => {
      try {
        await enterFullScreen();
      } catch (_e) { void _e; }
    };

    const showSub = Keyboard.addListener('keyboardDidShow', onKeyboardShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onKeyboardHide);

    return () => {
      mounted = false;
      try { showSub.remove(); } catch (_e) { void _e; }
      try { hideSub.remove(); } catch (_e) { void _e; }
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('pointerdown', onUserInteraction as any);
          window.removeEventListener('keydown', onUserInteraction as any);
        }
      } catch (_e) { }
      // restore UI on unmount
      exitFullScreen().catch(() => {});
    };
  }, []);

  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SettingsProvider>
  );
}
