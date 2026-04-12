import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comments,
  conversationMembers,
  conversations,
  createCommunityD1Repositories,
  createCommunityRepositories,
  follows,
  likes,
  messages,
  notifications,
  posts,
  reports,
  users,
} from '../src/index.js';

const tableName = (table) => table?.[Symbol.for('drizzle:Name')] ?? table?._.name;

test('relational core tables expose expected names', () => {
  assert.equal(tableName(users), 'users');
  assert.equal(tableName(posts), 'posts');
  assert.equal(tableName(comments), 'comments');
  assert.equal(tableName(likes), 'likes');
  assert.equal(tableName(follows), 'follows');
  assert.equal(tableName(notifications), 'notifications');
  assert.equal(tableName(reports), 'reports');
  assert.equal(tableName(conversations), 'conversations');
  assert.equal(tableName(conversationMembers), 'conversation_members');
  assert.equal(tableName(messages), 'messages');
});

test('repository factory returns core repositories', () => {
  const repos = createCommunityRepositories({});
  assert.deepEqual(Object.keys(repos).sort(), [
    'comments',
    'conversationMembers',
    'conversations',
    'follows',
    'likes',
    'messages',
    'notifications',
    'posts',
    'reports',
    'users',
  ]);
});

test('d1 repository factory returns chat repositories', () => {
  const repos = createCommunityD1Repositories({});
  assert.deepEqual(Object.keys(repos).sort(), [
    'conversationMembers',
    'conversations',
    'users',
  ]);
});
