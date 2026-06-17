import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const workerSource = readFileSync(resolve(repoRoot, 'src/lib.rs'), 'utf8');
const adminViewSource = readFileSync(
  resolve(repoRoot, 'v5-svelte-migration', 'src', 'components', 'views', 'AdminView.svelte'),
  'utf8'
);
const communityApiSource = readFileSync(
  resolve(repoRoot, 'v5-svelte-migration', 'src', 'lib', 'communityApi.ts'),
  'utf8'
);
const profileViewSource = readFileSync(
  resolve(repoRoot, 'v5-svelte-migration', 'src', 'components', 'views', 'ProfileView.svelte'),
  'utf8'
);
const communityConsoleSource = readFileSync(
  resolve(repoRoot, 'v5-svelte-migration', 'src', 'components', 'modals', 'CommunityConsole.svelte'),
  'utf8'
);

function sliceBetween(startMarker, endMarker) {
  const start = workerSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = workerSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return workerSource.slice(start, end);
}

test('drive upload stages media in R2 before async Drive archiving', () => {
  const handler = sliceBetween(
    'async fn handle_community_media_library_upload(',
    'fn resolve_cached_media_status('
  );

  assert.match(handler, /let media_key = format!\(\s*"media-\{\}\.\{\}"/);
  assert.match(handler, /put_uploaded_media\(&ctx\.env, &media_key, &buffer, &mime_type\)\.await/);
  assert.match(handler, /ctx\.data\.wait_until\(async move \{/);
  assert.match(handler, /sync_media_to_drive_archive\(/);
  assert.match(handler, /"driveSync": drive_sync/);
  assert.match(handler, /"fromDrive": false/);
});

test('media upload alias is the frontend-facing endpoint', () => {
  assert.match(workerSource, /\.post_async\("\/api\/community\/media\/upload"/);
  assert.match(
    workerSource,
    /\.post_async\("\/api\/community\/drive\/upload", \|req, ctx\| async move \{\s*handle_community_media_library_upload\(req, ctx\)\.await\s*\}\)/
  );
  assert.doesNotMatch(workerSource, /\/api\/community\/drive\/upload-legacy/);
  assert.match(communityApiSource, /COMMUNITY_MEDIA_UPLOAD_ENDPOINT = '\/api\/community\/media\/upload'/);
  assert.match(profileViewSource, /communityFetch\(COMMUNITY_MEDIA_UPLOAD_ENDPOINT/);
  assert.match(communityConsoleSource, /communityFetch\(COMMUNITY_MEDIA_UPLOAD_ENDPOINT/);
  assert.doesNotMatch(profileViewSource, /\/api\/community\/drive\/upload/);
  assert.doesNotMatch(communityConsoleSource, /\/api\/community\/drive\/upload/);
});

test('public media reads backfill R2 after Drive fallback', () => {
  assert.match(workerSource, /async fn fetch_drive_media_bytes\(/);
  assert.match(workerSource, /fn build_public_media_response_from_bytes\(/);

  const handler = sliceBetween('.get_async("/api/community/media/:key"', '.get_async("/api/music"');
  assert.match(handler, /fetch_drive_media_bytes\(&ctx\.env, &drive_file_id\)\.await/);
  assert.match(handler, /put_uploaded_media\(&ctx\.env, &key, &bytes, &content_type\)\.await/);
  assert.match(handler, /"MISS-GDrive-REFILL"/);
});

test('community API normalizes stored media keys before exposing image URLs', () => {
  assert.match(workerSource, /fn normalize_media_url\(value: Option<String>\) -> Option<String>/);
  assert.match(workerSource, /Some\(format!\("\/api\/community\/media\/\{\}", trimmed\)\)/);
  assert.match(workerSource, /fn normalize_community_user_media\(user: &mut User\)/);
  assert.match(workerSource, /fn normalize_community_post_media\(post: &mut Post\)/);
  assert.match(workerSource, /fn normalize_community_comment_media\(comment: &mut Comment\)/);
  assert.match(workerSource, /normalize_community_user_media\(&mut user\)/);
  assert.match(workerSource, /normalize_community_post_media\(&mut post\)/);
  assert.match(workerSource, /normalize_community_comment_media\(&mut comment\)/);

  const profileHandler = sliceBetween('.get_async("/api/community/profile"', '.post_async("/api/community/profile"');
  assert.match(profileHandler, /normalize_community_user_media\(&mut u\)/);

  const profileSaveHandler = sliceBetween('.post_async("/api/community/profile"', '.get_async("/api/community/discovery"');
  assert.match(profileSaveHandler, /with_community_level\(updated\)/);

  const driveListHandler = sliceBetween('.get_async("/api/community/drive/list"', '.post_async("/api/community/drive/mkdir"');
  assert.match(driveListHandler, /file\.url = normalize_media_url\(file\.url\.clone\(\)\)/);
});

test('admin media copy reflects R2 primary and Drive archive roles', () => {
  assert.match(workerSource, /"mode": "r2-primary-drive-archive"/);
  assert.match(adminViewSource, /R2 主存储/);
  assert.match(adminViewSource, /Drive 归档/);
  assert.match(adminViewSource, /优先命中 R2/);
});
