import React, { useState, useEffect, useRef } from "react";
import {
  View, 
  Text,
  TextInput,
  TouchableOpacity,
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
  // Extended filter controls
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterType, setFilterType] = useState<'All' | 'ID' | 'Role' | 'Availability'>('All');
  const [idFilter, setIdFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'All' | 'Available' | 'Unavailable'>('All');

  const [staffList, setStaffList] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  // header info
  const [adminName, setAdminName] = useState<string>('Admin');
  const [now, setNow] = useState<Date>(new Date());

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
  const [showApprovedPopup, setShowApprovedPopup] = useState(false);
  const approvalTimerRef = useRef<any>(null);
  const [approvalMessage, setApprovalMessage] = useState<string>('Changes have been successfully made.');
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const measuredRowRef = useRef<boolean>(false);

  const baseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';

  useEffect(() => {
    fetchStaff();
    fetchAdminInfo();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchAdminInfo = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const name = data?.full_name || data?.name || data?.username || data?.displayName || 'Admin';
      setAdminName(name);
    } catch (e) {
      // ignore - keep default
    }
  };

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

  const filteredStaff = (() => {
    const q = (searchQuery || '').toLowerCase();
    // apply search first (search by name)
    let list = staffList.filter((s) => (s.full_name || '').toLowerCase().includes(q));

    // apply selected filter type
    if (filterType === 'Role' && filterRole && filterRole !== 'All') {
      list = list.filter((s) => s.role === filterRole);
    } else if (filterType === 'ID' && idFilter && idFilter.trim() !== '') {
      const idq = idFilter.trim().toLowerCase();
      list = list.filter((s) => String(s.id || '').toLowerCase().includes(idq));
    } else if (filterType === 'Availability' && availabilityFilter && availabilityFilter !== 'All') {
      // assume staff.available is a boolean. If it doesn't exist, this filter will be a no-op.
      const wantAvailable = availabilityFilter === 'Available';
      list = list.filter((s: any) => (typeof s.available === 'boolean' ? s.available === wantAvailable : true));
    }

    return list;
  })();

  // Pagination (client-side) - 5 items per page
  const [page, setPage] = useState<number>(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  // Reset page to 1 when filters/search or staff list change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterRole, staffList.length]);

  const paginatedStaff = filteredStaff.slice((page - 1) * pageSize, page * pageSize);

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
      // refresh and show acknowledgement popup
      await fetchStaff();
      setShowAdd(false);
      setFullName(''); setUsername(''); setPassword(''); setRole('Dispatcher');
      openApprovalPopup('Staff have been successfully added!.');
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
      // show approval popup with manual close (X) and 2s auto-close
      openApprovalPopup('Changes have been successfully made.');
    } catch (e) {
      alert('Error updating staff');
    }
  };

  // show confirmation overlay before performing submitEdit
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Remove-confirmation modal state
  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; full_name?: string; role?: string } | null>(null);

  // Opens the approval popup and starts a 2s auto-close timer. If the user
  // presses the X button the popup will close immediately and the timer
  // will be cleared. When the popup closes we refresh the staff list and
  // clear the edit form.
  const openApprovalPopup = (message?: string) => {
    if (message) setApprovalMessage(message);
    // ensure any existing timer is cleared
    if (approvalTimerRef.current) {
      clearTimeout(approvalTimerRef.current);
      approvalTimerRef.current = null;
    }
    setShowApprovedPopup(true);
    approvalTimerRef.current = setTimeout(() => {
      closeApprovalPopup();
    }, 2000);
  };

  const closeApprovalPopup = async () => {
    if (approvalTimerRef.current) {
      clearTimeout(approvalTimerRef.current);
      approvalTimerRef.current = null;
    }
    setShowApprovedPopup(false);
    try {
      await fetchStaff();
    } catch (e) {
      // ignore fetch errors here
    }
    setEditingId(null);
    setEditFullName(''); setEditUsername(''); setEditPassword(''); setEditRole('Dispatcher');
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (approvalTimerRef.current) {
        clearTimeout(approvalTimerRef.current);
        approvalTimerRef.current = null;
      }
    };
  }, []);

  const confirmDelete = (id: number) => {
    // Deprecated: we now use a custom modal. Keep function to remain compatible.
    setRemoveTarget({ id });
    setShowRemoveConfirmModal(true);
  };

  const performRemove = async () => {
    if (!removeTarget) return;
    const id = removeTarget.id;
    try {
      const res = await fetch(`${baseUrl}/api/admin/staff/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const t = await res.text();
        Alert.alert('Error', 'Failed deleting staff: ' + t);
        return;
      }
      // close remove modal then show acknowledgement popup
      setShowRemoveConfirmModal(false);
      setRemoveTarget(null);
      openApprovalPopup('Staff has been removed successfully.');
    } catch (e) {
      Alert.alert('Error', 'Error deleting staff');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Staff Management</Text>
          <Text style={styles.subtitle}>{adminName}</Text>
        </View>
        <View>
          <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
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
        <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)}>
          <Text style={styles.filterButtonText}>{filterType === 'All' ? 'Filter by Role (All)' : filterType === 'Role' ? `Filter: Role (${filterRole})` : filterType === 'ID' ? `Filter: ID` : filterType === 'Availability' ? `Filter: Availability (${availabilityFilter})` : 'Filter'}</Text>
          <MaterialIcons name="arrow-drop-down" size={22} color="#374728" />
        </TouchableOpacity>
      </View>

      {/* Filter modal */}
      <Modal visible={filterModalVisible} transparent animationType="fade" onRequestClose={() => setFilterModalVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Filter Staff</Text>

            <View style={{ marginTop: 8 }}>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>Filter Type</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.pageButton, filterType === 'All' ? styles.pageButtonActive : {}]} onPress={() => setFilterType('All')}>
                  <Text style={filterType === 'All' ? styles.pageButtonTextActive : styles.pageButtonText}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pageButton, filterType === 'Role' ? styles.pageButtonActive : {}]} onPress={() => setFilterType('Role')}>
                  <Text style={filterType === 'Role' ? styles.pageButtonTextActive : styles.pageButtonText}>Role</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pageButton, filterType === 'ID' ? styles.pageButtonActive : {}]} onPress={() => setFilterType('ID')}>
                  <Text style={filterType === 'ID' ? styles.pageButtonTextActive : styles.pageButtonText}>ID</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pageButton, filterType === 'Availability' ? styles.pageButtonActive : {}]} onPress={() => setFilterType('Availability')}>
                  <Text style={filterType === 'Availability' ? styles.pageButtonTextActive : styles.pageButtonText}>Availability</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* conditional controls */}
            {filterType === 'Role' && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: '700', marginBottom: 6 }}>Select Role</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Dispatcher', 'Cashier', 'BallHandler', 'Serviceman'].map((r) => (
                    <TouchableOpacity key={r} style={[styles.roleButton, filterRole === r ? styles.roleButtonActive : {}]} onPress={() => setFilterRole(r)}>
                      <Text style={filterRole === r ? styles.roleButtonTextActive : {}}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {filterType === 'ID' && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: '700', marginBottom: 6 }}>User ID contains</Text>
                <TextInput style={styles.formInput} placeholder="Enter ID fragment" value={idFilter} onChangeText={setIdFilter} />
              </View>
            )}

            {filterType === 'Availability' && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: '700', marginBottom: 6 }}>Availability</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.pageButton, availabilityFilter === 'All' ? styles.pageButtonActive : {}]} onPress={() => setAvailabilityFilter('All')}>
                    <Text style={availabilityFilter === 'All' ? styles.pageButtonTextActive : styles.pageButtonText}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.pageButton, availabilityFilter === 'Available' ? styles.pageButtonActive : {}]} onPress={() => setAvailabilityFilter('Available')}>
                    <Text style={availabilityFilter === 'Available' ? styles.pageButtonTextActive : styles.pageButtonText}>Available</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.pageButton, availabilityFilter === 'Unavailable' ? styles.pageButtonActive : {}]} onPress={() => setAvailabilityFilter('Unavailable')}>
                    <Text style={availabilityFilter === 'Unavailable' ? styles.pageButtonTextActive : styles.pageButtonText}>Unavailable</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <Pressable style={styles.cancelButton} onPress={() => { setFilterModalVisible(false); }}>
                <Text style={styles.cancelButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={() => { setFilterModalVisible(false); setPage(1); }}>
                <Text style={styles.confirmButtonText}>Apply</Text>
              </Pressable>
              <Pressable style={[styles.cancelButton, { backgroundColor: '#EEE' }]} onPress={() => { setFilterType('All'); setFilterRole('All'); setIdFilter(''); setAvailabilityFilter('All'); setFilterModalVisible(false); setPage(1); }}>
                <Text style={[styles.cancelButtonText, { color: '#333' }]}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      

      {/* Add Staff modal (replaces inline add form) */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Staff To Roster</Text>

            <Text style={[styles.modalLabel, { marginTop: 8 }]}>Player Name/ Nickname</Text>
            <TextInput style={styles.modalInput} placeholder="Enter Player's Name or Nickname" value={fullName} onChangeText={setFullName} />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Role</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {['Dispatcher', 'Cashier', 'BallHandler', 'Serviceman'].map((r) => (
                <TouchableOpacity key={r} style={[styles.roleButton, role === r ? styles.roleButtonActive : {}]} onPress={() => setRole(r)}>
                  <Text style={role === r ? styles.roleButtonTextActive : {}}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>User ID (Read Only)</Text>
            <View style={styles.readonlyInput}><Text>{'Will be generated'}</Text></View>

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Username (optional)</Text>
            <TextInput style={styles.modalInput} placeholder="Username (optional)" value={username} onChangeText={setUsername} />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Password</Text>
            <TextInput style={styles.modalInput} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />

            <View style={{ flexDirection: 'row', marginTop: 18, justifyContent: 'space-between' }}>
              <Pressable style={styles.modalButton} onPress={() => { submitAdd(); }}>
                <Text style={styles.modalButtonText}>CONFIRM ASSIGNMENT</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, { backgroundColor: '#EEE', marginLeft: 10 }]} onPress={() => { setShowAdd(false); setFullName(''); setUsername(''); setPassword(''); setRole('Dispatcher'); }}>
                <Text style={[styles.modalButtonText, { color: '#333' }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingId} animationType="slide" transparent onRequestClose={() => setEditingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Staff Details</Text>
            <Text style={styles.modalLabel}>Player Name/ Nickname</Text>
            <TextInput style={styles.modalInput} placeholder="Enter Player's Name or Nickname" value={editFullName} onChangeText={setEditFullName} />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Role</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {['Dispatcher', 'Cashier', 'BallHandler', 'Serviceman'].map((r) => (
                <TouchableOpacity key={r} style={[styles.roleButton, editRole === r ? styles.roleButtonActive : {}]} onPress={() => setEditRole(r)}>
                  <Text style={editRole === r ? styles.roleButtonTextActive : {}}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>User ID (Read Only)</Text>
            <View style={styles.readonlyInput}><Text>{editingId}</Text></View>

            <View style={{ flexDirection: 'row', marginTop: 18, justifyContent: 'space-between' }}>
              <Pressable style={styles.modalButton} onPress={() => setShowConfirmModal(true)}>
                <Text style={styles.modalButtonText}>CONFIRM ASSIGNMENT</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, { backgroundColor: '#EEE', marginLeft: 10 }]} onPress={() => setEditingId(null)}>
                <Text style={[styles.modalButtonText, { color: '#333' }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation overlay shown before performing the assignment */}
      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Confirm Changes</Text>
            <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
            <Text style={styles.confirmBody}>Do you want to confirm the changes you made? This may affect areas of operations. Please proceed with caution.</Text>
            <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable style={styles.cancelButton} onPress={() => setShowConfirmModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={() => { setShowConfirmModal(false); submitEdit(); }}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Approval popup shown after successful edit */}
      <Modal visible={showApprovedPopup} transparent animationType="fade" onRequestClose={() => closeApprovalPopup()}>
        <View style={styles.approvalOverlay}>
          {/* Close (X) button top-right */}
          <TouchableOpacity style={styles.approvalCloseButton} onPress={() => closeApprovalPopup()} accessibilityLabel="Close">
            <MaterialIcons name="close" size={20} color="#7E0000" />
          </TouchableOpacity>

          <View style={styles.approvalCard}>
            <Text style={styles.approvalCardTitle}>Report Notification</Text>
            <View style={styles.approvalDivider} />
            <Text style={styles.approvalCardBody}>{approvalMessage}</Text>
          </View>
        </View>
      </Modal>

      {/* Remove confirmation modal (custom styled) */}
      <Modal visible={showRemoveConfirmModal} transparent animationType="fade" onRequestClose={() => { setShowRemoveConfirmModal(false); setRemoveTarget(null); }}>
        <View style={styles.approvalOverlay}>
          <View style={styles.removeCard}>
            <Text style={styles.removeTitle}>Confirm Staff Removal</Text>
            <View style={styles.removeDivider} />
            <Text style={styles.removeBody}>Are you sure you want to remove {removeTarget?.role} {removeTarget?.full_name ? `(${removeTarget.full_name})` : ''}?</Text>
            <View style={{ height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <Pressable style={styles.cancelButton} onPress={() => { setShowRemoveConfirmModal(false); setRemoveTarget(null); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={() => performRemove()}>
                <Text style={styles.confirmButtonText}>Remove</Text>
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

        {/* Rows - fixed-size body so pagination transitions are smooth */}
        {/* compute row height (if measured) otherwise fallback to 56 */}
        {(() => {
          const computedRowHeight = rowHeight ?? 56;
          return (
            <View style={[styles.tableBody, { minHeight: computedRowHeight * pageSize }]}>
              {paginatedStaff.map((staff, i) => (
                <View
                  key={staff.id ?? i}
                  style={styles.tableRow}
                  onLayout={(e) => {
                    // measure the first rendered real row only once
                    if (!measuredRowRef.current) {
                      const h = e.nativeEvent.layout.height;
                      if (h && h > 10) {
                        setRowHeight(h);
                        measuredRowRef.current = true;
                      }
                    }
                  }}
                >
              <Text style={[styles.cellText, { flex: 2 }]}>{staff.full_name}</Text>
              <Text style={[styles.cellText, { flex: 2 }]}>{staff.role}</Text>
              <Text style={[styles.cellText, { flex: 2 }]}>{staff.id}</Text>
              <View style={[styles.cellActions, { flex: 2 }]}>
                <TouchableOpacity style={styles.editButton} onPress={() => startEdit(staff)}>
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeButton} onPress={() => { setRemoveTarget({ id: staff.id, full_name: staff.full_name, role: staff.role }); setShowRemoveConfirmModal(true); }}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
      ))}

      {/* Render empty placeholder rows so the container height is identical for every page */}
              {Array.from({ length: Math.max(0, pageSize - paginatedStaff.length) }).map((_, idx) => (
                <View key={`empty-${idx}`} style={[styles.tableRowEmpty, { height: computedRowHeight }]}> 
                  <Text style={{ color: 'transparent' }}></Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      {/* Pagination controls */}
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.pagePrevButton, page === 1 ? styles.pageNavDisabled : {}]}
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          <Text style={styles.pagePrevText}>Previous</Text>
        </TouchableOpacity>

        <View style={styles.pageList}>
          {Array.from({ length: totalPages }).map((_, idx) => {
            const p = idx + 1;
            return (
              <TouchableOpacity key={p} style={[styles.pageButton, page === p ? styles.pageButtonActive : {}]} onPress={() => setPage(p)}>
                <Text style={page === p ? styles.pageButtonTextActive : styles.pageButtonText}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.pageNextButton, page === totalPages ? styles.pageNavDisabled : {}]}
          onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          <Text style={styles.pageNextText}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* Add Button */}
      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Text style={styles.addButtonText}>Add Staff to Roster</Text>
        <MaterialIcons name="add" size={20} color="#374728" />
      </TouchableOpacity>
    </View>
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
    textAlign: "center",

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
    textAlign: "center",
  },
  cellActions: {
    flexDirection: "row",
    justifyContent: "center",
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
  approvalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  approvalBox: { backgroundColor: '#fff', padding: 30, borderRadius: 12, minWidth: 220, alignItems: 'center' },
  approvalText: { fontSize: 28, fontWeight: '800', color: '#12411A' },
  approvalCloseButton: { position: 'absolute', top: 40, right: 30, backgroundColor: '#fff', borderRadius: 20, padding: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 6 },
  approvalCard: { width: '88%', maxWidth: 560, backgroundColor: '#F3FBF1', borderRadius: 10, paddingVertical: 18, paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 6, borderWidth: 1, borderColor: '#E6F3E3' },
  approvalCardTitle: { fontSize: 18, fontWeight: '800', color: '#123B14', marginBottom: 8 },
  approvalDivider: { height: 1, backgroundColor: '#D7EAD6', marginVertical: 10 },
  approvalCardBody: { fontSize: 14, color: '#6B6B6B', lineHeight: 20 },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  /* Pagination */
  paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  pageNavButton: { backgroundColor: '#F0F3EE', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  pageNavDisabled: { opacity: 0.5 },
  pageNavText: { color: '#12411A', fontWeight: '700' },
  pageList: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  pageButton: { backgroundColor: '#FFF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#E6E6E6' },
  pageButtonActive: { backgroundColor: '#C9DABF', borderColor: '#12411A' },
  pageButtonText: { color: '#333', fontWeight: '700' },
  pageButtonTextActive: { color: '#12411A', fontWeight: '800' },
  pagePrevButton: { backgroundColor: '#17321d', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, marginRight: 12 },
  pagePrevText: { color: '#fff', fontWeight: '700' },
  pageNextButton: { backgroundColor: '#C9DABF', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginLeft: 12 },
  pageNextText: { color: '#12411A', fontWeight: '700' },
  confirmBox: { width: '90%', maxWidth: 520, backgroundColor: '#F4F8F3', borderRadius: 10, padding: 18 },
  removeCard: { width: '88%', maxWidth: 560, backgroundColor: '#FEFEFB', borderRadius: 10, paddingVertical: 18, paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 6, borderWidth: 1, borderColor: '#E9E6E3' },
  removeTitle: { fontSize: 20, fontWeight: '800', color: '#7E0000', marginBottom: 8 },
  removeDivider: { height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 },
  removeBody: { fontSize: 15, color: '#444', marginBottom: 6 },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: '#12411A', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: '#666', marginBottom: 8 },
  cancelButton: { backgroundColor: '#C9DABF', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginRight: 8 },
  cancelButtonText: { color: '#12411A', fontWeight: '700' },
  confirmButton: { backgroundColor: '#7E0000', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  confirmButtonText: { color: '#fff', fontWeight: '700' },
  tableBody: { minHeight: 5 * 40, justifyContent: 'flex-start' },
  tableRowEmpty: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 10, height: 56 },
});
