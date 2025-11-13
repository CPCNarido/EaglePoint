// Simple test WebSocket client using the 'ws' package
// Usage: node scripts/test_ws_client.js

const WebSocket = require('ws');
// CLI args: [0]=node, [1]=script, [2]=wsUrl (optional), [3]=token (optional)
const rawUrl = process.argv[2] || 'ws://localhost:4001/?employeeId=1';
const token = process.argv[3] || null;
let url = rawUrl;
if (token) {
  try {
    const u = new URL(rawUrl);
    // attach token as query param if not present
    if (!u.searchParams.has('token')) u.searchParams.set('token', token);
    url = u.toString();
  } catch (e) { url = rawUrl + (rawUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`; }
}
console.log('Connecting to', url, token ? '(with token)' : '');

const ws = new WebSocket(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });

ws.on('open', () => {
  console.log('[WS] open');
});

ws.on('message', (data) => {
  try {
    const s = typeof data === 'string' ? data : data.toString();
    console.log('[WS] message:', s);
  } catch (e) {
    console.log('[WS] message (raw):', data);
  }
});

ws.on('close', () => {
  console.log('[WS] closed');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('[WS] error', err && err.message ? err.message : err);
  process.exit(1);
});

// keep alive for 20s then exit
setTimeout(() => {
  try { console.log('[WS] timeout, closing'); ws.close(); } catch {};
}, 20000);
