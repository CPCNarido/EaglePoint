import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const router = useRouter();

  const tabs = [
    { name: "Dashboard", icon: "dashboard" },
    { name: "Bay Assignment", icon: "golf-course" },
    { name: "Shared Display", icon: "tv" },
    { name: "Session Control", icon: "settings" },
  ];

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => router.replace("/") },
    ]);
  };

  return (
    <View style={styles.sidebar}>
      <Text style={styles.logo}>{" "}Eagle Point{"\n"}Dispatcher</Text>

      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.name}
          style={[styles.tabButton, activeTab === tab.name && styles.activeTabButton]}
          onPress={() => setActiveTab(tab.name)}
        >
          <MaterialIcons
            name={tab.icon as any}
            size={22}
            color={activeTab === tab.name ? "#fff" : "#B8C1B7"}
            style={styles.icon}
          />
          <Text style={[styles.tabText, activeTab === tab.name && styles.activeTabText]}>
            {tab.name}
          </Text>
        </TouchableOpacity>
      ))}

      <View style={styles.logoutContainer}>
        <Text style={styles.loggedInText}>Logged in as: Cashier Anne</Text>
        <Text style={styles.loggedInText}>Cashier ID: 1022101</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>LOG OUT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 250,
    backgroundColor: "#1E2B20",
    padding: 20,
    justifyContent: "flex-start",
  },
  logo: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
    marginBottom: 40,
    lineHeight: 26,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  activeTabButton: { backgroundColor: "#405C45" },
  tabText: { color: "#DADADA", fontSize: 16 },
  activeTabText: { color: "#fff", fontWeight: "600" },
  icon: { marginRight: 10 },
  logoutContainer: { marginTop: "auto", marginBottom: 10 },
  loggedInText: { color: "#ccc", fontSize: 12, marginBottom: 3 },
  logoutButton: {
    marginTop: 10,
    backgroundColor: "#404040",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold" },
});
