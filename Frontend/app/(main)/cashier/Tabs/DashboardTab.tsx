import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, ImageBackground, StyleSheet } from 'react-native';
import QuickOverview from '../../../components/QuickOverview';
import RealTimeBayOverview from '../../../components/RealTimeBayOverview';
import { useSettings } from '../../../lib/SettingsProvider';

export default function DashboardTab({ overview, userName }: { overview: any; userName?: string }) {
  const settings = useSettings();
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <ScrollView style={styles.scrollContent}>
      <View style={styles.contentContainer}>
        <ImageBackground
          source={require('../../../../assets/General/CashierHeroImage.png')}
          style={styles.headerBannerImage}
          imageStyle={{ borderRadius: 12 }}
        >
          <Text style={styles.sectionTitle}>Cashier Dashboard</Text>
          <View style={styles.headerBannerOverlay}>
            <Text style={styles.headerBannerTitle}>Welcome back, {userName ?? 'Cashier'}!</Text>
            <View style={styles.headerDateTimeRow}>
              <Text style={styles.headerBannerDate}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              <Text style={styles.headerBannerTime}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          </View>
        </ImageBackground>

        <Text style={styles.sectionTitle}>Quick Overview</Text>
        <View>
          {/* @ts-ignore */}
          <QuickOverview overview={overview} settings={settings} currencySymbol={settings.currencySymbol} />
        </View>

        {/* @ts-ignore */}
        <RealTimeBayOverview overview={overview} settings={settings} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flex: 1 },
  contentContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  headerBannerImage: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    marginBottom: 8,
    marginTop: 30,
    backgroundColor: 'transparent',
  },
  headerBannerOverlay: { flex: 1, justifyContent: 'space-between', padding: 16, alignItems: 'flex-start' },
  headerBannerTitle: {
    color: '#fff',
    marginTop: 12,
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerBannerDate: { color: '#fff', marginBottom: 4, marginTop: 50, fontSize: 13, fontWeight: '600' },
  headerBannerTime: { color: '#fff', fontSize: 13, fontWeight: '600' },
  headerDateTimeRow: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
});