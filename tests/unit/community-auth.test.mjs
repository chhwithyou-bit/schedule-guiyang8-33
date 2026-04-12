import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCommunityLevelFromXp,
  normalizeCommunityRole,
  resolveCommunityUserFromAuthHeader,
  withCommunityLevel
} from '../../apps/api/src/routes/auth/index.ts';

function createEnv(record) {
  return {
    COMMUNITY_OWNER_USERS: 'admin,boss',
    COMMUNITY_OWNER_IDS: 'owner-id',
    COMMUNITY_DB: {
      prepare() {
        return {
          bind(...values) {
            return {
              async first() {
                if (!record) return null;
                const [username, passHash] = values;
                if (username !== record.username || passHash !== record.password_hash) return null;
                return record;
              }
            };
          }
        };
      }
    }
  };
}

test('getCommunityLevelFromXp matches legacy thresholds', () => {
  assert.equal(getCommunityLevelFromXp(0), 1);
  assert.equal(getCommunityLevelFromXp(10), 2);
  assert.equal(getCommunityLevelFromXp(2090), 20);
});

test('normalizeCommunityRole upgrades configured admins to owner only', () => {
  assert.equal(normalizeCommunityRole({ id: '1', username: 'boss', role: 'admin' }, createEnv(null)), 'owner');
  assert.equal(normalizeCommunityRole({ id: 'owner-id', username: 'someone', role: 'admin' }, createEnv(null)), 'owner');
  assert.equal(normalizeCommunityRole({ id: '2', username: 'mod', role: 'admin' }, createEnv(null)), 'admin');
  assert.equal(normalizeCommunityRole({ id: '3', username: 'user', role: 'user' }, createEnv(null)), 'user');
});

test('withCommunityLevel recalculates stale level from xp', () => {
  const normalized = withCommunityLevel({ xp: 25, level: 1 });
  assert.equal(normalized.level, 3);
  assert.equal(normalized.xp, 25);
});

test('resolveCommunityUserFromAuthHeader accepts legacy bearer username:passHash format', async () => {
  const record = {
    id: 'user-1',
    username: '张三',
    password_hash: 'abc123',
    role: 'admin',
    xp: 10,
    level: 1,
    signature: 'hello',
    avatar_url: '/avatar.png',
    background_url: '/bg.png',
    is_banned: 0
  };

  const user = await resolveCommunityUserFromAuthHeader(createEnv(record), 'Bearer %E5%BC%A0%E4%B8%89:abc123');
  assert.deepEqual(user, {
    id: 'user-1',
    username: '张三',
    passHash: 'abc123',
    role: 'admin',
    xp: 10,
    level: 2,
    signature: 'hello',
    avatar_url: '/avatar.png',
    background_url: '/bg.png'
  });
});

test('resolveCommunityUserFromAuthHeader rejects missing or banned users', async () => {
  assert.equal(await resolveCommunityUserFromAuthHeader(createEnv(null), null), null);
  assert.equal(await resolveCommunityUserFromAuthHeader(createEnv({ username: 'a', password_hash: 'b', is_banned: 1 }), 'Bearer a:b'), null);
});
