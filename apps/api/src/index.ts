import { databaseTables } from '@schedule-guiyang/db';
import { Hono } from 'hono';
import { handleCommunityAuth, type CommunityAuthEnv, type D1DatabaseLike } from './routes/auth';

export interface Env {
  APP_NAME: string;
  COMMUNITY_DB: D1DatabaseLike;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: c.env.APP_NAME,
    message: `API scaffold ready for Hono + Drizzle integration (${databaseTables.schedules}).`
  });
});

app.get('/health', (c) => {
  return c.json({
    ok: true,
    now: new Date().toISOString()
  });
});

app.post('/api/community/auth', async (c) => {
  const body = await c.req.json();
  const result = await handleCommunityAuth(c.env as CommunityAuthEnv, body);
  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
});

export default app;
