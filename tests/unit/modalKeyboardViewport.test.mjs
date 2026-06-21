import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const cssBlock = (source, selector) => {
  const match = source.match(new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`));
  assert.ok(match, `Expected .${selector} CSS block to exist`);
  return match[0];
};

test('modal shells follow the mobile visual viewport above the keyboard', () => {
  const app = read('v5-svelte-migration', 'src', 'App.svelte');
  const authModal = read('v5-svelte-migration', 'src', 'components', 'modals', 'AuthModal.svelte');
  const postModal = read('v5-svelte-migration', 'src', 'components', 'modals', 'PostModal.svelte');

  assert.match(app, /window\.visualViewport\?\.addEventListener\('resize', syncModalViewport\)/);
  assert.match(app, /--app-modal-viewport-height/);
  assert.match(app, /--app-modal-viewport-top/);

  for (const [source, frameSelector] of [[authModal, 'auth-frame'], [postModal, 'post-modal-frame']]) {
    const frame = cssBlock(source, frameSelector);

    assert.match(source, /top:\s*var\(--app-modal-viewport-top,\s*0\)/);
    assert.match(source, /height:\s*var\(--app-modal-viewport-height,\s*100dvh\)/);
    assert.match(source, /max-height:\s*calc\(var\(--app-modal-viewport-height,\s*100dvh\)/);
    assert.match(source, /overscroll-behavior:\s*contain/);
    assert.doesNotMatch(frame, /inset:\s*0;/);
  }
});
