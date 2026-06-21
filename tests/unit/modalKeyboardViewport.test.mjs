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

  assert.match(app, /window\.visualViewport\?\.addEventListener\('resize', handleViewportChange\)/);
  assert.match(app, /window\.visualViewport\?\.removeEventListener\('resize', handleViewportChange\)/);
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

test('focused text inputs are scrolled into the visible keyboard viewport', () => {
  const app = read('v5-svelte-migration', 'src', 'App.svelte');

  assert.match(app, /function keepFocusedInputAboveKeyboard\(\)/);
  assert.match(app, /window\.addEventListener\('focusin', keepFocusedInputAboveKeyboard\)/);
  assert.match(app, /findScrollParent\(active\)/);
  assert.match(app, /window\.scrollBy\(\{ top: delta, behavior: 'auto' \}\)/);
});

test('auth modal uses compact mobile layout without keyboard heuristics', () => {
  const authModal = read('v5-svelte-migration', 'src', 'components', 'modals', 'AuthModal.svelte');

  assert.doesNotMatch(authModal, /keyboard-compact/);
  assert.doesNotMatch(authModal, /syncKeyboardOpen/);
  assert.match(authModal, /@media \(max-width:\s*520px\)/);
  assert.match(authModal, /justify-content:\s*flex-start/);
  assert.match(authModal, /font-family:\s*var\(--sans\);\s*[\s\S]*?font-size:\s*20px/);
  assert.match(authModal, /\.field input\s*\{\s*[\s\S]*?padding:\s*10px 12px/);
  assert.match(authModal, /\.auth-frame::before\s*\{\s*[\s\S]*?position:\s*fixed;\s*[\s\S]*?inset:\s*0;\s*[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(authModal, /\.scrim\s*\{\s*[\s\S]*?background:\s*transparent;\s*[\s\S]*?backdrop-filter:\s*none/);
  assert.match(authModal, /position:\s*fixed;\s*[\s\S]*?inset:\s*0;\s*[\s\S]*?background:\s*rgba\(25,\s*25,\s*25,\s*0\.18\)/);
});
