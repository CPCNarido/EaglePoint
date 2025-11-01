import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';

export default function AuditLogs() {
  const [adminName, setAdminName] = useState<string>('Admin');
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    fetchAdmin();
    return () => clearInterval(t);
  }, []);

  const fetchAdmin = async () => {
    try {
      const baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' });
      if (!res.ok) return;
      const d = await res.json();
      const name = d?.full_name || d?.name || d?.username || 'Admin';
      setAdminName(name);
    } catch {
      // ignore
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Audit Logs</Text>
          <Text style={styles.subtitle}>{adminName}</Text>
        </View>
        <View>
          <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      <View style={styles.contentCard}>
        <Text style={styles.sectionTitle}>Recent Audit Events</Text>
        <Text style={styles.placeholderText}>Audit log table placeholder. Implement event list and filters here.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F6F6F2' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700', color: '#374728' },
  subtitle: { color: '#666', marginBottom: 8 },
  dateText: { textAlign: 'right', fontSize: 12, color: '#555' },
  divider: { height: 1, backgroundColor: '#ccc', marginVertical: 10 },
  contentCard: { backgroundColor: '#fff', borderRadius: 10, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2E3B2B', marginBottom: 8 },
  placeholderText: { color: '#666' },
});
