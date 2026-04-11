import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = (name = 'created_at') => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const updatedAt = (name = 'updated_at') => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('user').notNull(),
  avatarUrl: text('avatar_url'),
  signature: text('signature'),
  backgroundUrl: text('background_url'),
  xp: integer('xp').default(0).notNull(),
  level: integer('level').default(1).notNull(),
  isBanned: boolean('is_banned').default(false).notNull(),
  createdAt: createdAt(),
}, (table) => ({
  usernameUnique: uniqueIndex('users_username_unique').on(table.username),
}));

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  content: text('content'),
  mediaJson: text('media_json'),
  type: text('type').default('post').notNull(),
  repostId: text('repost_id').references(() => posts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (table) => ({
  createdAtIdx: index('idx_posts_created_at').on(table.createdAt),
}));

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references(() => comments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: createdAt(),
}, (table) => ({
  postCreatedIdx: index('idx_comments_post_created').on(table.postId, table.createdAt),
}));

export const likes = pgTable('likes', {
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (table) => ({
  pk: primaryKey({ columns: [table.postId, table.userId], name: 'likes_pkey' }),
}));

export const follows = pgTable('follows', {
  followerId: text('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: text('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (table) => ({
  pk: primaryKey({ columns: [table.followerId, table.followingId], name: 'follows_pkey' }),
}));

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  fromUserId: text('from_user_id').references(() => users.id, { onDelete: 'cascade' }),
  targetId: text('target_id'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: createdAt(),
}, (table) => ({
  userCreatedIdx: index('idx_notifications_user_created').on(table.userId, table.createdAt),
}));

export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason'),
  status: text('status').default('pending').notNull(),
  createdAt: createdAt(),
});

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  kind: text('kind').default('direct').notNull(),
  title: text('title'),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  directKey: text('direct_key'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  directKeyUnique: uniqueIndex('conversations_direct_key_unique').on(table.directKey),
  kindUpdatedIdx: index('idx_conversations_kind_updated').on(table.kind, table.updatedAt),
}));

export const conversationMembers = pgTable('conversation_members', {
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').default('member').notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  joinedAt: createdAt('joined_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.conversationId, table.userId], name: 'conversation_members_pkey' }),
  userJoinedIdx: index('idx_conversation_members_user').on(table.userId, table.joinedAt),
}));

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').references(() => users.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  metaJson: text('meta_json'),
  createdAt: createdAt(),
}, (table) => ({
  conversationCreatedIdx: index('idx_messages_conversation_created').on(table.conversationId, table.createdAt),
}));

export const migrationJournal = pgTable('__drizzle_migrations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  checksum: text('checksum').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
  executionTimeMs: bigint('execution_time_ms', { mode: 'number' }).notNull().default(0),
}, (table) => ({
  nameUnique: uniqueIndex('__drizzle_migrations_name_unique').on(table.name),
}));

export const communitySchema = {
  users,
  posts,
  comments,
  likes,
  follows,
  notifications,
  reports,
  conversations,
  conversationMembers,
  messages,
  migrationJournal,
};

export const databaseTables = {
  schedules: 'schedules'
};
