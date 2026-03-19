import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./learnhub.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client);

migrate(db, { migrationsFolder: './lib/db/migrations' })
  .then(() => {
    console.log('Migrations applied successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
