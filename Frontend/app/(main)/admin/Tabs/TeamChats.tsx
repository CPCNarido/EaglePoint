import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Presence from '../../../lib/presence';
import { isServicemanRole } from '../../utils/staffHelpers';
import { View, Text, ScrollView, SectionList, StyleSheet, Platform, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, ActivityIndicator, useWindowDimensions, Keyboard } from 'react-native';

type ChatRoom = { chat_id?: number; name?: string | null; is_group?: boolean; employee_id?: number; role?: string; online?: boolean };
type ChatMessage = { message_id?: number; tempId?: string; chat_id: number; sender_name?: string; sender_id?: number; content: string; sent_at?: string; status?: 'pending' | 'sent' | 'failed' };

export default function TeamChats() {
  const [adminName, setAdminName] = useState<string>('Admin');
  // store the logged user's employee id explicitly
  const [adminEmployeeId, setAdminEmployeeId] = useState<number | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [showOnlineOnly, setShowOnlineOnly] = useState<boolean>(false);

  // compute role counts for an "Online users" quick section (derived from rooms list)
  // Each role maps to an object with total and online counts.
  const roleCounts = React.useMemo(() => {
    const counts: Record<string, { total: number; online: number }> = {};
    for (const r of rooms) {
      if (!r.employee_id) continue;
      const role = (r.role ?? 'Other') as string;
      if (!counts[role]) counts[role] = { total: 0, online: 0 };
      counts[role].total += 1;
      if (r.online) counts[role].online += 1;
    }
    return counts;
  }, [rooms, rosterSearch, showOnlineOnly]);

  const [selectedChat, setSelectedChat] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [composer, setComposer] = useState('');
  const [lastPreview, setLastPreview] = useState<Record<string, string>>({});
  
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const listKey = selectedChat ? (selectedChat.employee_id ? `emp-${selectedChat.employee_id}` : `chat-${selectedChat.chat_id}`) : 'none';
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const [unseenCounts, setUnseenCounts] = useState<Record<string, number>>({});
  const [loadingEarlier, setLoadingEarlier] = useState<boolean>(false);
  const { height: windowHeight } = useWindowDimensions();
  // Strict percentage of viewport: 60% of window height (no min/max)
  const rosterHeight = Math.floor(windowHeight * 0.5);
  const prevMessagesCount = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  // buffered outgoing messages that have been sent over WS but not yet persisted
  const outgoingBufferRef = useRef<any[]>([]);
  // keep a ref to the selected chat so socket handlers don't close over stale state
  const selectedChatRef = useRef<ChatRoom | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting'|'open'|'closed'|'error'|'disabled'>('connecting');
  const [bufferedCount, setBufferedCount] = useState<number>(0);
  const retryCountRef = useRef<number>(0);
  const reconnectTimerRef = useRef<any>(null);
  const prevSelectedChatRef = useRef<ChatRoom | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  void setShowDebug;

  // Track keyboard and composer sizes so the chat list keeps enough bottom
  // padding to avoid messages being hidden below the composer (especially
  // on Android where KeyboardAvoidingView behavior may not push the list).
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
  const [composerHeight, setComposerHeight] = useState<number>(0);

  useEffect(() => {
    // On mount: keep the clock ticking, fetch admin and then load the roster.
    const t = setInterval(() => setNow(new Date()), 1000);
    void t;
    (async () => {
      try {
        const id = await fetchAdmin();
        // pass the freshly-obtained id into fetchRooms so the initial fetch can
        // immediately exclude the logged user without waiting for state update.
        await fetchRooms(id ?? null);
          const connectWebSocket = async () => {
            if (!adminEmployeeId) return;
            setWsStatus('connecting');
            try {
              // Prefer global Presence socket when available (app-wide connection)
              try {
                const globalSocket = Presence.getSocket && Presence.getSocket();
                if (globalSocket) {
                  // detach any previous handlers we attached here
                  try { globalSocket.off('connect'); globalSocket.off('disconnect'); globalSocket.off('connect_error'); globalSocket.off('message:new'); } catch (_e) { void _e; }
                  socketRef.current = globalSocket as any;
                  // attach light handlers so UI status reflects connection
                  globalSocket.on('connect', () => { retryCountRef.current = 0; setWsStatus('open'); });
                  globalSocket.on('disconnect', (reason: any) => { setWsStatus('closed'); });
                  globalSocket.on('connect_error', (err: any) => { setWsStatus('error'); });
                  // forward message:new from global socket into the same handler used previously
                  globalSocket.on('message:new', (d: any) => {
                    try {
                      const payload = d?.message ? d.message : d;
                      if (!payload) return;
                      const m = payload;
                      const incoming: ChatMessage = {
                        message_id: m.message_id,
                        chat_id: m.chat_id ?? 0,
                        sender_id: m.sender_id ?? undefined,
                        sender_name: m.sender_name ?? 'Unknown',
                        content: m.content ?? '',
                        sent_at: m.sent_at ?? new Date().toISOString(),
                      };
                      const currentSelected = selectedChatRef.current;
                      if (currentSelected) {
                        if (currentSelected.chat_id && incoming.chat_id === currentSelected.chat_id) { setMessages((prev) => [...prev, incoming]); try { setLastPreview((p) => ({ ...p, [`chat-${incoming.chat_id}`]: String(incoming.content).slice(0, 80) })); } catch (_e) { void _e; } return; }
                        if (currentSelected.employee_id && incoming.sender_id === currentSelected.employee_id) { setMessages((prev) => [...prev, incoming]); try { setLastPreview((p) => ({ ...p, [`emp-${currentSelected.employee_id}`]: String(incoming.content).slice(0, 80) })); } catch (_e) { void _e; } return; }
                      }
                      try { const key = incoming.chat_id ? `chat-${incoming.chat_id}` : `emp-${incoming.sender_id}`; setLastPreview((prev) => ({ ...prev, [key]: String(incoming.content).slice(0, 80) })); setUnseenCounts((prev) => ({ ...(prev || {}), [key]: (prev?.[key] ?? 0) + 1 })); } catch (_e) { void _e; }
                    } catch (_e) { void _e; }
                  });
                  // reflect current connection state
                  setWsStatus(globalSocket.connected ? 'open' : 'connecting');
                  return;
                }
              } catch (_e) { void _e; }

              // Fallback: create a local socket (previous behavior)
              const baseUrl = await getBaseUrl();
              // read token from async storage if available
              // @ts-ignore
              const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
              const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
              const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;

              const socketUrl = baseUrl.replace(/\/$/, '');
              try {
                if (socketRef.current) { try { socketRef.current.disconnect(); } catch (_e) { void _e; } socketRef.current = null; }
                const opts: any = { transports: ['websocket'], autoConnect: true, reconnection: true, auth: {} };
                if (token) opts.auth.token = token;
                opts.query = { employeeId: String(adminEmployeeId) };
                const socket = io(socketUrl, opts);
                socketRef.current = socket;
                socket.on('connect', () => { retryCountRef.current = 0; setWsStatus('open'); });
                socket.on('disconnect', (reason: any) => { setWsStatus('closed'); });
                socket.on('connect_error', (err: any) => { setWsStatus('error'); });
                socket.on('message:new', (d: any) => {
                  try {
                    const payload = d?.message ? d.message : d;
                    if (!payload) return;
                    const m = payload;
                    const incoming: ChatMessage = {
                      message_id: m.message_id,
                      chat_id: m.chat_id ?? 0,
                      sender_id: m.sender_id ?? undefined,
                      sender_name: m.sender_name ?? 'Unknown',
                      content: m.content ?? '',
                      sent_at: m.sent_at ?? new Date().toISOString(),
                    };
                    const currentSelected = selectedChatRef.current;
                    if (currentSelected) {
                      if (currentSelected.chat_id && incoming.chat_id === currentSelected.chat_id) { setMessages((prev) => [...prev, incoming]); try { setLastPreview((p) => ({ ...p, [`chat-${incoming.chat_id}`]: String(incoming.content).slice(0, 80) })); } catch (_e) { void _e; } return; }
                      if (currentSelected.employee_id && incoming.sender_id === currentSelected.employee_id) { setMessages((prev) => [...prev, incoming]); try { setLastPreview((p) => ({ ...p, [`emp-${currentSelected.employee_id}`]: String(incoming.content).slice(0, 80) })); } catch (_e) { void _e; } return; }
                    }
                    try { const key = incoming.chat_id ? `chat-${incoming.chat_id}` : `emp-${incoming.sender_id}`; setLastPreview((prev) => ({ ...prev, [key]: String(incoming.content).slice(0, 80) })); setUnseenCounts((prev) => ({ ...(prev || {}), [key]: (prev?.[key] ?? 0) + 1 })); } catch (_e) { void _e; }
                  } catch (_e) { void _e; }
                });
              } catch (_e) { socketRef.current = null; setWsStatus('disabled'); }
            } catch (_e) { setWsStatus('error'); }
          };

          let cancelled = false;
          void cancelled;
          connectWebSocket();

          return () => {
            cancelled = true;
            try {
              // flush any buffered outgoing messages when component unmounts
              (async () => { try { await flushBufferedMessages(); } catch (_e) { void _e; } })();
              if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
              if (socketRef.current) { try { socketRef.current.disconnect(); } catch (_e) { void _e; } socketRef.current = null; }
            } catch (_e) { void _e; };
          };
      } catch (_e) { void _e; }
    })();

    return () => {
      try {
        // flush any buffered outgoing messages when component unmounts
        (async () => { try { await flushBufferedMessages(); } catch (_e) { void _e; } })();
        if (socketRef.current) { try { socketRef.current.disconnect(); } catch (_e) { void _e; } socketRef.current = null; }
      } catch (_e) { void _e; };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminEmployeeId]);

  // Persist buffered outgoing messages for the previous selected chat when user switches chats
  useEffect(() => {
    (async () => {
      try {
        const prev = prevSelectedChatRef.current;
        if (prev) {
          // flush messages that were buffered for the previous chat
          if (prev.employee_id) await flushBufferedMessages({ employeeId: prev.employee_id });
          else if (prev.chat_id !== undefined) await flushBufferedMessages({ chat_id: prev.chat_id });
        }
          } catch (_e) { void _e; /* ignore flush errors */ }
      prevSelectedChatRef.current = selectedChat;
    })();
  }, [selectedChat]);

  // Flush outgoingBufferRef to server; filter optional selector to persist only for a specific chat/employee
  const flushBufferedMessages = async (selector?: { chat_id?: number; employeeId?: number }) => {
    try {
      const buf = outgoingBufferRef.current || [];
      if (!buf.length) return;
      const toFlush = selector ? buf.filter((it) => (selector.chat_id !== undefined ? Number(it.chat_id) === Number(selector.chat_id) : (selector.employeeId !== undefined ? Number(it.employeeId) === Number(selector.employeeId) : false))) : buf.slice();
      if (!toFlush.length) return;
      const baseUrl = await getBaseUrl();
      const headers = await getAuthHeaders();
      const r = await fetch(`${baseUrl}/api/admin/chats/persist`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ messages: toFlush }) });
      if (!r.ok) {
        // do not drop buffer on failure
        return;
      }
      const res = await r.json();
      // res is array of per-item results; for successful ones, update messages state to mark sent
      if (Array.isArray(res)) {
        setMessages((prev) => {
          const next = prev.map((p) => {
            if (p.tempId) {
              const found = res.find((x: any) => x.tempId === p.tempId || (x.message && x.message.content === p.content));
              if (found && found.ok && found.message) {
                return { ...p, status: 'sent', message_id: found.message.message_id ?? p.message_id, sent_at: found.message.sent_at ?? p.sent_at } as ChatMessage;
              }
            }
            return p;
          });
          return next;
        });
      }
      // remove flushed items from buffer
      outgoingBufferRef.current = buf.filter((it) => !toFlush.includes(it));
      try { setBufferedCount(outgoingBufferRef.current.length); } catch (_e) { void _e; }
    } catch (_e) { void _e; /* ignore best-effort */ }
  };

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

  // keep selectedChatRef in sync for socket handlers
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Ensure we join the server chat room for the selected chat so we reliably
  // receive room-level broadcasts. Also leave the previous room when switching.
  useEffect(() => {
    try {
      const prev = prevSelectedChatRef.current;
      // leave previous room if we were in one
      if (socketRef.current && prev && prev.chat_id) {
        try { socketRef.current.emit('leave:chat', { chat_id: Number(prev.chat_id) }); } catch (_e) { void _e; }
      }

      // join the newly-selected chat room (if it has a chat_id)
      if (socketRef.current && selectedChat && selectedChat.chat_id) {
        try { socketRef.current.emit('join:chat', { chat_id: Number(selectedChat.chat_id) }, (ack: any) => { try { console.log('join:chat ack', ack); } catch (_e) { void _e; } }); } catch (_e) { void _e; }
      }
    } catch (_e) { void _e; }
    // do not update prevSelectedChatRef here; the other effect handles that
  }, [selectedChat]);

  // Listen for presence updates from the websocket (server may emit when users connect/disconnect)
  useEffect(() => {
    try {
      const socket = socketRef.current;
      if (!socket) return;
      const onPresence = (p: any) => {
        try {
          const id = Number(p?.employee_id ?? p?.employeeId ?? p?.id ?? null);
          const online = typeof p?.online === 'boolean' ? p.online : (String(p?.status ?? '').toLowerCase() === 'online');
          if (!Number.isFinite(id)) return;
          setRooms((prev) => (prev || []).map((r) => (r.employee_id === id ? { ...r, online: Boolean(online) } : r)));
        } catch (_e) { void _e; }
      };

      const eventNames = ['presence:update', 'staff:online', 'staff:status', 'user:online', 'user:offline'];
      for (const ev of eventNames) socket.on(ev, onPresence);
      return () => { for (const ev of eventNames) try { socket.off(ev, onPresence); } catch (_e) { void _e; } };
    } catch (_e) { void _e; }
    // only re-run when websocket status changes (re-attach) or socket ref changes
  }, [wsStatus]);

  // When "showOnlineOnly" is enabled, poll the roster periodically so presence info
  // (computed server-side) stays fresh even if the server doesn't emit presence events.
  useEffect(() => {
    if (!showOnlineOnly) return;
    let cancelled = false;
    const doRefresh = async () => {
      try {
        const prev = selectedChat;
        await fetchRooms(adminEmployeeId ?? null);
        // try to preserve selection if user had a chat open
        try { if (!cancelled && prev) setSelectedChat(prev); } catch (_e) { void _e; }
      } catch (_e) { void _e; }
    };
    // refresh immediately, then poll
    void doRefresh();
    const id = setInterval(() => { void doRefresh(); }, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [showOnlineOnly, adminEmployeeId, selectedChat]);

  const getBaseUrl = async () => {
    let baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
    try {
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
      if (override) baseUrl = override;
    } catch (_e) { void _e; }
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
      try { console.log('fetchAdmin response', d); } catch (_e) { void _e; }
  const name = d?.full_name || d?.name || d?.username || 'Admin';
  setAdminName(name);
  // prefer employee_id when available (explicit requirement)
  const id = Number(d?.employee_id ?? d?.id ?? d?.userId ?? null);
  if (id && !Number.isNaN(id)) setAdminEmployeeId(id);
    } catch {
      // ignore
    }
  };

  const fetchRooms = async (currentAdminId: number | null = null) => {
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
          try { console.log('fetchRooms: raw staff response', staff); } catch (_e) { void _e; }
            if (Array.isArray(staff) && staff.length) {
            // Prefer explicit employee_id field when present. Map presence if provided by API.
            const mapped = staff.map((s: any) => ({
              employee_id: Number(s.employee_id ?? s.id),
              name: s.full_name ?? s.username ?? `User ${s.id ?? s.employee_id}`,
              role: s.role ?? '',
              online: Boolean(s.online ?? false),
            }));
            try { console.log('fetchRooms: mapped staff', mapped, 'adminEmployeeId', adminEmployeeId); } catch (_e) { void _e; }
            roomsAcc.push(...mapped);
          }
        }
      } catch (_e) { void _e; }

      // dedupe rooms by employee_id and remove self (show only other staff)
      const dedupeRooms = (arr: ChatRoom[]) => {
        const map = new Map<number | string, ChatRoom>();
        for (const it of arr) {
          const key = it.employee_id ? it.employee_id : `chat-${it.chat_id ?? 'unknown'}`;
          if (!map.has(key)) map.set(key, it);
        }
        // Exclude the logged-in employee and any staff with serviceman-like roles
        const adminIdToCheck = currentAdminId ?? adminEmployeeId;
        return Array.from(map.values()).filter((r) => {
          const isSelf = Boolean(r.employee_id && adminIdToCheck && r.employee_id === adminIdToCheck);
          const isSvc = Boolean(r.role && isServicemanRole(r.role));
          return !isSelf && !isSvc;
        });
      };

      // Previously we included chat rooms in the roster. For this build we only want staff entries
      // so we do not fetch or append chat rooms here. Keep roomsAcc limited to staff entries.

      const deduped = dedupeRooms(roomsAcc);
      try { console.log('fetchRooms: deduped roster', deduped); } catch (_e) { void _e; }
      setRooms(deduped);
      // auto-select first staff or first group by preference, but only when
      // there is no current selection so refreshes/polls don't steal focus.
      if (deduped.length && !selectedChat) setSelectedChat(deduped[0]);
    } catch (_e) { void _e; }
    finally { setLoadingRooms(false); }
  };

  // If adminEmployeeId changes after mount (e.g., login completes), refresh rooms
  useEffect(() => {
    if (adminEmployeeId !== null) {
      // re-run rooms fetch to ensure self is excluded
      fetchRooms(adminEmployeeId);
    }
    // also fetch previews whenever admin id becomes available
    (async () => {
      try {
        const baseUrl = await getBaseUrl();
        const headers = await getAuthHeaders();
        const r = await fetch(`${baseUrl}/api/admin/chats/previews`, { method: 'GET', credentials: 'include', headers });
        if (!r.ok) return;
        const d = await r.json();
        if (Array.isArray(d)) {
          const map: Record<string, string> = {};
          for (const p of d) {
            const key = p.employee_id ? `emp-${p.employee_id}` : `chat-${p.chat_id}`;
            map[key] = p.preview ? String(p.preview).slice(0, 80) : '';
          }
            // compute diffs to increment unseen counts for rooms that updated while not selected
            setLastPreview((prev) => {
              const next = { ...prev, ...map };
              try {
                const updated: Record<string, number> = { ...unseenCounts };
                const selectedKey = selectedChat ? (selectedChat.employee_id ? `emp-${selectedChat.employee_id}` : `chat-${selectedChat.chat_id}`) : null;
                for (const k of Object.keys(map)) {
                  const prevVal = String(prev[k] ?? '');
                  const newVal = String(map[k] ?? '');
                  if (k !== selectedKey && newVal && newVal !== prevVal) {
                    updated[k] = (updated[k] ?? 0) + 1;
                  }
                }
                setUnseenCounts(updated);
              } catch (_e) { void _e; }
              return next;
            });
        }
      } catch (_e) { void _e; }
    })();
  }, [adminEmployeeId]);

  // Subscribe to chat SSE stream so incoming messages push to the UI in real-time.
  useEffect(() => {
    if (adminEmployeeId === null) return;
    let es: any = null;
    (async () => {
      try {
        const baseUrl = await getBaseUrl();
        // dynamic import to avoid bundler-time dependency
        // @ts-ignore
        const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
        const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
        const token = AsyncStorage ? await AsyncStorage.getItem('authToken') : null;

        if (typeof EventSource === 'undefined') return;

        let streamUrl = `${baseUrl.replace(/\/$/, '')}/api/admin/chats/stream`;
        if (token) streamUrl += `?token=${encodeURIComponent(token)}`;

        try {
          es = new EventSource(streamUrl);

          es.addEventListener('message:new', (ev: any) => {
            try {
              const payload = JSON.parse(ev.data);
              const m = payload?.message;
              if (!m) return;

              // Normalize incoming message to ChatMessage shape
              const incoming: ChatMessage = {
                message_id: m.message_id,
                chat_id: m.chat_id ?? 0,
                sender_id: m.sender_id ?? undefined,
                sender_name: m.sender_name ?? 'Unknown',
                content: m.content ?? '',
                sent_at: m.sent_at ?? new Date().toISOString(),
              };

              // If the incoming message belongs to the currently-selected chat, append it.
              if (selectedChat) {
                if (selectedChat.chat_id && incoming.chat_id === selectedChat.chat_id) {
                  setMessages((prev) => [...prev, incoming]);
                  try { setLastPreview((p) => ({ ...p, [`chat-${incoming.chat_id}`]: String(incoming.content).slice(0, 80) })); } catch (_e) { void _e; }
                  return;
                }
                // For direct chats (selectedChat.employee_id), match by sender_id
                if (selectedChat.employee_id && incoming.sender_id === selectedChat.employee_id) {
                  setMessages((prev) => [...prev, incoming]);
                  try { setLastPreview((p) => ({ ...p, [`emp-${selectedChat.employee_id}`]: String(incoming.content).slice(0, 80) })); } catch (_e) { void _e; }
                  return;
                }
              }

              // If not matching active chat, update preview and unseen count for that room/employee
              try {
                const key = incoming.chat_id ? `chat-${incoming.chat_id}` : `emp-${incoming.sender_id}`;
                setLastPreview((prev) => ({ ...prev, [key]: String(incoming.content).slice(0, 80) }));
                setUnseenCounts((prev) => ({ ...(prev || {}), [key]: (prev?.[key] ?? 0) + 1 }));
              } catch (_e) { void _e; }
              } catch (_e) { void _e; /* ignore parse errors */ }
          });

          es.onerror = () => {
            try { es.close(); } catch (_e) { void _e; }
          };
        } catch (_e) { void _e; // ignore EventSource creation errors
        }
      } catch (_e) { void _e; // ignore
      }
    })();

    return () => {
      try { if (es) es.close(); } catch (_e) { void _e; }
    };
  }, [adminEmployeeId, selectedChat]);

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
            // clear unseen count for this chat since user loaded it
            try { setUnseenCounts((prev) => { const cp = { ...prev }; delete cp[`chat-${chatId}`]; return cp; }); } catch (_e) { void _e; }
            // update preview for this chat
            try {
              const last = normalized.length ? normalized[normalized.length - 1] : null;
              if (last) setLastPreview((p) => ({ ...p, [`chat-${chatId}`]: String(last.content).slice(0, 80) }));
            } catch (_e) { void _e; }
            return;
          }
        } catch (_e) { void _e; }
      }
      setMessages([]);
    } catch (_e) { void _e; }
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
            try { console.log('fetchDirectMessages: raw message missing sender_id', m); } catch (_e) { void _e; }
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
  // clear unseen count for this emp chat
  try { setUnseenCounts((prev) => { const cp = { ...prev }; delete cp[`emp-${employeeId}`]; return cp; }); } catch (_e) { void _e; }
        try {
          const last = normalized.length ? normalized[normalized.length - 1] : null;
          if (last) {
            try { setLastPreview((p) => ({ ...p, [`emp-${employeeId}`]: String(last.content).slice(0, 80) })); } catch (_e) { void _e; }
          }
        } catch (_e) { void _e; }
      }
    } catch (_e) { void _e; }
    finally { setLoadingMessages(false); }
    };

    // auto-scroll to end when new messages are added
  useEffect(() => {
    try {
      if (messages.length > prevMessagesCount.current) {
        // scroll to end
        try {
          if (listRef.current && typeof (listRef.current as any).scrollToEnd === 'function') {
            // small delay to avoid visual jump
            setTimeout(() => { try { (listRef.current as any).scrollToEnd({ animated: true }); } catch (_e) { void _e; } }, 60);
          } else if (listRef.current && typeof (listRef.current as any).scrollToOffset === 'function') {
            setTimeout(() => { try { (listRef.current as any).scrollToOffset({ offset: 99999, animated: true }); } catch (_e) { void _e; } }, 60);
          }
        } catch (_e) { void _e; }
      }
    } catch (_e) { void _e; }
    prevMessagesCount.current = messages.length;
  }, [messages]);

  // compute spacer so last message sits above composer + keyboard
  const bottomSpacerHeight = Math.max(120, composerHeight + keyboardHeight + 24);

  // when the spacer changes (keyboard shown/hidden or composer resized) keep
  // the list scrolled to bottom if user was already at the bottom.
  useEffect(() => {
    try {
      if (isAtBottom && listRef.current && typeof (listRef.current as any).scrollToEnd === 'function') {
        setTimeout(() => { try { (listRef.current as any).scrollToEnd({ animated: true }); } catch (_e) { void _e; } }, 60);
      }
    } catch (_e) { void _e; }
  }, [bottomSpacerHeight]);

  // Listen for keyboard show/hide so we can increase the FlatList bottom padding
  useEffect(() => {
    try {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
      const onShow = (e: any) => {
        try { setKeyboardHeight(e?.endCoordinates?.height ?? 0); } catch (_e) { setKeyboardHeight(0); }
      };
      const onHide = () => setKeyboardHeight(0);
      const subShow = Keyboard.addListener(showEvent, onShow);
      const subHide = Keyboard.addListener(hideEvent, onHide);
      return () => { try { subShow.remove(); subHide.remove(); } catch (_e) { void _e; } };
    } catch (_e) { void _e; }
  }, []);

  const sendMessage = async (chatId: number, content: string) => {
    if (!content || content.trim().length === 0) return false;
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tempMsg: ChatMessage = { tempId, chat_id: chatId, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: new Date().toISOString(), status: 'pending' };
    setMessages((prev) => [...prev, tempMsg]);
    try {
      // If socket.io present, emit and rely on server ack. If ack fails, buffer for persistence
      if (socketRef.current && socketRef.current.connected) {
        const payload = { message: { chat_id: chatId, sender_id: adminEmployeeId ?? undefined, sender_name: adminName, content, sent_at: new Date().toISOString(), tempId } };
        try {
          console.log('[TeamChats] sendMessage: emitting via socket.io', { tempId, chat_id: chatId, sender: adminEmployeeId });
          // optimistic UI already appended; wait for server ack to mark as sent
          socketRef.current.emit('message:new', payload, (ack: any) => {
            try {
              if (ack && ack.ok && ack.message) {
                // mark the temp message as sent
                setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'sent', message_id: ack.message.message_id ?? it.message_id, sent_at: ack.message.sent_at ?? it.sent_at } : it)));
              } else {
                // ack failed: keep in buffer for later persistence
                outgoingBufferRef.current.push({ tempId, chat_id: chatId, content });
                try { setBufferedCount(outgoingBufferRef.current.length); } catch (_e) { void _e; }
                console.log('[TeamChats] sendMessage: ack failed, buffered for persistence', { bufferedCount: outgoingBufferRef.current.length });
              }
            } catch (_e) { void _e; /* ignore ack handler errors */ }
          });
          // preview update
          try { setLastPreview((p) => ({ ...p, [`chat-${chatId}`]: String(content).slice(0, 80) })); } catch (_e) { void _e; }
          return true;
        } catch (_e) {
          void _e; // fall through to HTTP fallback
        }
      }

      // Fallback: use existing HTTP POST behavior to persist immediately
      const baseUrl = await getBaseUrl();
      const endpoints = [
        `/api/admin/chats/${chatId}/messages`,
        `/api/chats/${chatId}/messages`,
        `/api/admin/chats/${chatId}/send`,
      ];
      for (const ep of endpoints) {
        try {
          console.log('[TeamChats] sendMessage: attempting HTTP fallback to', ep);
          const headers = await getAuthHeaders();
          const r = await fetch(`${baseUrl}${ep}`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ content }) });
          if (!r.ok) continue;
          const m = await r.json();
          // replace temp message with server message
          const serverSentAt = m?.sent_at ?? new Date().toISOString();
          setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { message_id: m?.message_id ?? undefined, chat_id: chatId, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: serverSentAt, status: 'sent' } : it)));
          try { setLastPreview((p) => ({ ...p, [`chat-${chatId}`]: String(content).slice(0, 80) })); } catch (_e) { void _e; }
          try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('overview:updated')); } catch (_e) { void _e; }
          // re-fetch to get canonical message(s) from db
          await fetchMessages(chatId);
          console.log('[TeamChats] sendMessage: HTTP send ok, server message id', m?.message_id);
          return true;
        } catch (_e) { void _e; }
      }
    } catch (_e) {
      void _e; /* ignore */
    }
    // mark failed
    console.log('[TeamChats] sendMessage: failed to send', { tempId });
    setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'failed' } : it)));
    return false;
  };

  const sendDirectMessage = async (employeeId: number, content: string) => {
    if (!content || content.trim().length === 0) return false;
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tempMsg: ChatMessage = { tempId, chat_id: 0, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: new Date().toISOString(), status: 'pending' };
    setMessages((prev) => [...prev, tempMsg]);
    try {
      // Try to send over socket.io if available
      if (socketRef.current && socketRef.current.connected) {
        const payload = { message: { employeeId: employeeId, sender_id: adminEmployeeId ?? undefined, sender_name: adminName, content, sent_at: new Date().toISOString(), tempId } };
        try {
          console.log('[TeamChats] sendDirectMessage: emitting via socket.io', { tempId, employeeId, sender: adminEmployeeId });
          socketRef.current.emit('message:new', payload, (ack: any) => {
            try {
              if (ack && ack.ok && ack.message) {
                setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'sent', message_id: ack.message.message_id ?? it.message_id, sent_at: ack.message.sent_at ?? it.sent_at } : it)));
              } else {
                outgoingBufferRef.current.push({ tempId, employeeId, content });
                try { setBufferedCount(outgoingBufferRef.current.length); } catch (_e) { void _e; }
                console.log('[TeamChats] sendDirectMessage: ack failed, buffered for persistence', { bufferedCount: outgoingBufferRef.current.length });
              }
            } catch (_e) { void _e; }
          });
          try { setLastPreview((p) => ({ ...p, [`emp-${employeeId}`]: String(content).slice(0, 80) })); } catch (_e) { void _e; }
          return true;
        } catch (_e) { void _e; /* fall back to HTTP */ }
      }

      // Fallback to HTTP
      const baseUrl = await getBaseUrl();
      const headers = await getAuthHeaders();
      const r = await fetch(`${baseUrl}/api/admin/chats/direct/${employeeId}/messages`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ content }) });
      if (!r.ok) {
        console.log('[TeamChats] sendDirectMessage: HTTP send failed', { employeeId, status: r.status });
        setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'failed' } : it)));
        return false;
      }
      const m = await r.json();
      const serverSentAt = m?.sent_at ?? new Date().toISOString();
      setMessages((prev) => prev.map((it) => (it.tempId === tempId ? { message_id: m?.message_id ?? undefined, chat_id: m?.chat_id ?? m?.chatId ?? 0, sender_name: adminName, sender_id: adminEmployeeId ?? undefined, content, sent_at: serverSentAt, status: 'sent' } : it)));
      try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('overview:updated')); } catch (_e) { void _e; }
      await fetchDirectMessages(employeeId);
      try { setLastPreview((p) => ({ ...p, [`emp-${employeeId}`]: String(content).slice(0, 80) })); } catch (_e) { void _e; }
      console.log('[TeamChats] sendDirectMessage: HTTP send ok, server message id', m?.message_id ?? m?.message?.message_id ?? null);
      return true;
    } catch (_e) {
      console.log('[TeamChats] sendDirectMessage: unexpected error', _e);
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

  // Mark sendBroadcast referenced to avoid unused-vars warning (function intentionally unused)
  void sendBroadcast;

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

  const loadEarlierMessages = async () => {
    if (!selectedChat) return;
    if (messages.length === 0) return;
    setLoadingEarlier(true);
    try {
      const baseUrl = await getBaseUrl();
      const oldest = messages[0]?.sent_at ?? new Date().toISOString();
      const endpoints = selectedChat.employee_id ?
        [`/api/admin/chats/direct/${selectedChat.employee_id}/messages?before=${encodeURIComponent(oldest)}`] :
        [`/api/admin/chats/${selectedChat.chat_id}/messages?before=${encodeURIComponent(oldest)}`, `/api/chats/${selectedChat.chat_id}/messages?before=${encodeURIComponent(oldest)}`];
      for (const ep of endpoints) {
        try {
          const headers = await getAuthHeaders();
          const r = await fetch(`${baseUrl}${ep}`, { method: 'GET', credentials: 'include', headers });
          if (!r.ok) continue;
          const d = await r.json();
          const msgs = Array.isArray(d) ? d : (d?.messages ?? d?.chatMessages ?? []);
          if (Array.isArray(msgs) && msgs.length) {
            const normalized = msgs.map((m: any) => ({
              message_id: m.message_id ?? m.id,
              chat_id: m.chat_id ?? selectedChat.chat_id ?? 0,
              sender_name: m.sender_name ?? m.sender?.full_name ?? 'Unknown',
              sender_id: Number(m.sender_id ?? m.sender?.id ?? m.sender?.employee_id ?? null) || undefined,
              content: m.content,
              sent_at: m.sent_at ?? m.sentAt ?? m.created_at ?? new Date().toISOString(),
            } as ChatMessage));
            setMessages((prev) => [...normalized, ...prev]);
            // attempt to keep scroll position stable
            try { if (listRef.current && typeof (listRef.current as any).scrollToOffset === 'function') (listRef.current as any).scrollToOffset({ offset: normalized.length * 80, animated: false }); } catch (_e) { void _e; }
            break;
          }
        } catch (_e) { void _e; }
      }
    } catch (_e) { void _e; }
    finally { setLoadingEarlier(false); }
  };

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <TouchableOpacity
      style={[styles.roomCard, (selectedChat && ((item.employee_id && selectedChat.employee_id === item.employee_id) || (item.chat_id && selectedChat.chat_id === item.chat_id))) ? styles.roomCardActive : null]}
      onPress={() => {
        const key = item.employee_id ? `emp-${item.employee_id}` : `chat-${item.chat_id}`;
        // clear unseen count when user selects
        setUnseenCounts((prev) => { const cp = { ...prev }; delete cp[key]; return cp; });
        setSelectedChat(item);
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.avatarCircleSmall, { backgroundColor: roleColor(item.role) }]}> 
          <Text style={[styles.avatarInitialsSmall, { color: avatarInitialColor(item.role) }]}>{String((item.name ?? '').split(' ').map((s:any)=>s[0]).join('').slice(0,2)).toUpperCase() || 'U'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName}>{item.name ?? (item.employee_id ? item.name : `Chat ${item.chat_id}`)}</Text>
          <Text style={styles.roomMeta}>{item.employee_id ? (item.role ?? 'User') : (item.is_group ? 'Group' : 'Chat')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.roomSubMeta}>{ lastPreview[item.employee_id ? `emp-${item.employee_id}` : `chat-${item.chat_id}`] ?? 'Last: Emergency Alert' }</Text>
            {(() => {
              const key = item.employee_id ? `emp-${item.employee_id}` : `chat-${item.chat_id}`;
              const c = unseenCounts[key] ?? 0;
              if (c > 0) return (<View style={styles.unseenBadge}><Text style={styles.unseenBadgeText}>{String(c)}</Text></View>);
              return null;
            })()}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const roleColor = (role?: string) => {
    if (!role) return '#FFFFFF';
    const r = String(role).toLowerCase();
    if (r.includes('dispatcher')) return '#E9F6EE';
    if (r.includes('cashier')) return '#F1F7F0';
    if (r.includes('ball')) return '#FFF8EE';
    if (r.includes('admin')) return '#EAF6E9';
    return '#FFFFFF';
  };

  const avatarInitialColor = (_role?: string) => {
    return '#27421A';
  };

  // Filter rooms by rosterSearch then group by role for roster sections (preserve desired display order)
  // Honor `showOnlineOnly` to restrict the roster to currently-online staff when enabled.
  const groupedRooms = React.useMemo(() => {
    const order = ['Dispatcher', 'Cashier', 'BallHandler', 'Admin', 'Other'];
    const titleMap: Record<string, string> = { Dispatcher: 'Dispatchers', Cashier: 'Cashiers', BallHandler: 'Ball Handler', Admin: 'Admins', Other: 'Other' };
    const groups: { key: string; title: string; items: ChatRoom[] }[] = [];

    // apply roster search filter (name or role) and optional "online only" filter
    const filtered = (rooms || []).filter((ro) => {
      if (showOnlineOnly && !ro.online) return false;
      if (!rosterSearch || rosterSearch.trim().length === 0) return true;
      const q = rosterSearch.toLowerCase().trim();
      const name = String(ro.name ?? '').toLowerCase();
      const role = String(ro.role ?? '').toLowerCase();
      return name.includes(q) || role.includes(q);
    });

    const byRole: Record<string, ChatRoom[]> = {};
    for (const r of filtered) {
      // Only include staff/direct entries in the roster (skip chat rooms)
      if (r.employee_id) {
        const k = (r.role ?? 'Other') as string;
        if (!byRole[k]) byRole[k] = [];
        byRole[k].push(r);
      }
    }
    for (const k of order) {
      const items = byRole[k] ?? [];
      if (items.length) groups.push({ key: k, title: titleMap[k] ?? k, items });
    }
    // include any other roles not present in order
    for (const k of Object.keys(byRole)) {
      if (!order.includes(k)) {
        groups.push({ key: k, title: titleMap[k] ?? k, items: byRole[k] });
      }
    }

    return groups;
  }, [rooms, rosterSearch, showOnlineOnly]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
  const fromMe = (item.sender_id !== undefined && adminEmployeeId !== null) ? item.sender_id === adminEmployeeId : (item.sender_name === adminName);
    return (
      <View style={[styles.messageRow, fromMe ? styles.messageRowRight : styles.messageRowLeft]}>
        {/* Timestamp + sender line above the bubble */}
        <View style={{ width: '100%', flexDirection: 'row', justifyContent: fromMe ? 'flex-end' : 'flex-start' }}>
          <Text style={styles.messageTimeTop}>{`${item.sender_name ?? ''}${item.sent_at ? ' - ' + new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`}</Text>
        </View>
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
      </View>
    );
  };

  return (
    <View style={[styles.root, { padding: 20 }]}>
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
  <View style={styles.bodyRow}>
        <View style={styles.rosterColumn}>
          <View style={styles.rosterCard}>
            <Text style={styles.rosterCardTitle}>Chat Roster</Text>
            <View style={styles.emergencyTagRow}>
            </View>

            {/* Online users / active roles quick chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleChipsRow} contentContainerStyle={{ paddingVertical: 6 }}>
              <TouchableOpacity style={[styles.roleChip, !rosterSearch && !showOnlineOnly ? styles.roleChipActive : null]} onPress={() => { setRosterSearch(''); setShowOnlineOnly(false); }}>
                <Text style={styles.roleChipText}>All</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.roleChip, showOnlineOnly ? styles.roleChipActive : null]} onPress={() => { setShowOnlineOnly((v) => !v); setRosterSearch(''); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {showOnlineOnly ? <View style={styles.roleOnlineDot} /> : <View style={{ width: 8, height: 8, marginRight: 8 }} />}
                  <Text style={styles.roleChipText}>Online only</Text>
                </View>
              </TouchableOpacity>

              {Object.keys(roleCounts).map((role) => {
                  const rc = roleCounts[role] ?? { total: 0, online: 0 };
                  return (
                    <TouchableOpacity key={role} style={[styles.roleChip, rosterSearch && rosterSearch.toLowerCase() === String(role).toLowerCase() ? styles.roleChipActive : null]} onPress={() => { setRosterSearch(role); setShowOnlineOnly(false); }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {rc.online > 0 ? <View style={styles.roleOnlineDot} /> : <View style={{ width: 8, height: 8, marginRight: 8 }} />}
                        <Text style={styles.roleChipText}>{role} ({rc.online}/{rc.total})</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <View style={{ marginBottom: 10 }}>
              <TextInput value={rosterSearch} onChangeText={setRosterSearch} placeholder="Search name or role" style={styles.rosterSearchInput} />
            </View>

            {/* All Roles quick entry removed when no group chats are present */}
            {/* (Chats/general entries intentionally not shown in roster) */}

            {(loadingRooms || adminEmployeeId === null) ? <ActivityIndicator style={{ marginTop: 12 }} /> : (
              <SectionList
                sections={groupedRooms.map((g) => ({ title: g.title, data: g.items }))}
                keyExtractor={(item: ChatRoom, index) => `room-${item.employee_id ?? item.chat_id ?? 'unk'}-${index}`}
                renderSectionHeader={({ section }) => (
                  <>
                    <Text style={styles.groupHeader}>{section.title}</Text>
                    <View style={styles.groupDivider} />
                  </>
                )}
                renderItem={({ item }) => renderRoom({ item })}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                contentContainerStyle={{ paddingBottom: 13 }}
                showsVerticalScrollIndicator={false}
                style={[styles.rosterList, { height: rosterHeight }]}
                nestedScrollEnabled={true}
                stickySectionHeadersEnabled={true}
              />
            )}

            <TouchableOpacity style={styles.urgentButton} onPress={undefined} disabled={true}>
              <Text style={styles.urgentText}>Urgent Alerts</Text>
            </TouchableOpacity>

            {showDebug && (
              <ScrollView style={styles.debugPanel}>
                <Text style={styles.debugTitle}>Rooms (deduped)</Text>
                <Text style={styles.debugBody}>{JSON.stringify(rooms, null, 2)}</Text>
              </ScrollView>
            )}
          </View>
        </View>

        <View style={styles.chatColumn}>
          <View style={styles.chatHeaderRow}>
              <Text style={styles.chatTitleLarge}>{selectedChat ? `Chat with ${selectedChat.name ?? 'Chat'}` : 'Select a chat'}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: '#666' }}>{`WS: ${wsStatus}`}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>{`Buffered: ${bufferedCount}`}</Text>
              </View>
          </View>
          <View style={styles.chatWindowCard}>
            {loadingMessages ? <ActivityIndicator /> : (
              <FlatList
                key={listKey}
                ref={listRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(m, idx) => String(m.tempId ?? m.message_id ?? idx)}
                contentContainerStyle={{ padding: 12, flexGrow: 1, justifyContent: 'flex-end' }}
                ListFooterComponent={() => (<View style={{ height: bottomSpacerHeight }} />)}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={() => (
                  messages.length ? (
                    <View style={{ alignItems: 'center', marginVertical: 6 }}>
                      {loadingEarlier ? <ActivityIndicator /> : (
                        <TouchableOpacity onPress={loadEarlierMessages} style={styles.loadEarlierButton}><Text style={styles.loadEarlierText}>Load earlier messages</Text></TouchableOpacity>
                      )}
                    </View>
                  ) : null
                )}
                onContentSizeChange={() => {
                  try {
                    if (isAtBottom && listRef.current && typeof (listRef.current as any).scrollToEnd === 'function') {
                      // small timeout to allow layout to stabilize and avoid flicker when switching chats
                      setTimeout(() => { try { (listRef.current as any).scrollToEnd({ animated: true }); } catch (_e) { void _e; } }, 60);
                    }
                  } catch (_e) { void _e; }
                }}
                onScroll={(e: any) => {
                  try {
                    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                    const paddingToBottom = 40;
                    const atBottom = (layoutMeasurement.height + contentOffset.y) >= (contentSize.height - paddingToBottom);
                    setIsAtBottom(Boolean(atBottom));
                  } catch (_e) { void _e; }
                }}
                initialNumToRender={20}
                scrollEventThrottle={100}
              />
            )}

            {/* Jump-to-latest floating button when user scrolled up */}
            {!isAtBottom && (
              <TouchableOpacity
                style={[styles.floatingLatestButton, { bottom: bottomSpacerHeight + 20 }]}
                onPress={() => {
                  try { if (listRef.current && typeof (listRef.current as any).scrollToEnd === 'function') (listRef.current as any).scrollToEnd({ animated: true }); setIsAtBottom(true); } catch (_e) { void _e; }
                }}
              >
                <Text style={styles.floatingLatestText}>Latest ↓</Text>
              </TouchableOpacity>
            )}

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.composerRowInside} onLayout={(e) => { try { setComposerHeight(e.nativeEvent.layout.height); } catch (_e) { void _e; } }}>
              <TextInput value={composer} onChangeText={setComposer} placeholder="Type your message in here" style={styles.composerInputInside} />
              <TouchableOpacity style={styles.sendButtonInside} onPress={onSendPressed}><Text style={styles.sendIcon}>➤</Text></TouchableOpacity>
            </KeyboardAvoidingView>
          </View>
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
  bodyRow: { flexDirection: 'row' },
  rosterColumn: { width: 360 },
  rosterCard: { backgroundColor: '#F7FBF6', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, elevation: 2 },
  rosterCardTitle: { fontWeight: '800', color: '#27421A', fontSize: 16, marginBottom: 8 },
  emergencyTagRow: { marginBottom: 8 },
  emergencyLabel: { color: '#B00000', fontWeight: '800', fontSize: 11 },
  rosterTitle: { fontWeight: '700', marginBottom: 8 },
  rosterList: { marginBottom: 12, maxHeight: 600 },
  rosterSearchInput: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E6EDE4' },
  roomSubMeta: { color: '#9A9A9A', fontSize: 12, marginTop: 4 },
  messageTimeTop: { fontSize: 12, color: '#27421A', marginBottom: 6 },
  groupHeader: { fontSize: 13, fontWeight: '800', color: '#27421A', marginTop: 8, marginBottom: 6 },
  groupDivider: { height: 1, backgroundColor: '#E6EDE4', marginBottom: 8 },
  sectionSpacer: { height: 8 },
  avatarCircleSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E6E6E6', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarInitialsSmall: { color: '#27421A', fontWeight: '700', fontSize: 12 },
  roomCard: { backgroundColor: '#F8FBF6', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EDEFE8' },
  allRolesCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E9F6EE', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarInitials: { color: '#27421A', fontWeight: '800' },
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
  chatColumn: { flex: 1, marginLeft: 18, minHeight: 420 },
  chatHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  chatTitleLarge: { fontWeight: '800', fontSize: 18, color: '#2E3B2B' },

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
  chatWindowCard: { flex: 1, minHeight: 300, backgroundColor: '#FBFEFD', borderRadius: 12, padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: '#EEF6EB', position: 'relative' },
  composerRowInside: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E6EDE4', padding: 12, backgroundColor: 'transparent' },
  composerInputInside: { flex: 1, backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#E6EDE4', marginRight: 8 },
  sendButtonInside: { marginLeft: 8, backgroundColor: '#17321d', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: '#fff', fontWeight: '700' },
  floatingLatestButton: { position: 'absolute', right: 16, bottom: 140, backgroundColor: '#17321d', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 6, zIndex: 60 },
  floatingLatestText: { color: '#fff', fontWeight: '800' },
  unseenBadge: { backgroundColor: '#B00000', minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unseenBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  loadEarlierButton: { backgroundColor: '#EDEFF0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  loadEarlierText: { color: '#27421A', fontWeight: '700' },
  roleChipsRow: { marginBottom: 3 },
  roleChip: { backgroundColor: '#F0F6F0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, marginRight: 8, borderWidth: 1, borderColor: '#E6EDE4' },
  roleChipActive: { backgroundColor: '#E9F6EE', borderColor: '#C9DABF'  },
  roleChipText: { color: '#27421A', fontWeight: '700', marginLeft: 6 },
  roleOnlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1fbf4a', marginRight: 8 },
});
