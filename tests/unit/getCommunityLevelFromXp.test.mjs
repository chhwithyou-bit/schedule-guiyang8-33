import test from 'node:test';
import assert from 'node:assert/strict';
import { getCommunityLevelFromXp, COMMUNITY_LEVEL_THRESHOLDS } from '../../utils.mjs';

test('getCommunityLevelFromXp calculates correct level based on xp', async (t) => {
  await t.test('handles negative values', () => {
    assert.equal(getCommunityLevelFromXp(-10), 1);
  });

  await t.test('handles zero', () => {
    assert.equal(getCommunityLevelFromXp(0), 1);
  });

  await t.test('handles null/undefined/NaN', () => {
    assert.equal(getCommunityLevelFromXp(null), 1);
    assert.equal(getCommunityLevelFromXp(undefined), 1);
    assert.equal(getCommunityLevelFromXp(NaN), 1);
  });

  await t.test('handles first threshold exactly', () => {
    assert.equal(getCommunityLevelFromXp(0), 1);
  });

  await t.test('handles second threshold exact and near', () => {
    assert.equal(getCommunityLevelFromXp(9), 1);
    assert.equal(getCommunityLevelFromXp(10), 2);
    assert.equal(getCommunityLevelFromXp(11), 2);
  });

  await t.test('handles highest threshold', () => {
    assert.equal(getCommunityLevelFromXp(2089), 19);
    assert.equal(getCommunityLevelFromXp(2090), 20);
    assert.equal(getCommunityLevelFromXp(5000), 20);
  });
});
