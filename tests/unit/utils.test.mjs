import { test } from 'node:test';
import assert from 'node:assert';
import {
  parseIdentityList,
  isCommunityAdminRole,
  isCommunityOwnerRole,
  getCommunityLevelFromXp,
  parsePositiveInt,
  safeDecodeURIComponent
} from '../../utils.mjs';

test('parseIdentityList parses comma-separated strings into a lowercased set', () => {
  const result = parseIdentityList('Admin, User1, USER2, , ');
  assert.strictEqual(result.size, 3);
  assert.ok(result.has('admin'));
  assert.ok(result.has('user1'));
  assert.ok(result.has('user2'));
});

test('parseIdentityList handles empty or null values', () => {
  assert.strictEqual(parseIdentityList('').size, 0);
  assert.strictEqual(parseIdentityList(null).size, 0);
  assert.strictEqual(parseIdentityList(undefined).size, 0);
});

test('isCommunityAdminRole identifies admin and owner roles', () => {
  assert.strictEqual(isCommunityAdminRole('admin'), true);
  assert.strictEqual(isCommunityAdminRole('owner'), true);
  assert.strictEqual(isCommunityAdminRole('user'), false);
  assert.strictEqual(isCommunityAdminRole(''), false);
  assert.strictEqual(isCommunityAdminRole(null), false);
});

test('isCommunityOwnerRole identifies owner role', () => {
  assert.strictEqual(isCommunityOwnerRole('owner'), true);
  assert.strictEqual(isCommunityOwnerRole('admin'), false);
  assert.strictEqual(isCommunityOwnerRole('user'), false);
});

test('getCommunityLevelFromXp calculates level based on thresholds', () => {
  // Thresholds: [0, 10, 25, 45, 70, 100, 140, 190, 250, 325, 415, 520, 640, 780, 940, 1120, 1325, 1555, 1810, 2090]
  assert.strictEqual(getCommunityLevelFromXp(0), 1);
  assert.strictEqual(getCommunityLevelFromXp(5), 1);
  assert.strictEqual(getCommunityLevelFromXp(10), 2);
  assert.strictEqual(getCommunityLevelFromXp(24), 2);
  assert.strictEqual(getCommunityLevelFromXp(25), 3);
  assert.strictEqual(getCommunityLevelFromXp(2089), 19);
  assert.strictEqual(getCommunityLevelFromXp(2090), 20);
  assert.strictEqual(getCommunityLevelFromXp(3000), 20);
  assert.strictEqual(getCommunityLevelFromXp(-10), 1);
  assert.strictEqual(getCommunityLevelFromXp('10'), 2);
});

test('parsePositiveInt parses strings and numbers with fallback', () => {
  assert.strictEqual(parsePositiveInt('123', 10), 123);
  assert.strictEqual(parsePositiveInt(456, 10), 456);
  assert.strictEqual(parsePositiveInt('0', 10), 10);
  assert.strictEqual(parsePositiveInt('-5', 10), 10);
  assert.strictEqual(parsePositiveInt('abc', 10), 10);
  assert.strictEqual(parsePositiveInt(null, 10), 10);
  assert.strictEqual(parsePositiveInt(1.8, 10), 1);
});

test('safeDecodeURIComponent decodes correctly or returns original', () => {
  assert.strictEqual(safeDecodeURIComponent('hello%20world'), 'hello world');
  assert.strictEqual(safeDecodeURIComponent('%E4%BD%A0%E5%A5%BD'), '你好');
  // Malformed URI
  assert.strictEqual(safeDecodeURIComponent('%E4%BD%A0%E5%A5'), '%E4%BD%A0%E5%A5');
});
