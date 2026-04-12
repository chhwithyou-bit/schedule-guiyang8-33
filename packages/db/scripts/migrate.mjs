import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');
const databaseUrl = process.env.DATABASE_URL;
const dryRun = process.argv.includes('--dry-run');

if (!databaseUrl && !dryRun) {
  throw new Error('DATABASE_URL is required unless --dry-run is used.');
}

const { Client } = pg;

async function readMigrations() {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const migrations = [];
  for (const name of files) {
    const sql = await readFile(path.join(migrationsDir, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    migrations.push({ name, sql, checksum });
  }
  return migrations;
}

async function ensureJournal(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      execution_time_ms bigint NOT NULL DEFAULT 0
    )
  `);
}

async function main() {
  const migrations = await readMigrations();

  if (dryRun) {
    for (const migration of migrations) {
      process.stdout.write(`-- ${migration.name}\n${migration.sql}\n`);
    }
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureJournal(client);

    for (const migration of migrations) {
      const existing = await client.query('SELECT name, checksum FROM __drizzle_migrations WHERE name = $1 LIMIT 1', [migration.name]);
      if (existing.rowCount > 0) {
        const applied = existing.rows[0];
        if (applied.checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.name}.`);
        }
        continue;
      }

      const startedAt = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO __drizzle_migrations (name, checksum, execution_time_ms) VALUES ($1, $2, $3)',
          [migration.name, migration.checksum, Date.now() - startedAt],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

await main();
