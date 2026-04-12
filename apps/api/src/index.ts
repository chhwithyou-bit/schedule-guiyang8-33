import { Hono } from 'hono';
import {
  handleCommunityAuth,
  resolveCommunityUserFromAuthHeader,
  type CommunityAuthAction,
  type CommunityAuthEnv,
  type D1DatabaseLike
} from './routes/auth/index.ts';

export interface Env {
  APP_NAME: string;
  COMMUNITY_DB: D1DatabaseLike;
  COMMUNITY_OWNER_USERS?: string;
  COMMUNITY_OWNER_IDS?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: c.env.APP_NAME,
    message: 'API scaffold ready for Hono + Drizzle integration.'
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

for (const action of ['register', 'login'] as const satisfies CommunityAuthAction[]) {
  app.post(`/api/community/${action}`, async (c) => {
    const body = await c.req.json();
    const result = await handleCommunityAuth(c.env as CommunityAuthEnv, { ...body, action });
    return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
  });
}

app.get('/api/community/me', async (c) => {
  const user = await resolveCommunityUserFromAuthHeader(c.env as CommunityAuthEnv, c.req.header('Authorization'));
  if (!user) {
    return c.json({ ok: false, msg: '未登录' }, 401);
  }

  return c.json({ ok: true, user });
});

export default app;
