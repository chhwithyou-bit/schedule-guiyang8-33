import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { PREBUILT_WORKER_FILES, hasPrebuiltWorkerBundle } from '../../scripts/build-worker.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');

test('build worker fallback can reuse checked-in worker artifacts', () => {
  assert.deepEqual(PREBUILT_WORKER_FILES, [
    'build/index.js',
    'build/index_bg.wasm',
    'build/package.json',
    'build/worker/shim.mjs'
  ]);
  assert.equal(hasPrebuiltWorkerBundle(repoRoot), true);
});
