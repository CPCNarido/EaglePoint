import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import CashierHeader from '../components/CashierHeader';

export default function TransactionTab({ userName }: { userName?: string }) {
  return (
    <ScrollView style={styles.scrollContent}>
      <View style={styles.contentContainer}>
        <CashierHeader title="Player Transaction" userName={userName} />
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>Transaction Page</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flex: 1 },
  contentContainer: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#2E372E' },
  placeholderBox: { backgroundColor: '#fff', borderRadius: 12, padding: 30, alignItems: 'center', marginTop: 20 },
  placeholderText: { fontSize: 16, color: '#555' },
});