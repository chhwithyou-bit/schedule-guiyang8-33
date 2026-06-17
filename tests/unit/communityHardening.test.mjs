import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const readText = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const backend = readText('src', 'lib.rs');
const schema = readText('schema.sql');
const communityApi = readText('v5-svelte-migration', 'src', 'lib', 'communityApi.ts');
const authModal = readText('v5-svelte-migration', 'src', 'components', 'modals', 'AuthModal.svelte');
const appState = readText('v5-svelte-migration', 'src', 'stores', 'appState.ts');

test('community auth uses opaque sessions instead of password hashes as bearer tokens', () => {
  assert.doesNotMatch(backend, /format!\("{}:{}",\s*username,\s*pass_hash\)/);
  assert.doesNotMatch(backend, /token\.split\(': '\)|token\.split\(':'\)/);
  assert.match(backend, /community_sessions/);
  assert.match(backend, /token_hash/);
  assert.match(backend, /issue_community_session/);
  assert.match(backend, /find_user_by_session_token/);

  assert.doesNotMatch(communityApi, /passHash/);
  assert.doesNotMatch(authModal, /passHash/);
  assert.match(communityApi, /authToken/);
  assert.match(authModal, /hydrateCurrentUser\(authToken/);
});

test('community schema bootstrap is not direct DDL on every community request', () => {
  assert.doesNotMatch(backend, /if request_url\.path\(\)\.starts_with\("\/api\/community"\)\s*\{[\s\S]{0,160}ensure_community_schema\(&db\)\.await\?/);
  assert.doesNotMatch(backend, /DROP TABLE IF EXISTS messages/);
  assert.match(backend, /ensure_community_schema_once/);
  assert.match(backend, /COMMUNITY_SCHEMA_VERSION/);
});

test('post like endpoints share one implementation path', () => {
  const duplicateLikeSql = backend.match(/SELECT 1 FROM likes WHERE post_id = \? AND user_id = \?/g) || [];
  assert.equal(duplicateLikeSql.length, 1);
  assert.match(backend, /toggle_post_like/);
  assert.match(backend, /PostLikeResult/);
});

test('runtime DDL and schema.sql share community table shape', () => {
  for (const source of [backend, schema]) {
    assert.match(source, /community_sessions/);
    assert.match(source, /token_hash/);
    assert.match(source, /is_read/);
    assert.match(source, /idx_notifications_user_created/);
    assert.match(source, /idx_drive_files_user_parent/);
  }
});

test('community app state exposes domain types instead of writable<any>', () => {
  assert.doesNotMatch(appState, /writable<any>/);
  assert.match(appState, /export type CommunityUser/);
  assert.match(appState, /export type CommunityPost/);
  assert.match(appState, /export type CommunityProfile/);
});
