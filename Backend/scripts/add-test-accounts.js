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
    const accounts = [
      { username: 'dispatcher1', password: 'Dispatcher123!', role: 'dispatcher' },
      { username: 'cashier1', password: 'Cashier123!', role: 'cashier' },
      { username: 'ballhandler1', password: 'BallHandler123!', role: 'ballhandler' },
    ];

    for (const acc of accounts) {
      const hash = await bcrypt.hash(acc.password, 10);
      const exists = await client.query('SELECT admin_id FROM "Admin" WHERE username = $1', [acc.username]);
      if (exists.rowCount > 0) {
        const id = exists.rows[0].admin_id;
        await client.query('UPDATE "Admin" SET password = $1, role = $2, note = $3 WHERE admin_id = $4', [hash, acc.role, 'test account', id]);
        console.log(`Updated ${acc.username} id=${id}`);
      } else {
        const res = await client.query('INSERT INTO "Admin" (username, password, role, note) VALUES ($1, $2, $3, $4) RETURNING admin_id', [acc.username, hash, acc.role, 'test account']);
        console.log(`Inserted ${acc.username} id=${res.rows[0].admin_id}`);
      }
    }
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
