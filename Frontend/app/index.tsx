import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image, ImageBackground, useWindowDimensions, Platform, Alert } from "react-native";
import { useRouter } from 'expo-router';
import { tw } from "react-native-tailwindcss";

const Login: React.FC = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { width, height } = useWindowDimensions();

    // Default for 2000x1200, scale for smaller screens
    const containerWidth = width >= 2000 ? "40%" : width > 900 ? "60%" : "90%";
    const containerHeight = height >= 1200 ? "70%" : height > 700 ? "80%" : "90%";

    const router = useRouter();

    const handleSubmit = async () => {
        if (!email || !password) return Alert.alert('Validation', 'Email and password required');
        try {
            // For Android emulator use 10.0.2.2, for iOS simulator or web use localhost,
            // on a physical device replace with your machine LAN IP (e.g. http://192.168.x.y:3000)
            const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
            console.log('[Frontend] login attempt', { email });
            const res = await fetch(`${baseUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            console.log('[Frontend] response status', res.status);
            if (!res.ok) {
                const text = await res.text().catch(() => null);
                console.log('[Frontend] login failed body:', text);
                Alert.alert('Login failed', text || `Status ${res.status}`);
                return;
            }
            const data = await res.json().catch(() => ({ message: 'OK' }));
            console.log('[Frontend] login success:', data);
            Alert.alert('Login success', data?.message ?? 'Authenticated');
                        // navigate according to backend-provided destination (role-based)
                        try {
                            const dest = data?.destination || '/admin';
                            router.push(dest);
                        } catch (e) { console.log('router.push error', e); }
        } catch (err: any) {
            console.log('[Frontend] network error', err?.message ?? err);
            Alert.alert('Network error', err?.message ?? String(err));
        }
    };

    return (
        <ImageBackground
            source={require('../assets/Login Page/LOGIN TABLET.png')}
            style={[tw.flex1, { width: '100%', height: '100%' }]}
            resizeMode="cover"
        >
            <View style={[tw.flex1, tw.justifyCenter, tw.itemsCenter]}>
                <View
                    style={[
                        tw.justifyCenter,
                        tw.bgWhite,
                        tw.p8,
                        tw.roundedLg,
                        tw.shadowMd,
                        tw.wFull,
                        { width: containerWidth },
                        { height: containerHeight },
                        { gap: 5 },
                    ]}
                >
                    <Image
                        source={require('../assets/images/EaglePointLogo.png')}
                        style={{ width: 120, height: 120, alignSelf: 'center', marginBottom: 1 }}
                    />
                    <Text
                        style={[
                            tw.text2xl,
                            tw.fontBold,
                            tw.textCenter,
                        ]}
                    >
                        STAFF LOGIN
                    </Text>
                    <Text
                        style={[
                            tw.textCenter,
                            tw.textGray500,
                            tw.fontMedium,
                            tw.mB10
                        ]}
                    >
                        Welcome to Eagle Point Management System
                    </Text>
                    <View style={tw.mB4}>
                        <Text
                            style={[
                                tw.textBase,
                                tw.fontBold,
                                tw.textGray700,
                                tw.mB2
                            ]}
                        >
                            EmployeeID / Username
                        </Text>
                        <TextInput
                            style={[
                                tw.wFull,
                                tw.pX5,
                                tw.pY6,
                                tw.border,
                                tw.rounded,
                                tw.mB2,
                            ]}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Enter your EmployeeID or Username"
                            placeholderTextColor="#B1B1B1"
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>
                    <View style={tw.mB6}>
                        <Text
                            style={[
                                tw.textBase,
                                tw.fontBold,
                                tw.textGray700,
                                tw.mB2
                            ]}
                        >
                            Password
                        </Text>
                        <TextInput
                            style={[
                                tw.wFull,
                                tw.pX5,
                                tw.pY6,
                                tw.border,
                                tw.rounded,
                                tw.mB2,
                            ]}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Enter your Password"
                            placeholderTextColor="#B1B1B1"
                            secureTextEntry
                        />
                    </View>
                    <TouchableOpacity
                        style={[
                            tw.wFull,
                            tw.pY5,
                            tw.rounded,
                            tw.itemsCenter,
                            tw.border,
                            tw.mT10,
                            { backgroundColor: "#C6DFA4" },
                            tw.shadowMd
                        ]}
                        onPress={handleSubmit}
                    >
                        <Text
                            style={[
                                { color: "#283720" },
                                tw.textBase,
                                tw.fontMedium,
                                tw.fontBold
                            ]}
                        >
                            LOGIN
                        </Text>
                    </TouchableOpacity>
                    <View>
                        <Text
                            style={[
                                tw.mT20,
                                tw.textBase,
                                tw.textCenter,
                            ]}
                        >
                            Contact Admin for Access Issues
                        </Text>
                    </View>
                </View>
            </View>
        </ImageBackground>
    );
};

export default Login;