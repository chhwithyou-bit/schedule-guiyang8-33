import test from 'node:test';
import assert from 'node:assert/strict';
import { runLimitedConcurrency } from '../../v5-svelte-migration/src/lib/uploadQueue.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('runLimitedConcurrency caps active uploads and keeps result order', async () => {
  const delays = [30, 5, 20, 10, 15];
  let active = 0;
  let maxActive = 0;

  const results = await runLimitedConcurrency(delays, 2, async (delay, index) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(delay);
    active -= 1;
    return `${index}:${delay}`;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(results, ['0:30', '1:5', '2:20', '3:10', '4:15']);
});
