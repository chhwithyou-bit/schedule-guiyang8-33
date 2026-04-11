import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/schedule_guiyang',
  },
  verbose: true,
  strict: true,
});
