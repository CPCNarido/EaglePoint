require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set in .env');
    process.exit(1);
  }
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name"
    );
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch (e) {
    console.error('Failed to list tables:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
