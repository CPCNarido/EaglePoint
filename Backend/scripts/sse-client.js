const http = require('http');
const url = process.argv[2];
if (!url) {
  console.error('usage: node sse-client.js <url>');
  process.exit(1);
}
console.log('connecting to', url);
http.get(url, (res) => {
  console.log('status', res.statusCode);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  res.on('end', () => {
    console.log('\nstream ended');
  });
}).on('error', (e) => {
  console.error('sse client error', e);
});
