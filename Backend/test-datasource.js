const { DataSource } = require('typeorm');
require('dotenv').config();
(async () => {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    synchronize: false,
    logging: true,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await ds.initialize();
    console.log('TypeORM DataSource initialized');
    const r = await ds.query('SELECT NOW()');
    console.log('DB time:', r[0]);
    await ds.destroy();
  } catch (e) {
    console.error('TypeORM DataSource failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
