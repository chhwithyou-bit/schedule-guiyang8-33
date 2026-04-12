import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { communitySchema } from './schema.js';
import './relations.js';

export function createPgPool(connectionString, options = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to create a PostgreSQL pool.');
  }

  return new Pool({
    connectionString,
    max: 10,
    ...options,
  });
}

export function createDb(connectionStringOrPool, options = {}) {
  const pool = typeof connectionStringOrPool === 'string'
    ? createPgPool(connectionStringOrPool, options.pool)
    : connectionStringOrPool;

  if (!pool) {
    throw new Error('A PostgreSQL connection string or Pool instance is required.');
  }

  return drizzle(pool, { schema: communitySchema, ...(options.drizzle || {}) });
}

export function withTransaction(db, callback) {
  return db.transaction((tx) => callback(tx));
}
