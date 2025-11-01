import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  useWindowDimensions,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { tw } from "react-native-tailwindcss";
import { saveAccessToken } from './lib/auth';
import { useSettings } from './lib/SettingsProvider';

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { width, height } = useWindowDimensions();

  // Responsive scaling logic
  const isTablet = width >= 1000 && height >= 700;
  const isLaptop = width >= 1400;
  const isSmallScreen = width < 700;

  // Maintain tablet size as base, scale up for laptops/desktops slightly
  const containerWidth = isLaptop
    ? "40%"
    : isTablet
    ? "50%"
    : isSmallScreen
    ? "95%"
    : "80%";

  const containerHeight = isLaptop
    ? "93%"
    : isTablet
    ? "80%"
    : isSmallScreen
    ? "85%"
    : "80%";

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async () => {
    if (!email || !password) return Alert.alert("Validation", "Email and password required");
    setLoading(true);
    setErrorMessage("");
    setErrorModalVisible(false);
    try {
      // Backend runs with global prefix '/api' and default port 3001 in development.
      // Use localhost:3001 for web and 10.0.2.2:3001 for Android emulator.
      const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // server expects 'email' body field (we treat it as username or employee id)
        body: JSON.stringify({ email: email?.trim(), password }),
        credentials: 'include',
      });

      if (!res.ok) {
        const text = await res.text().catch(() => null);
        setErrorMessage(text || `Status ${res.status}`);
        setErrorModalVisible(true);
        return;
      }

      const data = await res.json().catch(() => ({ message: "OK" }));

      // Save access token (refresh token will be set as HttpOnly cookie by server)
      try {
        const access = data?.accessToken || data?.access_token || null;
        if (access) {
          saveAccessToken(access);
        }
      } catch {
        // ignore storage errors
      }

      router.push(data?.destination || "/admin");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setErrorMessage(
        msg.includes("Network request failed")
          ? "Network error: check your internet connection"
          : msg
      );
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/Login Page/LOGIN TABLET.png")}
      style={[tw.flex1, { width: "100%", height: "100%" }]}
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
            {
              width: containerWidth,
              height: containerHeight,
              gap: 5,
              minWidth: 320,
              maxWidth: 700, // Prevent it from being too huge
            },
          ]}
        >
          <Image
            source={require("../assets/images/EaglePointLogo.png")}
            style={{ width: 120, height: 120, alignSelf: "center", marginBottom: 10 }}
            resizeMode="contain"
          />
          <Text style={[tw.text2xl, tw.fontBold, tw.textCenter]}>STAFF LOGIN</Text>
          <Text style={[tw.textCenter, tw.textGray500, tw.fontMedium, tw.mB10]}>
            Welcome to {useSettings().siteName} Management System
          </Text>

          <View style={tw.mB4}>
            <Text style={[tw.textBase, tw.fontBold, tw.textGray700, tw.mB2]}>
              EmployeeID / Username
            </Text>
            <TextInput
              style={[
                  tw.wFull,
                  tw.pX5,
                  tw.pY4,
                  tw.border,
                  tw.rounded,
                  tw.mB2,
                  { fontSize: isSmallScreen ? 14 : 16 },
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
            <Text style={[tw.textBase, tw.fontBold, tw.textGray700, tw.mB2]}>Password</Text>
            <TextInput
              style={[
                tw.wFull,
                tw.pX5,
                tw.pY4,
                tw.border,
                tw.rounded,
                tw.mB2,
                { fontSize: isSmallScreen ? 14 : 16 },
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
              tw.shadowMd,
              loading ? { opacity: 0.7 } : {},
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#283720" />
            ) : (
              <Text style={[{ color: "#283720" }, tw.textBase, tw.fontMedium, tw.fontBold]}>
                LOGIN
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[tw.mT10, tw.textBase, tw.textCenter]}>
            Contact Admin for Access Issues
          </Text>
        </View>
      </View>

      {/* Error Modal */}
      <Modal
        visible={errorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ width: "80%", backgroundColor: "#fff", borderRadius: 8, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>Error</Text>
            <Text style={{ marginBottom: 20 }}>{errorMessage}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Pressable onPress={() => setErrorModalVisible(false)} style={{ padding: 10 }}>
                <Text style={{ color: "#1E2B20", fontWeight: "600" }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};

export default Login;
