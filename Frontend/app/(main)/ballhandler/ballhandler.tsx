import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function BallHandler() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Ball Handler</Text>
			<Text style={styles.subtitle}>This route is a placeholder. Implement the Ball Handler UI here.</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { padding: 20 },
	title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
	subtitle: { color: '#666' },
});
