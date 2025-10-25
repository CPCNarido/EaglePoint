const { Client } = require('pg');
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
    // Check if column exists
    const col = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='Admin' AND column_name='role'");
    if (col.rowCount === 0) {
      console.log('Adding role column to Admin');
      await client.query('ALTER TABLE "Admin" ADD COLUMN role varchar(50) DEFAULT \'' + 'admin' + '\'');
    } else {
      console.log('role column already exists');
    }
    // Set admin row role to 'admin' for admin_id=1
    const upd = await client.query('UPDATE "Admin" SET role = $1 WHERE admin_id = $2', ['admin', 1]);
    console.log('Updated rows:', upd.rowCount);
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
