function normalizeResultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export class CommunityD1UsersRepository {
  constructor(db) {
    this.db = db;
  }

  async findById(id) {
    const row = await this.db.prepare(
      'SELECT id, username, avatar_url, signature, role, xp, level, is_banned FROM users WHERE id = ? LIMIT 1'
    )
      .bind(id)
      .first();

    return row ?? null;
  }
}

export class CommunityD1ConversationsRepository {
  constructor(db) {
    this.db = db;
  }

  async listForUser(userId, { limit = 50 } = {}) {
    const result = await this.db.prepare(`
      SELECT
        COALESCE(c.id, '') as id,
        COALESCE(c.kind, 'direct') as kind,
        c.title,
        c.description,
        c.avatar_url,
        c.updated_at,
        cm.role as member_role,
        (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) as member_count,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COALESCE(u.username, '系统') FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_name,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.conversation_id = c.id
            AND datetime(m.created_at) > datetime(COALESCE(cm.last_read_at, '1970-01-01 00:00:00'))
        ) as unread_count,
        (
          SELECT COALESCE(u.id, '')
          FROM conversation_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
          LIMIT 1
        ) as partner_id,
        (
          SELECT COALESCE(u.username, '私聊')
          FROM conversation_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
          LIMIT 1
        ) as partner_username,
        (
          SELECT u.avatar_url
          FROM conversation_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
          LIMIT 1
        ) as partner_avatar_url,
        (
          SELECT u.signature
          FROM conversation_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
          LIMIT 1
        ) as partner_signature,
        (
          SELECT COALESCE(u.role, 'user')
          FROM conversation_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
          LIMIT 1
        ) as partner_role,
        (
          SELECT COALESCE(u.xp, 0)
          FROM conversation_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
          LIMIT 1
        ) as partner_xp
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ?
      ORDER BY datetime(COALESCE((SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), c.updated_at)) DESC,
               datetime(c.created_at) DESC
      LIMIT ?
    `)
      .bind(userId, userId, userId, userId, userId, userId, limit)
      .all();

    return normalizeResultRows(result);
  }

  async findById(id) {
    const row = await this.db.prepare(
      'SELECT id, kind, title, description, avatar_url, updated_at, created_at FROM conversations WHERE id = ? LIMIT 1'
    )
      .bind(id)
      .first();

    return row ?? null;
  }

  async findDirectByKey(directKey) {
    const row = await this.db.prepare(
      'SELECT id, kind, title, description, avatar_url, updated_at, created_at FROM conversations WHERE direct_key = ? LIMIT 1'
    )
      .bind(directKey)
      .first();

    return row ?? null;
  }

  async createDirectConversation({ id, title, description, avatarUrl, directKey, createdBy }) {
    await this.db.prepare(
      `INSERT INTO conversations (id, kind, title, description, avatar_url, direct_key, created_by, updated_at)
       VALUES (?, 'direct', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(id, title, description, avatarUrl, directKey, createdBy)
      .run();

    return this.findById(id);
  }
}

export class CommunityD1ConversationMembersRepository {
  constructor(db) {
    this.db = db;
  }

  async createDirectPair(conversationId, userAId, userBId) {
    await this.db.prepare(
      `INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
       VALUES (?, ?, 'member', CURRENT_TIMESTAMP), (?, ?, 'member', CURRENT_TIMESTAMP)`
    )
      .bind(conversationId, userAId, conversationId, userBId)
      .run();
  }

  async findMembership(conversationId, userId) {
    const row = await this.db.prepare(
      `SELECT conversation_id, user_id, role as member_role, last_read_at
       FROM conversation_members
       WHERE conversation_id = ? AND user_id = ?
       LIMIT 1`
    )
      .bind(conversationId, userId)
      .first();

    return row ?? null;
  }

  async listOtherUserIds(conversationId, userId) {
    const result = await this.db.prepare(
      `SELECT user_id
       FROM conversation_members
       WHERE conversation_id = ? AND user_id != ?`
    )
      .bind(conversationId, userId)
      .all();

    return normalizeResultRows(result).map((row) => String(row.user_id || '')).filter(Boolean);
  }

  async markRead(conversationId, userId) {
    await this.db.prepare(
      `UPDATE conversation_members
       SET last_read_at = CURRENT_TIMESTAMP
       WHERE conversation_id = ? AND user_id = ?`
    )
      .bind(conversationId, userId)
      .run();
  }
}

export class CommunityD1MessagesRepository {
  constructor(db) {
    this.db = db;
  }

  async listByConversation(conversationId, { limit = 80 } = {}) {
    const result = await this.db.prepare(
      `SELECT
         COALESCE(m.id, '') as id,
         COALESCE(m.conversation_id, '') as conversation_id,
         m.sender_id,
         COALESCE(m.content, '') as content,
         m.meta_json,
         COALESCE(m.created_at, '') as created_at,
         COALESCE(u.username, '[账号不可用]') as username,
         u.avatar_url,
         COALESCE(u.xp, 0) as xp,
         COALESCE(u.level, 1) as level,
         COALESCE(u.role, 'user') as role
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY datetime(m.created_at) DESC
       LIMIT ?`
    )
      .bind(conversationId, limit)
      .all();

    return normalizeResultRows(result);
  }

  async create({ id, conversationId, senderId, content, metaJson }) {
    await this.db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, content, meta_json)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, conversationId, senderId, content, metaJson)
      .run();
  }
}

export function createCommunityD1Repositories(db) {
  return {
    users: new CommunityD1UsersRepository(db),
    conversations: new CommunityD1ConversationsRepository(db),
    conversationMembers: new CommunityD1ConversationMembersRepository(db),
    messages: new CommunityD1MessagesRepository(db),
  };
}
