const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Post Debug', username: 'postdebug', password: 'pw', role: 'Dispatcher' }),
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (e) {
    console.error('FETCH ERR', e && e.message ? e.message : e);
  }
})();
