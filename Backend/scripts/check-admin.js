const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query('SELECT admin_id, username, password FROM "Admin" LIMIT 1');
    console.log('rowCount=', res.rowCount);
    if (res.rowCount === 0) {
      console.log('No admin rows');
      return;
    }
    const row = res.rows[0];
    console.log('Admin row:', row);
    const pw = process.env.DEV_LOGIN_PASSWORD || 'password';
    const match = await bcrypt.compare(pw, row.password || '');
    console.log(`Compare DEV_LOGIN_PASSWORD ('${pw}') =>`, match);
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
