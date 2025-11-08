const http = require('http');

const data = JSON.stringify({ action: 'End Session' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/bays/1/override',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    try { console.log('BODY', JSON.parse(body)); } catch (e) { console.log('BODY', body); }
  });
});

req.on('error', (e) => {
  console.error('request error', e.message);
});

req.write(data);
req.end();
