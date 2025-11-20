import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Image, ImageBackground, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { fetchWithAuth } from '../../_lib/fetchWithAuth';
import { logoutAndClear } from '../../_lib/auth';
import { useSettings } from '../../lib/SettingsProvider';
import TeamChats from '../admin/Tabs/TeamChats';
import ErrorModal from '../../components/ErrorModal';

export default function BallHandler() {
	const settings = useSettings();
	const router = useRouter();
	const [activeTab, setActiveTab] = useState<string>('Dashboard');

	const [overview, setOverview] = useState<any>(null);
	const [userName, setUserName] = useState<string>('Ball Handler');
	const [userEmployeeId, setUserEmployeeId] = useState<string>('');
	const [now, setNow] = useState<number>(Date.now());
	const [modalVisible, setModalVisible] = useState(false);
	const [modalType, setModalType] = useState<any>(null);
	const [modalMessage, setModalMessage] = useState<string | undefined>(undefined);
	const isFetchingRef = useRef(false);

	const performLogout = async () => {
		await logoutAndClear();
		try { router.replace('/'); } catch {};
	};

	const fetchOverview = useCallback(async () => {
		if (isFetchingRef.current) return;
		isFetchingRef.current = true;
		try {
			let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
			try {
				// @ts-ignore
				const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
				const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
				const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
				if (override) baseUrl = override;
			} catch {}

			const res = await fetchWithAuth(`${baseUrl}/api/dispatcher/overview`, { method: 'GET' });
			if (!res.ok) {
				setOverview(null);
				return;
			}
			const data = await res.json();
			setOverview(data);
		} catch (e) {
			setOverview(null);
		} finally {
			isFetchingRef.current = false;
		}
	}, []);

	const handleHandOver = async (bay: any) => {
		try {
			let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
			try {
				// @ts-ignore
				const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
				const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
				const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
				if (override) baseUrl = override;
			} catch {}

			const url = `${baseUrl}/api/admin/bays/${bay.bay_number}/hand-over`;
			// Diagnostic: log the URL and whether an auth token is present (do not log token value)
			let authPresent = false;
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					authPresent = !!window.localStorage.getItem('authToken');
				} else {
					// @ts-ignore
					const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
					const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
					if (AsyncStorage && AsyncStorage.getItem) {
						const t = await AsyncStorage.getItem('authToken').catch(() => null);
						authPresent = !!t;
					}
				}
			} catch (e) {
				console.warn('Failed checking auth token presence', e);
			}
			console.warn(`handOver: POST ${url} authPresent=${authPresent}`);
			const res = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket_count: 1 }) });
			if (res.ok) {
				setModalType('success');
				setModalMessage('Bucket recorded');
				setModalVisible(true);
				await fetchOverview();
			} else {
				// Try to parse error details from response for diagnostics
				let details = '';
				try {
					const ct = res.headers.get('content-type') || '';
					if (ct.includes('application/json')) {
						const body = await res.json();
						details = body?.message ? String(body.message) : JSON.stringify(body);
					} else {
						details = await res.text();
					}
				} catch (parseErr) {
					console.warn('Failed parsing hand-over error response', parseErr);
				}
				console.warn(`handOver failed bay=${bay?.bay_number} status=${res.status} details=${details}`);
				setModalType('other');
				setModalMessage(`Failed to record bucket${details ? ': ' + String(details).slice(0,200) : ''}`);
				setModalVisible(true);
				await fetchOverview();
			}
		} catch (e) {
			setModalType('other');
			setModalMessage('Unexpected error');
			setModalVisible(true);
			await fetchOverview();
		}
	};

	useEffect(() => {
		const clock = setInterval(() => setNow(Date.now()), 1000);
		(async () => {
			try {
				let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
				try {
					// @ts-ignore
					const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
					const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
					const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
					if (override) baseUrl = override;
				} catch {}

				let d: any = null;
				try {
					const r = await fetchWithAuth(`${baseUrl}/api/admin/me`, { method: 'GET' });
					if (r.ok) d = await r.json();
				} catch {}
				if (d) {
					const name = d?.full_name || d?.name || d?.username || 'Ball Handler';
					const empId = d?.employee_id ?? d?.employeeId ?? null;
					setUserName(name);
					setUserEmployeeId(empId != null ? String(empId) : '');
				}
			} catch {}
		})();

		fetchOverview();
		const interval = setInterval(() => fetchOverview(), 2000);
		return () => {
			clearInterval(interval);
			clearInterval(clock);
		};
	}, [fetchOverview]);

	// derive queue: show only active sessions (occupied bays with player)
	const queue = (overview?.bays ?? []).filter((b: any) => String(b.status) === 'Occupied' && b.player);

	// Hero banner: full month name date and hour:minute AM/PM time on separate lines
	const formattedHeroDate = new Date(now).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
	const formattedHeroTime = new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

	const renderDashboard = () => (
		<View style={styles.container}>
			<Text style={styles.header}>Ball Handler Dashboard</Text>
			<ImageBackground source={require('../../../assets/General/BHHeroImg.png')} style={styles.heroImage} resizeMode="cover">
				{/* top-left welcome */}
				<View style={styles.heroTopLeft} pointerEvents="none">
					<Text style={styles.heroWelcomeText}>Welcome, {userName}</Text>
				</View>
				{/* bottom-left date/time on two lines */}
				<View style={styles.heroBottomLeft} pointerEvents="none">
					<Text style={styles.heroDateText}>{formattedHeroDate}</Text>
					<Text style={styles.heroTimeText}>{formattedHeroTime}</Text>
				</View>
			</ImageBackground>

			<View style={styles.contentRow}>
				<View style={styles.queueColumn}>
					<Text style={styles.sectionTitle}>Player Queue</Text>
					<ScrollView style={styles.queueList}>
						{queue.length === 0 && (
							<View style={styles.placeholderBox}><Text style={styles.placeholderText}>No active sessions</Text></View>
						)}
						{queue.map((b: any) => (
							<View key={String(b.bay_id)} style={styles.queueItem}>
								<Text style={styles.bayLabel}>Bay #{b.bay_number}</Text>
								<Text style={styles.playerName}>{b.player?.nickname ?? b.player?.full_name ?? 'Unknown'}</Text>
								<Text style={styles.sessionMeta}>{b.session_type ?? 'Open'}{b.session_type === 'Timed' && b.end_time ? ` • ends ${new Date(b.end_time).toLocaleTimeString()}` : ''}</Text>
								<TouchableOpacity onPress={() => handleHandOver(b)} style={styles.handOverBtn}><Text style={styles.handOverTxt}>Handed Over</Text></TouchableOpacity>
							</View>
						))}
					</ScrollView>
				</View>

				<View style={styles.logColumn}>
					<Text style={styles.sectionTitle}>Recent Deliver Log</Text>
					<ScrollView style={styles.logList}>
						<View style={styles.logItem}><Text style={styles.logTitle}>No recent deliver records</Text></View>
					</ScrollView>
				</View>
			</View>
		</View>
	);

	const renderContent = () => {
		switch (activeTab) {
			case 'Dashboard':
				return renderDashboard();
			case 'Bucket Tracker':
				return (
					<View style={styles.container}>
						<Text style={styles.header}>Bucket Tracker</Text>
						<View style={styles.placeholderBox}><Text style={styles.placeholderText}>Bucket Tracker is a placeholder for now.</Text></View>
					</View>
				);
			case 'Team Chats':
				return <TeamChats />;
			default:
				return renderDashboard();
		}
	};

	return (
		<View style={styles.outerContainer}>
			<ErrorModal visible={modalVisible} errorType={modalType} errorMessage={modalMessage ?? ''} onClose={() => setModalVisible(false)} />
			<View style={styles.sidebar}>
				<View style={styles.logoContainer}>
					<Image source={require('../../../assets/General/Logo.png')} style={styles.logoImage} resizeMode="contain" />
					<View style={styles.logoTextContainer}>
						<Text style={styles.logoAppName}>{settings.siteName}</Text>
						<Text style={styles.logoRole}>Ball Handler</Text>
					</View>
				</View>
				<View style={styles.logoDivider} />

				{[
					{ name: 'Dashboard', icon: 'dashboard' },
					{ name: 'Bucket Tracker', icon: 'sports-tennis' },
					{ name: 'Team Chats', icon: 'chat' },
				].map((tab) => (
					<TouchableOpacity key={tab.name} style={[styles.tabButton, activeTab === tab.name && styles.activeTabButton]} onPress={() => setActiveTab(tab.name)}>
						<Icon name={tab.icon as any} size={20} color={activeTab === tab.name ? '#fff' : '#B8C1B7'} style={styles.icon} />
						<Text style={activeTab === tab.name ? styles.activeTabText : styles.tabText}>{tab.name}</Text>
					</TouchableOpacity>
				))}

				<View style={styles.logoutContainer}>
					<Text style={styles.loggedInText}>Logged in as: {userName}</Text>
					<Text style={styles.loggedInText}>ID: {userEmployeeId || '—'}</Text>
					<TouchableOpacity style={styles.logoutButton} onPress={performLogout}>
						<Text style={styles.logoutText}>LOG OUT</Text>
					</TouchableOpacity>
				</View>
			</View>

			{renderContent()}
		</View>
	);
}

