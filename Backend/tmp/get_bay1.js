const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/dispatcher/bays',
  method: 'GET',
};

const req = http.request(options, (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    try {
      const arr = JSON.parse(body);
      const b = arr.find(x => String(x.bay_number) === '1' || x.bay_id === 1);
      console.log('BAY1', JSON.stringify(b, null, 2));
    } catch (e) {
      console.error('PARSE_ERROR', e.message);
      console.log('RAW', body);
    }
  });
});

req.on('error', (e) => {
  console.error('request error', e.message);
});

req.end();
