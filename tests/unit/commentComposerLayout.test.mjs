import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const postDetail = readFileSync(
  join(root, 'v5-svelte-migration', 'src', 'components', 'views', 'PostDetail.svelte'),
  'utf8'
);
const profileView = readFileSync(
  join(root, 'v5-svelte-migration', 'src', 'components', 'views', 'ProfileView.svelte'),
  'utf8'
);

test('post detail keeps the comment composer inside the panel footer', () => {
  assert.doesNotMatch(postDetail, /post-detail-composer-wrap fixed bottom-0 left-0 right-0/);
  assert.match(postDetail, /post-detail-composer-wrap(?:[^"\n]*)\bshrink-0\b/);
  assert.match(postDetail, /\.post-detail-composer-wrap\s*\{[\s\S]*position:\s*relative;/);
});

test('post detail shell follows the mobile visual viewport for keyboard-safe comments', () => {
  assert.doesNotMatch(postDetail, /post-detail-frame fixed inset-0/);
  assert.match(postDetail, /post-detail-frame fixed left-0 right-0/);
  assert.match(postDetail, /\.post-detail-frame\s*\{[\s\S]*top:\s*var\(--app-modal-viewport-top,\s*0\);/);
  assert.match(postDetail, /\.post-detail-frame\s*\{[\s\S]*height:\s*var\(--app-modal-viewport-height,\s*100dvh\);/);
});

test('profile overlay follows the mobile visual viewport for keyboard-safe signature editing', () => {
  assert.doesNotMatch(profileView, /\.profile-overlay\s*\{[\s\S]*?inset:\s*0;/);
  assert.match(profileView, /\.profile-overlay\s*\{[\s\S]*top:\s*var\(--app-modal-viewport-top,\s*0\);/);
  assert.match(profileView, /\.profile-overlay\s*\{[\s\S]*height:\s*var\(--app-modal-viewport-height,\s*100dvh\);/);
});
