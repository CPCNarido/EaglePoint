import { io, Socket } from 'socket.io-client';

// Minimal event emitter for presence notifications
type Handler = (...args: any[]) => void;
class Emitter {
  private map: Record<string, Handler[]> = {};
  on(ev: string, h: Handler) { (this.map[ev] = this.map[ev] ?? []).push(h); }
  off(ev: string, h?: Handler) { if (!this.map[ev]) return; if (!h) { delete this.map[ev]; return; } this.map[ev] = this.map[ev].filter(x=>x!==h); }
  emit(ev: string, ...args: any[]) { (this.map[ev] || []).slice().forEach(h=>{ try { h(...args); } catch(_){} }); }
}

const emitter = new Emitter();

let socket: Socket | null = null;
let currentEmployeeId: string | number | null = null;

const getBaseUrl = async () => {
  let baseUrl = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '') ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  try {
    // dynamic import AsyncStorage when available
    // @ts-ignore
    const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
    const override = AsyncStorage ? await AsyncStorage.getItem('backendBaseUrlOverride') : null;
    if (override) baseUrl = override;
  } catch (_e) { }
  return baseUrl;
};

const getAuthToken = async () => {
  try {
    // @ts-ignore
    const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
    if (!AsyncStorage || !AsyncStorage.getItem) return null;
    return await AsyncStorage.getItem('authToken');
  } catch (_e) { return null; }
};

// Try to resolve the logged-in employee id from the backend using the stored token.
const resolveEmployeeIdFromServer = async () => {
  try {
    const token = await getAuthToken();
    if (!token) return null;
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/me`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    const emp = d?.employee_id ?? d?.employeeId ?? d?.id ?? null;
    if (emp == null) return null;
    return String(emp);
  } catch (_e) { return null; }
};

const connect = async (employeeId: string | number) => {
  try {
    if (!employeeId) return;
    if (socket && currentEmployeeId && String(currentEmployeeId) === String(employeeId) && socket.connected) return socket;
    // disconnect previous
    try { if (socket) { socket.disconnect(); socket = null; } } catch (_e) { }
    currentEmployeeId = employeeId;
    const baseUrl = await getBaseUrl();
    const token = await getAuthToken();
    const socketUrl = baseUrl.replace(/\/$/, '');
    const opts: any = { transports: ['websocket'], autoConnect: true, reconnection: true, auth: {} };
    if (token) opts.auth.token = token;
    opts.query = { employeeId: String(employeeId) };
    // create socket
    socket = io(socketUrl, opts);

    // proxy some events to emitter
    socket.on('connect', () => emitter.emit('connect'));
    socket.on('disconnect', (r: any) => emitter.emit('disconnect', r));
    socket.on('connect_error', (err: any) => emitter.emit('connect_error', err));

    // presence and message events are forwarded as-is
    const forward = (ev: string) => (d: any) => emitter.emit(ev, d);
    const eventsToForward = ['presence:update', 'staff:online', 'staff:offline', 'message:new', 'user:online', 'user:offline', 'staff:status'];
    for (const ev of eventsToForward) socket.on(ev, forward(ev));

    return socket;
  } catch (e) {
    try { emitter.emit('error', e); } catch (_e) {}
    return null;
  }
};

const disconnect = async () => {
  try {
    if (socket) {
      try { socket.disconnect(); } catch (_e) {}
      socket = null;
      currentEmployeeId = null;
    }
  } catch (_e) { }
};

const on = (ev: string, h: Handler) => emitter.on(ev, h);
const off = (ev: string, h?: Handler) => emitter.off(ev, h);
const emit = (ev: string, ...args: any[]) => emitter.emit(ev, ...args);
const getSocket = () => socket;
const isConnected = () => Boolean(socket && socket.connected);

// Ensure there is a socket connected for the currently-logged-in employee.
// If no employeeId is supplied, attempt to resolve it via the backend with the stored token.
const ensureConnected = async () => {
  try {
    if (isConnected()) return getSocket();
    // If we have a currentEmployeeId, connect with it
    if (currentEmployeeId) return await connect(currentEmployeeId as string);
    // Otherwise try to resolve from server using token
    const emp = await resolveEmployeeIdFromServer();
    if (emp) return await connect(emp);
    return null;
  } catch (_e) { return null; }
};

// Handle visibility / AppState to re-establish presence when the app becomes active.
try {
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'visible') {
          void ensureConnected();
        }
      } catch (_e) { }
    });
  }
} catch (_e) { }

// For React Native AppState compatibility: attempt to re-connect when app becomes active
try {
  // dynamic import to avoid bundler-time dependency
  // @ts-ignore
  const RN = typeof require === 'function' ? require('react-native') : null;
  const AppState = (RN && (RN as any).AppState) || null;
  if (AppState && AppState.addEventListener) {
    try {
      AppState.addEventListener('change', (next: string) => {
        try { if (next === 'active') void ensureConnected(); } catch (_e) { }
      });
    } catch (_e) { }
  }
} catch (_e) { }

export default { connect, disconnect, on, off, emit, getSocket, isConnected, ensureConnected } as const;
