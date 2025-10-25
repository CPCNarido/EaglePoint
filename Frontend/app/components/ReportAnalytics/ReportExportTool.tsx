import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";

const ReportExportTool: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState("Full Report Pack");

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Report Export Tool</Text>
      <View style={styles.row}>
        <Picker
          selectedValue={selectedReport}
          style={styles.picker}
          onValueChange={(v) => setSelectedReport(v)}
        >
          <Picker.Item label="Full Report Pack" value="Full Report Pack" />
          <Picker.Item label="Summary Report" value="Summary Report" />
          <Picker.Item label="Detailed Report" value="Detailed Report" />
        </Picker>

        <TouchableOpacity style={styles.downloadBtn}>
          <Text style={styles.downloadText}>Download</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ReportExportTool;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  picker: {
    flex: 1,
    height: 40,
    marginRight: 10,
  },
  downloadBtn: {
    backgroundColor: "#4c5b32",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  downloadText: {
    color: "#fff",
    fontWeight: "600",
  },
});
