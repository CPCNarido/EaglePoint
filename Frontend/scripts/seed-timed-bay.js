// Usage: node seed-timed-bay.js [bayNo] [seconds]
// Example: node seed-timed-bay.js 5 10
//
// This script attempts to create/assign a short timed session for testing by
// POSTing to several plausible backend endpoints. Backend APIs vary by
// implementation so the script tries a few endpoints and logs which succeeded.

const DEFAULT_BAY = process.argv[2] ? Number(process.argv[2]) : 1;
const SECONDS = process.argv[3] ? Number(process.argv[3]) : 10;
const BASE = process.env.BASE_URL || 'http://localhost:3000';

if (!DEFAULT_BAY || isNaN(DEFAULT_BAY)) {
  console.error('Invalid bay number');
  process.exit(1);
}
if (!SECONDS || isNaN(SECONDS) || SECONDS <= 0) {
  console.error('Invalid seconds');
  process.exit(1);
}

const endTime = new Date(Date.now() + SECONDS * 1000).toISOString();
const bayNo = DEFAULT_BAY;

const candidates = [
  {
    url: `${BASE}/api/admin/bays/${bayNo}/start`,
    method: 'POST',
    body: { nickname: 'SEED_TEST', full_name: 'SEED_TEST', end_time: endTime },
  },
  {
    url: `${BASE}/api/admin/bays/${bayNo}/override`,
    method: 'POST',
    body: { action: 'Reserved' },
  },
  {
    url: `${BASE}/api/session/create`,
    method: 'POST',
    body: { bayNo, type: 'timed', end_time: endTime, playerName: 'SEED_TEST' },
  },
  {
    url: `${BASE}/api/dispatcher/bays/${bayNo}/assign`,
    method: 'POST',
    body: { bayNo, end_time: endTime, playerName: 'SEED_TEST' },
  },
];

(async () => {
  console.log(`Seeding bay ${bayNo} with end_time ${endTime} (in ${SECONDS}s) to ${BASE}`);
  for (const c of candidates) {
    try {
      const res = await fetch(c.url, {
        method: c.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c.body),
        credentials: 'include',
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        console.log(`SUCCESS -> ${c.url} returned ${res.status}`);
        try { console.log('Response:', JSON.parse(text)); } catch { console.log('Response text:', text); }
        process.exit(0);
      } else {
        console.warn(`FAILED -> ${c.url} returned ${res.status}`);
        if (text) console.warn('Response:', text);
      }
    } catch (_e) {
      console.warn(`ERROR -> ${c.url} ->`, String(_e));
    }
  }
  console.error('All candidate endpoints failed. Check backend API routes or adjust the script payloads.');
  process.exit(2);
})();
