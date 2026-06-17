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

test('post detail keeps the comment composer inside the panel footer', () => {
  assert.doesNotMatch(postDetail, /post-detail-composer-wrap fixed bottom-0 left-0 right-0/);
  assert.match(postDetail, /post-detail-composer-wrap(?:[^"\n]*)\bshrink-0\b/);
  assert.match(postDetail, /\.post-detail-composer-wrap\s*\{[\s\S]*position:\s*relative;/);
});
