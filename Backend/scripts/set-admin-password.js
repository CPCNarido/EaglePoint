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

  const newPassword = process.env.NEW_ADMIN_PASSWORD;
  if (!newPassword) {
    console.error('Please set NEW_ADMIN_PASSWORD env var');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const res = await client.query('UPDATE "Admin" SET password = $1 WHERE admin_id = $2', [hash, 1]);
    console.log('UPDATE result rowCount=', res.rowCount);
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
