import { and, desc, eq, sql } from 'drizzle-orm';
import {
  comments,
  conversationMembers,
  conversations,
  follows,
  likes,
  messages,
  notifications,
  posts,
  reports,
  users,
} from '../schema.js';
import { BaseRepository } from './base-repository.js';

export class UsersRepository extends BaseRepository {
  constructor(db) {
    super(db, users);
  }

  async findByUsername(username, options = {}) {
    const executor = options.tx || this.db;
    const [row] = await executor.select().from(users).where(eq(users.username, username)).limit(1);
    return row ?? null;
  }
}

export class PostsRepository extends BaseRepository {
  constructor(db) {
    super(db, posts);
  }

  async listFeed({ limit = 20, offset = 0 } = {}, options = {}) {
    const executor = options.tx || this.db;

    if (executor.query?.posts?.findMany) {
      return executor.query.posts.findMany({
        with: {
          user: true,
          comments: true,
          likes: true,
        },
        orderBy: [desc(posts.createdAt)],
        limit,
        offset,
      });
    }

    return executor.select().from(posts).orderBy(desc(posts.createdAt)).limit(limit).offset(offset);
  }
}

export class ConversationsRepository extends BaseRepository {
  constructor(db) {
    super(db, conversations);
  }

  async getMembership(conversationId, userId, options = {}) {
    const executor = options.tx || this.db;
    const [row] = await executor
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async listForUser(userId, { limit = 50 } = {}, options = {}) {
    const executor = options.tx || this.db;
    return executor
      .select({
        id: conversations.id,
        kind: conversations.kind,
        title: conversations.title,
        description: conversations.description,
        avatarUrl: conversations.avatarUrl,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        memberRole: conversationMembers.role,
        memberCount: sql`(
          select count(*)::int from conversation_members cm2 where cm2.conversation_id = ${conversations.id}
        )`,
        lastMessage: sql`(
          select m.content from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1
        )`,
        lastMessageAt: sql`(
          select m.created_at from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1
        )`,
        lastSenderName: sql`(
          select coalesce(u.username, '系统')
          from messages m
          left join users u on u.id = m.sender_id
          where m.conversation_id = ${conversations.id}
          order by m.created_at desc
          limit 1
        )`,
        unreadCount: sql`(
          select count(*)::int
          from messages m
          where m.conversation_id = ${conversations.id}
            and m.created_at > coalesce(${conversationMembers.lastReadAt}, to_timestamp(0))
        )`,
      })
      .from(conversations)
      .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
      .where(eq(conversationMembers.userId, userId))
      .orderBy(
        sql`coalesce((select m.created_at from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1), ${conversations.updatedAt}) desc`,
      )
      .limit(limit);
  }
}

export function createCommunityRepositories(db) {
  return {
    users: new UsersRepository(db),
    posts: new PostsRepository(db),
    conversations: new ConversationsRepository(db),
    comments: new BaseRepository(db, comments),
    likes: new BaseRepository(db, likes),
    follows: new BaseRepository(db, follows),
    notifications: new BaseRepository(db, notifications),
    reports: new BaseRepository(db, reports),
    messages: new BaseRepository(db, messages),
    conversationMembers: new BaseRepository(db, conversationMembers),
  };
}
