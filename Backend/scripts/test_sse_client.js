// Tiny SSE client using Node's http module
// Usage: node scripts/test_sse_client.js

const http = require('http');
// Usage: node scripts/test_sse_client.js [streamUrl] [token]
const rawUrl = process.argv[2] || 'http://localhost:3000/api/admin/chats/stream';
const token = process.argv[3] || null;
console.log('Connecting to SSE:', rawUrl, token ? '(with token)' : '');

const options = {};
try {
  const u = new URL(rawUrl);
  options.hostname = u.hostname;
  options.port = u.port || (u.protocol === 'https:' ? 443 : 80);
  options.path = u.pathname + (u.search || '');
  options.method = 'GET';
  options.headers = { 'Accept': 'text/event-stream' };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
} catch (e) {
  // fallback: let http.get parse the string and add Authorization header if token
  if (token) options.headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'text/event-stream' };
}

const req = http.request(rawUrl, options, (res) => {
  console.log('[SSE] status', res.statusCode);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    // SSE sends data lines separated by \n, print them as they arrive
    process.stdout.write('[SSE] ' + chunk);
  });
  res.on('end', () => {
    console.log('\n[SSE] ended');
    process.exit(0);
  });
});
req.on('error', (err) => {
  console.error('[SSE] error', err && err.message ? err.message : err);
  process.exit(1);
});
req.end();

req.on('error', (err) => {
  console.error('[SSE] error', err && err.message ? err.message : err);
  process.exit(1);
});

// Kill after 15s
setTimeout(() => {
  try { console.log('\n[SSE] timeout, aborting'); req.abort(); } catch {};
  process.exit(0);
}, 15000);
