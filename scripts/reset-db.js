// Deletes the SQLite file and rebuilds it from database/database.sql.
// Usage: npm run reset-db   (stop the server first)
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'database', 'shop.db');
for (const f of [file, file + '-wal', file + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
require('../db'); // recreates the database from the SQL file
console.log('Database reset complete.');
