import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAppLocationHash,
  parseAppLocationHash
} from '../../v5-svelte-migration/src/lib/appRouteState.mjs';

test('buildAppLocationHash normalizes top-level SPA routes', () => {
  assert.equal(buildAppLocationHash({ view: 'community', section: 'feed' }), '#/community');
  assert.equal(buildAppLocationHash({ view: 'community', section: 'discovery' }), '#/community/discovery');
  assert.equal(buildAppLocationHash({ view: 'community', section: 'favorites' }), '#/community/favorites');
  assert.equal(buildAppLocationHash({ view: 'profile' }), '#/profile');
  assert.equal(buildAppLocationHash({ view: 'admin' }), '#/admin');
});

test('parseAppLocationHash restores top-level SPA routes with sane fallbacks', () => {
  assert.deepEqual(parseAppLocationHash('#/community'), { view: 'community', section: 'feed' });
  assert.deepEqual(parseAppLocationHash('#/community/notifications'), {
    view: 'community',
    section: 'notifications'
  });
  assert.deepEqual(parseAppLocationHash('#/profile'), { view: 'profile', section: 'feed' });
  assert.deepEqual(parseAppLocationHash('#/admin'), { view: 'admin', section: 'feed' });
  assert.deepEqual(parseAppLocationHash('#/not-real'), { view: 'community', section: 'feed' });
  assert.deepEqual(parseAppLocationHash(''), { view: 'community', section: 'feed' });
});