const styles = StyleSheet.create({
	// outer container (sidebar + main)
	outerContainer: { flexDirection: 'row', flex: 1, backgroundColor: '#EDECE8' },
	// sidebar (copied from Cashier layout)
	sidebar: {
		width: 250,
		backgroundColor: '#1E2B20',
		padding: 20,
		justifyContent: 'space-between',
	},
	logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
	logoImage: { width: 60, height: 60, borderRadius: 8, marginRight: 10, backgroundColor: 'transparent', overflow: 'hidden' },
	logoTextContainer: { flexDirection: 'column' },
	logoAppName: { color: '#fff', fontWeight: '700', fontSize: 20 },
	logoRole: { color: '#DADADA', fontSize: 15, marginTop: 2 },
	logoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 0, alignSelf: 'stretch' },
	tabButton: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 14,
		paddingHorizontal: 10,
		borderRadius: 8,
		marginVertical: 5,
	},
	activeTabButton: { backgroundColor: '#405C45' },
	tabText: { color: '#DADADA', fontSize: 16 },
	activeTabText: { color: '#fff', fontWeight: '600' },
	icon: { marginRight: 10 },
	logoutContainer: { marginTop: 'auto', marginBottom: 10 },
	loggedInText: { color: '#CFCFCF', fontSize: 12, marginBottom: 4 },
	logoutButton: {
		backgroundColor: '#555',
		padding: 10,
		borderRadius: 6,
		alignItems: 'center',
		marginTop: 10,
	},
	logoutText: { color: 'white', fontWeight: 'bold' },

	// main content (copied from Cashier mainContent)
	container: { flex: 1, backgroundColor: '#F9F8F6', borderTopLeftRadius: 20, padding: 20 },
	header:  { fontSize: 18, fontWeight: "700", marginBottom: 10,marginTop:30 },
	heroImage: { marginTop:-30,width: '100%', height: 160, borderRadius: 10, marginBottom: 12, overflow: 'hidden', justifyContent: 'flex-start' },
	heroTopLeft: { position: 'absolute', left: 16, top: 12 },
	heroBottomLeft: { position: 'absolute', left: 16, bottom: 12 },
	heroWelcomeText: { marginTop:40,color: '#FFFFFF', fontSize: 18, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
	heroDateText: { color: '#E6F0E6', fontSize: 13, marginBottom: 2 },
	heroTimeText: { color: '#E6F0E6', fontSize: 13, fontWeight: '700' },
	contentRow: { flexDirection: 'row', gap: 12 },

	// ball handler specific columns
	queueColumn: { flex: 2, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12 },
	logColumn: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12 },
	sectionTitle: { fontSize: 18, fontWeight: '700', color: '#2E372E', marginBottom: 8 },
 	queueList: { height: 330 },
	queueItem: { backgroundColor: '#F3F6F1', borderRadius: 8, padding: 12, marginBottom: 10 },
	bayLabel: { fontWeight: '700', color: '#1B4D2A' },
	playerName: { marginTop: 6, fontSize: 16, color: '#234' },
	sessionMeta: { marginTop: 6, color: '#5A6A55' },
	handOverBtn: { position: 'absolute', right: 12, top: 12, backgroundColor: '#A3C38A', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
	handOverTxt: { color: '#14391A', fontWeight: '700' },
	placeholderBox: { padding: 20, alignItems: 'center', justifyContent: 'center' },
	placeholderText: { color: '#666' },
	logList: { maxHeight: 600 },
	logItem: { backgroundColor: '#F7F7F7', padding: 10, borderRadius: 8, marginBottom: 8 },
	logTitle: { color: '#555' },
});
