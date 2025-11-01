// Simple Node script to POST a JSON payload to the admin staff endpoint
(async () => {
  try {
  const res = await fetch('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Node Test', username: 'nodetest', password: 'abc123', role: 'Dispatcher' }),
    });
    console.log('STATUS:', res.status);
    const txt = await res.text();
    console.log('BODY:', txt);
  } catch (e) {
    console.error('ERROR', e);
  }
})();
