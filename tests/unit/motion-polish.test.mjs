import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

test('frontend motion polish exposes Apple-like motion tokens and surfaces', () => {
  const appCss = read('v5-svelte-migration', 'src', 'styles', 'app.css');
  const pageTransition = read('v5-svelte-migration', 'src', 'components', 'layout', 'PageTransition.svelte');
  const liquidBar = read('v5-svelte-migration', 'src', 'components', 'layout', 'LiquidBar.svelte');
  const postCard = read('v5-svelte-migration', 'src', 'components', 'views', 'PostCard.svelte');
  const communityView = read('v5-svelte-migration', 'src', 'components', 'views', 'CommunityView.svelte');

  assert.match(appCss, /--motion-ease-apple:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
  assert.match(appCss, /--motion-duration-slow:\s*680ms/);
  assert.match(pageTransition, /MOTION_PROFILE/);
  assert.match(pageTransition, /expo\.out/);
  assert.match(liquidBar, /data-motion-role="liquid-nav"/);
  assert.match(liquidBar, /var\(--motion-ease-apple\)/);
  assert.match(postCard, /data-motion-role="post-card"/);
  assert.match(postCard, /var\(--motion-ease-apple\)/);
  assert.match(communityView, /data-motion-role="community-surface"/);
});
