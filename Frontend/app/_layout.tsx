import { Stack } from "expo-router";
import React from 'react';
import { SettingsProvider } from './lib/SettingsProvider';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SettingsProvider>
  );
}
