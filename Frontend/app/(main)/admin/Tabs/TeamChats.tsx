import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, ActivityIndicator } from 'react-native';

type ChatRoom = { chat_id?: number; name?: string | null; is_group?: boolean; employee_id?: number; role?: string };
type ChatMessage = { message_id?: number; tempId?: string; chat_id: number; sender_name?: string; sender_id?: number; content: string; sent_at?: string; status?: 'pending' | 'sent' | 'failed' };

export default function TeamChats() {
  const [adminName, setAdminName] = useState<string>('Admin');
  // store the logged user's employee id explicitly
  const [adminEmployeeId, setAdminEmployeeId] = useState<number | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [selectedChat, setSelectedChat] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [composer, setComposer] = useState('');
  const listRef = useRef<any>(null);
  const prevMessagesCount = useRef(0);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    fetchAdmin();
    fetchRooms();
    return () => { clearInterval(t); };
  }, []);

  // fetch messages once when the selected chat changes (no polling)
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    (async () => {
      if (selectedChat.employee_id) {
        await fetchDirectMessages(selectedChat.employee_id);
      } else if (typeof selectedChat.chat_id === 'number') {
        await fetchMessages(selectedChat.chat_id);
      }
    })();
  }, [selectedChat]);

  const getBaseUrl = async () => {
    let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
    try {
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
      if (override) baseUrl = override;
    } catch {}
    return baseUrl;
  };

  const getAuthHeaders = async (extraHeaders: Record<string, string> = {}) => {
    try {
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return headers;
    } catch {
      return { 'Content-Type': 'application/json', ...extraHeaders };
    }
  };

  const fetchAdmin = async () => {
    try {
      const baseUrl = await getBaseUrl();
      // include auth headers when fetching admin info so we get the employee id
      const headers = await getAuthHeaders();
      const res = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', credentials: 'include', headers });
      if (!res.ok) return;
      const d = await res.json();
      try { console.log('fetchAdmin response', d); } catch {}
  const name = d?.full_name || d?.name || d?.username || 'Admin';
  setAdminName(name);
  // prefer employee_id when available (explicit requirement)
  const id = Number(d?.employee_id ?? d?.id ?? d?.userId ?? null);
  if (id && !Number.isNaN(id)) setAdminEmployeeId(id);
    } catch {
      // ignore
    }
  };

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const baseUrl = await getBaseUrl();
      const roomsAcc: ChatRoom[] = [];

      // Fetch staff list and append as direct chat entries (roster is staff-only)
      try {
        const headers2 = await getAuthHeaders();
        const r2 = await fetch(`${baseUrl}/api/admin/staff`, { method: 'GET', credentials: 'include', headers: headers2 });
        if (r2.ok) {
          const staff = await r2.json();
          if (Array.isArray(staff) && staff.length) {
            const mapped = staff.map((s: any) => ({ employee_id: Number(s.id ?? s.employee_id), name: s.full_name ?? s.username ?? `User ${s.id}`, role: s.role ?? '' }));
            roomsAcc.push(...mapped);
          }
        }
      } catch {}

      // dedupe rooms by employee_id and remove self (show only other staff)
      const dedupeRooms = (arr: ChatRoom[]) => {
        const map = new Map<number | string, ChatRoom>();
        for (const it of arr) {
          const key = it.employee_id ? it.employee_id : `chat-${it.chat_id ?? 'unknown'}`;
          if (!map.has(key)) map.set(key, it);
        }
  return Array.from(map.values()).filter((r) => !(r.employee_id && adminEmployeeId && r.employee_id === adminEmployeeId));
      };

      const deduped = dedupeRooms(roomsAcc);
      setRooms(deduped);
      // auto-select first staff by default
      if (deduped.length) setSelectedChat(deduped[0]);
    } catch {}
    finally { setLoadingRooms(false); }
  };

  const fetchMessages = async (chatId: number) => {
    setLoadingMessages(true);
    try {
      const baseUrl = await getBaseUrl();
      const endpoints = [
        `/api/admin/chats/${chatId}/messages`,
        `/api/chats/${chatId}/messages`,
        `/api/chats/${chatId}`,
      ];
      for (const ep of endpoints) {
        try {
          const headers = await getAuthHeaders();
          const r = await fetch(`${baseUrl}${ep}`, { method: 'GET', credentials: 'include', headers });
          if (!r.ok) continue;
          const d = await r.json();
          const msgs = Array.isArray(d) ? d : (d?.messages ?? d?.chatMessages ?? []);
          if (Array.isArray(msgs)) {
            // normalize messages; mark messages as from current admin when sender_id matches adminId
            // or when sender_name matches adminName (fallback)
            const normalized = msgs.map((m: any) => {
              const sentAt = m.sent_at ?? m.sentAt ?? m.created_at ?? new Date().toISOString();
              let senderId = Number(m.sender_id ?? m.sender?.id ?? m.sender?.employee_id ?? null) || undefined;
              let senderName = m.sender_name ?? m.sender?.full_name ?? m.senderUsername ?? 'Unknown';
              // Strict ownership: only trust server-provided senderId. Do not infer ownership by name/role.
              return {
                message_id: m.message_id ?? m.id,
                chat_id: chatId,
                sender_name: senderName,
                sender_id: senderId,
                content: m.content,
                sent_at: sentAt,
              } as ChatMessage;
            });
            setMessages(normalized);
            return;
          }
        } catch {}
      }
      setMessages([]);
    } catch {}
    finally { setLoadingMessages(false); }
  };

  const fetchDirectMessages = async (employeeId: number) => {
    setLoadingMessages(true);
    try {
      const baseUrl = await getBaseUrl();
      const headers = await getAuthHeaders();
      const r = await fetch(`${baseUrl}/api/admin/chats/direct/${employeeId}/messages`, { method: 'GET', credentials: 'include', headers });
      if (!r.ok) { setMessages([]); return; }
      const d = await r.json();
          if (Array.isArray(d)) {
        const normalized = d.map((m: any) => {
          const sentAt = m.sent_at ?? m.sentAt ?? m.created_at ?? new Date().toISOString();
          let senderId = Number(m.sender_id ?? m.sender?.id ?? m.sender?.employee_id ?? null) || undefined;
          let senderName = m.sender_name ?? (m.sender?.full_name ?? 'Unknown');
          // Strict ownership: only trust server-provided senderId. Do not infer ownership by name/role.
          if (senderId === undefined) {
            try { console.log('fetchDirectMessages: raw message missing sender_id', m); } catch {}
          }
          return {
            message_id: m.message_id ?? m.id,
            chat_id: m.chat_id ?? 0,
            sender_name: senderName,
            sender_id: senderId,
            content: m.content,
            sent_at: sentAt,
          } as ChatMessage;
        });
        setMessages(normalized);
        return;
      }
      setMessages([]);
    } catch {}
    finally { setLoadingMessages(false); }
  };

  // auto-scroll to end when new messages are added
  useEffect(() => {
    try {
      if (messages.length > prevMessagesCount.current) {
        // scroll to end
        if (listRef.current && listRef.current.scrollToEnd) {
          listRef.current.scrollToEnd({ animated: true });
        } else if (listRef.current && listRef.current.scrollToOffset) {
          listRef.current.scrollToOffset({ offset: 99999, animated: true });
        }
      }
    } catch {}
    prevMessagesCount.current = messages.length;
  }, [messages]);

  const sendMessage = async (chatId: number, content: string) => {
    if (!content || content.trim().length === 0) return false;
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tempMsg: ChatMessage = { tempId, chat_id: chatId, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: new Date().toISOString(), status: 'pending' };
    setMessages((prev) => [...prev, tempMsg]);
    try {
      const baseUrl = await getBaseUrl();
      const endpoints = [
        `/api/admin/chats/${chatId}/messages`,
        `/api/chats/${chatId}/messages`,
        `/api/admin/chats/${chatId}/send`,
      ];
      for (const ep of endpoints) {
        try {
          const headers = await getAuthHeaders();
          const r = await fetch(`${baseUrl}${ep}`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ content }) });
          if (!r.ok) continue;
          const m = await r.json();
          // replace temp message with server message
          const serverSentAt = m?.sent_at ?? new Date().toISOString();
          setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { message_id: m?.message_id ?? undefined, chat_id: chatId, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: serverSentAt, status: 'sent' } : it)));
          try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('overview:updated')); } catch {}
          // re-fetch to get canonical message(s) from db
          await fetchMessages(chatId);
          return true;
        } catch {}
      }
    } catch {}
    // mark failed
    setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'failed' } : it)));
    return false;
  };

  const sendDirectMessage = async (employeeId: number, content: string) => {
    if (!content || content.trim().length === 0) return false;
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tempMsg: ChatMessage = { tempId, chat_id: 0, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: new Date().toISOString(), status: 'pending' };
    setMessages((prev) => [...prev, tempMsg]);
    try {
      const baseUrl = await getBaseUrl();
      const headers = await getAuthHeaders();
      const r = await fetch(`${baseUrl}/api/admin/chats/direct/${employeeId}/messages`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ content }) });
      if (!r.ok) {
        setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'failed' } : it)));
        return false;
      }
  const m = await r.json();
  const serverSentAt = m?.sent_at ?? new Date().toISOString();
  setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { message_id: m?.message_id ?? undefined, chat_id: m?.chat_id ?? m?.chatId ?? 0, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: serverSentAt, status: 'sent' } : it)));
  // Re-fetch conversation to pick up DB record (ownership will be resolved by sender_id or sender_name fallback)
      try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('overview:updated')); } catch {}
      // re-fetch conversation to pick up DB record
      await fetchDirectMessages(employeeId);
      return true;
    } catch {
      setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'failed' } : it)));
      return false;
    }
  };

  const retryMessage = async (tempId: string) => {
    const m = messages.find((x) => x.tempId === tempId);
    if (!m) return;
    // remove the failed temp message, then resend (send* will append a new temp)
    setMessages((prev) => prev.filter((it) => it.tempId !== tempId));
    if (selectedChat) {
      if (selectedChat.chat_id === 0) {
        // broadcast disabled in UI per request; do nothing
      } else if (selectedChat.employee_id) {
        await sendDirectMessage(selectedChat.employee_id, m.content);
      } else if (selectedChat.chat_id) {
        await sendMessage(selectedChat.chat_id, m.content);
      }
    }
  };

  const sendBroadcast = async (_content: string) => {
    // Per user request: do not wire the red urgent button to any function here.
    return false;
  };

  const onSendPressed = async () => {
    if (!selectedChat) return;
    const text = composer.trim();
    if (!text) return;
    setComposer('');
    // if chat_id === 0 treat as broadcast (but broadcast button is intentionally disabled)
    if (selectedChat.chat_id === 0) {
      // no-op: broadcasts are intentionally not invoked here
      return;
    } else if (selectedChat.employee_id) {
      await sendDirectMessage(selectedChat.employee_id, text);
    } else if (selectedChat.chat_id) {
      await sendMessage(selectedChat.chat_id, text);
    }
  };

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <TouchableOpacity
      style={[styles.roomCard, (selectedChat && ((item.employee_id && selectedChat.employee_id === item.employee_id) || (item.chat_id && selectedChat.chat_id === item.chat_id))) ? styles.roomCardActive : null]}
      onPress={() => setSelectedChat(item)}
    >
      <Text style={styles.roomName}>{item.name ?? (item.employee_id ? item.name : `Chat ${item.chat_id}`)}</Text>
      <Text style={styles.roomMeta}>{item.employee_id ? (item.role ?? 'User') : (item.is_group ? 'Group' : 'Chat')}</Text>
    </TouchableOpacity>
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => {
  const fromMe = (item.sender_id !== undefined && adminEmployeeId !== null) ? item.sender_id === adminEmployeeId : (item.sender_name === adminName);
    return (
      <View style={[styles.messageRow, fromMe ? styles.messageRowRight : styles.messageRowLeft]}>
        {!fromMe && <Text style={styles.messageSender}>{item.sender_name}</Text>}
        <View style={[styles.messageBubble, fromMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
          <Text style={fromMe ? styles.messageTextMe : styles.messageTextOther}>{item.content}</Text>
          {item.status === 'pending' && <ActivityIndicator size="small" color="#666" style={{ marginTop: 6 }} />}
          {item.status === 'failed' && (
            <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
              <Text style={{ color: '#b00', marginRight: 8, fontSize: 12 }}>Failed to send</Text>
              <TouchableOpacity onPress={() => item.tempId && retryMessage(item.tempId)} style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#eee', borderRadius: 6 }}>
                <Text style={{ color: '#333', fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={styles.messageTime}>{item.sent_at ? new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Team Chats</Text>
          <Text style={styles.subtitle}>{adminName}</Text>
        </View>
        <View>
          <Text style={styles.dateText}>{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          <Text style={styles.dateText}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      <View style={styles.bodyRow}>
        <View style={styles.rosterColumn}>
          <Text style={styles.rosterTitle}>Chat Roster</Text>
          {loadingRooms ? <ActivityIndicator /> : (
            <FlatList
              data={rooms}
              renderItem={renderRoom}
              keyExtractor={(r) => (r.employee_id ? `emp-${r.employee_id}` : `chat-${r.chat_id ?? 'unknown'}`)}
              style={styles.rosterList}
            />
          )}
          <TouchableOpacity style={styles.urgentButton} onPress={undefined} disabled={true}>
            <Text style={styles.urgentText}>Send to All (Urgent)</Text>
          </TouchableOpacity>
          
          {showDebug && (
            <ScrollView style={styles.debugPanel}>
              <Text style={styles.debugTitle}>Rooms (deduped)</Text>
              <Text style={styles.debugBody}>{JSON.stringify(rooms, null, 2)}</Text>
            </ScrollView>
          )}
        </View>

        <View style={styles.chatColumn}>
          <Text style={styles.chatTitle}>{selectedChat ? (selectedChat.name ?? 'Chat') : 'Select a chat'}</Text>
          <View style={styles.chatWindow}>
            {loadingMessages ? <ActivityIndicator /> : (
                  <FlatList
                    ref={listRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(m, idx) => String(m.tempId ?? m.message_id ?? idx)}
                  />
            )}
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.composerRow}>
            <TextInput value={composer} onChangeText={setComposer} placeholder="Type your message in here" style={styles.composerInput} />
            <TouchableOpacity style={styles.sendButton} onPress={onSendPressed}><Text style={styles.sendIcon}>➤</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F6F2', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700', color: '#2E3B2B' },
  subtitle: { color: '#666', marginTop: 6 },
  dateText: { textAlign: 'right', fontSize: 12, color: '#555' },
  divider: { height: 1, backgroundColor: '#D6D6D6', marginVertical: 12 },
  bodyRow: { flexDirection: 'row', gap: 12 },
  rosterColumn: { width: 320 },
  rosterTitle: { fontWeight: '700', marginBottom: 8 },
  rosterList: { marginBottom: 12 },
  roomCard: { backgroundColor: '#F8FBF6', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EDEFE8' },
  roomCardActive: { backgroundColor: '#E9F6EE', borderColor: '#C9DABF' },
  roomName: { fontWeight: '700', color: '#27421A' },
  roomMeta: { color: '#7A7A7A', fontSize: 12, marginTop: 4 },
  urgentButton: { marginTop: 8, backgroundColor: '#7E0000', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  urgentText: { color: '#fff', fontWeight: '700' },
  debugToggle: { marginTop: 8, backgroundColor: '#EEE', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  debugToggleText: { color: '#333', fontWeight: '700' },
  debugPanel: { marginTop: 8, backgroundColor: '#0f1720', padding: 8, borderRadius: 6, maxHeight: 240 },
  debugTitle: { color: '#fff', fontWeight: '800', marginBottom: 6 },
  debugBody: { color: '#ddd', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 12 },
  chatColumn: { flex: 1, marginLeft: 12, minHeight: 400, backgroundColor: '#fff', borderRadius: 10, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, elevation: 2 },
  chatTitle: { fontWeight: '700', marginBottom: 8 },
  chatWindow: { flex: 1, minHeight: 240, maxHeight: 720, padding: 8 },
  messageRow: { marginVertical: 6 },
  messageRowLeft: { alignItems: 'flex-start' },
  messageRowRight: { alignItems: 'flex-end' },
  messageSender: { fontSize: 12, color: '#666', marginBottom: 4 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 8 },
  messageBubbleMe: { backgroundColor: '#E9EEF2', alignSelf: 'flex-end' },
  messageBubbleOther: { backgroundColor: '#F1F7F0', alignSelf: 'flex-start' },
  messageTextMe: { color: '#1B2B1C' },
  messageTextOther: { color: '#1B2B1C' },
  messageTime: { fontSize: 11, color: '#999', marginTop: 4 },
  composerRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EDEDED', paddingTop: 8, marginTop: 8 },
  composerInput: { flex: 1, backgroundColor: '#F6F6F6', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#E8E8E8' },
  sendButton: { marginLeft: 8, backgroundColor: '#2E7D32', padding: 12, borderRadius: 6 },
  sendIcon: { color: '#fff', fontWeight: '700' },
});
