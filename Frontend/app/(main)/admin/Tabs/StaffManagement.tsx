import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function StaffManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("All");

  const [staffList, setStaffList] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);

  // Add staff form
  const [showAdd, setShowAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Dispatcher");
  // Edit form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("Dispatcher");

  const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/admin/staff`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        setStaffList([]);
        return;
      }
      const data = await res.json();
      setStaffList(data || []);
    } catch (e) {
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredStaff =
    filterRole === "All"
      ? staffList.filter((s) => s.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
      : staffList.filter((s) => s.role === filterRole && s.full_name.toLowerCase().includes(searchQuery.toLowerCase()));

  const submitAdd = async () => {
    if (!fullName || !password) return alert('Name and password required');
    const nameTrim = fullName.trim();
    const passTrim = password.trim();
    if (!nameTrim || !passTrim) return alert('Name and password required');
    try {
      const res = await fetch(`${baseUrl}/api/admin/staff`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: nameTrim, username: username || undefined, password: passTrim, role }),
      });
      if (!res.ok) {
        const t = await res.text();
        alert('Failed: ' + t);
        return;
      }
      await fetchStaff();
      setShowAdd(false);
      setFullName(''); setUsername(''); setPassword(''); setRole('Dispatcher');
    } catch (e) {
      alert('Error creating staff');
    }
  };

  const startEdit = (staff: any) => {
    setEditingId(staff.id);
    setEditFullName(staff.full_name || '');
    setEditUsername(staff.username || '');
    setEditRole(staff.role || 'Dispatcher');
    setEditPassword('');
    // ensure add form is hidden
    setShowAdd(false);
    // scroll to top if needed not implemented
  };

  const submitEdit = async () => {
    if (!editingId) return;
    const nameTrim = editFullName.trim();
    if (!nameTrim) return alert('Name required');
    try {
      const res = await fetch(`${baseUrl}/api/admin/staff/${editingId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: nameTrim, username: editUsername || undefined, role: editRole, password: editPassword || undefined }),
      });
      if (!res.ok) {
        const t = await res.text();
        alert('Failed updating staff: ' + t);
        return;
      }
      await fetchStaff();
      setEditingId(null);
      setEditFullName(''); setEditUsername(''); setEditPassword(''); setEditRole('Dispatcher');
    } catch (e) {
      alert('Error updating staff');
    }
  };

  const confirmDelete = (id: number) => {
    Alert.alert('Delete staff', `Delete staff id ${id}? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const res = await fetch(`${baseUrl}/api/admin/staff/${id}`, { method: 'DELETE', credentials: 'include' });
          if (!res.ok) {
            const t = await res.text();
            Alert.alert('Error', 'Failed deleting staff: ' + t);
            return;
          }
          await fetchStaff();
        } catch (e) {
          Alert.alert('Error', 'Error deleting staff');
        }
      } }
    ], { cancelable: true });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Staff Management</Text>
          <Text style={styles.subtitle}>Admin Coco</Text>
        </View>
        <View>
          <Text style={styles.dateText}>October 18, 2025</Text>
          <Text style={styles.dateText}>15:30 PM</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Table of Staff */}
      <Text style={styles.sectionTitle}>Table of Staff</Text>

  <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#4B4B4B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Name or User ID"
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity style={styles.filterButton} onPress={() => setShowAdd(!showAdd)}>
          <Text style={styles.filterButtonText}>{showAdd ? 'Cancel' : 'Add Staff to Roster'}</Text>
          <MaterialIcons name={showAdd ? 'close' : 'add'} size={22} color="#374728" />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={[styles.tableContainer, { marginBottom: 12 }]}>
          <Text style={styles.tableTitle}>Add Staff</Text>
          <TextInput style={styles.formInput} placeholder="Full name" value={fullName} onChangeText={setFullName} />
          <TextInput style={styles.formInput} placeholder="Username (optional)" value={username} onChangeText={setUsername} />
          <TextInput style={styles.formInput} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[styles.roleButton, role === 'Dispatcher' ? styles.roleButtonActive : {}]} onPress={() => setRole('Dispatcher')}><Text style={role === 'Dispatcher' ? styles.roleButtonTextActive : {}}>Dispatcher</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.roleButton, role === 'Cashier' ? styles.roleButtonActive : {}]} onPress={() => setRole('Cashier')}><Text style={role === 'Cashier' ? styles.roleButtonTextActive : {}}>Cashier</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.roleButton, role === 'BallHandler' ? styles.roleButtonActive : {}]} onPress={() => setRole('BallHandler')}><Text style={role === 'BallHandler' ? styles.roleButtonTextActive : {}}>BallHandler</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.roleButton, role === 'Serviceman' ? styles.roleButtonActive : {}]} onPress={() => setRole('Serviceman')}><Text style={role === 'Serviceman' ? styles.roleButtonTextActive : {}}>Serviceman</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.addButton, { marginTop: 10 }]} onPress={submitAdd}>
            <Text style={styles.addButtonText}>Create Staff</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={!!editingId} animationType="slide" transparent onRequestClose={() => setEditingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Staff Details</Text>
            <Text style={styles.modalLabel}>Player Name/ Nickname</Text>
            <TextInput style={styles.modalInput} placeholder="Enter Player's Name or Nickname" value={editFullName} onChangeText={setEditFullName} />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Role</Text>
            <TouchableOpacity style={styles.modalSelect} onPress={() => { /* keep simple - cycle roles */ const next = editRole === 'Dispatcher' ? 'Cashier' : editRole === 'Cashier' ? 'BallHandler' : editRole === 'BallHandler' ? 'Serviceman' : 'Dispatcher'; setEditRole(next as any); }}>
              <Text style={styles.modalSelectText}>{editRole}</Text>
            </TouchableOpacity>

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>User ID (Read Only)</Text>
            <View style={styles.readonlyInput}><Text>{editingId}</Text></View>

            <View style={{ flexDirection: 'row', marginTop: 18, justifyContent: 'space-between' }}>
              <Pressable style={styles.modalButton} onPress={submitEdit}>
                <Text style={styles.modalButtonText}>CONFIRM ASSIGNMENT</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, { backgroundColor: '#EEE', marginLeft: 10 }]} onPress={() => setEditingId(null)}>
                <Text style={[styles.modalButtonText, { color: '#333' }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Current Staff Roster Table */}
      <View style={styles.tableContainer}>
        <Text style={styles.tableTitle}>Current Staff Roster</Text>

        {/* Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerText, { flex: 2 }]}>Name</Text>
          <Text style={[styles.headerText, { flex: 2 }]}>Role</Text>
          <Text style={[styles.headerText, { flex: 2 }]}>User ID</Text>
          <Text style={[styles.headerText, { flex: 2 }]}>Actions</Text>
        </View>

        {/* Rows */}
        {filteredStaff.map((staff, i) => (
          <View key={staff.id ?? i} style={styles.tableRow}>
              <Text style={[styles.cellText, { flex: 2 }]}>{staff.full_name}</Text>
              <Text style={[styles.cellText, { flex: 2 }]}>{staff.role}</Text>
              <Text style={[styles.cellText, { flex: 2 }]}>{staff.id}</Text>
              <View style={[styles.cellActions, { flex: 2 }]}>
                <TouchableOpacity style={styles.editButton} onPress={() => startEdit(staff)}>
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeButton} onPress={() => confirmDelete(staff.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
        ))}
      </View>

      {/* Add Button */}
      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(!showAdd)}>
        <Text style={styles.addButtonText}>Add Staff to Roster</Text>
        <MaterialIcons name="add" size={20} color="#374728" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F3EE",
    padding: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#374728",
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
  },
  dateText: {
    textAlign: "right",
    fontSize: 12,
    color: "#555",
  },
  divider: {
    height: 1,
    backgroundColor: "#ccc",
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374728",
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 6,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#000",
    marginLeft: 6,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C9DABF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterButtonText: {
    fontSize: 14,
    color: "#374728",
    fontWeight: "500",
    marginRight: 4,
  },
  tableContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 20,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374728",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#E6EED4",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  headerText: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374728",
    textAlign: "left",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingVertical: 10,
  },
  cellText: {
    fontSize: 13,
    color: "#333",
  },
  cellActions: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  editButton: {
    backgroundColor: "#C9DABF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  removeButton: {
    backgroundColor: "#7E0000",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editText: {
    color: "#374728",
    fontWeight: "600",
  },
  removeText: {
    color: "#fff",
    fontWeight: "600",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "#C9DABF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: "#374728",
    fontWeight: "600",
    fontSize: 14,
    marginRight: 4,
  },
  formInput: {
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  roleButton: {
    backgroundColor: '#EEE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  }
  ,
  roleButtonActive: {
    backgroundColor: '#C9DABF',
    borderWidth: 1,
    borderColor: '#374728'
  },
  roleButtonTextActive: {
    color: '#12411A',
    fontWeight: '700'
  }
  ,
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#F4F8F3',
    borderRadius: 12,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#12411A', marginBottom: 8 },
  modalLabel: { fontSize: 13, color: '#666', marginBottom: 6 },
  modalInput: { backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  modalSelect: { backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12 },
  modalSelectText: { fontSize: 16, color: '#222' },
  readonlyInput: { backgroundColor: '#fff', borderRadius: 6, padding: 12 },
  modalButton: { backgroundColor: '#C6DFA4', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, flex: 1, alignItems: 'center' },
  modalButtonText: { color: '#12411A', fontWeight: '700' },
});
